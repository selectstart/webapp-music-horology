import { guess } from 'web-audio-beat-detector';
import { TEMPO } from '../mappings';
import { foldBpm } from '../movement/physics';

export interface TempoResult {
  /** Detected tempo folded into the plausible window. */
  bpm: number;
  /** Seconds from the start of the buffer to the first beat. */
  offset: number;
  /** False when detection failed and we fell back. */
  confident: boolean;
}

/**
 * Full-song tempo for file mode. web-audio-beat-detector renders the
 * buffer through a lowpass offline and measures peak intervals — solid
 * for anything with a pulse. On failure (ambient, rubato, spoken word)
 * we fall back to a calm rate and let the escapement free-run.
 *
 * Octave folding keeps offset valid: beats at 2× or ½× tempo still pass
 * through the same grid anchor.
 */
export async function detectTempo(buffer: AudioBuffer): Promise<TempoResult> {
  try {
    const { bpm, offset } = await guess(buffer);
    return { bpm: foldBpm(bpm), offset, confident: true };
  } catch {
    return { bpm: TEMPO.FALLBACK_BPM, offset: 0, confident: false };
  }
}
