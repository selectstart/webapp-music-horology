import { HAIRSPRING } from '../mappings';

const POINTS = 240;

/**
 * Generate the hairspring path for a given balance angle (radians).
 *
 * The spiral is Archimedean: radius grows linearly with arc position.
 * Breathing: a point at normalised position s (0 = collet, 1 = stud)
 * is rotated by balanceAngle × gain × (1 − s)^falloff, so the inner
 * coil follows the balance and the outer end stays pinned. The coils
 * visibly compress on one side and open on the other — exactly what a
 * flat hairspring does under amplitude.
 *
 * Regenerated every frame; ~240 points is nothing for the browser.
 */
export function hairspringPath(
  cx: number,
  cy: number,
  innerR: number,
  outerR: number,
  balanceAngleRad: number,
): string {
  const { TURNS, BREATH_GAIN, BREATH_FALLOFF } = HAIRSPRING;
  const totalSweep = TURNS * 2 * Math.PI;
  let d = '';
  for (let i = 0; i <= POINTS; i++) {
    const s = i / POINTS;
    const theta =
      s * totalSweep +
      balanceAngleRad * BREATH_GAIN * Math.pow(1 - s, BREATH_FALLOFF);
    const r = innerR + (outerR - innerR) * s;
    const x = cx + r * Math.cos(theta);
    const y = cy + r * Math.sin(theta);
    d += (i === 0 ? 'M' : 'L') + x.toFixed(2) + ' ' + y.toFixed(2);
  }
  return d;
}

/** Stud position — the fixed outer terminal (s = 1, unaffected by breathing). */
export function hairspringStud(
  cx: number,
  cy: number,
  outerR: number,
): { x: number; y: number } {
  const theta = HAIRSPRING.TURNS * 2 * Math.PI;
  return { x: cx + outerR * Math.cos(theta), y: cy + outerR * Math.sin(theta) };
}
