import { TEMPO, MIC, TRACKER } from '../mappings';

const TWO_PI = 2 * Math.PI;

/** Signed distance (radians) from phase to its nearest beat (multiple of 2π). */
function beatError(phase: number): number {
  const m = phase % TWO_PI;
  const w = m < 0 ? m + TWO_PI : m;
  return w > Math.PI ? w - TWO_PI : w;
}

/**
 * Real-time tempo + beat-phase tracker for mic mode. No lookahead.
 *
 * Pipeline, fed one onset-flux value per analysis frame (~43 Hz):
 *  1. Onset picking — flux compared against a rolling mean + k·σ, so the
 *     threshold rides through AGC pumping and concert-level loudness.
 *  2. Period — autocorrelation of the flux envelope over a sliding
 *     window, re-estimated twice a second, with a log-domain tempo prior
 *     and continuity rules: small drifts track smoothly, a genuinely new
 *     tempo must persist several estimates before we re-lock. Stability
 *     over twitchiness, per the house rules.
 *  3. Phase — a PLL: onsets near a predicted beat nudge `phase` onto the
 *     beat and raise confidence; off-grid onsets erode it. When
 *     confidence is low, a comb alignment against the recent envelope
 *     re-anchors phase outright (nobody is watching the servo then).
 *
 * `phase` is unwrapped, 2π per beat — same convention as the Escapement,
 * which servos onto it exactly like the file-mode beat grid.
 */
export class TempoTracker {
  /** Beat period in seconds; 0 until the first confident estimate. */
  period = 0;
  /** Unwrapped beat phase (2π per beat). */
  phase = 0;
  /** 0..1 — how much to trust period+phase right now. */
  confidence = 0;

  private readonly hopDt: number;
  private readonly env: Float32Array;
  private head = 0; // total frames written
  private fluxMean = 0;
  private fluxVar = 0;
  private tNow = 0;
  private lastOnsetT = -10;
  private sinceEstimate = 0;
  private disagree = 0;

  constructor(sampleRate: number, bufferSize: number) {
    this.hopDt = bufferSize / sampleRate;
    this.env = new Float32Array(Math.ceil(12 / this.hopDt)); // ~12 s history
  }

  get bpm(): number {
    return this.period > 0 ? 60 / this.period : 0;
  }

  /** Feed one analysis frame of onset flux. */
  push(flux: number): void {
    if (!Number.isFinite(flux) || flux < 0) flux = 0;
    this.env[this.head % this.env.length] = flux;
    this.head++;
    this.tNow += this.hopDt;

    if (this.period > 0) this.phase += (TWO_PI * this.hopDt) / this.period;

    // Rolling flux statistics (EMA) for the adaptive onset threshold.
    const k = 1 - Math.exp(-this.hopDt / TRACKER.FLUX_STAT_TAU);
    this.fluxMean += (flux - this.fluxMean) * k;
    const dev = flux - this.fluxMean;
    this.fluxVar += (dev * dev - this.fluxVar) * k;

    const isOnset =
      dev > TRACKER.ONSET_THRESH_STD * Math.sqrt(this.fluxVar) &&
      this.tNow - this.lastOnsetT > TRACKER.ONSET_REFRACTORY_S;
    if (isOnset) {
      this.lastOnsetT = this.tNow;
      this.onOnset();
    }

    this.sinceEstimate += this.hopDt;
    if (this.sinceEstimate >= TRACKER.REEST_S && this.head * this.hopDt > 3) {
      this.sinceEstimate = 0;
      this.reestimate();
    }
  }

  /** PLL: pull phase toward beats evidenced by onsets. */
  private onOnset(): void {
    if (this.period <= 0) return;
    const err = beatError(this.phase);
    if (Math.abs(err) < MIC.PLL_WINDOW * TWO_PI) {
      this.phase -= err * MIC.PLL_GAIN;
      this.confidence = Math.min(1, this.confidence + 0.06);
    } else {
      this.confidence = Math.max(0, this.confidence - 0.04);
    }
  }

  /** Envelope value `secondsAgo` in the past (0 if beyond history). */
  private envAt(secondsAgo: number): number {
    const back = Math.round(secondsAgo / this.hopDt);
    const i = this.head - 1 - back;
    if (i < 0 || i < this.head - this.env.length) return 0;
    return this.env[i % this.env.length];
  }

