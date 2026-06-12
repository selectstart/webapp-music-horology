import './style.css';
import { TEMPO, AMPLITUDE, WINDDOWN, CALIBER, BARREL, MATERIAL, MIC, SECTIONS, COMPLICATIONS } from './mappings';
import { AudioEngine } from './audio/engine';
import { MicEngine } from './audio/mic';
import { detectTempo } from './audio/bpm';
import { analyzeSections, type Section } from './audio/sections';
import { Escapement, Spring } from './movement/physics';
import { MovementRenderer } from './movement/render';
import { Complications } from './movement/complications';
import { recordLoop, downloadBlob } from './share/recorder';

type Mode = 'empty' | 'measuring' | 'running' | 'paused' | 'winddown';
type Source = 'file' | 'mic';

const stage = document.getElementById('stage')!;
const promptEl = document.getElementById('prompt')!;
const promptMain = document.getElementById('prompt-main')!;
const promptSub = document.getElementById('prompt-sub')!;
const specEl = document.getElementById('spec')!;
const fileInput = document.getElementById('file-input') as HTMLInputElement;
const recBtn = document.getElementById('rec-btn') as HTMLButtonElement;

const modeFileBtn = document.getElementById('mode-file') as HTMLButtonElement;
const modeMicBtn = document.getElementById('mode-mic') as HTMLButtonElement;

const renderer = new MovementRenderer(stage);
const comps = new Complications(renderer.svgEl);
const engine = new AudioEngine();
const mic = new MicEngine();
const escapement = new Escapement();
const amplitude = new Spring(0, AMPLITUDE.SPRING_STIFFNESS, AMPLITUDE.SPRING_DAMPING);

let mode: Mode = 'empty';
let source: Source = 'file';
let beatGrid: { freq: number; offset: number } | null = null;
let loadToken = 0;
let micSilentFor = 0;
let micLockedOnce = false;
let specTimer = 0;
let specBase = '';

// Section driver state (file mode) + live heuristic state (mic mode).
let sections: Section[] = [];
let sectionIdx = -1;
let micSlowLoud = 0;
let micHiHold = 0;
let micLoHold = 0;
let micOffHold = 0;
let micChorusOn = false;
let micDate = 0;
// The bench lamp: follows the pointer with inertia (a lamp has mass).
// Defaults to the classic over-the-left-shoulder position; touch devices
// without hover simply keep it there.
const lightTarget = { x: 180, y: 130 };
const lightPos = { x: 180, y: 130 };

window.addEventListener('pointermove', (e) => {
  const ctm = renderer.svgEl.getScreenCTM();
  if (!ctm) return;
  const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse());
  lightTarget.x = p.x;
  lightTarget.y = p.y;
});

// Loudness follower state (see AMPLITUDE in mappings.ts).
let rollingPeak: number = AMPLITUDE.PEAK_FLOOR;
let loudness = 0;

// Bass follower (see BARREL) and material temperature (see MATERIAL).
let bassPeak: number = BARREL.PEAK_FLOOR;
let bass01 = 0;
let temp01 = 0.5;

/* ── UI states ─────────────────────────────────────────────────────── */

function setPrompt(main: string, sub: string, visible = true): void {
  promptMain.textContent = main;
  promptSub.textContent = sub;
  promptEl.classList.toggle('hidden', !visible);
}

function caliberNumber(name: string, duration: number): string {
  let h = Math.round(duration * 1000);
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return String(1000 + (h % 9000));
}

function showSpec(bpm: number, confident: boolean, file: File, duration: number): void {
  const vph = Math.round(bpm * CALIBER.VPH_PER_BPM).toLocaleString('en-US');
  const tempo = confident ? `${Math.round(bpm)} bpm` : 'tempo free';
  plate.cal = caliberNumber(file.name, duration);
  plate.vph = vph;
  plate.res = fmtDuration(duration);
  specBase = `cal. ${plate.cal} · ${vph} vph · ${tempo}`;
  refreshSpec();
  specEl.classList.add('visible');
}

