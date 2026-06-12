import { COMPLICATIONS as C, CALIBER } from '../mappings';
import { Spring } from './physics';

/* ── Complication docking positions (free plate real estate) ────────── */
const RESERVE = { x: 565, y: 858, r: 62 }; // fan, between balance and subdial
const SUB = { x: 700, y: 758, r: 70 }; // chronograph 30-min subdial
const MOON = { x: 800, y: 330, r: 56 }; // moonphase aperture
const DATE = { x: 560, y: 158, w: 38, h: 48, gap: 6 }; // big date windows

function polar(cx: number, cy: number, r: number, deg: number): [number, number] {
  const a = (deg * Math.PI) / 180;
  return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
}

/**
 * The modular complication deck. Static furniture (apertures, subdial
 * track, scale arcs) is always present, engraved into the plate; what
 * ENGAGES is mechanism — a column-wheel lever throws, the moon disc
 * rises into its aperture, hands run and fly back. Springs everywhere;
 * nothing fades.
 *
 * Mappings: chorus → chronograph · quiet/bridge → moonphase ·
 * section boundary → big date snap · bass → power reserve.
 */
export class Complications {
  /** Bumped whenever the active set changes (spec line re-renders). */
  jewelsDirty = true;

  private chronoOn = false;
  private moonOn = false;
  private chronoEngage = new Spring(0, C.ENGAGE_STIFFNESS, C.ENGAGE_DAMPING);
  private moonEngage = new Spring(0, C.ENGAGE_STIFFNESS, C.ENGAGE_DAMPING);
  private subHand = new Spring(0, C.FLYBACK_STIFFNESS, C.FLYBACK_DAMPING);
  private chronoElapsed = 0;
  private moonDrift = 0;
  private reserve = 0;
  private reserveHand = new Spring(0, 4, 0.9);
  private dateN = 0;
  private dateOffs = [new Spring(0, C.DATE_STIFFNESS, C.DATE_DAMPING), new Spring(0, C.DATE_STIFFNESS, C.DATE_DAMPING)];

  private subHandG: SVGGElement;
  private leverG: SVGGElement;
  private moonG: SVGGElement;
  private moonSelf: SVGGElement;
  private reserveHandG: SVGGElement;
  private dateTexts: [SVGTextElement, SVGTextElement];

  constructor(svg: SVGSVGElement) {
    const layer = svg.querySelector<SVGGElement>('#comp-layer')!;
    layer.innerHTML = this.buildDeck();
    this.subHandG = svg.querySelector('#sub-rot')!;
    this.leverG = svg.querySelector('#chrono-lever')!;
    this.moonG = svg.querySelector('#moon-rise')!;
    this.moonSelf = svg.querySelector('#moon-self')!;
    this.reserveHandG = svg.querySelector('#reserve-rot')!;
    this.dateTexts = [svg.querySelector('#date-tens')!, svg.querySelector('#date-ones')!];
  }

  /** Moon disc drift angle, exposed so the drive wheel can mesh it. */
  get moonDriftDeg(): number {
    return this.moonDrift;
  }

  get jewels(): number {
    return (
      CALIBER.BASE_JEWELS +
      C.JEWELS.reserve +
      (this.chronoOn ? C.JEWELS.chrono : 0) +
      (this.moonOn ? C.JEWELS.moon : 0) +
      (this.dateN > 0 ? C.JEWELS.date : 0)
    );
  }

  setChrono(on: boolean): void {
    if (on === this.chronoOn) return;
    this.chronoOn = on;
    if (on) this.chronoElapsed = 0;
    this.jewelsDirty = true;
  }

  setMoon(on: boolean): void {
    if (on === this.moonOn) return;
    this.moonOn = on;
    this.jewelsDirty = true;
  }

  /** Snap the big date to n (1-based; wraps at 31 like a real date wheel). */
  dateTo(n: number): void {
    if (n === this.dateN) return;
    const prev = this.dateN;
    this.dateN = n;
    const shown = ((n - 1) % 31) + 1;
    const tens = Math.floor(shown / 10);
    const ones = shown % 10;
    const prevShown = prev > 0 ? ((prev - 1) % 31) + 1 : -1;
    this.dateTexts[0].textContent = String(tens);
    this.dateTexts[1].textContent = String(ones);
    // Only the discs that actually moved snap (tens rarely does).
    if (prev <= 0 || tens !== Math.floor(prevShown / 10)) this.dateOffs[0].snapTo(-DATE.h);
    if (prev <= 0 || ones !== prevShown % 10) this.dateOffs[1].snapTo(-DATE.h);
    this.jewelsDirty = true;
  }

  disengageAll(): void {
    this.setChrono(false);
    this.setMoon(false);
  }

