/**
 * Offline check of section detection: a synthetic 80 s "song" —
 * quiet intro → loud broadband chorus → mid verse → loud chorus.
 *
 *   npx esbuild scripts/sections-test.ts --bundle --format=esm \
 *     --outfile=/tmp/sections-test.mjs && node /tmp/sections-test.mjs
 */
import { analyzeSections } from '../src/audio/sections';

const SR = 44100;
const DUR = 80;
const n = SR * DUR;
const data = new Float32Array(n);
let rng = 99;
const rand = () => ((rng = (rng * 48271) % 2147483647) / 2147483647) * 2 - 1;

for (let i = 0; i < n; i++) {
  const t = i / SR;
  if (t < 20) {
    // quiet: soft low sine + a whisper of noise
    data[i] = 0.05 * Math.sin(2 * Math.PI * 110 * t) + 0.01 * rand();
  } else if (t < 40) {
    // chorus: loud, broadband, bright
    data[i] = 0.5 * rand() + 0.3 * Math.sin(2 * Math.PI * 220 * t) + 0.2 * Math.sin(2 * Math.PI * 2400 * t);
  } else if (t < 60) {
    // verse: medium
    data[i] = 0.12 * Math.sin(2 * Math.PI * 165 * t) + 0.08 * rand();
  } else {
    // chorus again
    data[i] = 0.5 * rand() + 0.3 * Math.sin(2 * Math.PI * 220 * t) + 0.2 * Math.sin(2 * Math.PI * 2400 * t);
  }
}

const mockBuffer = {
  sampleRate: SR,
  duration: DUR,
  length: n,
  numberOfChannels: 1,
  getChannelData: () => data,
} as unknown as AudioBuffer;

const sections = analyzeSections(mockBuffer);
console.log('expected ≈: quiet 0–20 · chorus 20–40 · verse 40–60 · chorus 60–80');
for (const s of sections) {
  console.log(`  ${s.kind.padEnd(6)} ${s.start.toFixed(1)}s → ${s.end.toFixed(1)}s`);
}