/** Jewel count tracks the active complications. */
function refreshSpec(): void {
  if (specBase) specEl.textContent = `${specBase} · ${comps.jewels} jewels`;
  renderer.setPlate(plate.cal, comps.jewels, plate.vph, plate.res);
}

// Engraved caliber-plate fields (the dial carries its own papers).
const plate = { cal: '———', vph: '——', res: '—' };

function fmtDuration(s: number): string {
  const m = Math.floor(s / 60);
  const sec = Math.round(s % 60);
  return `${m}:${String(sec).padStart(2, '0')}`;
}

/* ── Share loop: 10 s WebM of the living movement ──────────────────── */

let recording = false;

recBtn.addEventListener('click', async () => {
  if (recording || (mode !== 'running' && mode !== 'winddown')) return;
  recording = true;
  recBtn.classList.add('recording');
  const live = source === 'mic' && mic.active;
  const track = live ? mic.captureTrack() : engine.captureTrack();
  try {
    const blob = await recordLoop(renderer.svgEl, {
      seconds: 10,
      audioTrack: track,
      onProgress: (left) => {
        recBtn.textContent = `● ${Math.ceil(left)}`;
      },
    });
    downloadBlob(blob, `complications-cal-${plate.cal.replace(/[^\w]/g, '') || 'live'}.webm`);
    recBtn.textContent = 'saved';
  } catch {
    recBtn.textContent = 'rec failed';
  } finally {
    // The mic track is a clone made for this recording; the file-mode
    // track belongs to the engine's persistent capture node — leave it.
    if (live) track?.stop();
    recording = false;
    recBtn.classList.remove('recording');
    setTimeout(() => {
      recBtn.textContent = 'rec ●';
    }, 2500);
  }
});

/* ── Song lifecycle ────────────────────────────────────────────────── */

function setSource(s: Source): void {
  source = s;
  modeFileBtn.classList.toggle('active', s === 'file');
  modeMicBtn.classList.toggle('active', s === 'mic');
}

async function startMic(): Promise<void> {
  loadToken++; // cancel any in-flight file load
  engine.stop();
  beatGrid = null;
  sections = [];
  specBase = '';
  comps.disengageAll();
  micSlowLoud = 0;
  micHiHold = 0;
  micLoHold = 0;
  micOffHold = 0;
  micChorusOn = false;
  setSource('mic');
  specEl.classList.remove('visible');
  try {
    await mic.start();
  } catch {
    setSource('file');
    mode = 'empty';
    setPrompt('Microphone declined', 'allow mic access in site settings, or drop a song');
    return;
  }
  mode = 'running';
  micLockedOnce = false;
  micSilentFor = 0;
  escapement.reset(0, 0);
  amplitude.snapTo(0);
  rollingPeak = AMPLITUDE.PEAK_FLOOR;
  loudness = 0;
  setPrompt('Listening', 'finding the beat…');
}

function stopMic(): void {
  mic.stop();
  setSource('file');
  if (mode === 'running') {
    mode = 'winddown';
    escapement.targetFreq = 0;
  }
  setPrompt('Drop a song', 'or click · mp3 / wav / m4a');
}

modeMicBtn.addEventListener('click', () => {
  if (source !== 'mic') void startMic();
});
modeFileBtn.addEventListener('click', () => {
  if (source === 'mic') stopMic();
});

