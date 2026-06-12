/**
 * mappings.ts — THE MAPPING ENGINE
 * ================================
 * Every relationship between an audio feature and a mechanical behaviour
 * lives in this file as an adjustable constant. If the movement feels wrong,
 * tune it here — nothing elsewhere should need to change.
 *
 * Conventions:
 *  - times are seconds, angles are degrees unless suffixed RAD
 *  - "tau" means an exponential time constant: smaller = faster response
 *  - springs are second-order: STIFFNESS is the natural frequency omega
 *    (rad/s — higher = faster), DAMPING is the ratio zeta
 *    (< 1 overshoots, 1 critically damped, > 1 sluggish)
 */

/* ────────────────────────────────────────────────────────────────────
 * TEMPO → ESCAPEMENT
 * The balance wheel completes OSC_PER_BEAT full oscillations per song
 * beat. At 1.0, a 120 BPM song gives a 2 Hz balance, and the escapement
 * tick-tocks twice per beat (each semi-oscillation = one pallet impulse),
 * i.e. vph = BPM × 120.
 * ──────────────────────────────────────────────────────────────────── */
export const TEMPO = {
  /** Full balance oscillations per musical beat. */
  OSC_PER_BEAT: 1.0,

  /** Glide time-constant when the tempo (re)locks. Larger = more stately,
   *  never snappy. A real movement can't change rate instantly. */
  FREQ_GLIDE_TAU: 0.9,

  /** Servo gain (1/s) pulling the escapement phase onto the detected beat
   *  grid in file mode, so ticks land on the song's actual beats.
   *  0 disables the servo (free-running escapement). */
  PHASE_SERVO_GAIN: 1.5,

  /** Detected tempi are folded into this window by octave doubling/halving
   *  so a 75 BPM ballad doesn't read as 150 and vice versa. */
  MIN_BPM: 55,
  MAX_BPM: 190,

  /** Used when detection fails outright — a calm at-rest rate. */
  FALLBACK_BPM: 72,
} as const;

/* ────────────────────────────────────────────────────────────────────
 * LOUDNESS (RMS) → BALANCE AMPLITUDE
 * Quiet verse = lazy swing, loud chorus = full swing. RMS is normalised
 * against a rolling peak (not absolute level) so quiet masters, loud
 * masters and AGC'd phone mics all use the full range.
 * ──────────────────────────────────────────────────────────────────── */
export const AMPLITUDE = {
  /** Swing at the quietest playing passage. */
  MIN_DEG: 180,
  /** Swing at full chorus. (Real watches knock above ~330° — we stop short.) */
  MAX_DEG: 310,

  /** Spring on amplitude changes: weighty, with a hint of overshoot when
   *  a chorus lands. */
  SPRING_STIFFNESS: 5.5,
  SPRING_DAMPING: 0.8,

  /** Loudness envelope follower: fast attack so hits register, slow
   *  release so the swing decays like a flywheel, not a VU meter. */
  ATTACK_TAU: 0.06,
  RELEASE_TAU: 0.45,

  /** Rolling peak normalisation: the reference peak decays this fraction
   *  per second, so the mapping re-spreads after a loud section. */
  PEAK_DECAY_PER_S: 0.06,
  /** Absolute floor for the rolling peak — below this is "silence",
   *  preventing noise from being stretched to full amplitude. */
  PEAK_FLOOR: 0.001,
} as const;

/* ────────────────────────────────────────────────────────────────────
 * ESCAPEMENT GEOMETRY & IMPULSE FEEL
 * Discrete events fired each semi-oscillation (each "tick").
 * ──────────────────────────────────────────────────────────────────── */
