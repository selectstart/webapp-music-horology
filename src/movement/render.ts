import { ESCAPEMENT, TRAIN, BARREL, MATERIAL } from '../mappings';
import { Spring } from './physics';
import { hairspringPath, hairspringStud } from './hairspring';

/* ── Caliber layout (viewBox 0 0 1000 1000) ───────────────────────────
 * The train runs in an S from the barrel (upper left) down to the
 * balance (lower left, the hero). Wheel centres are placed so that each
 * wheel's tooth ring touches the NEXT wheel's pinion:
 * |centre A − centre B| ≈ R_A + r_pinion_B. The visual gear ratios in
 * mappings.ts (TRAIN) are derived from these same radii, so the drawing
 * and the motion agree.
 */
const BARREL_C = { x: 320, y: 300 };
const BARREL_R = 120; // drum tooth ring
const RATCHET_R = 78;

const CENTER_C = { x: 429, y: 391 };
const CENTER_R = 90;
const CENTER_PINION = 22; // meshes the barrel: |Δ| = 142 ≈ 120 + 22

const THIRD_C = { x: 530, y: 354 };
const THIRD_R = 70;
const THIRD_PINION = 18; // meshes center: |Δ| = 108 ≈ 90 + 18

const FOURTH_C = { x: 604, y: 397 };
const FOURTH_R = 75;
const FOURTH_PINION = 16; // meshes third: |Δ| = 86 ≈ 70 + 16

const EC = { x: 589, y: 485 }; // escape wheel
const ESCAPE_R = 56;
const ESCAPE_PINION = 14; // meshes fourth: |Δ| = 89 ≈ 75 + 14

const PP = { x: 510, y: 555 }; // pallet fork pivot

/* Auxiliary gear work — every wheel meshes something that already turns.
 * Crown wheel: |Δ to barrel| = 126 ≈ ratchet 78 + crown 48.
 * Winding pinion: |Δ to crown| = 70 ≈ crown 48 + pinion 22.
 * Coupling: |Δ to fourth| = 57 ≈ driving ring 30 + coupling 26. */
const CROWN_C = { x: 409, y: 211 };
const CROWN_R = 48;
const WIND_C = { x: 459, y: 162 };
const WIND_R = 22;
const COUPLING_C = { x: 654, y: 425 };
const COUPLING_R = 26;
const DRIVING_RING_R = 30;
const MOONDRIVE_C = { x: 745, y: 365 };
const MOONDRIVE_R = 20;

/* Centre seconds wheel: co-axial with the sweep hand (they turn as one
 * assembly on the sweep staff), tooth ring meshing the escape pinion:
 * |Δ centre→escape| = 92.4 ≈ wheel 78 + pinion 14. STRICTLY geared:
 * its angle (and the hand's) is the escape wheel's sprung angle through
 * the 78:14 ratio, so the hand micro-steps with every beat and scales
 * with tempo. The escape wheel runs CCW so the hand comes out CW. */
const CS_C = { x: 500, y: 510 };
const CS_R = 78;
const SWEEP_LEN = 385;
const SWEEP_TAIL = 92;

/* Fourth keyless wheel: |Δ to winding pinion| = 41.8 ≈ 22 + 18. */
const SETTING_C = { x: 499, y: 150 };
const SETTING_R = 18;

/* Tri-synchro glide regulator: a small flywheel on the centre seconds
 * rim (|Δ| = 90 = 78 + 12), braked between two pole shoes. It is the
 * one continuously spinning wheel in the movement — the visible reason
 * the hand glides instead of stepping. */
const GLIDE_C = { x: 558, y: 579 };
const GLIDE_R = 12;

const BC = { x: 390, y: 680 }; // balance centre — the hero
const BALANCE_R = 145;
const HS_INNER = 34;
const HS_OUTER = 94;

const NS = 'http://www.w3.org/2000/svg';

function polar(cx: number, cy: number, r: number, deg: number): [number, number] {
  const a = (deg * Math.PI) / 180;
  return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
}

function lerpHex(a: string, b: string, t: number): string {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const c = (sh: number) => {
    const va = (pa >> sh) & 0xff;
    const vb = (pb >> sh) & 0xff;
    return Math.round(va + (vb - va) * t);
  };
  return `rgb(${c(16)},${c(8)},${c(0)})`;
}

/** 15-tooth club-tooth escape wheel outline, centred on (0,0). */
function escapeWheelPath(r: number, teeth: number): string {
  const root = r * 0.72;
  let d = '';
  for (let i = 0; i < teeth; i++) {
    const a = (i * 360) / teeth;
    const [x1, y1] = polar(0, 0, root, a - 6);
    const [x2, y2] = polar(0, 0, r, a);
    const [x3, y3] = polar(0, 0, r * 0.93, a + 5);
    const [x4, y4] = polar(0, 0, root, a + 9);
    d += `${i === 0 ? 'M' : 'L'}${x1.toFixed(1)} ${y1.toFixed(1)}`;
    d += `L${x2.toFixed(1)} ${y2.toFixed(1)}L${x3.toFixed(1)} ${y3.toFixed(1)}L${x4.toFixed(1)} ${y4.toFixed(1)}`;
  }
  return d + 'Z';
}

/**
 * A train wheel: fine tooth ring (dashed-stroke illusion — reads as
 * gear teeth at this scale and rotates as one transform), slender rim,
 * five spokes, hub, and the pinion that meshes the previous wheel.
 */
function trainWheel(cx: number, cy: number, r: number, pinionR: number): string {
  const spokes = [0, 72, 144, 216, 288]
    .map((a) => {
      const [ix, iy] = polar(cx, cy, pinionR + 6, a + 18);
      const [ox, oy] = polar(cx, cy, r - 10, a + 18);
      return `<line x1="${ix.toFixed(1)}" y1="${iy.toFixed(1)}" x2="${ox.toFixed(1)}" y2="${oy.toFixed(1)}" stroke="url(#trainGrad)" stroke-width="8"/>`;
    })
    .join('');
  return `
    <circle cx="${cx}" cy="${cy}" r="${r + 7}" fill="url(#wheelShadow)"/>
    <circle cx="${cx}" cy="${cy}" r="${r - 3.5}" fill="none" stroke="url(#trainGrad)" stroke-width="7" stroke-dasharray="3.2 2.6"/>
    <circle cx="${cx}" cy="${cy}" r="${r - 9}" fill="none" stroke="url(#trainGrad)" stroke-width="5"/>
    ${spokes}
    <circle cx="${cx}" cy="${cy}" r="${pinionR + 5}" fill="url(#trainGrad)" stroke="#0c0d10" stroke-width="1"/>
    <circle cx="${cx}" cy="${cy}" r="${pinionR}" fill="none" stroke="#0c0d10" stroke-opacity="0.55" stroke-width="3" stroke-dasharray="2.4 2.2"/>
    <circle cx="${cx}" cy="${cy}" r="3.5" fill="#0c0d10"/>
  `;
}