async function loadFile(file: File): Promise<void> {
  if (source === 'mic') {
    mic.stop();
    setSource('file');
  }
  const token = ++loadToken;
  mode = 'measuring';
  setPrompt('Measuring', 'finding the beat…');
  specEl.classList.remove('visible');

  let bufferDuration: number;
  try {
    const buffer = await engine.load(file);
    bufferDuration = buffer.duration;
  } catch {
    mode = 'empty';
    setPrompt('Unreadable movement blank', 'that codec didn’t decode — try mp3 / wav / m4a');
    return;
  }
  const tempo = await detectTempo(engine.buffer!);
  if (token !== loadToken) return; // superseded by a newer drop

  const freq = (tempo.bpm / 60) * TEMPO.OSC_PER_BEAT;
  beatGrid = tempo.confident ? { freq, offset: tempo.offset } : null;

  // Song structure, so complications can anticipate sections.
  let songSections: Section[] = [];
  try {
    songSections = analyzeSections(engine.buffer!);
  } catch {
    songSections = [];
  }
  if (token !== loadToken) return;
  sections = songSections;
  sectionIdx = -1;
  comps.disengageAll();

  engine.onEnded = () => {
    if (token === loadToken) windDown();
  };
  engine.play();

  // Start the escapement already on the grid — no settling wobble.
  const startPhase = beatGrid ? 2 * Math.PI * freq * (engine.songTime - beatGrid.offset) : 0;
  escapement.reset(freq, Math.max(0, startPhase));
  amplitude.snapTo(0);
  rollingPeak = AMPLITUDE.PEAK_FLOOR;
  loudness = 0;

  mode = 'running';
  setPrompt('', '', false);
  showSpec(tempo.bpm, tempo.confident, file, bufferDuration);
}

function windDown(): void {
  if (mode !== 'running' && mode !== 'paused') return;
  mode = 'winddown';
  escapement.targetFreq = 0;
  comps.disengageAll();
}

/* ── Hacking: tap the movement to stop/restart the seconds ─────────── */

stage.addEventListener('click', () => {
  if (DEMO || source === 'mic') return;
  if (mode === 'empty') {
    fileInput.click();
  } else if (mode === 'running') {
    void engine.pause();
    mode = 'paused';
    escapement.targetFreq = 0;
  } else if (mode === 'paused') {
    void engine.resume();
    mode = 'running';
    if (beatGrid) escapement.targetFreq = beatGrid.freq;
  }
});

/* ── File input ────────────────────────────────────────────────────── */

fileInput.addEventListener('change', () => {
  const f = fileInput.files?.[0];
  if (f) void loadFile(f);
  fileInput.value = '';
});

window.addEventListener('dragover', (e) => {
  e.preventDefault();
  document.body.classList.add('dragging');
});
window.addEventListener('dragleave', (e) => {
  if (e.relatedTarget === null) document.body.classList.remove('dragging');
});
window.addEventListener('drop', (e) => {
  e.preventDefault();
  document.body.classList.remove('dragging');
  const f = e.dataTransfer?.files?.[0];
  if (f) void loadFile(f);
});

/* ── Demo mode (?demo): drives the movement from a synthetic signal so
 *    the mechanics can be tuned without audio. Dev aid only. ────────── */

const DEMO = new URLSearchParams(location.search).has('demo');
let demoT = 0;
if (DEMO) {
  mode = 'running';
  escapement.reset(96 / 60, 0);
  setPrompt('', '', false);
  plate.cal = '0000';
  plate.vph = '11,520';
  plate.res = '∞';
  specBase = 'cal. 0000 · 11,520 vph · demo';
  refreshSpec();
  specEl.classList.add('visible');
}

/* ── Render loop ───────────────────────────────────────────────────── */

let lastT = performance.now();

