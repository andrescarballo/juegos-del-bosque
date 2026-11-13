// Música: las canciones de web/musica/*.mp3. Se pone sola según la página (la importa sonido.js, que usan todas):
//   menú, jugadores y ajustes -> el tema del bosque · la carrera -> los de carrera · el resto de juegos -> el de la estación
// Al cambiar de página, si toca la misma canción sigue por donde iba.
//   musicaActiva() / ponerMusica(true|false)   -> el ajuste (se guarda)
//   volumenMusica(0..1)                        -> para bajarla un momento (pausa, final de partida…)
import './almacen.js';
import { ESTACION } from './estaciones.js';

const CANCIONES = {
  menu: ['cuento-del-bosque', 'cuento-de-primavera-2'],
  carrera: ['primera-carrera', 'carrera-entre-arboles', 'primera-carrera-2'],
  // primavera, verano, otoño, invierno: primero la más propia de la estación y luego las demás, para que no suene
  // siempre la misma (cada partida toca la siguiente de la lista)
  estacion: [
    ['cuento-de-primavera', 'cuento-de-primavera-2', 'cuento-del-bosque'],
    ['cuento-del-bosque', 'cuento-de-primavera-2', 'carrera-entre-arboles'],
    ['carrera-entre-arboles', 'cuento-del-bosque', 'cuento-de-primavera'],
    ['invierno-en-el-bosque', 'cuento-del-bosque', 'cuento-de-primavera-2'],
  ],
};
const VOLUMEN = 0.38;
const CLAVE = 'bosque.musica', CLAVE_POS = 'bosque.musica.pos', CLAVE_TURNO = 'bosque.musica.turno';
const local = (fn, d = null) => { try { return fn(); } catch (e) { return d; } };

export function musicaActiva() { return local(() => localStorage.getItem(CLAVE)) !== '0'; }

function listaDeEstaPagina() {
  const ruta = location.pathname;
  if (/\/carrera\//.test(ruta)) return ['carrera', CANCIONES.carrera];
  if (/\/(globo|pompas|escondidos|escondite|bosque|fiesta|paseo|pintar|redil|despensa)\//.test(ruta)) return ['estacion' + ESTACION, CANCIONES.estacion[ESTACION]];
  if (/\/(_prueba|movil)\//.test(ruta)) return [null, []];
  return ['menu', CANCIONES.menu];
}

let audio = null, pista = null, nivel = 1, sube = 0;

function elegirPista() {
  const [grupo, lista] = listaDeEstaPagina();
  if (!lista.length) return null;
  const antes = local(() => JSON.parse(sessionStorage.getItem(CLAVE_POS)), null);
  // Si la canción que sonaba vale para esta página, sigue esa (por donde iba)
  if (antes && lista.includes(antes.pista) && antes.grupo === grupo) return antes;
  // Si no, la siguiente de la lista (va rotando de una partida a otra)
  const turnos = local(() => JSON.parse(localStorage.getItem(CLAVE_TURNO)), null) || {};
  // un solo turno para todas las estaciones: así, de un juego al siguiente, cambia la canción aunque cambie la estación
  const clave = grupo.replace(/\d+$/, ''), n = turnos[clave] || 0, k = n % lista.length;
  turnos[clave] = n + 1;
  local(() => localStorage.setItem(CLAVE_TURNO, JSON.stringify(turnos)));
  return { pista: lista[k], grupo, t: 0 };
}

function recordar() {
  if (!audio || !pista || audio.paused) return;
  local(() => sessionStorage.setItem(CLAVE_POS, JSON.stringify({ pista: pista.pista, grupo: pista.grupo, t: audio.currentTime })));
}

let sinCanciones = false;
function arrancar() {
  if (sinCanciones || !musicaActiva() || typeof Audio !== 'function') return;
  if (!audio) {
    pista = elegirPista();
    if (!pista) return;
    audio = new Audio(new URL(`../musica/${pista.pista}.mp3`, import.meta.url).href);
    audio.loop = true; audio.preload = 'auto'; audio.volume = 0;
    audio.addEventListener('error', () => { sinCanciones = true; }, { once: true });   // no están (la web publicada no las lleva): sin música
    if (pista.t > 1) audio.addEventListener('loadedmetadata', () => { try { audio.currentTime = pista.t % (audio.duration || 1e9); } catch (e) { /* desde el principio */ } }, { once: true });
    audio.addEventListener('playing', () => { sube = performance.now(); subir(); }, { once: true });
    setInterval(recordar, 1500);
    addEventListener('pagehide', recordar);
  }
  if (audio.paused) audio.play().catch(() => { /* el navegador pide una pulsación antes: se reintenta abajo */ });
}
function subir() {
  if (!audio) return;
  const f = Math.min(1, (performance.now() - sube) / 1200);
  audio.volume = VOLUMEN * nivel * f;
  if (f < 1) setTimeout(subir, 60);
}

export function ponerMusica(si) {
  local(() => localStorage.setItem(CLAVE, si ? '1' : '0'));
  if (si) arrancar();
  else if (audio) { audio.pause(); }
}
/** Baja o sube la música sin pararla (1 = normal). */
export function volumenMusica(v) { nivel = Math.max(0, Math.min(1, v)); if (audio && !audio.paused) audio.volume = VOLUMEN * nivel; }

// En la tele suena nada más entrar; en el navegador del PC hay que esperar a la primera pulsación
arrancar();
for (const ev of ['pointerdown', 'keydown', 'touchstart']) addEventListener(ev, arrancar, { passive: true });
addEventListener('gamepadconnected', arrancar);
export function despertarMusica() { if (audio ? audio.paused : true) arrancar(); }
document.addEventListener('visibilitychange', () => { if (!audio) return; if (document.hidden) audio.pause(); else if (musicaActiva()) audio.play().catch(() => {}); });
