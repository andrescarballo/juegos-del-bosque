// Sonidos sintetizados con WebAudio: no hace falta ningún fichero de audio.
import { pad } from './pad.js';
import { despertarMusica } from './musica.js';
import { ambiente } from './ambiente.js';

let ctx = null;
let master = null;

function audio() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.55;
    master.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  ambiente(ctx, ctx.destination);   // pájaros, grillos y viento de fondo (solo la primera vez)
  return ctx;
}

// Desbloquear en la primera pulsación (navegadores con política de autoplay)
pad.onActivity(() => { audio(); despertarMusica(); });
addEventListener('pointerdown', () => audio());

/** Nota con barrido de frecuencia. */
export function tono(f0, f1, dur, { tipo = 'triangle', vol = 0.5, cuando = 0 } = {}) {
  const a = audio();
  if (!a) return;
  const t = a.currentTime + cuando;
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = tipo;
  o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(master);
  o.start(t);
  o.stop(t + dur + 0.02);
}

const SONIDOS = {
  mover: () => tono(740, 780, 0.06, { tipo: 'square', vol: 0.06 }),
  elegir: () => { tono(660, 990, 0.09, { tipo: 'square', vol: 0.1 }); tono(990, 1320, 0.12, { tipo: 'square', vol: 0.1, cuando: 0.08 }); },
  no: () => { tono(330, 300, 0.1, { tipo: 'square', vol: 0.1 }); tono(260, 230, 0.16, { tipo: 'square', vol: 0.1, cuando: 0.1 }); },
  salto: () => tono(300, 560, 0.15, { tipo: 'sine', vol: 0.3 }),
  aterriza: () => tono(180, 90, 0.08, { tipo: 'sine', vol: 0.25 }),
  toque: (n = 0) => { const f = 620 * Math.pow(1.03, Math.min(n, 24)); tono(f, f * 1.9, 0.13, { vol: 0.5 }); },
  cae: () => { tono(560, 420, 0.22, { vol: 0.45 }); tono(420, 300, 0.22, { vol: 0.45, cuando: 0.22 }); tono(300, 140, 0.5, { vol: 0.45, cuando: 0.44 }); },
  fanfarria: () => [523, 659, 784, 1047].forEach((f, i) => tono(f, f, i === 3 ? 0.35 : 0.11, { vol: 0.4, cuando: i * 0.1 })),
  record: () => [784, 988, 1175, 1568, 1319, 1568].forEach((f, i) => tono(f, f, 0.14, { vol: 0.35, cuando: i * 0.11 })),
  // Pompas
  disparo: () => tono(420, 1500, 0.13, { tipo: 'square', vol: 0.07 }),
  pompa: (tam = 2) => { const f = 1500 / (1 + tam * 0.45); tono(f, f * 2.2, 0.05, { tipo: 'sine', vol: 0.45 }); tono(f * 0.6, f * 0.3, 0.09, { tipo: 'triangle', vol: 0.3, cuando: 0.02 }); },
  cristal: () => { tono(2400, 1800, 0.08, { tipo: 'square', vol: 0.08 }); tono(3100, 2600, 0.12, { tipo: 'sine', vol: 0.2, cuando: 0.03 }); },
  golpe: () => { tono(260, 70, 0.45, { tipo: 'sawtooth', vol: 0.22 }); tono(130, 60, 0.4, { tipo: 'sine', vol: 0.4 }); },
  objeto: () => [880, 1109, 1319].forEach((f, i) => tono(f, f * 1.01, 0.09, { tipo: 'square', vol: 0.09, cuando: i * 0.06 })),
  tictac: () => tono(1200, 1150, 0.04, { tipo: 'square', vol: 0.06 }),
  // Plataformas
  bellota: () => { tono(1320, 1320, 0.05, { tipo: 'square', vol: 0.07 }); tono(1980, 1980, 0.1, { tipo: 'square', vol: 0.07, cuando: 0.05 }); },
  pisoton: () => { tono(520, 160, 0.14, { tipo: 'square', vol: 0.12 }); tono(300, 90, 0.12, { tipo: 'sine', vol: 0.35 }); },
  bloque: () => tono(220, 140, 0.08, { tipo: 'square', vol: 0.12 }),
  romper: () => { for (let i = 0; i < 4; i++) tono(400 - i * 60, 120, 0.09, { tipo: 'square', vol: 0.08, cuando: i * 0.03 }); },
  muelle: () => tono(200, 900, 0.3, { tipo: 'triangle', vol: 0.35 }),
  // Especiales de los animales
  esp_pounce: () => { tono(240, 180, 0.12, { tipo: 'sine', vol: 0.25 }); tono(320, 980, 0.28, { tipo: 'triangle', vol: 0.35, cuando: 0.14 }); },
  esp_binky: () => { tono(420, 1250, 0.22, { tipo: 'sine', vol: 0.35 }); tono(1250, 1700, 0.16, { tipo: 'sine', vol: 0.22, cuando: 0.22 }); },
  esp_pronk: () => [0, 0.6, 1.2].forEach((c, i) => tono(260 + i * 60, 620 + i * 120, 0.16, { tipo: 'triangle', vol: 0.32, cuando: c })),
  esp_charge: () => { tono(150, 95, 0.5, { tipo: 'sawtooth', vol: 0.16 }); for (let i = 0; i < 6; i++) tono(120, 60, 0.07, { tipo: 'sine', vol: 0.3, cuando: 0.1 + i * 0.13 }); },
  esp_ball: () => { for (let i = 0; i < 8; i++) tono(300 + i * 35, 180 + i * 30, 0.08, { tipo: 'triangle', vol: 0.2, cuando: i * 0.09 }); },
  esp_flap: () => { for (let i = 0; i < 6; i++) tono(700, 260, 0.09, { tipo: 'sine', vol: 0.16, cuando: i * 0.14 }); tono(520, 660, 0.35, { tipo: 'sine', vol: 0.14, cuando: 0.9 }); },
  esp_nibble: () => { for (let i = 0; i < 9; i++) tono(1700 + (i % 2) * 300, 1200, 0.035, { tipo: 'square', vol: 0.05, cuando: i * 0.085 }); tono(500, 1400, 0.25, { tipo: 'triangle', vol: 0.3, cuando: 0.85 }); },
  esp_throw: () => { tono(300, 900, 0.14, { tipo: 'sine', vol: 0.2, cuando: 0.28 }); tono(900, 500, 0.2, { tipo: 'triangle', vol: 0.12, cuando: 0.36 }); tono(240, 120, 0.09, { tipo: 'square', vol: 0.16, cuando: 0.55 }); tono(520, 260, 0.08, { tipo: 'triangle', vol: 0.3, cuando: 0.55 }); },
  esp_stand: () => { tono(170, 70, 0.75, { tipo: 'sawtooth', vol: 0.3, cuando: 0.35 }); tono(120, 55, 0.8, { tipo: 'square', vol: 0.12, cuando: 0.35 }); tono(240, 110, 0.6, { tipo: 'sine', vol: 0.3, cuando: 0.4 }); },
  bandera: () => [659, 880, 1175].forEach((f, i) => tono(f, f, 0.12, { tipo: 'triangle', vol: 0.35, cuando: i * 0.09 })),
};

export function suena(nombre, ...args) {
  try { SONIDOS[nombre] && SONIDOS[nombre](...args); } catch (e) { /* sin sonido, sin drama */ }
}
