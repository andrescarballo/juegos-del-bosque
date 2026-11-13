// Receptor del móvil-mando dentro de la propia web (sin servidor ni app): WebRTC con PeerJS.
// La página del juego abre un "peer" con un ID corto; el QR lleva /movil/?p=ID y el móvil se conecta directo (misma wifi).
// El broker público de PeerJS solo hace de presentador: el mando va de punto a punto. Los mensajes son los de siempre:
//   móvil -> juego: "p,botones,lx,ly,rx,ry" y "n,nombre"      juego -> móvil: "ok,N" y "v,ms"
// En la app de la tele no hace nada (allí está window.NativePad).
import './almacen.js';

const CADUCA_MS = 1500;
const moviles = new Map();   // id -> { id, conn, nombre, mask, lx, ly, rx, ry, ultimo }
const numeros = new Map();   // clave del móvil -> su número
let siguiente = 1;
let miId = '';
let estadoRed = 'parado';    // parado | conectando | listo | error

const clamp = (v) => { v = parseFloat(v); return Number.isFinite(v) ? Math.max(-1, Math.min(1, v)) : 0; };
const mayor = (a, b) => (Math.abs(b) > Math.abs(a) ? b : a);

function idGuardado() {
  try {
    let id = localStorage.getItem('bosque.receptor');
    if (!id || !/^jv-[a-z0-9]{8}$/.test(id)) {
      id = 'jv-' + Math.random().toString(36).slice(2, 10).padEnd(8, '0');
      localStorage.setItem('bosque.receptor', id);
    }
    return id;
  } catch (e) { return 'jv-' + Math.random().toString(36).slice(2, 10).padEnd(8, '0'); }
}

function cargarPeerJS() {
  return new Promise((ok, mal) => {
    if (window.Peer) return ok();
    const s = document.createElement('script');
    s.src = new URL('../lib/peerjs.min.js', import.meta.url).href;
    s.onload = ok; s.onerror = mal;
    document.head.appendChild(s);
  });
}

function atender(conn) {
  const clave = String((conn.metadata && conn.metadata.clave) || conn.peer).replace(/[^a-zA-Z0-9]/g, '').slice(0, 40);
  let id = numeros.get(clave);
  if (id === undefined) { id = siguiente++; numeros.set(clave, id); }
  const m = { id, conn, nombre: 'Móvil ' + id, mask: 0, lx: 0, ly: 0, rx: 0, ry: 0, ultimo: Date.now() };
  conn.on('open', () => {
    const viejo = moviles.get(id);
    if (viejo && viejo.conn !== conn) { try { viejo.conn.close(); } catch (e) { /* nada */ } }
    moviles.set(id, m);
    try { conn.send('ok,' + id); } catch (e) { /* nada */ }
  });
  conn.on('data', (t) => {
    t = String(t);
    m.ultimo = Date.now();
    if (t.startsWith('n,') && t.length > 2) { m.nombre = t.slice(2, 26).replace(/[,|;]/g, ' '); return; }
    if (!t.startsWith('p,')) return;
    const v = t.split(',');
    if (v.length < 6) return;
    m.mask = parseInt(v[1], 10) || 0;
    m.lx = clamp(v[2]); m.ly = clamp(v[3]); m.rx = clamp(v[4]); m.ry = clamp(v[5]);
  });
  const fin = () => { if (moviles.get(id) && moviles.get(id).conn === conn) moviles.delete(id); };
  conn.on('close', fin);
  conn.on('error', fin);
}

let intentos = 0;
function abrir(id) {
  estadoRed = 'conectando';
  const peer = new window.Peer(id);
  peer.on('open', () => { miId = id; estadoRed = 'listo'; intentos = 0; });
  peer.on('connection', atender);
  peer.on('disconnected', () => { try { peer.reconnect(); } catch (e) { /* nada */ } });
  peer.on('error', (e) => {
    if (e && e.type === 'unavailable-id' && intentos < 6) {   // al cambiar de página, el broker tarda en soltar el ID
      intentos++;
      try { peer.destroy(); } catch (x) { /* nada */ }
      setTimeout(() => abrir(intentos >= 4 ? 'jv-' + Math.random().toString(36).slice(2, 10).padEnd(8, '0') : id), 1200);
    } else if (e && /network|server|socket/.test(e.type)) {
      estadoRed = 'error';
    }
  });
}

function url() {
  if (estadoRed !== 'listo') return '';
  // desde localhost el móvil no puede llegar: hay que abrir la página con la IP del PC
  if (/^(localhost|127\.|\[::1\])/.test(location.hostname)) return '';
  const base = new URL('../movil/', import.meta.url);
  base.search = '?p=' + miId;
  return base.href;
}

function vivos(ms) { const t = Date.now(); return [...moviles.values()].filter((m) => t - m.ultimo < ms); }

export const MandoWeb = {
  /** URL para el QR, o "" si aún no hay o no sirve (localhost). */
  movilUrl: url,
  /** Para explicar por qué no hay QR: 'localhost' | 'error' | 'conectando' | 'ok' */
  motivo: () => (estadoRed === 'listo' ? (url() ? 'ok' : 'localhost') : estadoRed),
  moviles: () => vivos(CADUCA_MS * 4).length,
  /** Como NativePad.dispositivos(), solo móviles: "m1|Móvil 1|botones|lx|ly|rx|ry|0|0;" */
  dispositivos: () => vivos(CADUCA_MS * 4).map((m) => {
    const f = Date.now() - m.ultimo < CADUCA_MS;
    return `m${m.id}|${m.nombre}|${f ? m.mask : 0}|${f ? m.lx : 0}|${f ? m.ly : 0}|${f ? m.rx : 0}|${f ? m.ry : 0}|0|0;`;
  }).join(''),
  /** Todos los móviles juntos (para los menús). */
  suma: () => {
    const r = { mask: 0, lx: 0, ly: 0, rx: 0, ry: 0, n: 0 };
    for (const m of vivos(CADUCA_MS)) { r.n++; r.mask |= m.mask; r.lx = mayor(r.lx, m.lx); r.ly = mayor(r.ly, m.ly); r.rx = mayor(r.rx, m.rx); r.ry = mayor(r.ry, m.ry); }
    return r;
  },
  vibrar: (ms) => { for (const m of moviles.values()) try { m.conn.send('v,' + ms); } catch (e) { /* nada */ } },
  vibrarDisp: (disp, ms) => {
    const m = moviles.get(parseInt(String(disp).slice(1), 10));
    if (m) try { m.conn.send('v,' + ms); } catch (e) { /* nada */ }
  },
};

if (!window.NativePad && !/^\/movil\//.test(location.pathname.replace(/^.*?(\/movil\/)/, '$1')) && /^https?:$/.test(location.protocol)
    && !new URLSearchParams(location.search).has('sinmovil')) {
  window.MandoWeb = MandoWeb;
  cargarPeerJS().then(() => abrir(idGuardado())).catch(() => { estadoRed = 'error'; });
}