/**
 * Small solid wheel (crown wheel, coupling, drive wheels): dashed tooth
 * ring, sunburst-brushed face, slotted hub that rotates with it.
 */
function smallWheel(cx: number, cy: number, r: number, rays = 8): string {
  const burst = Array.from({ length: rays }, (_, i) => {
    const a = i * (360 / rays);
    const [ix, iy] = polar(cx, cy, r * 0.25, a);
    const [ox, oy] = polar(cx, cy, r - 6, a);
    return `<line x1="${ix.toFixed(1)}" y1="${iy.toFixed(1)}" x2="${ox.toFixed(1)}" y2="${oy.toFixed(1)}" stroke="#ffffff" stroke-opacity="0.05" stroke-width="2.5"/>`;
  }).join('');
  return `
    <circle cx="${cx}" cy="${cy}" r="${r + 4}" fill="url(#wheelShadow)"/>
    <circle cx="${cx}" cy="${cy}" r="${r - 2.5}" fill="none" stroke="url(#trainGrad)" stroke-width="5" stroke-dasharray="2.6 2.2"/>
    <circle cx="${cx}" cy="${cy}" r="${r - 5}" fill="url(#trainGrad)" stroke="#0c0d10" stroke-width="1"/>
    ${burst}
    <circle cx="${cx}" cy="${cy}" r="${Math.max(5, r * 0.18)}" fill="url(#bluedGrad)" stroke="#06070a" stroke-width="1"/>
    <line x1="${cx - r * 0.13}" y1="${cy}" x2="${cx + r * 0.13}" y2="${cy}" stroke="#06070a" stroke-width="1.6"/>
  `;
}

/** Centre seconds needle: tapered polished steel through the centre. */
function sweepNeedle(): string {
  const { x, y } = CS_C;
  return `M ${x - 3.2} ${y + SWEEP_TAIL} L ${x - 1.2} ${y - SWEEP_LEN + 34} L ${x} ${y - SWEEP_LEN}
    L ${x + 1.2} ${y - SWEEP_LEN + 34} L ${x + 3.2} ${y + SWEEP_TAIL} Z`;
}

/** Tapered bridge ("cock") from an edge anchor to a pivot boss, with stripes. */
function buildCock(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  rootW: number,
  neckW: number,
  bossR: number,
): string {
  const len = Math.hypot(bx - ax, by - ay);
  const ang = (Math.atan2(by - ay, bx - ax) * 180) / Math.PI;
  const rw = rootW / 2;
  const nw = neckW / 2;
  const taperAt = len * 0.56;
  const body = `M0 ${-rw} L${taperAt} ${-rw}
    C ${len * 0.78} ${-rw * 0.92} ${len * 0.8} ${-nw} ${len - bossR} ${-nw}
    L${len - bossR} ${nw}
    C ${len * 0.8} ${nw} ${len * 0.78} ${rw * 0.92} ${taperAt} ${rw}
    L0 ${rw} Z`;
  return `<g transform="translate(${ax} ${ay}) rotate(${ang.toFixed(2)})" filter="url(#ds)">
    <path d="${body}" fill="url(#bridgeGrad)" stroke="#0c0d10" stroke-width="1.5"/>
    <path d="${body}" fill="url(#cotes)" opacity="0.55"/>
    <path d="${body}" fill="none" stroke="#f5f0e6" stroke-opacity="0.12" stroke-width="1" transform="translate(0 -1)"/>
    <circle cx="${len}" cy="0" r="${bossR}" fill="url(#bridgeGrad)" stroke="#0c0d10" stroke-width="1.5"/>
    <circle cx="${len}" cy="0" r="${bossR}" fill="url(#cotes)" opacity="0.55"/>
  </g>`;
}

/** A polished, slotted blued screw head. */
function screw(x: number, y: number, r: number, slotDeg: number): string {
  return `<g transform="rotate(${slotDeg} ${x} ${y})">
    <circle cx="${x}" cy="${y}" r="${r}" fill="url(#bluedGrad)" stroke="#06070a" stroke-width="1"/>
    <line x1="${x - r * 0.75}" y1="${y}" x2="${x + r * 0.75}" y2="${y}" stroke="#06070a" stroke-width="${Math.max(1.2, r * 0.22)}"/>
  </g>`;
}

/** Ruby jewel in a gold chaton. */
function jewel(x: number, y: number, r: number): string {
  return `<circle cx="${x}" cy="${y}" r="${r * 1.7}" fill="url(#goldGrad)" stroke="#0c0d10" stroke-width="1"/>
    <circle cx="${x}" cy="${y}" r="${r}" fill="url(#rubyGrad)"/>
    <circle cx="${x - r * 0.3}" cy="${y - r * 0.35}" r="${r * 0.28}" fill="#ffd9df" opacity="0.85"/>`;
}