  private reestimate(): void {
    const maxLag = Math.ceil(60 / TEMPO.MIN_BPM / this.hopDt);
    const minLag = Math.max(2, Math.floor(60 / TEMPO.MAX_BPM / this.hopDt));
    const window = Math.min(
      this.head,
      this.env.length - maxLag - 1,
      Math.ceil(TRACKER.WINDOW_S / this.hopDt),
    );
    if (window < maxLag * 2) return;

    // Mean-subtracted copy of the recent envelope, oldest-first.
    const e = new Float32Array(window + maxLag);
    for (let i = 0; i < e.length; i++) e[i] = this.envAt((e.length - 1 - i) * this.hopDt);
    let mean = 0;
    for (const v of e) mean += v;
    mean /= e.length;
    for (let i = 0; i < e.length; i++) e[i] -= mean;

    let r0 = 1e-9;
    for (let i = maxLag; i < e.length; i++) r0 += e[i] * e[i];

    // Tempo-weighted normalised autocorrelation over the plausible lags.
    const norms = new Float32Array(maxLag + 1);
    let best = -Infinity;
    let bestLag = 0;
    let normSum = 0;
    for (let lag = minLag; lag <= maxLag; lag++) {
      let r = 0;
      for (let i = maxLag; i < e.length; i++) r += e[i] * e[i - lag];
      const bpm = 60 / (lag * this.hopDt);
      const prior = Math.exp(
        -0.5 * ((Math.log(bpm) - Math.log(TRACKER.TEMPO_CENTER_BPM)) / TRACKER.TEMPO_LOG_SIGMA) ** 2,
      );
      const score = (r / r0) * prior;
      norms[lag] = score;
      normSum += score;
      if (score > best) {
        best = score;
        bestLag = lag;
      }
    }
    if (bestLag === 0) return;

    // Prefer the fundamental over its double: a pulse train correlates at
    // every multiple of the true period, so for fast songs the prior can
    // tip the pick to the half-tempo octave. If the half-lag also shows a
    // strong peak, the energy really is arriving twice as often — take it.
    const half = Math.round(bestLag / 2);
    if (half >= minLag) {
      let hBest = 0;
      let hLag = 0;
      for (const l of [half - 1, half, half + 1]) {
        if (l >= minLag && norms[l] > hBest) {
          hBest = norms[l];
          hLag = l;
        }
      }
      if (hLag > 0 && hBest > TRACKER.OCTAVE_PREFER * best) {
        best = hBest;
        bestLag = hLag;
      }
    }

    // Parabolic refinement of the peak for sub-frame period accuracy.
    let lag = bestLag;
    if (bestLag > minLag && bestLag < maxLag) {
      const a = norms[bestLag - 1];
      const b = norms[bestLag];
      const c = norms[bestLag + 1];
      const denom = a - 2 * b + c;
      if (Math.abs(denom) > 1e-9) lag += Math.max(-0.5, Math.min(0.5, (0.5 * (a - c)) / denom));
    }
    const candidate = lag * this.hopDt;
    const meanNorm = normSum / (maxLag - minLag + 1);
    const estConf = Math.max(0, Math.min(1, (best - meanNorm) * 3));

    if (this.period <= 0) {
      this.period = candidate;
      this.confidence = estConf * 0.6;
      this.combAlign();
    } else if (Math.abs(candidate - this.period) / this.period < TRACKER.SWITCH_TOLERANCE) {
      // Same tempo: track drift smoothly.
      this.period += (candidate - this.period) * 0.25;
      this.disagree = 0;
    } else {
      // A different tempo must persist before we re-lock (graceful, not twitchy).
      this.disagree++;
      if (this.disagree >= TRACKER.SWITCH_PERSIST) {
        this.period = candidate;
        this.disagree = 0;
        this.confidence *= 0.4;
        this.combAlign();
      }
    }
    this.confidence = 0.8 * this.confidence + 0.2 * estConf;

    // While unconvincing, keep re-anchoring phase to the evidence.
    if (this.confidence < MIC.MIN_LOCK_CONFIDENCE) this.combAlign();
  }

  /**
   * Comb alignment: test phase offsets across one period against the
   * recent envelope and set the fractional phase to the offset whose
   * predicted beats land on the most energy.
   */
  private combAlign(): void {
    if (this.period <= 0) return;
    const beats = Math.min(6, Math.floor((this.head * this.hopDt) / this.period));
    if (beats < 2) return;
    const STEPS = 16;
    let bestOff = 0;
    let bestScore = -Infinity;
    for (let s = 0; s < STEPS; s++) {
      const off = (s / STEPS) * this.period;
      let score = 0;
      for (let j = 0; j < beats; j++) score += this.envAt(off + j * this.period);
      if (score > bestScore) {
        bestScore = score;
        bestOff = off;
      }
    }
    // `bestOff` is the time since the most recent beat, so the wrapped
    // phase right now is 2π·bestOff/period. Keep the unwrapped turns.
    const turns = Math.floor(this.phase / TWO_PI);
    this.phase = turns * TWO_PI + (TWO_PI * bestOff) / this.period;
  }
}
