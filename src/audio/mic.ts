import Meyda from 'meyda';
import type { MeydaFeaturesObject } from 'meyda';
import { TempoTracker } from './tempo';

/**
 * Mic mode: fully real-time, built for a phone held up at a concert.
 *
 * Browser DSP (echo cancellation / noise suppression / AGC) is disabled —
 * those exist for speech and will eat drums and pump levels. All level
 * handling downstream is rolling-normalised instead of absolute, so hot,
 * clipped, bass-heavy input still maps onto the full mechanical range.
 *
 * The onset flux driving the TempoTracker comes from Bark-band loudness
 * deltas, weighted toward the low bands — kick and snare survive a dense
 * mix far better there than in full-spectrum flux.
 */
export class MicEngine {
  ctx: AudioContext | null = null;
  tracker: TempoTracker | null = null;

  rms = 0;
  centroidHz = 0;
  bass = 0;

  private stream: MediaStream | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private meyda: ReturnType<typeof Meyda.createMeydaAnalyzer> | null = null;
  private prevBands: Float32Array | null = null;

  get active(): boolean {
    return this.stream !== null;
  }

  /** Cloned mic track for the share-loop recorder. */
  captureTrack(): MediaStreamTrack | null {
    return this.stream?.getAudioTracks()[0]?.clone() ?? null;
  }

  /** Throws on permission denial — caller shows the graceful state. */
  async start(): Promise<void> {
    if (this.active) return;
    if (!this.ctx) this.ctx = new AudioContext();
    if (this.ctx.state === 'suspended') await this.ctx.resume();
    const ctx = this.ctx;

    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
      },
    });
    this.source = ctx.createMediaStreamSource(this.stream);

    const bufferSize = 1024;
    this.tracker = new TempoTracker(ctx.sampleRate, bufferSize);
    this.prevBands = null;

    this.meyda = Meyda.createMeydaAnalyzer({
      audioContext: ctx,
      source: this.source,
      bufferSize,
      featureExtractors: ['rms', 'spectralCentroid', 'loudness'],
      callback: (features: Partial<MeydaFeaturesObject>) => {
        if (typeof features.rms === 'number') this.rms = features.rms;
        if (typeof features.spectralCentroid === 'number' && !Number.isNaN(features.spectralCentroid)) {
          this.centroidHz = (features.spectralCentroid * ctx.sampleRate) / bufferSize;
        }
        const bands = features.loudness?.specific;
        if (bands) {
          this.bass = bands[0] + bands[1] + bands[2] + bands[3];
          // Weighted half-wave-rectified band flux → onset envelope.
          let flux = 0;
          if (this.prevBands) {
            for (let i = 0; i < bands.length; i++) {
              const d = bands[i] - this.prevBands[i];
              if (d > 0) flux += d * (i < 5 ? 1.6 : i < 13 ? 1.0 : 0.6);
            }
          }
          this.prevBands = Float32Array.from(bands);
          this.tracker?.push(flux);
        }
      },
    });
    this.meyda.start();
  }

  /** Mic-clock time (s) — the tracker's phase advances on this clock. */
  get time(): number {
    return this.ctx?.currentTime ?? 0;
  }

  stop(): void {
    this.meyda?.stop();
    this.meyda = null;
    this.source?.disconnect();
    this.source = null;
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.tracker = null;
    this.rms = 0;
    this.bass = 0;
  }
}
