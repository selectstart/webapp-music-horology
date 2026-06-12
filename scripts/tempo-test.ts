/**
 * Offline check of the mic-mode TempoTracker: feed a synthetic onset
 * envelope (noisy pulse train) and verify lock speed, accuracy, phase
 * alignment, and graceful re-lock on a tempo change.
 *
 *   node scripts/tempo-test.ts
 */
import { TempoTracker } from '../src/audio/tempo';

const SR = 44100;
const HOP = 1024;
const hopDt = HOP / SR;

function run(label: string, segments: Array<{ bpm: number; seconds: number }>): void {
  const tracker = new TempoTracker(SR, HOP);
  let t = 0;
  let nextBeat = 0.1;
  let rngState = 12345;
  const rng = () => ((rngState = (rngState * 48271) % 2147483647) / 2147483647);

  console.log(`\n── ${label} ──`);
  for (const seg of segments) {
    const period = 60 / seg.bpm;
    const segEnd = t + seg.seconds;
    let lockedAt = -1;
    let phaseErrSum = 0;
    let phaseErrN = 0;
    while (t < segEnd) {
      let flux = 0.08 * rng(); // noise floor
      if (t >= nextBeat) {
        flux += 0.9 + 0.2 * rng(); // the hit
        // measure how far the tracker's predicted beat is from truth
        if (tracker.confidence > 0.25 && tracker.period > 0) {
          const m = tracker.phase % (2 * Math.PI);
          const w = m < 0 ? m + 2 * Math.PI : m;
          const err = (w > Math.PI ? w - 2 * Math.PI : w) / (2 * Math.PI);
          phaseErrSum += Math.abs(err);
          phaseErrN++;
        }
        nextBeat += period * (1 + 0.01 * (rng() - 0.5)); // human jitter
      }
      tracker.push(flux);
      t += hopDt;
      if (lockedAt < 0 && Math.abs(tracker.bpm - seg.bpm) < 3 && tracker.confidence > 0.25) {
        lockedAt = t - (segEnd - seg.seconds);
      }
    }
    const meanPhaseErr = phaseErrN ? ((phaseErrSum / phaseErrN) * 100).toFixed(1) : '—';
    console.log(
      `  target ${seg.bpm} bpm → got ${tracker.bpm.toFixed(1)} bpm,` +
        ` conf ${tracker.confidence.toFixed(2)},` +
        ` locked in ${lockedAt < 0 ? 'NEVER' : lockedAt.toFixed(1) + 's'},` +
        ` mean |phase err| ${meanPhaseErr}% of a beat`,
    );
  }
}

run('steady 120', [{ bpm: 120, seconds: 15 }]);
run('slow 72', [{ bpm: 72, seconds: 15 }]);
run('fast 168', [{ bpm: 168, seconds: 15 }]);
run('tempo change 120 → 140', [
  { bpm: 120, seconds: 12 },
  { bpm: 140, seconds: 12 },
]);
