// Sonidos del bosque de fondo, hechos con WebAudio (del prototipo "Bichos del bosque"): viento siempre, y según la
// estación pájaros (muchos en primavera, ninguno en invierno), grillos (verano) y hojarasca (otoño).
// Lo arranca sonido.js en cuanto hay audio; no hay que llamarlo desde los juegos.
import { ESTACION, VIENTO } from './estaciones.js';

const rnd = (a, b) => a + Math.random() * (b - a);
const VOLUMEN = 0.5;
let hecho = false;

export function ambiente(ctx, salida) {
  if (hecho || !ctx || /\/(_prueba|movil|mando)\//.test(location.pathname)) return;
  hecho = true;
  const bus = ctx.createGain(); bus.gain.value = 0; bus.connect(salida);
  bus.gain.setTargetAtTime(VOLUMEN, ctx.currentTime, 1.2);
  const env = (g, t, pico, ataque, caida) => { g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(pico, t + ataque); g.gain.exponentialRampToValueAtTime(0.0001, t + ataque + caida); };

  // Viento: ruido filtrado que sube y baja a rachas
  const ruido = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const d = ruido.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  const fuente = ctx.createBufferSource(); fuente.buffer = ruido; fuente.loop = true;
  const filtro = ctx.createBiquadFilter(); filtro.type = 'bandpass'; filtro.frequency.value = 500; filtro.Q.value = 0.6;
  const gViento = ctx.createGain(); gViento.gain.value = 0.05;
  fuente.connect(filtro); filtro.connect(gViento); gViento.connect(bus); fuente.start();

  function pajaro(t) {
    const pan = ctx.createStereoPanner ? ctx.createStereoPanner() : ctx.createGain(); if (pan.pan) pan.pan.value = rnd(-0.85, 0.85); pan.connect(bus);
    const tipo = (Math.random() * 3) | 0, f0 = rnd(2200, 4200);
    const nota = (tt, fa, fb, dur, v) => { const o = ctx.createOscillator(), g = ctx.createGain(); o.frequency.setValueAtTime(fa, tt); o.frequency.exponentialRampToValueAtTime(fb, tt + dur); env(g, tt, v, 0.012, dur); o.connect(g); g.connect(pan); o.start(tt); o.stop(tt + dur + 0.05); };
    if (tipo === 0) { const n = 3 + ((Math.random() * 5) | 0); for (let i = 0; i < n; i++) nota(t + i * rnd(0.07, 0.1), f0 * (1 + i * 0.02), f0 * 1.2, 0.06, 0.1); }   // trino
    else if (tipo === 1) { for (let i = 0; i < 2 + ((Math.random() * 2) | 0); i++) { nota(t + i * 0.42, f0 * 1.25, f0, 0.12, 0.11); nota(t + i * 0.42 + 0.16, f0, f0 * 0.8, 0.14, 0.1); } }   // «tiu-tiu»
    else nota(t, f0 * 1.3, f0 * 0.75, 0.35, 0.09);   // silbido que baja
  }
  function grillos(t) {
    const o = ctx.createOscillator(), g = ctx.createGain(), am = ctx.createOscillator(), ag = ctx.createGain(), e = ctx.createGain(), dur = rnd(0.5, 1.1);
    o.frequency.value = rnd(4200, 4700); am.frequency.value = 27; am.type = 'square'; ag.gain.value = 0.5; g.gain.value = 0;
    env(e, t, 0.045, 0.08, dur); am.connect(ag); ag.connect(g.gain); o.connect(g); g.connect(e); e.connect(bus);
    o.start(t); am.start(t); o.stop(t + dur + 0.2); am.stop(t + dur + 0.2);
  }
  function hojarasca(t, viento) {
    const n = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain(), dur = rnd(0.5, 1.3);
    n.buffer = ruido; f.type = 'bandpass'; f.frequency.value = rnd(2400, 4200); f.Q.value = 0.8;
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.05 + viento * 0.07, t + dur * 0.4); g.gain.linearRampToValueAtTime(0.0001, t + dur);
    n.connect(f); f.connect(g); g.connect(bus); n.start(t, Math.random()); n.stop(t + dur + 0.1);
  }

  const PAJAROS = [1, 0.7, 0.25, 0][ESTACION];
  let tPajaro = ctx.currentTime + 1.5, tGrillo = ctx.currentTime + 2, tHojas = ctx.currentTime + 1, racha = Math.random() * 10;
  setInterval(() => {
    if (ctx.state !== 'running' || document.hidden) return;
    const ahora = ctx.currentTime;
    racha += 0.25;
    const viento = Math.max(0.08, Math.min(1.2, 0.4 * VIENTO * (0.75 + 0.45 * Math.sin(racha * 0.21) + 0.3 * Math.sin(racha * 0.57 + 1.3))));
    if (PAJAROS && ahora > tPajaro) { pajaro(ahora + 0.05); tPajaro = ahora + rnd(1.2, 5) / PAJAROS; }
    if (ESTACION === 1 && ahora > tGrillo) { grillos(ahora + 0.05); tGrillo = ahora + rnd(1.5, 4); }
    if (ESTACION === 2 && ahora > tHojas) { hojarasca(ahora + 0.05, viento); tHojas = ahora + rnd(1, 3.5) / (0.4 + viento); }
    gViento.gain.setTargetAtTime((ESTACION === 3 ? 0.08 : 0.05) + viento * 0.22, ahora, 0.4);
    filtro.frequency.setTargetAtTime((ESTACION === 3 ? 300 : 380) + viento * 620, ahora, 0.4);
  }, 250);
}