/** Pallet fork drawn in absolute coords; rotated around PP at runtime. */
function buildFork(): string {
  const toE = { x: EC.x - PP.x, y: EC.y - PP.y };
  const lenE = Math.hypot(toE.x, toE.y);
  const ue = { x: toE.x / lenE, y: toE.y / lenE };
  const pe = { x: -ue.y, y: ue.x };

  const toB = { x: BC.x - PP.x, y: BC.y - PP.y };
  const lenB = Math.hypot(toB.x, toB.y);
  const ub = { x: toB.x / lenB, y: toB.y / lenB };
  const pb = { x: -ub.y, y: ub.x };

  const P = (px: number, py: number) => `${px.toFixed(1)} ${py.toFixed(1)}`;
  const at = (u: { x: number; y: number }, d: number, p: { x: number; y: number }, o: number) =>
    [PP.x + u.x * d + p.x * o, PP.y + u.y * d + p.y * o] as const;

  // Pallet stones sit where the escape teeth sweep past: just inside the
  // tooth ring, either side of the centre line.
  const stoneDist = lenE - ESCAPE_R + 8;
  const stoneA = at(ue, stoneDist, pe, 16);
  const stoneB = at(ue, stoneDist, pe, -16);
  const arm = (s: readonly [number, number]) =>
    `<path d="M${P(PP.x, PP.y)}L${P(s[0], s[1])}" stroke="url(#steelGrad)" stroke-width="8" stroke-linecap="round"/>`;
  const stone = (s: readonly [number, number]) => {
    const ang = (Math.atan2(EC.y - s[1], EC.x - s[0]) * 180) / Math.PI;
    return `<rect x="${s[0] - 3}" y="${s[1] - 7}" width="6" height="14" rx="1.5"
      fill="url(#rubyGrad)" transform="rotate(${(ang + 90).toFixed(1)} ${P(s[0], s[1])})"/>`;
  };

  // Lever tail toward the balance: horns stop short of the staff so the
  // impulse pin (on the balance roller) sits in the fork slot at rest.
  const hornDist = lenB - 28;
  const tailEnd = at(ub, hornDist - 16, pb, 0);
  const hornA = at(ub, hornDist, pb, 9);
  const hornB = at(ub, hornDist, pb, -9);

  return `
    ${arm(stoneA)}${arm(stoneB)}
    <path d="M${P(PP.x, PP.y)}L${P(tailEnd[0], tailEnd[1])}" stroke="url(#steelGrad)" stroke-width="7" stroke-linecap="round"/>
    <path d="M${P(tailEnd[0], tailEnd[1])}L${P(hornA[0], hornA[1])}" stroke="url(#steelGrad)" stroke-width="5" stroke-linecap="round"/>
    <path d="M${P(tailEnd[0], tailEnd[1])}L${P(hornB[0], hornB[1])}" stroke="url(#steelGrad)" stroke-width="5" stroke-linecap="round"/>
    ${stone(stoneA)}${stone(stoneB)}
    <circle cx="${PP.x}" cy="${PP.y}" r="9" fill="url(#steelGrad)"/>
  `;
}

export interface MovementFrame {
  /** Balance angle in degrees (signed, 0 = rest). */
  balanceDeg: number;
  /** Normalised bass 0..1 → barrel speed. */
  bass01: number;
  /** Material temperature 0 = warm rose gold, 1 = cool rhodium. */
  temp01: number;
  /** Moon disc drift angle (deg) — drives the moonphase drive wheel. */
  moonDeg: number;
  dt: number;
}

export class MovementRenderer {
  /** Root SVG — the complications deck docks into #comp-layer/#comp-top. */
  readonly svgEl: SVGSVGElement;
  private balanceG: SVGGElement;
  private springPath: SVGPathElement;
  private escapeG: SVGGElement;
  private palletG: SVGGElement;
  private fourthG: SVGGElement;
  private thirdG: SVGGElement;
  private centerG: SVGGElement;
  private barrelG: SVGGElement;
  private crownG: SVGGElement;
  private windingG: SVGGElement;
  private couplingG: SVGGElement;
  private moonDriveG: SVGGElement;
  private centerSecG: SVGGElement;
  private settingG: SVGGElement;
  private glideG: SVGGElement;
  private csDeg = 0; // glide-regulated centre seconds angle
  private sweepG: SVGGElement;
  private sweepShadowRotG: SVGGElement;
  private sweepShadowOffG: SVGGElement;
  private trainStops: SVGStopElement[];
  private metalGrads: SVGLinearGradientElement[] = [];
  private glintGrads: Array<[SVGRadialGradientElement, number]> = [];
  private keyLightGrad: SVGRadialGradientElement | null = null;
  private dsShadow: SVGFEDropShadowElement | null = null;

  private palletSpring = new Spring(
    ESCAPEMENT.PALLET_DEG,
    ESCAPEMENT.PALLET_STIFFNESS,
    ESCAPEMENT.PALLET_DAMPING,
  );
  private wheelSpring = new Spring(0, ESCAPEMENT.WHEEL_STIFFNESS, ESCAPEMENT.WHEEL_DAMPING);
  private palletTarget: number = ESCAPEMENT.PALLET_DEG;
  private wheelTarget = 0;
  private wheelSteps = 0;
  private barrelDeg = 0;
  private lastTemp = -1;

  constructor(host: HTMLElement) {
    host.innerHTML = this.buildScene();
    const svg = host.querySelector('svg')! as SVGSVGElement;
    this.svgEl = svg;
    this.balanceG = svg.querySelector('#balance-rot')!;
    this.springPath = svg.querySelector('#hairspring')!;
    this.escapeG = svg.querySelector('#escape-rot')!;
    this.palletG = svg.querySelector('#pallet-rot')!;
    this.fourthG = svg.querySelector('#fourth-rot')!;
    this.thirdG = svg.querySelector('#third-rot')!;
    this.centerG = svg.querySelector('#center-rot')!;
    this.barrelG = svg.querySelector('#barrel-rot')!;
    this.crownG = svg.querySelector('#crown-rot')!;
    this.windingG = svg.querySelector('#winding-rot')!;
    this.couplingG = svg.querySelector('#coupling-rot')!;
    this.moonDriveG = svg.querySelector('#moondrive-rot')!;
    this.centerSecG = svg.querySelector('#centersec-rot')!;
    this.settingG = svg.querySelector('#setting-rot')!;
    this.glideG = svg.querySelector('#glide-rot')!;
    this.sweepG = svg.querySelector('#sweep-rot')!;
    this.sweepShadowRotG = svg.querySelector('#sweep-shadow-rot')!;
    this.sweepShadowOffG = svg.querySelector('#sweep-shadow-off')!;
    this.trainStops = Array.from(svg.querySelectorAll('#trainGrad stop'));

    // Light-reactive elements, cached once.
    for (const id of ['rimGrad', 'steelGrad', 'goldGrad', 'trainGrad', 'bridgeGrad', 'handGrad', 'sweepGrad']) {
      const g = svg.querySelector<SVGLinearGradientElement>(`#${id}`);
      if (g) this.metalGrads.push(g);
    }
    for (const [id, amt] of [
      ['rubyGrad', 20],
      ['capGrad', 16],
      ['plateGrad', 9],
    ] as const) {
      const g = svg.querySelector<SVGRadialGradientElement>(`#${id}`);
      if (g) this.glintGrads.push([g, amt]);
    }
    this.keyLightGrad = svg.querySelector('#keyLight');
    this.dsShadow = svg.querySelector('#ds feDropShadow');
  }