export const ESCAPEMENT = {
  /** Escape wheel tooth count. 15 is the classic Swiss lever number. */
  TEETH: 15,
  /** The wheel advances half a tooth pitch per beat (entry/exit pallets
   *  alternate): 360 / TEETH / 2. Kept explicit for tuning. */
  STEP_DEG: 360 / 15 / 2,

  /** Escape wheel snap spring — fast advance with a whisper of recoil. */
  WHEEL_STIFFNESS: 70,
  WHEEL_DAMPING: 0.75,

  /** Pallet fork swing to each banking pin, and its snap spring. */
  PALLET_DEG: 9,
  PALLET_STIFFNESS: 60,
  PALLET_DAMPING: 0.55,

  /** Tri-synchro glide: the centre seconds wheel follows the escape
   *  wheel's stepped angle through a viscous/magnetic coupling with this
   *  time constant. Average gearing stays strictly 78:14; the smoothing
   *  lives inside backlash, so the hand glides like a Spring Drive while
   *  the escapement still ticks. Smaller = closer to raw stepping. */
  GLIDE_TAU: 0.35,
} as const;

/* ────────────────────────────────────────────────────────────────────
 * HAIRSPRING BREATHING
 * The inner coil is fixed to the balance collet, so it rotates the full
 * balance angle; the outer end is pinned at the stud and doesn't move.
 * Intermediate coils follow a power-law falloff — this is what makes
 * the spring visibly bunch and relax ("breathe") each swing.
 * ──────────────────────────────────────────────────────────────────── */
export const HAIRSPRING = {
  TURNS: 8,
  /** Fraction of the balance angle the collet end actually shows.
   *  1.0 is physical truth; lower if the bunching reads as chaotic. */
  BREATH_GAIN: 0.85,
  /** Falloff exponent: angular offset = angle × (1 − s)^EXP where s is
   *  the normalised position along the spring (0 = collet, 1 = stud).
   *  Higher = breathing concentrated in the inner coils. */
  BREATH_FALLOFF: 1.6,
} as const;

/* ────────────────────────────────────────────────────────────────────
 * GEAR TRAIN RATIOS
 * Derived from the drawn geometry (wheel radius ÷ pinion radius in
 * render.ts), so the visible meshing and the motion agree. The whole
 * train is driven backwards from the escape wheel's continuous angle —
 * which means every wheel micro-steps with each beat, as a real train
 * does. Signs alternate because meshing wheels counter-rotate.
 * ──────────────────────────────────────────────────────────────────── */
export const TRAIN = {
  /** fourth = escape / (escape pinion ratio). Escape R75-wheel drives… */
  ESC_TO_FOURTH: 75 / 14,
  FOURTH_TO_THIRD: 70 / 16,
  THIRD_TO_CENTER: 90 / 18,
  /** Keyless works on the barrel bridge: ratchet → crown → winding
   *  pinion, alternating direction, each faster than the last. */
  RATCHET_TO_CROWN: 78 / 48,
  CROWN_TO_WINDING: 48 / 22,
  /** Chronograph horizontal clutch: driving ring on the fourth wheel
   *  (r30) meshes the coupling wheel (r26). */
  FOURTH_TO_COUPLING: 30 / 26,
  /** Moon disc edge to its drive wheel. */
  MOON_TO_DRIVE: 1.2,
  /** Centre seconds wheel (r78) driven by the escape pinion (r14) —
   *  STRICT gearing: the sweep hand is this wheel. It micro-steps with
   *  the escapement and its rate scales with the song's tempo. */
  ESC_TO_CENTERSEC: 78 / 14,
  /** Fourth keyless wheel: winding pinion (r22) → setting wheel (r18). */
  WINDING_TO_SETTING: 22 / 18,
  /** Glide wheel (r12) on the centre seconds rim (r78) — the fast,
   *  continuously spinning flywheel of the tri-synchro regulator. */
  CENTERSEC_TO_GLIDE: 78 / 12,
} as const;

/* ────────────────────────────────────────────────────────────────────
 * BASS → MAINSPRING BARREL
 * Low-frequency energy drives the barrel's rotation speed: a bass-heavy
 * passage visibly winds the train harder. Bass is normalised against
 * its own rolling peak, like RMS.
 * ──────────────────────────────────────────────────────────────────── */
