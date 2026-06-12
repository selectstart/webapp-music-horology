# Complications

Music rendered as a living, mechanically plausible watch movement in the browser.

Drop an audio file (or use your microphone) and watch a fully simulated Swiss lever escapement respond in real time — tempo drives oscillation frequency, loudness swings the balance wheel, bass charges the mainspring barrel, and spectral brightness shifts the metal finish between rose gold and rhodium.

---

## Features

### The Movement
- **Swiss lever escapement** — 15-tooth escape wheel, pallet fork, impulse pin, and second-order damped spring physics throughout
- **Full gear train** — mainspring barrel → third wheel → fourth wheel → escape wheel, with gear ratios derived from drawn SVG radii so visible meshing and motion agree
- **Hairspring breathing** — 8-turn spiral with power-law coil falloff; the inner coils visibly bunch and relax each oscillation
- **Keyless works** — 4-wheel winding cascade (ratchet R78 → crown R48 → winding R22 → setting R18) driven by bass energy

### Grand Seiko–style Sweep Seconds
The centre seconds hand is **strictly geared** to the escape wheel at a 78:14 ratio — it speeds up, slows down, and stops with the music, never animating independently. A tri-synchro exponential follower (τ = 0.35 s) smooths the stepped escapement ticks into a continuous sweep, the same principle as a Spring Drive glide-spring regulator. A small R12 flywheel spinning at 6.5× the seconds wheel is visible at the pivot, flanked by two pole shoes and a copper coil winding.

### Audio Engine
| Mode | How it works |
|------|-------------|
| **File** | Drop mp3 / wav / m4a. BPM detected via autocorrelation with octave-preference fix. Full song analysed offline (own FFT, 12 log-spaced bands, cosine-distance novelty curve) to find section boundaries and classify each segment as chorus / verse / quiet. Complications engage on the upbeat. |
| **Mic** | Real-time tempo tracking: AGC / echo-cancel disabled, Bark-band flux with rolling mean+σ onset threshold, PLL phase lock. Locks in ≈ 3 s, re-locks to a new tempo in ≈ 4 s. |

Both modes use rolling-peak normalisation so quiet masters, loud masters, and AGC'd phone mics all drive the full range of movement.

### Complications
| Complication | Trigger | Mechanism |
|---|---|---|
| **Flyback chronograph** | Chorus sections | Column-wheel lever throws; 30-min subdial totaliser accumulates; spring flyback on disengage |
| **Moonphase** | Quiet / bridge sections | Moon disc rises into aperture on a damped spring; self-rotates on a 90 s period |
| **Power reserve** | Bass energy | Fan-type indicator, bass-charged, passively drains at 0.03/s; collapses at 10× rate on silence |
| **Big date** | Section boundaries | Twin digit windows with gold bezels; only the disc that changed numerically snaps |

### Lighting & Materials
- **Pointer-following bench lamp** — move your mouse to reposition the light source; all metal surfaces (bridges, wheels, jewels, hands) react via shared SVG gradient definitions, not per-element filters, so the scene runs at 60 fps
- **Spectral material shift** — treble-heavy passages shift the train toward cool rhodium; bass-heavy passages warm it to rose gold; τ = 2.5 s
- **30 jewels** — count shown live on the caliber plate; increments as complications engage

---

## Running locally

```bash
npm install
npm run dev
```

Open **http://localhost:5173** in your browser.

Add `?demo` to the URL to run a synthetic signal (no audio required) — useful for visual tuning.

---

## Sharing

Hit the **REC** button while a song is playing to capture a 10-second WebM loop with muxed audio, downloaded automatically.

---

## Tuning

Every audio→mechanism mapping lives in [`src/mappings.ts`](src/mappings.ts) — nothing elsewhere needs to change for tuning. Key constants:

| Constant | Default | Effect |
|---|---|---|
| `ESCAPEMENT.GLIDE_TAU` | `0.35` | Seconds hand smoothness — higher is silkier, lower is closer to raw ticking |
| `AMPLITUDE.MIN_DEG / MAX_DEG` | `180 / 310` | Balance wheel swing range |
| `TEMPO.PHASE_SERVO_GAIN` | `1.5` | How tightly ticks lock to detected song beats |
| `BARREL.BASS_DPS` | `9` | How much bass accelerates the barrel |
| `MATERIAL.TAU` | `2.5` | How slowly the metal finish shifts with brightness |

---

## Tech stack

- **Vite + TypeScript** — no framework, vanilla DOM
- **SVG + requestAnimationFrame** — all rendering; no canvas, no WebGL
- **Web Audio API** — AnalyserNode, OfflineAudioContext, MediaRecorder, MediaStreamAudioDestination
- **Meyda** — real-time RMS, spectral centroid, Bark-band loudness
- **web-audio-beat-detector** — file-mode BPM detection

---

## Caliber specification

| Parameter | Value |
|---|---|
| Movement type | Manual-wind mechanical (audio-driven) |
| Balance frequency | BPM × 2 / 60 Hz |
| Vibrations per hour | BPM × 120 vph |
| Escape wheel teeth | 15 (Swiss lever) |
| Centre seconds ratio | 78 : 14 |
| Glide wheel ratio | 78 : 12 |
| Base jewels | 23 |
| Max jewels (all complications) | 30 |

Full interactive feature reference: [`/features.html`](features.html)