  /** Unit vector from the movement centre toward the light. */
  lightDir = { x: -0.66, y: -0.75 };

  /**
   * Bench lamp follows the pointer. One light vector drives everything:
   * linear metal gradients re-aim their bright axis toward the light
   * (sheen rolls across brushed/polished surfaces), radial highlights on
   * jewels and the cap drift toward it, and shadows fall away from it.
   * Subtle by construction — only directions move, never intensities.
   */
  setLight(lx: number, ly: number): void {
    const dx = lx - 500;
    const dy = ly - 510;
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len;
    const uy = dy / len;
    if (Math.hypot(ux - this.lightDir.x, uy - this.lightDir.y) < 0.004) return;
    this.lightDir = { x: ux, y: uy };

    // Brushed/polished metals: bright end of the axis faces the light.
    for (const g of this.metalGrads) {
      g.setAttribute('x1', (0.5 + 0.5 * ux).toFixed(3));
      g.setAttribute('y1', (0.5 + 0.5 * uy).toFixed(3));
      g.setAttribute('x2', (0.5 - 0.5 * ux).toFixed(3));
      g.setAttribute('y2', (0.5 - 0.5 * uy).toFixed(3));
    }
    // Specular glints inside rubies / on the domed cap, and the plate sheen.
    for (const [g, amt] of this.glintGrads) {
      g.setAttribute('cx', `${(50 + ux * amt).toFixed(1)}%`);
      g.setAttribute('cy', `${(50 + uy * amt).toFixed(1)}%`);
    }
    // The lamp's pool of light tracks the pointer position itself.
    if (this.keyLightGrad) {
      this.keyLightGrad.setAttribute('cx', `${(Math.min(0.95, Math.max(0.05, (lx - 28) / 944)) * 100).toFixed(1)}%`);
      this.keyLightGrad.setAttribute('cy', `${(Math.min(0.95, Math.max(0.05, (ly - 38) / 944)) * 100).toFixed(1)}%`);
    }
    // Bridge shadows fall away from the light.
    if (this.dsShadow) {
      this.dsShadow.setAttribute('dx', (-ux * 5).toFixed(1));
      this.dsShadow.setAttribute('dy', (-uy * 5 + 2).toFixed(1));
    }
  }

  /** Engrave the caliber plate (both the cut and its light edge). */
  setPlate(cal: string, jewels: number, vph: string, reserve: string): void {
    const l1 = `CAL. ${cal} · ${jewels} J`;
    const l2 = `${vph} VPH · ${reserve}`;
    for (const [id, txt] of [
      ['plate-l1', l1],
      ['plate-l1-hl', l1],
      ['plate-l2', l2],
      ['plate-l2-hl', l2],
    ] as const) {
      const el = this.svgEl.querySelector(`#${id}`);
      if (el) el.textContent = txt;
    }
  }

  /** A pallet impulse: the fork snaps across, the wheel drops one step.
   *  Negative: the escape wheel runs CCW so that, through the centre
   *  seconds mesh, the sweep hand turns clockwise. */
  beat(side: 1 | -1): void {
    this.palletTarget = side * ESCAPEMENT.PALLET_DEG;
    this.wheelSteps++;
    this.wheelTarget = -this.wheelSteps * ESCAPEMENT.STEP_DEG;
  }

  update(f: MovementFrame): void {
    const dt = Math.min(f.dt, 0.1);
    const rot = (g: SVGGElement, deg: number, c: { x: number; y: number }) =>
      g.setAttribute('transform', `rotate(${deg.toFixed(2)} ${c.x} ${c.y})`);

    rot(this.balanceG, f.balanceDeg, BC);
    this.springPath.setAttribute(
      'd',
      hairspringPath(BC.x, BC.y, HS_INNER, HS_OUTER, (f.balanceDeg * Math.PI) / 180),
    );

    // Escape wheel advances in sprung steps; the rest of the train is
    // geared off it, so every wheel micro-steps with the tick. Signs
    // alternate — meshing wheels counter-rotate.
    const esc = this.wheelSpring.step(this.wheelTarget, dt);
    rot(this.escapeG, esc, EC);
    const fourth = -esc / TRAIN.ESC_TO_FOURTH;
    rot(this.fourthG, fourth, FOURTH_C);
    const third = -fourth / TRAIN.FOURTH_TO_THIRD;
    rot(this.thirdG, third, THIRD_C);
    // Centre wheel driven by the barrel (120:22), not backwards from the
    // escapement — matches the physical train direction and makes it visibly
    // live while the barrel spins.
    rot(this.centerG, -this.barrelDeg * CENTER_PINION / BARREL_R, CENTER_C);

    // Barrel: independent, bass-driven (see BARREL in mappings.ts).
    this.barrelDeg += (BARREL.BASE_DPS + BARREL.BASS_DPS * f.bass01) * dt;
    rot(this.barrelG, this.barrelDeg, BARREL_C);

    // Keyless works cascade off the ratchet — each meshing wheel flips
    // direction and spins faster, so bass visibly ripples up the chain.
    const crown = -this.barrelDeg * TRAIN.RATCHET_TO_CROWN;
    rot(this.crownG, crown, CROWN_C);
    const wind = -crown * TRAIN.CROWN_TO_WINDING;
    rot(this.windingG, wind, WIND_C);
    rot(this.settingG, -wind * TRAIN.WINDING_TO_SETTING, SETTING_C);

    // Chronograph clutch rides the fourth wheel's driving ring.
    rot(this.couplingG, -fourth * TRAIN.FOURTH_TO_COUPLING, COUPLING_C);

    // Moon drive: always spinning off the fourth wheel (decorative but live).
    rot(this.moonDriveG, -fourth * TRAIN.MOON_TO_DRIVE, MOONDRIVE_C);

    // Centre seconds: strictly geared off the escape pinion (78:14) but
    // governed by the tri-synchro glide — a viscous/magnetic coupling
    // that follows the stepped angle through gear backlash. Average rate
    // is exactly the gear ratio; instantaneous motion is a Spring Drive
    // glide. Stops when the train stops; no independent clock anywhere.
    const csStrict = -esc / TRAIN.ESC_TO_CENTERSEC;
    this.csDeg += (csStrict - this.csDeg) * (1 - Math.exp(-dt / ESCAPEMENT.GLIDE_TAU));
    const csRot = `rotate(${this.csDeg.toFixed(3)} ${CS_C.x} ${CS_C.y})`;
    // The glide flywheel spins continuously off the seconds rim — fast,
    // smooth, and visibly the thing doing the regulating.
    rot(this.glideG, -this.csDeg * TRAIN.CENTERSEC_TO_GLIDE, GLIDE_C);
    this.centerSecG.setAttribute('transform', csRot);
    this.sweepG.setAttribute('transform', csRot);
    this.sweepShadowRotG.setAttribute('transform', csRot);
    this.sweepShadowOffG.setAttribute(
      'transform',
      `translate(${(-this.lightDir.x * 6).toFixed(1)} ${(-this.lightDir.y * 6 + 3).toFixed(1)})`,
    );

    rot(this.palletG, this.palletSpring.step(this.palletTarget, dt), PP);

    // Material temperature: retint the train gradient only when it moves.
    if (Math.abs(f.temp01 - this.lastTemp) > 0.002) {
      this.lastTemp = f.temp01;
      this.trainStops[0]?.setAttribute(
        'stop-color',
        lerpHex(MATERIAL.WARM_LIGHT, MATERIAL.COOL_LIGHT, f.temp01),
      );
      this.trainStops[1]?.setAttribute(
        'stop-color',
        lerpHex(MATERIAL.WARM_DARK, MATERIAL.COOL_DARK, f.temp01),
      );
    }
  }

