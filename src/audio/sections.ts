import { SECTIONS } from '../mappings';

export type SectionKind = 'chorus' | 'verse' | 'quiet';

export interface Section {
  start: number;
  end: number;
  kind: SectionKind;
}

/** In-place iterative radix-2 FFT. */
function fft(re: Float32Array, im: Float32Array): void {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      const tr = re[i];
      re[i] = re[j];
      re[j] = tr;
      const ti = im[i];
      im[i] = im[j];
      im[j] = ti;
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wr = Math.cos(ang);
    const wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1;
      let ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const ur = re[i + k];
        const ui = im[i + k];
        const vr = re[i + k + len / 2] * cr - im[i + k + len / 2] * ci;
        const vi = re[i + k + len / 2] * ci + im[i + k + len / 2] * cr;
        re[i + k] = ur + vr;
        im[i + k] = ui + vi;
        re[i + k + len / 2] = ur - vr;
        im[i + k + len / 2] = ui - vi;
        const ncr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = ncr;
      }
    }
  }
}

/**
 * Offline song-structure analysis for file mode.
 *
 * Per frame: FFT → log-spaced band energies (z-normalised per band,
 * temporally smoothed). Novelty at t = cosine distance between the mean
 * feature vectors of the windows just before and just after t. Peaks
 * above mean + k·σ (with a minimum section length) become boundaries,
 * and each segment is classified by its energy z-score relative to the
 * whole song: loud → chorus, soft → quiet, else verse.
 *
 * This runs once during "Measuring…" so complications can anticipate
 * structure during playback.
 */
export function analyzeSections(buffer: AudioBuffer): Section[] {
  const { FRAME, HOP, BANDS, BAND_LO_HZ, BAND_HI_HZ } = SECTIONS;
  const sr = buffer.sampleRate;
  const duration = buffer.duration;
  if (duration < SECTIONS.MIN_SECTION_S * 2.5) {
    return [{ start: 0, end: duration, kind: 'verse' }];
  }

  // Mono mixdown.
  const mono = new Float32Array(buffer.length);
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const ch = buffer.getChannelData(c);
    for (let i = 0; i < ch.length; i++) mono[i] += ch[i] / buffer.numberOfChannels;
  }

  const frames = Math.floor((mono.length - FRAME) / HOP) + 1;
  if (frames < 16) return [{ start: 0, end: duration, kind: 'verse' }];

  const hann = new Float32Array(FRAME);
  for (let i = 0; i < FRAME; i++) hann[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (FRAME - 1));

  // Log-spaced band edges in bin space.
  const binHz = sr / FRAME;
  const edges: number[] = [];
  for (let b = 0; b <= BANDS; b++) {
    const hz = BAND_LO_HZ * Math.pow(BAND_HI_HZ / BAND_LO_HZ, b / BANDS);
    edges.push(Math.max(1, Math.min(FRAME / 2 - 1, Math.round(hz / binHz))));
  }

  const feat = new Float32Array(frames * BANDS);
  const energy = new Float32Array(frames);
  const re = new Float32Array(FRAME);
  const im = new Float32Array(FRAME);

  for (let f = 0; f < frames; f++) {
    const off = f * HOP;
    for (let i = 0; i < FRAME; i++) {
      re[i] = mono[off + i] * hann[i];
      im[i] = 0;
    }
    fft(re, im);
    let total = 0;
    for (let b = 0; b < BANDS; b++) {
      let p = 0;
      for (let k = edges[b]; k < edges[b + 1]; k++) p += re[k] * re[k] + im[k] * im[k];
      feat[f * BANDS + b] = Math.log1p(p);
      total += p;
    }
    energy[f] = Math.log1p(total);
  }

  // Per-band z-normalisation, then temporal box smoothing.
  for (let b = 0; b < BANDS; b++) {
    let m = 0;
    for (let f = 0; f < frames; f++) m += feat[f * BANDS + b];
    m /= frames;
    let v = 0;
    for (let f = 0; f < frames; f++) v += (feat[f * BANDS + b] - m) ** 2;
    const sd = Math.sqrt(v / frames) || 1;
    for (let f = 0; f < frames; f++) feat[f * BANDS + b] = (feat[f * BANDS + b] - m) / sd;
  }
  const frameDt = HOP / sr;
  const smoothN = Math.max(1, Math.round(SECTIONS.SMOOTH_S / frameDt));
  const smoothed = new Float32Array(feat.length);
  for (let b = 0; b < BANDS; b++) {
    let acc = 0;
    for (let f = 0; f < frames; f++) {
      acc += feat[f * BANDS + b];
      if (f >= smoothN) acc -= feat[(f - smoothN) * BANDS + b];
      smoothed[f * BANDS + b] = acc / Math.min(f + 1, smoothN);
    }
  }

  // Novelty: cosine distance between mean vectors before/after each frame.
  const W = Math.max(2, Math.round(SECTIONS.NOVELTY_HALF_WINDOW_S / frameDt));
  const novelty = new Float32Array(frames);
  const before = new Float32Array(BANDS);
  const after = new Float32Array(BANDS);
  for (let f = W; f < frames - W; f++) {
    before.fill(0);
    after.fill(0);
    for (let j = 1; j <= W; j++) {
      for (let b = 0; b < BANDS; b++) {
        before[b] += smoothed[(f - j) * BANDS + b];
        after[b] += smoothed[(f + j) * BANDS + b];
      }
    }
    let dot = 0;
    let na = 0;
    let nb = 0;
    for (let b = 0; b < BANDS; b++) {
      dot += before[b] * after[b];
      na += before[b] * before[b];
      nb += after[b] * after[b];
    }
    novelty[f] = 1 - dot / (Math.sqrt(na * nb) + 1e-9);
  }

  // Peak-pick boundaries above mean + k·σ, spaced ≥ MIN_SECTION_S.
  let nm = 0;
  for (const v of novelty) nm += v;
  nm /= frames;
  let nv = 0;
  for (const v of novelty) nv += (v - nm) ** 2;
  const thresh = nm + SECTIONS.NOVELTY_THRESH_STD * Math.sqrt(nv / frames);
  const minGap = Math.round(SECTIONS.MIN_SECTION_S / frameDt);
  const bounds: number[] = [0];
  for (let f = W + 1; f < frames - W - 1; f++) {
    if (
      novelty[f] > thresh &&
      novelty[f] >= novelty[f - 1] &&
      novelty[f] >= novelty[f + 1] &&
      f - (bounds[bounds.length - 1] ?? 0) >= minGap &&
      frames - f >= minGap
    ) {
      bounds.push(f);
    }
  }
  bounds.push(frames);

  // Classify each segment by energy z-score over the whole song.
  let em = 0;
  for (const v of energy) em += v;
  em /= frames;
  let ev = 0;
  for (const v of energy) ev += (v - em) ** 2;
  const esd = Math.sqrt(ev / frames) || 1;

  const sections: Section[] = [];
  for (let s = 0; s < bounds.length - 1; s++) {
    const a = bounds[s];
    const b = bounds[s + 1];
    let mean = 0;
    for (let f = a; f < b; f++) mean += energy[f];
    const z = (mean / (b - a) - em) / esd;
    const kind: SectionKind = z > SECTIONS.CHORUS_Z ? 'chorus' : z < SECTIONS.QUIET_Z ? 'quiet' : 'verse';
    const start = (a * HOP) / sr;
    const end = s === bounds.length - 2 ? duration : (b * HOP) / sr;
    const prev = sections[sections.length - 1];
    if (prev && prev.kind === kind) prev.end = end;
    else sections.push({ start, end, kind });
  }
  return sections;
}