  update(dt: number, running: boolean, bass01: number): void {
    // ── chronograph (30-min totaliser + column-wheel lever) ──
    // (The centre sweep belongs to the renderer now — it is strictly
    // geared to the escape wheel, not a complication.)
    const eng = this.chronoEngage.step(this.chronoOn ? 1 : 0, dt);
    this.leverG.setAttribute(
      'transform',
      `rotate(${(-16 + 30 * Math.min(1.15, eng)).toFixed(2)} ${SUB.x + SUB.r + 18} ${SUB.y})`,
    );
    if (this.chronoOn && running) this.chronoElapsed += dt;
    if (this.chronoOn) {
      this.subHand.snapTo((this.chronoElapsed / 60) * 12); // 12°/min on a 30-min dial
    } else {
      this.subHand.step(0, dt); // flyback home
    }
    this.subHandG.setAttribute('transform', `rotate(${this.subHand.value.toFixed(2)} ${SUB.x} ${SUB.y})`);

    // ── moonphase ──
    const rise = this.moonEngage.step(this.moonOn ? 1 : 0, dt);
    if (this.moonOn && running) this.moonDrift += (360 / C.MOON_PERIOD_S) * dt;
    const dy = (1 - rise) * (MOON.r + 30);
    this.moonG.setAttribute('transform', `translate(0 ${dy.toFixed(2)})`);
    this.moonSelf.setAttribute('transform', `rotate(${this.moonDrift.toFixed(2)} ${MOON.x} ${MOON.y + 14})`);

    // ── power reserve ──
    if (running) {
      this.reserve += (bass01 * C.RESERVE_CHARGE_PER_S - C.RESERVE_DRAIN_PER_S) * dt;
    } else {
      this.reserve -= C.RESERVE_COLLAPSE_PER_S * dt;
    }
    this.reserve = Math.max(0, Math.min(1, this.reserve));
    const rh = this.reserveHand.step(this.reserve, dt);
    this.reserveHandG.setAttribute(
      'transform',
      `rotate(${(-140 + 100 * rh + 90).toFixed(2)} ${RESERVE.x} ${RESERVE.y})`,
    );

    // ── big date ──
    for (let i = 0; i < 2; i++) {
      const off = this.dateOffs[i].step(0, dt);
      this.dateTexts[i].setAttribute('transform', `translate(0 ${off.toFixed(2)})`);
    }
  }

  /* ── static furniture + moving parts ──────────────────────────────── */