  private buildScene(): string {
    const stud = hairspringStud(BC.x, BC.y, HS_OUTER);

    // Timing screws: slotted gold heads seated on the rim; the radial
    // slots make the rim's rotation legible.
    const screws = [45, 135, 225, 315]
      .map((a) => {
        const [sx, sy] = polar(BC.x, BC.y, BALANCE_R, a);
        const x = sx.toFixed(1);
        const y = sy.toFixed(1);
        return `<g transform="rotate(${a} ${x} ${y})">
          <rect x="${(sx - 9).toFixed(1)}" y="${(sy - 5).toFixed(1)}" width="18" height="10" rx="2" fill="url(#goldGrad)" opacity="0.45"/>
          <circle cx="${x}" cy="${y}" r="7" fill="url(#goldGrad)" stroke="#0c0d10" stroke-width="1"/>
          <line x1="${(sx - 5).toFixed(1)}" y1="${y}" x2="${(sx + 5).toFixed(1)}" y2="${y}" stroke="#0c0d10" stroke-width="1.8"/>
        </g>`;
      })
      .join('');
    const poising = [0, 90, 180, 270]
      .map((a) => {
        const [px, py] = polar(BC.x, BC.y, BALANCE_R - 4, a);
        return `<circle cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="2.2" fill="#0c0d10" opacity="0.8"/>`;
      })
      .join('');

    // Impulse pin: on the balance roller, pointing at the pallet pivot at
    // rest so it sits between the fork horns.
    const pinAngle = (Math.atan2(PP.y - BC.y, PP.x - BC.x) * 180) / Math.PI;
    const [pinX, pinY] = polar(BC.x, BC.y, 28, pinAngle);

    // Ratchet wheel sunburst brushing.
    const sunburst = Array.from({ length: 12 }, (_, i) => {
      const [ix, iy] = polar(BARREL_C.x, BARREL_C.y, 18, i * 30);
      const [ox, oy] = polar(BARREL_C.x, BARREL_C.y, RATCHET_R - 6, i * 30);
      return `<line x1="${ix.toFixed(1)}" y1="${iy.toFixed(1)}" x2="${ox.toFixed(1)}" y2="${oy.toFixed(1)}" stroke="#fff" stroke-opacity="0.06" stroke-width="3"/>`;
    }).join('');

    // Barrel bridge: a plate over the top-left with a round aperture that
    // exposes the whole drum + ratchet — an exhibition barrel.
    const hole = (cx: number, cy: number, r: number) =>
      `M ${cx + r} ${cy} A ${r} ${r} 0 1 0 ${cx - r} ${cy} A ${r} ${r} 0 1 0 ${cx + r} ${cy} Z`;
    const barrelBridge = `M 150 170
      C 230 118 420 108 502 148
      C 518 240 512 330 482 420
      C 432 502 322 547 230 542
      C 164 537 140 480 138 420
      C 136 340 140 240 150 170 Z ${hole(BARREL_C.x, BARREL_C.y, BARREL_R + 9)}`;

    return `
<svg viewBox="0 0 1000 1000" preserveAspectRatio="xMidYMid meet" xmlns="${NS}">
  <defs>
    <radialGradient id="plateGrad" cx="44%" cy="38%" r="80%">
      <stop offset="0%" stop-color="#23252b"/>
      <stop offset="70%" stop-color="#17181d"/>
      <stop offset="100%" stop-color="#101115"/>
    </radialGradient>
    <linearGradient id="bridgeGrad" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#5a5e66"/>
      <stop offset="55%" stop-color="#3c3f46"/>
      <stop offset="100%" stop-color="#2a2c32"/>
    </linearGradient>
    <linearGradient id="rimGrad" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#d9dbe0"/>
      <stop offset="50%" stop-color="#9ba0a9"/>
      <stop offset="100%" stop-color="#5f636c"/>
    </linearGradient>
    <linearGradient id="steelGrad" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#c2c6cd"/>
      <stop offset="100%" stop-color="#71757e"/>
    </linearGradient>
    <linearGradient id="goldGrad" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#e8cf9a"/>
      <stop offset="100%" stop-color="#9a7d4e"/>
    </linearGradient>
    <!-- Gear train gilding — retinted live by spectral centroid. -->
    <linearGradient id="trainGrad" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${MATERIAL.WARM_LIGHT}"/>
      <stop offset="100%" stop-color="${MATERIAL.WARM_DARK}"/>
    </linearGradient>
    <radialGradient id="rubyGrad" cx="35%" cy="32%" r="80%">
      <stop offset="0%" stop-color="#ff7387"/>
      <stop offset="45%" stop-color="#b3173a"/>
      <stop offset="100%" stop-color="#560a1e"/>
    </radialGradient>
    <linearGradient id="bluedGrad" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#6f95d8"/>
      <stop offset="100%" stop-color="#23375f"/>
    </linearGradient>
    <!-- Lighter blued steel for hands — must read against the dark plate. -->
    <linearGradient id="handGrad" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#a8c0ef"/>
      <stop offset="100%" stop-color="#4a6fae"/>
    </linearGradient>
    <!-- White-polished steel for the centre seconds — reads over plate AND bridges. -->
    <linearGradient id="sweepGrad" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#f0f3f8"/>
      <stop offset="100%" stop-color="#9fa8b6"/>
    </linearGradient>
    <radialGradient id="capGrad" cx="38%" cy="32%" r="80%">
      <stop offset="0%" stop-color="#f2f4f8"/>
      <stop offset="60%" stop-color="#9aa1ac"/>
      <stop offset="100%" stop-color="#585e69"/>
    </radialGradient>
    <radialGradient id="wheelShadow" cx="50%" cy="50%" r="50%">
      <stop offset="78%" stop-color="#000" stop-opacity="0.35"/>
      <stop offset="100%" stop-color="#000" stop-opacity="0"/>
    </radialGradient>
    <pattern id="cotes" width="30" height="30" patternUnits="userSpaceOnUse" patternTransform="rotate(24)">
      <rect width="30" height="30" fill="#000" opacity="0"/>
      <rect width="15" height="30" fill="#ffffff" opacity="0.055"/>
      <rect x="13" width="3" height="30" fill="#000000" opacity="0.14"/>
    </pattern>
    <pattern id="perlage" width="56" height="56" patternUnits="userSpaceOnUse">
      <circle cx="14" cy="14" r="16" fill="none" stroke="#ffffff" stroke-opacity="0.012" stroke-width="5"/>
      <circle cx="42" cy="14" r="16" fill="none" stroke="#ffffff" stroke-opacity="0.010" stroke-width="5"/>
      <circle cx="28" cy="42" r="16" fill="none" stroke="#ffffff" stroke-opacity="0.012" stroke-width="5"/>
    </pattern>
    <radialGradient id="keyLight" cx="40%" cy="30%" r="55%">
      <stop offset="0%" stop-color="#fff6e8" stop-opacity="0.10"/>
      <stop offset="55%" stop-color="#fff6e8" stop-opacity="0.03"/>
      <stop offset="100%" stop-color="#fff6e8" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="vignette" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#000" stop-opacity="0"/>
      <stop offset="78%" stop-color="#000" stop-opacity="0"/>
      <stop offset="100%" stop-color="#000" stop-opacity="0.55"/>
    </radialGradient>
    <filter id="ds" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="5" stdDeviation="7" flood-color="#000" flood-opacity="0.5"/>
    </filter>
    <!-- Bridges may not overhang the mainplate. -->
    <clipPath id="plateClip"><circle cx="500" cy="510" r="470"/></clipPath>
  </defs>

  <!-- mainplate -->
  <circle cx="500" cy="510" r="472" fill="url(#plateGrad)" stroke="#000" stroke-width="3"/>
  <circle cx="500" cy="510" r="472" fill="url(#perlage)"/>
  <circle cx="500" cy="510" r="472" fill="none" stroke="#ffffff" stroke-opacity="0.06" stroke-width="1.5"/>

  <!-- mainspring barrel: drum tooth ring + ratchet wheel, bass-driven -->
  <g id="barrel-rot">
    <circle cx="${BARREL_C.x}" cy="${BARREL_C.y}" r="${BARREL_R + 6}" fill="url(#wheelShadow)"/>
    <circle cx="${BARREL_C.x}" cy="${BARREL_C.y}" r="${BARREL_R - 4}" fill="none" stroke="url(#trainGrad)" stroke-width="8" stroke-dasharray="3.4 2.8"/>
    <circle cx="${BARREL_C.x}" cy="${BARREL_C.y}" r="${BARREL_R - 9}" fill="url(#plateGrad)" stroke="#0c0d10" stroke-width="1.5"/>
    <circle cx="${BARREL_C.x}" cy="${BARREL_C.y}" r="${RATCHET_R}" fill="none" stroke="url(#trainGrad)" stroke-width="6" stroke-dasharray="3 2.4"/>
    <circle cx="${BARREL_C.x}" cy="${BARREL_C.y}" r="${RATCHET_R - 4}" fill="url(#trainGrad)" stroke="#0c0d10" stroke-width="1.5"/>
    ${sunburst}
    ${screw(BARREL_C.x, BARREL_C.y, 13, 30)}
  </g>

  <!-- gear train: each wheel's pinion touches the previous wheel's teeth -->
  <g id="center-rot">${trainWheel(CENTER_C.x, CENTER_C.y, CENTER_R, CENTER_PINION)}</g>
  <g id="third-rot">${trainWheel(THIRD_C.x, THIRD_C.y, THIRD_R, THIRD_PINION)}</g>
  <g id="fourth-rot">${trainWheel(FOURTH_C.x, FOURTH_C.y, FOURTH_R, FOURTH_PINION)}
    <!-- chronograph driving ring, co-axial on the fourth wheel -->
    <circle cx="${FOURTH_C.x}" cy="${FOURTH_C.y}" r="${DRIVING_RING_R - 2}" fill="none" stroke="url(#trainGrad)" stroke-width="4" stroke-dasharray="2.4 2.2"/>
  </g>
  <!-- chronograph coupling (horizontal clutch), riding under the bridge -->
  <g id="coupling-rot">${smallWheel(COUPLING_C.x, COUPLING_C.y, COUPLING_R, 6)}</g>
  <g>${jewel(COUPLING_C.x, COUPLING_C.y, 4.5)}</g>

  <!-- escape wheel -->
  <g id="escape-rot">
    <circle cx="${EC.x}" cy="${EC.y}" r="${ESCAPE_R + 6}" fill="url(#wheelShadow)"/>
    <path d="${escapeWheelPath(ESCAPE_R, ESCAPEMENT.TEETH)}" transform="translate(${EC.x} ${EC.y})" fill="url(#trainGrad)" stroke="#0c0d10" stroke-width="1.5"/>
    <circle cx="${EC.x}" cy="${EC.y}" r="${ESCAPE_R * 0.55}" fill="url(#plateGrad)" stroke="#0c0d10" stroke-width="1.5"/>
    ${[0, 90, 180, 270]
      .map((a) => {
        const [ix, iy] = polar(EC.x, EC.y, 10, a + 45);
        const [ox, oy] = polar(EC.x, EC.y, ESCAPE_R * 0.53, a + 45);
        return `<line x1="${ix.toFixed(1)}" y1="${iy.toFixed(1)}" x2="${ox.toFixed(1)}" y2="${oy.toFixed(1)}" stroke="url(#trainGrad)" stroke-width="8"/>`;
      })
      .join('')}
    <circle cx="${EC.x}" cy="${EC.y}" r="${ESCAPE_PINION + 4}" fill="url(#trainGrad)" stroke="#0c0d10" stroke-width="1"/>
  </g>

  <!-- pallet fork -->
  <g id="pallet-rot">${buildFork()}</g>

  <!-- centre seconds wheel: carries the sweep hand, meshes the escape
       pinion; rides under the balance and bridges -->
  <g id="centersec-rot">${trainWheel(CS_C.x, CS_C.y, CS_R, 12)}</g>

  <!-- tri-synchro glide regulator: flywheel on the seconds rim, braked
       between two pole shoes — this is what makes the hand glide -->
  <g id="glide-rot">
    <circle cx="${GLIDE_C.x}" cy="${GLIDE_C.y}" r="${GLIDE_R + 3}" fill="url(#wheelShadow)"/>
    <circle cx="${GLIDE_C.x}" cy="${GLIDE_C.y}" r="${GLIDE_R - 1.5}" fill="none" stroke="url(#goldGrad)" stroke-width="3" stroke-dasharray="1.8 1.6"/>
    <circle cx="${GLIDE_C.x}" cy="${GLIDE_C.y}" r="${GLIDE_R - 3.5}" fill="url(#goldGrad)" stroke="#0c0d10" stroke-width="1"/>
    ${[0, 120, 240]
      .map((a) => {
        const [ix, iy] = polar(GLIDE_C.x, GLIDE_C.y, 2.5, a);
        const [ox, oy] = polar(GLIDE_C.x, GLIDE_C.y, GLIDE_R - 4.5, a);
        return `<line x1="${ix.toFixed(1)}" y1="${iy.toFixed(1)}" x2="${ox.toFixed(1)}" y2="${oy.toFixed(1)}" stroke="#0c0d10" stroke-opacity="0.45" stroke-width="2"/>`;
      })
      .join('')}
  </g>
  ${(() => {
    const pole = (a0: number, a1: number) => {
      const [x0, y0] = polar(GLIDE_C.x, GLIDE_C.y, GLIDE_R + 5, a0);
      const [x1, y1] = polar(GLIDE_C.x, GLIDE_C.y, GLIDE_R + 5, a1);
      return `<path d="M ${x0.toFixed(1)} ${y0.toFixed(1)} A ${GLIDE_R + 5} ${GLIDE_R + 5} 0 0 1 ${x1.toFixed(1)} ${y1.toFixed(1)}" fill="none" stroke="url(#steelGrad)" stroke-width="6" stroke-linecap="round"/>`;
    };
    const coil = [GLIDE_R + 2.5, GLIDE_R + 5, GLIDE_R + 7.5]
      .map((r) => {
        const [x0, y0] = polar(GLIDE_C.x, GLIDE_C.y, r, -25);
        const [x1, y1] = polar(GLIDE_C.x, GLIDE_C.y, r, 25);
        return `<path d="M ${x0.toFixed(1)} ${y0.toFixed(1)} A ${r} ${r} 0 0 1 ${x1.toFixed(1)} ${y1.toFixed(1)}" fill="none" stroke="#c9a06c" stroke-width="1" opacity="0.8"/>`;
      })
      .join('');
    return pole(130, 230) + pole(-50, 50) + coil;
  })()}
  <g>${jewel(GLIDE_C.x, GLIDE_C.y, 3.2)}</g>

  <!-- ── bridge layer ── -->
  <g clip-path="url(#plateClip)">
  <g filter="url(#ds)">
    <path d="${barrelBridge}" fill-rule="evenodd" fill="url(#bridgeGrad)" stroke="#0c0d10" stroke-width="1.5"/>
    <path d="${barrelBridge}" fill-rule="evenodd" fill="url(#cotes)" opacity="0.55"/>
  </g>
  </g>
  <!-- caliber plate: engraved into the barrel bridge, as tradition demands.
       Dark cut + light lower edge reads as engraving, not print. -->
  <g font-family="Helvetica Neue, Arial, sans-serif" text-anchor="middle" letter-spacing="2">
    <g>
      <text id="plate-l1-hl" x="300" y="480" font-size="11" fill="#ffffff" opacity="0.10">CAL. ———</text>
      <text id="plate-l1" x="300" y="479" font-size="11" fill="#17181c">CAL. ———</text>
    </g>
    <g>
      <text id="plate-l2-hl" x="300" y="502" font-size="11" fill="#ffffff" opacity="0.10">—— VPH</text>
      <text id="plate-l2" x="300" y="501" font-size="11" fill="#17181c">—— VPH</text>
    </g>
  </g>
  ${screw(176, 220, 8, 10)}
  ${screw(468, 190, 8, -30)}
  ${screw(196, 488, 8, 55)}
  <!-- keyless works on the barrel bridge:
       ratchet → crown → winding pinion → setting wheel -->
  <g id="crown-rot">${smallWheel(CROWN_C.x, CROWN_C.y, CROWN_R, 10)}</g>
  <g id="winding-rot">${smallWheel(WIND_C.x, WIND_C.y, WIND_R, 6)}</g>
  <g id="setting-rot">${smallWheel(SETTING_C.x, SETTING_C.y, SETTING_R, 5)}</g>
  <!-- click pawl, sprung against the ratchet teeth -->
  <path d="M 230 205 C 244 214 256 228 264.8 244.8 L 258 250 C 248 234 238 222 226 213 Z"
    fill="url(#steelGrad)" stroke="#0c0d10" stroke-width="1"/>
  <path d="M 214 226 C 220 217 226 211 233 207" fill="none" stroke="url(#steelGrad)" stroke-width="2.5"/>
  ${screw(230, 205, 6, 25)}
  <!-- center wheel pivot rides under the bridge: jewel in a chaton -->
  <g>${jewel(CENTER_C.x, CENTER_C.y, 6)}</g>

  <!-- train finger-bridge over third / fourth pivots -->
  <g clip-path="url(#plateClip)">
  <g filter="url(#ds)">
    <path d="M 920 430 C 800 420 680 405 ${FOURTH_C.x} ${FOURTH_C.y} L ${THIRD_C.x} ${THIRD_C.y}"
      fill="none" stroke="url(#bridgeGrad)" stroke-width="36" stroke-linecap="round"/>
    <path d="M 920 430 C 800 420 680 405 ${FOURTH_C.x} ${FOURTH_C.y} L ${THIRD_C.x} ${THIRD_C.y}"
      fill="none" stroke="url(#cotes)" stroke-width="36" stroke-linecap="round" opacity="0.55"/>
  </g>
  </g>
  <g>${jewel(THIRD_C.x, THIRD_C.y, 5.5)}</g>
  <g>${jewel(FOURTH_C.x, FOURTH_C.y, 5.5)}</g>
  ${screw(848, 426, 8, 80)}

  <!-- moonphase drive wheel: turns only while the moon is engaged -->
  <g id="moondrive-rot">${smallWheel(MOONDRIVE_C.x, MOONDRIVE_C.y, MOONDRIVE_R, 6)}</g>
  <g>${jewel(MOONDRIVE_C.x, MOONDRIVE_C.y, 4)}</g>

  <!-- escape cock -->
  <g clip-path="url(#plateClip)">
  ${buildCock(930, 630, EC.x, EC.y, 64, 30, 18)}
  </g>
  <g>${jewel(EC.x, EC.y, 5.5)}</g>
  ${screw(856, 612, 7, 20)}

  <!-- pallet boss -->
  <circle cx="${PP.x}" cy="${PP.y}" r="16" fill="url(#bridgeGrad)" stroke="#0c0d10" stroke-width="1.5" filter="url(#ds)"/>
  <g>${jewel(PP.x, PP.y, 5)}</g>

  <!-- complications deck (moonphase, big date, reserve, chrono subdial) -->
  <g id="comp-layer"></g>

  <!-- balance wheel -->
  <circle cx="${BC.x}" cy="${BC.y + 4}" r="${BALANCE_R + 10}" fill="url(#wheelShadow)"/>
  <g id="balance-rot">
    <circle cx="${BC.x}" cy="${BC.y}" r="${BALANCE_R}" fill="none" stroke="url(#rimGrad)" stroke-width="16"/>
    <line x1="${BC.x - BALANCE_R + 6}" y1="${BC.y}" x2="${BC.x + BALANCE_R - 6}" y2="${BC.y}" stroke="url(#rimGrad)" stroke-width="13"/>
    ${screws}
    ${poising}
    <circle cx="${BC.x}" cy="${BC.y}" r="13" fill="url(#steelGrad)" stroke="#0c0d10" stroke-width="1"/>
    <circle cx="${pinX.toFixed(1)}" cy="${pinY.toFixed(1)}" r="4.5" fill="url(#rubyGrad)"/>
  </g>

  <!-- hairspring breathes above the wheel -->
  <path id="hairspring" d="" fill="none" stroke="url(#bluedGrad)" stroke-width="2.1" stroke-linecap="round" opacity="0.95"/>
  <rect x="${stud.x - 6}" y="${stud.y - 9}" width="12" height="18" rx="3" fill="url(#steelGrad)" stroke="#0c0d10" stroke-width="1"/>

  <!-- balance cock crosses over the spring to the staff jewel -->
  <g clip-path="url(#plateClip)">
  ${buildCock(140, 930, BC.x, BC.y, 96, 44, 26)}
  </g>
  ${screw(212, 862, 8, -15)}
  ${screw(290, 788, 6, 40)}
  <!-- swan-neck fine regulator on the cock: index arm + S-spring + screw -->
  <path d="M ${BC.x} ${BC.y} L 363 707" stroke="url(#steelGrad)" stroke-width="4" stroke-linecap="round"/>
  <rect x="358.5" y="702.5" width="9" height="9" rx="2" fill="url(#steelGrad)" stroke="#0c0d10" stroke-width="0.8" transform="rotate(45 363 707)"/>
  <path d="M 352 720 C 342 708 350 692 364 695 C 372 697 372 707 365 709"
    fill="none" stroke="url(#steelGrad)" stroke-width="3.5" stroke-linecap="round"/>
  ${screw(350, 721, 4.5, 60)}
  <g>${jewel(BC.x, BC.y, 8)}</g>

  <!-- centre seconds: jewelled bearing, the hand, its cast shadow.
       Strictly geared — rotated by the renderer with the train. -->
  <g id="sweep-shadow-off" opacity="0.32" transform="translate(4 7)">
    <g id="sweep-shadow-rot">
      <path d="${sweepNeedle()}" fill="#000"/>
      <circle cx="${CS_C.x}" cy="${CS_C.y + SWEEP_TAIL}" r="8.5" fill="#000"/>
    </g>
  </g>
  <g id="sweep-rot">
    <path d="${sweepNeedle()}" fill="url(#sweepGrad)" stroke="#0a0b0e" stroke-width="0.8"/>
    <circle cx="${CS_C.x}" cy="${CS_C.y + SWEEP_TAIL}" r="8.5" fill="url(#sweepGrad)" stroke="#0a0b0e" stroke-width="0.8"/>
  </g>
  <circle cx="${CS_C.x}" cy="${CS_C.y}" r="13.5" fill="url(#goldGrad)" stroke="#0a0b0e" stroke-width="1"/>
  <circle cx="${CS_C.x}" cy="${CS_C.y}" r="9.5" fill="url(#rubyGrad)"/>
  <circle cx="${CS_C.x}" cy="${CS_C.y}" r="7" fill="url(#capGrad)" stroke="#0a0b0e" stroke-width="1"/>
  <circle cx="${CS_C.x - 2}" cy="${CS_C.y - 2.5}" r="1.6" fill="#ffffff" opacity="0.7"/>

  <!-- bench lighting -->
  <!-- lighting lives on the movement only — the page stays seamless black -->
  <circle cx="500" cy="510" r="472" fill="url(#keyLight)" pointer-events="none"/>
  <circle cx="500" cy="510" r="472" fill="url(#vignette)" pointer-events="none"/>
</svg>`;
  }
}
