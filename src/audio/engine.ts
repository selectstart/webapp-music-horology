import Meyda from 'meyda';
import type { MeydaFeaturesObject } from 'meyda';

/**
 * File-mode audio: decode, play, and extract features in real time.
 *
 * The Meyda analyser runs on the audio graph at its own cadence
 * (bufferSize 1024 ≈ 43 Hz at 44.1k) — that is the analysis loop.
 * The render loop reads the feature fields whenever it likes; the two
 * are decoupled.
 */
export class AudioEngine {
  ctx: AudioContext | null = null;
  buffer: AudioBuffer | null = null;

  /** Latest analysis-loop features, raw (un-normalised). */
  rms = 0;
  /** Spectral centroid in Hz — brightness of the signal. */
  centroidHz = 0;
  /** Low-frequency energy: sum of the lowest Bark loudness bands (~<300 Hz). */
  bass = 0;

  onEnded: (() => void) | null = null;

  private source: AudioBufferSourceNode | null = null;
  private tap: GainNode | null = null;
  private meyda: ReturnType<typeof Meyda.createMeydaAnalyzer> | null = null;
  private startedAt = 0;
  private recDest: MediaStreamAudioDestinationNode | null = null;

  /** Audio track for the share-loop recorder (null when not playing).
   *  Duplicate connect() calls are ignored per the Web Audio spec. */
  captureTrack(): MediaStreamTrack | null {
    if (!this.ctx || !this.tap) return null;
    if (!this.recDest) this.recDest = this.ctx.createMediaStreamDestination();
    this.tap.connect(this.recDest);
    return this.recDest.stream.getAudioTracks()[0] ?? null;
  }

  private ensureCtx(): AudioContext {
    if (!this.ctx) this.ctx = new AudioContext();
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    return this.ctx;
  }

  async load(file: File): Promise<AudioBuffer> {
    const ctx = this.ensureCtx();
    this.stop();
    const bytes = await file.arrayBuffer();
    this.buffer = await ctx.decodeAudioData(bytes);
    return this.buffer;
  }

  play(): void {
    if (!this.buffer) return;
    const ctx = this.ensureCtx();
    this.stop();

    this.tap = ctx.createGain();
    this.tap.connect(ctx.destination);

    this.source = ctx.createBufferSource();
    this.source.buffer = this.buffer;
    this.source.connect(this.tap);
    this.source.onended = () => {
      this.rms = 0;
      this.bass = 0;
      this.onEnded?.();
    };

    const bufferSize = 1024;
    this.meyda = Meyda.createMeydaAnalyzer({
      audioContext: ctx,
      source: this.tap,
      bufferSize,
      featureExtractors: ['rms', 'spectralCentroid', 'loudness'],
      callback: (features: Partial<MeydaFeaturesObject>) => {
        if (typeof features.rms === 'number') this.rms = features.rms;
        if (typeof features.spectralCentroid === 'number' && !Number.isNaN(features.spectralCentroid)) {
          // Meyda reports the centroid as an FFT bin index; convert to Hz.
          this.centroidHz = (features.spectralCentroid * ctx.sampleRate) / bufferSize;
        }
        if (features.loudness?.specific) {
          // First four Bark bands cover roughly the sub-300 Hz region.
          const s = features.loudness.specific;
          this.bass = s[0] + s[1] + s[2] + s[3];
        }
      },
    });
    this.meyda.start();

    this.startedAt = ctx.currentTime;
    this.source.start();
  }

  /** Song position in seconds (frozen while the context is suspended). */
  get songTime(): number {
    return this.ctx ? this.ctx.currentTime - this.startedAt : 0;
  }

  get playing(): boolean {
    return this.source !== null && this.ctx?.state === 'running';
  }

  /** Suspend the clock — hacking the movement. Resume picks up in sync. */
  async pause(): Promise<void> {
    if (this.ctx?.state === 'running') await this.ctx.suspend();
  }

  async resume(): Promise<void> {
    if (this.ctx?.state === 'suspended') await this.ctx.resume();
  }

  stop(): void {
    if (this.source) {
      this.source.onended = null;
      try {
        this.source.stop();
      } catch {
        /* never started */
      }
      this.source.disconnect();
      this.source = null;
    }
    if (this.meyda) {
      this.meyda.stop();
      this.meyda = null;
    }
    if (this.tap) {
      this.tap.disconnect();
      this.tap = null;
    }
    this.rms = 0;
    this.bass = 0;
  }
}