export const BARREL = {
  /** Barrel speed at zero bass (deg/s) — barely creeping, like the real thing. */
  BASE_DPS: 0.6,
  /** Additional speed at full bass (deg/s). */
  BASS_DPS: 9,
  ATTACK_TAU: 0.08,
  RELEASE_TAU: 0.6,
  PEAK_DECAY_PER_S: 0.06,
  PEAK_FLOOR: 0.5,
} as const;

/* ────────────────────────────────────────────────────────────────────
 * SPECTRAL CENTROID → MATERIAL TEMPERATURE
 * Brightness of the sound shifts the gear train's gilding between warm
 * rose gold (dark, bassy passages) and cool rhodium (bright passages).
 * The shift is slow and weighty — metal changing under different light,
 * not a colour organ.
 * ──────────────────────────────────────────────────────────────────── */
export const MATERIAL = {
  /** Centroid (Hz) at or below this reads fully warm… */
  WARM_HZ: 500,
  /** …and at or above this, fully cool. Interpolated on a log scale. */
  COOL_HZ: 3200,
  /** Smoothing time constant for the temperature value. */
  TAU: 2.5,
  /** Gradient endpoints: [light stop, dark stop] for each temperature. */
  WARM_LIGHT: '#e9c08e',
  WARM_DARK: '#a4724b',
  COOL_LIGHT: '#dfe2e6',
  COOL_DARK: '#84888f',
} as const;

/* ────────────────────────────────────────────────────────────────────
 * MIC MODE — live tempo lock
 * No lookahead exists, so the escapement follows the TempoTracker's
 * beat phase. Held to a gentler servo than file mode, and only when
 * the tracker is confident; otherwise the movement glides free.
 * ──────────────────────────────────────────────────────────────────── */
export const MIC = {
  /** Servo gain (1/s) pulling the escapement onto the live beat grid. */
  SERVO_GAIN: 0.9,
  /** Below this tracker confidence the escapement free-glides. */
  MIN_LOCK_CONFIDENCE: 0.25,
  /** PLL: onsets within this fraction of a beat of the prediction pull
   *  phase onto themselves… */
  PLL_WINDOW: 0.35,
  /** …by this fraction of the error per onset. */
  PLL_GAIN: 0.22,
  /** Raw RMS below this for SILENCE_HOLD_S = the room went quiet:
   *  the movement winds down, then re-locks when sound returns. */
  SILENCE_RMS: 0.0035,
  SILENCE_HOLD_S: 2.0,
} as const;

/* ────────────────────────────────────────────────────────────────────
 * TEMPO TRACKER INTERNALS (mic mode)
 * ──────────────────────────────────────────────────────────────────── */
export const TRACKER = {
  /** Autocorrelation window over the onset envelope. */
  WINDOW_S: 6,
  /** How often the period is re-estimated. */
  REEST_S: 0.5,
  /** Onset = flux exceeding rolling mean by this many σ. */
  ONSET_THRESH_STD: 2.0,
  ONSET_REFRACTORY_S: 0.12,
  /** Time constant of the rolling flux statistics (rides through AGC). */
  FLUX_STAT_TAU: 1.5,
  /** Log-domain tempo prior: centre and width. */
  TEMPO_CENTER_BPM: 115,
  TEMPO_LOG_SIGMA: 0.45,
  /** Relative period change still treated as the same tempo (drift). */
  SWITCH_TOLERANCE: 0.045,
  /** Consecutive disagreeing estimates required to re-lock a new tempo. */
  SWITCH_PERSIST: 3,
  /** If the autocorrelation peak at half the chosen lag is at least this
   *  fraction of the chosen peak, prefer the faster octave (fixes fast
   *  songs locking at half tempo). */
  OCTAVE_PREFER: 0.6,
} as const;

/* ────────────────────────────────────────────────────────────────────
 * SILENCE / SONG END → WIND-DOWN
 * The movement loses power: rate stretches, amplitude dies, beats stop.
 * Hacking seconds, literally.
 * ──────────────────────────────────────────────────────────────────── */
export const WINDDOWN = {
  /** How quickly the beat rate stretches out as power is lost. */
  FREQ_DECAY_TAU: 1.4,
  /** Below this amplitude the escapement can no longer unlock — beats
   *  stop and the balance settles to rest. */
  STOP_AMPLITUDE_DEG: 8,
  /** Below this frequency (Hz) we consider the train stopped. */
  STOP_FREQ_HZ: 0.15,
} as const;

