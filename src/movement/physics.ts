import { TEMPO } from '../mappings';

/**
 * Second-order spring (damped harmonic oscillator), integrated with
 * semi-implicit Euler. Used for everything that should move with mass:
 * balance amplitude, pallet snap, escape wheel advance.
 */
export class Spring {
  velocity = 0;

  constructor(
    public value: number,
    private stiffness: number,
    private damping: number,
  ) {}

  step(target: number, dt: number): number {
    // Subdivide large steps (tab switch, GC pause) to keep stiff springs stable.
    const n = Math.max(1, Math.ceil(dt / 0.008));
    const h = dt / n;
    for (let i = 0; i < n; i++) {
      const accel =
        this.stiffness * this.stiffness * (target - this.value) -
        2 * this.damping * this.stiffness * this.velocity;
      this.velocity += accel * h;
      this.value += this.velocity * h;
    }
    return this.value;
  }

  snapTo(v: number): void {
    this.value = v;
    this.velocity = 0;
  }
}

export interface BeatEvent {
  /** Total beats (semi-oscillations) since the escapement started. */
  count: number;
  /** Which pallet receives the impulse: alternates every beat. */
  side: 1 | -1;
}

/**
 * The escapement timebase. Keeps an accumulated phase Θ (radians) where
 * one full balance oscillation = 2π and one beat (tick) = π.
 *
 * Frequency glides toward its target rather than jumping, and an optional
 * servo gently pulls the phase onto an externally supplied beat grid
 * (file mode, where the beat detector gives us bpm + offset).
 */
export class Escapement {
  freq = 0; // current oscillation rate, Hz
  targetFreq = 0;
  phase = 0; // accumulated, radians, monotonic
  beatCount = 0;

  /** Hard-set the timebase, e.g. when a song starts. */
  reset(freq: number, phase: number): void {
    this.freq = freq;
    this.targetFreq = freq;
    this.phase = phase;
    this.beatCount = Math.floor(phase / Math.PI);
  }

  /**
   * Advance by dt. gridPhase, when given, is the ideal unwrapped phase
   * derived from song time — the servo closes any drift over ~1s, which
   * also produces a graceful re-lock after a pause.
   * Returns the beats that elapsed this step.
   */
  step(
    dt: number,
    gridPhase: number | null,
    glideTau: number = TEMPO.FREQ_GLIDE_TAU,
    servoGain: number = TEMPO.PHASE_SERVO_GAIN,
  ): BeatEvent[] {
    const k = 1 - Math.exp(-dt / glideTau);
    this.freq += (this.targetFreq - this.freq) * k;

    let dPhase = 2 * Math.PI * this.freq * dt;
    if (gridPhase !== null) {
      dPhase += (gridPhase - this.phase) * servoGain * dt;
    }
    // The train never runs backwards, however hard the servo pulls.
    this.phase += Math.max(0, dPhase);

    const beats: BeatEvent[] = [];
    const target = Math.floor(this.phase / Math.PI);
    while (this.beatCount < target) {
      this.beatCount++;
      beats.push({ count: this.beatCount, side: this.beatCount % 2 === 0 ? 1 : -1 });
    }
    return beats;
  }
}

/** Fold a detected tempo into the plausible window by octave shifts. */
export function foldBpm(bpm: number): number {
  let b = bpm;
  while (b < TEMPO.MIN_BPM) b *= 2;
  while (b > TEMPO.MAX_BPM) b /= 2;
  return b;
}