  private buildDeck(): string {
    // Power reserve: recessed fan scale, ticks, blued hand.
    const arc = (r: number, a0: number, a1: number) => {
      const [x0, y0] = polar(RESERVE.x, RESERVE.y, r, a0);
      const [x1, y1] = polar(RESERVE.x, RESERVE.y, r, a1);
      return `M${x0.toFixed(1)} ${y0.toFixed(1)} A ${r} ${r} 0 0 1 ${x1.toFixed(1)} ${y1.toFixed(1)}`;
    };
    const ticks = Array.from({ length: 6 }, (_, i) => {
      const a = -140 + i * 20;
      const [x0, y0] = polar(RESERVE.x, RESERVE.y, RESERVE.r - 8, a);
      const [x1, y1] = polar(RESERVE.x, RESERVE.y, RESERVE.r, a);
      return `<line x1="${x0.toFixed(1)}" y1="${y0.toFixed(1)}" x2="${x1.toFixed(1)}" y2="${y1.toFixed(1)}" stroke="#9da1a9" stroke-width="${i === 0 || i === 5 ? 2.5 : 1.4}"/>`;
    }).join('');

    // Chronograph subdial: recessed, azuraged, 30-minute track + lever.
    const subTicks = Array.from({ length: 30 }, (_, i) => {
      const a = i * 12 - 90;
      const big = i % 5 === 0;
      const [x0, y0] = polar(SUB.x, SUB.y, SUB.r - (big ? 12 : 7), a);
      const [x1, y1] = polar(SUB.x, SUB.y, SUB.r - 3, a);
      return `<line x1="${x0.toFixed(1)}" y1="${y0.toFixed(1)}" x2="${x1.toFixed(1)}" y2="${y1.toFixed(1)}" stroke="#a7abb3" stroke-width="${big ? 2.2 : 1}"/>`;
    }).join('');
    const azurage = [0.78, 0.58, 0.38, 0.18]
      .map((f) => `<circle cx="${SUB.x}" cy="${SUB.y}" r="${(SUB.r * f).toFixed(1)}" fill="none" stroke="#ffffff" stroke-opacity="0.05" stroke-width="5"/>`)
      .join('');

    // Moonphase: gold bezel, night-sky aperture, rising moon.
    const stars = [
      [-26, -18, 1.4],
      [18, -26, 1.1],
      [30, 6, 1.5],
      [-8, 8, 1.0],
    ]
      .map(([dx, dy, r]) => `<circle cx="${MOON.x + dx}" cy="${MOON.y + dy}" r="${r}" fill="#cdd6ee" opacity="0.6"/>`)
      .join('');

    // Big date: two framed windows.
    const win = (x: number, idx: string) => `
      <rect x="${x - 2}" y="${DATE.y - 2}" width="${DATE.w + 4}" height="${DATE.h + 4}" rx="5" fill="url(#goldGrad)"/>
      <rect x="${x}" y="${DATE.y}" width="${DATE.w}" height="${DATE.h}" rx="3" fill="#0b0c10" stroke="#000" stroke-width="1"/>
      <clipPath id="date-clip-${idx}"><rect x="${x}" y="${DATE.y}" width="${DATE.w}" height="${DATE.h}" rx="3"/></clipPath>
      <g clip-path="url(#date-clip-${idx})">
        <text id="date-${idx}" x="${x + DATE.w / 2}" y="${DATE.y + DATE.h - 12}" text-anchor="middle"
          font-family="Helvetica Neue, Arial, sans-serif" font-size="34" font-weight="500" fill="#cfd2d8"></text>
      </g>`;

    return `
  <!-- power reserve -->
  <circle cx="${RESERVE.x}" cy="${RESERVE.y}" r="${RESERVE.r + 14}" fill="#000" opacity="0.18"/>
  <path d="${arc(RESERVE.r - 4, -140, -40)}" fill="none" stroke="#7d818a" stroke-width="2"/>
  ${ticks}
  <g id="reserve-rot">
    <path d="M ${RESERVE.x - 2.5} ${RESERVE.y + 8} L ${RESERVE.x} ${RESERVE.y - RESERVE.r + 10} L ${RESERVE.x + 2.5} ${RESERVE.y + 8} Z" fill="url(#handGrad)"/>
    <circle cx="${RESERVE.x}" cy="${RESERVE.y + 12}" r="4" fill="url(#handGrad)"/>
  </g>
  <circle cx="${RESERVE.x}" cy="${RESERVE.y}" r="5.5" fill="url(#goldGrad)" stroke="#0c0d10" stroke-width="1"/>
  <circle cx="${RESERVE.x}" cy="${RESERVE.y}" r="2.8" fill="url(#rubyGrad)"/>

  <!-- chronograph 30-min subdial -->
  <circle cx="${SUB.x}" cy="${SUB.y}" r="${SUB.r + 6}" fill="#000" opacity="0.22"/>
  <circle cx="${SUB.x}" cy="${SUB.y}" r="${SUB.r}" fill="#14151a" stroke="#3a3d44" stroke-width="1.5"/>
  ${azurage}
  ${subTicks}
  <g id="sub-rot">
    <path d="M ${SUB.x - 2.2} ${SUB.y + 10} L ${SUB.x} ${SUB.y - SUB.r + 16} L ${SUB.x + 2.2} ${SUB.y + 10} Z" fill="url(#handGrad)"/>
  </g>
  <circle cx="${SUB.x}" cy="${SUB.y}" r="4.5" fill="url(#steelGrad)" stroke="#0c0d10" stroke-width="1"/>
  <!-- column-wheel lever: throws when the chronograph engages -->
  <g id="chrono-lever">
    <path d="M ${SUB.x + SUB.r + 18} ${SUB.y} L ${SUB.x + SUB.r + 58} ${SUB.y - 26} L ${SUB.x + SUB.r + 62} ${SUB.y - 18} L ${SUB.x + SUB.r + 26} ${SUB.y + 4} Z"
      fill="url(#steelGrad)" stroke="#0c0d10" stroke-width="1"/>
  </g>
  <circle cx="${SUB.x + SUB.r + 18}" cy="${SUB.y}" r="5" fill="url(#bluedGrad)" stroke="#06070a" stroke-width="1"/>

  <!-- moonphase -->
  <circle cx="${MOON.x}" cy="${MOON.y}" r="${MOON.r + 5}" fill="url(#goldGrad)" stroke="#0c0d10" stroke-width="1.5"/>
  <clipPath id="moon-clip"><circle cx="${MOON.x}" cy="${MOON.y}" r="${MOON.r}"/></clipPath>
  <g clip-path="url(#moon-clip)">
    <circle cx="${MOON.x}" cy="${MOON.y}" r="${MOON.r}" fill="#0b1026"/>
    ${stars}
    <g id="moon-rise">
      <g id="moon-self">
        <circle cx="${MOON.x}" cy="${MOON.y + 14}" r="24" fill="url(#goldGrad)"/>
        <circle cx="${MOON.x - 7}" cy="${MOON.y + 8}" r="4.5" fill="#8a744a" opacity="0.55"/>
        <circle cx="${MOON.x + 9}" cy="${MOON.y + 20}" r="3" fill="#8a744a" opacity="0.45"/>
        <circle cx="${MOON.x + 2}" cy="${MOON.y + 26}" r="2" fill="#8a744a" opacity="0.4"/>
      </g>
    </g>
  </g>

  <!-- big date -->
  ${win(DATE.x, 'tens')}
  ${win(DATE.x + DATE.w + DATE.gap, 'ones')}
`;
  }

}