/* ────────────────────────────────────────────────────────────────────
 * SONG STRUCTURE → SECTIONS (file mode, offline novelty detection)
 * The whole song is analysed up front: log-band spectral features →
 * novelty curve → boundaries → segments classified by relative energy.
 * ──────────────────────────────────────────────────────────────────── */
export const SECTIONS = {
  /** FFT frame & hop (samples). 2048 @ 44.1k ≈ 46 ms resolution. */
  FRAME: 2048,
  HOP: 2048,
  /** Log-spaced analysis bands across this range. */
  BANDS: 12,
  BAND_LO_HZ: 50,
  BAND_HI_HZ: 8000,
  /** Temporal smoothing of band features before novelty. */
  SMOOTH_S: 1.5,
  /** Novelty compares the mean feature vector this far each side. */
  NOVELTY_HALF_WINDOW_S: 2.0,
  /** Boundaries must clear mean + this·σ of the novelty curve… */
  NOVELTY_THRESH_STD: 1.0,
  /** …and sections never get shorter than this. */
  MIN_SECTION_S: 8,
  /** Segment energy z-score above → chorus; below QUIET_Z → quiet. */
  CHORUS_Z: 0.4,
  QUIET_Z: -0.5,
  /** File mode can see the future: engage this early, on the upbeat. */
  ANTICIPATE_S: 0.5,
} as const;

/* ────────────────────────────────────────────────────────────────────
 * SECTIONS → COMPLICATIONS
 * Chorus engages the chronograph; a quiet passage / bridge engages the
 * moonphase; every boundary snaps the big date forward; bass keeps the
 * power reserve wound. Engagements are mechanical: levers and springs,
 * never fades.
 * ──────────────────────────────────────────────────────────────────── */
export const COMPLICATIONS = {
  /** Engage/disengage spring — deliberate, with overshoot on arrival. */
  ENGAGE_STIFFNESS: 7,
  ENGAGE_DAMPING: 0.55,
  /** Chronograph flyback return spring (disengage → zero). */
  FLYBACK_STIFFNESS: 9,
  FLYBACK_DAMPING: 0.7,
  /** Big date snap spring (digit drops into the window). */
  DATE_STIFFNESS: 26,
  DATE_DAMPING: 0.6,
  /** Moon self-rotation while engaged: one revolution per this long. */
  MOON_PERIOD_S: 90,
  /** Power reserve: charge rate at full bass / passive drain (per s). */
  RESERVE_CHARGE_PER_S: 0.1,
  RESERVE_DRAIN_PER_S: 0.03,
  /** Drain rate once the movement is winding down or at rest. */
  RESERVE_COLLAPSE_PER_S: 0.3,
  /** Jewels each complication contributes to the caliber plate. */
  JEWELS: { chrono: 4, moon: 2, date: 1, reserve: 2 },
  /** Mic mode has no lookahead: sustained loudness drives engagement. */
  MIC_ENERGY_HI: 0.62,
  MIC_ENERGY_LO: 0.3,
  MIC_HOLD_S: 2.5,
  MIC_SLOW_TAU: 4,
} as const;

/* ────────────────────────────────────────────────────────────────────
 * CALIBER PLATE
 * Generated spec strings shown on the dial.
 * ──────────────────────────────────────────────────────────────────── */
export const CALIBER = {
  /** vph = BPM × VPH_PER_BPM (two semi-oscillations per beat × 60 min). */
  VPH_PER_BPM: 120,
  /** Jewel count for the full train (balance hole + cap ×2, pallet
   *  staff ×2, two pallet stones, impulse pin, escape ×2, fourth ×2,
   *  third ×2, center ×2, barrel arbor ×2, chrono coupling, moon drive,
   *  centre-seconds bearing ×2, glide-wheel staff ×2 = 23).
   *  Complications add their own. */
  BASE_JEWELS: 23,
} as const;