function frame(now: number): void {
  const dt = Math.min((now - lastT) / 1000, 0.1);
  lastT = now;

  // ── Loudness → amplitude target ──
  const live = source === 'mic' && mic.active;
  let rms = live ? mic.rms : engine.rms;
  let bassRaw = live ? mic.bass : engine.bass;
  let centroidHz = live ? mic.centroidHz : engine.centroidHz;
  if (DEMO) {
    demoT += dt;
    // A fake song: slow verse/chorus swell with beat-rate throb on top,
    // a kick-like bass pulse, and a slow brightness sweep.
    rms = 0.04 + 0.035 * Math.max(0, Math.sin(demoT * 0.25)) + 0.012 * Math.abs(Math.sin(demoT * Math.PI * 1.6));
    bassRaw = 8 + 14 * Math.pow(Math.max(0, Math.sin(demoT * Math.PI * 1.6)), 6) + 6 * Math.sin(demoT * 0.2);
    centroidHz = 1500 + 1300 * Math.sin(demoT * 0.13);
  }
  rollingPeak = Math.max(rms, rollingPeak * Math.exp(-AMPLITUDE.PEAK_DECAY_PER_S * dt), AMPLITUDE.PEAK_FLOOR);
  const norm = Math.min(1, rms / rollingPeak);
  const tau = norm > loudness ? AMPLITUDE.ATTACK_TAU : AMPLITUDE.RELEASE_TAU;
  loudness += (norm - loudness) * (1 - Math.exp(-dt / tau));

  let ampTarget = 0;
  if (mode === 'running') {
    ampTarget = AMPLITUDE.MIN_DEG + (AMPLITUDE.MAX_DEG - AMPLITUDE.MIN_DEG) * loudness;
  }

  // ── Mic mode: live tempo lock, silence wind-down, spec readout ──
  let micGrid: number | null = null;
  if (live && mode === 'running') {
    const tracker = mic.tracker!;
    micSilentFor = rms < MIC.SILENCE_RMS ? micSilentFor + dt : 0;
    const silent = micSilentFor > MIC.SILENCE_HOLD_S;
    const locked = tracker.bpm > 0 && tracker.confidence >= MIC.MIN_LOCK_CONFIDENCE;

    if (silent) {
      // The room went quiet: power drains, hands stop. Re-locks on sound.
      escapement.targetFreq = 0;
      ampTarget = 0;
    } else if (tracker.bpm > 0) {
      escapement.targetFreq = (tracker.bpm / 60) * TEMPO.OSC_PER_BEAT;
      if (locked) {
        micGrid = tracker.phase * TEMPO.OSC_PER_BEAT;
        // A hard re-anchor (mode switch, big comb correction): jump the
        // escapement rather than dragging it half a song around.
        if (Math.abs(micGrid - escapement.phase) > Math.PI) {
          escapement.reset(escapement.targetFreq, micGrid);
        }
      }
    }

    if (locked && !micLockedOnce) {
      micLockedOnce = true;
      setPrompt('', '', false);
    }

    specTimer += dt;
    if (specTimer > 0.25) {
      specTimer = 0;
      const bpm = Math.round(tracker.bpm);
      const vph = bpm > 0 ? Math.round(bpm * CALIBER.VPH_PER_BPM).toLocaleString('en-US') : '—';
      specEl.textContent = silent
        ? `cal. live · standing by · ${comps.jewels} jewels`
        : `cal. live · ${vph} vph · ${bpm > 0 ? bpm : '—'} bpm · ${locked ? 'locked' : 'listening…'} · ${comps.jewels} jewels`;
      specEl.classList.add('visible');
      plate.cal = 'LIVE';
      plate.vph = vph;
      plate.res = '—';
      renderer.setPlate(plate.cal, comps.jewels, plate.vph, plate.res);
    }
  }

  // ── Bass → barrel speed ──
  bassPeak = Math.max(bassRaw, bassPeak * Math.exp(-BARREL.PEAK_DECAY_PER_S * dt), BARREL.PEAK_FLOOR);
  const bassNorm = mode === 'running' ? Math.min(1, bassRaw / bassPeak) : 0;
  const bassTau = bassNorm > bass01 ? BARREL.ATTACK_TAU : BARREL.RELEASE_TAU;
  bass01 += (bassNorm - bass01) * (1 - Math.exp(-dt / bassTau));

  // ── Spectral centroid → material temperature (log-scale, slow) ──
  if (centroidHz > 0) {
    const t = Math.min(
      1,
      Math.max(
        0,
        (Math.log(centroidHz) - Math.log(MATERIAL.WARM_HZ)) /
          (Math.log(MATERIAL.COOL_HZ) - Math.log(MATERIAL.WARM_HZ)),
      ),
    );
    temp01 += (t - temp01) * (1 - Math.exp(-dt / MATERIAL.TAU));
  }

  // ── Complications driver ──
  if (mode === 'running') {
    if (!live && !DEMO && sections.length > 0) {
      // File mode: follow the precomputed section map, slightly early —
      // the complication lands with the section, like it saw it coming.
      const t = engine.songTime + SECTIONS.ANTICIPATE_S;
      let idx = Math.max(0, sectionIdx);
      while (idx + 1 < sections.length && t >= sections[idx + 1].start) idx++;
      if (idx !== sectionIdx) {
        sectionIdx = idx;
        comps.dateTo(idx + 1);
        comps.setChrono(sections[idx].kind === 'chorus');
        comps.setMoon(sections[idx].kind === 'quiet');
      }
    } else if (live) {
      // Mic mode, no lookahead: sustained energy drives engagement.
      micSlowLoud += (loudness - micSlowLoud) * (1 - Math.exp(-dt / COMPLICATIONS.MIC_SLOW_TAU));
      micHiHold = micSlowLoud > COMPLICATIONS.MIC_ENERGY_HI ? micHiHold + dt : 0;
      micLoHold = micSlowLoud < COMPLICATIONS.MIC_ENERGY_LO ? micLoHold + dt : 0;
      if (!micChorusOn && micHiHold > COMPLICATIONS.MIC_HOLD_S) {
        micChorusOn = true;
        micDate++;
        comps.dateTo(micDate);
      }
      micOffHold = micChorusOn && micSlowLoud < COMPLICATIONS.MIC_ENERGY_HI - 0.1 ? micOffHold + dt : 0;
      if (micChorusOn && micOffHold > COMPLICATIONS.MIC_HOLD_S) micChorusOn = false;
      comps.setChrono(micChorusOn);
      comps.setMoon(!micChorusOn && micLoHold > COMPLICATIONS.MIC_HOLD_S);
    } else if (DEMO) {
      // Cycle chorus → verse → quiet every 12 s for tuning screenshots.
      const cyc = Math.floor(demoT / 12);
      comps.dateTo(cyc + 1);
      comps.setChrono(cyc % 3 === 0);
      comps.setMoon(cyc % 3 === 2);
    }
  }
  // Lamp drift: ease toward the pointer, then relight the materials.
  const lk = 1 - Math.exp(-dt / 0.28);
  lightPos.x += (lightTarget.x - lightPos.x) * lk;
  lightPos.y += (lightTarget.y - lightPos.y) * lk;
  renderer.setLight(lightPos.x, lightPos.y);

  comps.update(dt, mode === 'running', bass01);
  if (comps.jewelsDirty) {
    comps.jewelsDirty = false;
    if (!live) refreshSpec();
  }

  // ── Escapement ──
  const onFileGrid = mode === 'running' && !DEMO && !live && beatGrid !== null && engine.playing;
  const gridPhase = onFileGrid
    ? 2 * Math.PI * beatGrid!.freq * (engine.songTime - beatGrid!.offset)
    : micGrid;
  const glideTau = mode === 'winddown' ? WINDDOWN.FREQ_DECAY_TAU : TEMPO.FREQ_GLIDE_TAU;
  const beats = escapement.step(dt, gridPhase, glideTau, live ? MIC.SERVO_GAIN : TEMPO.PHASE_SERVO_GAIN);

  // Below stopping amplitude the escapement can't unlock — beats cease.
  const amp = amplitude.step(ampTarget, dt);
  if (amp > WINDDOWN.STOP_AMPLITUDE_DEG || mode === 'running') {
    for (const b of beats) renderer.beat(b.side);
  }

  if (mode === 'winddown' && escapement.freq < WINDDOWN.STOP_FREQ_HZ && Math.abs(amp) < WINDDOWN.STOP_AMPLITUDE_DEG) {
    mode = 'empty';
    escapement.reset(0, 0);
    amplitude.snapTo(0);
    setPrompt('Drop a song', 'or click · mp3 / wav / m4a');
  }

  renderer.update({
    balanceDeg: amp * Math.sin(escapement.phase),
    bass01,
    temp01,
    moonDeg: comps.moonDriftDeg,
    dt,
  });

  recBtn.hidden = mode === 'empty' || mode === 'measuring';

  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
