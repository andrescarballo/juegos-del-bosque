// Mando unificado para todos los juegos.
//  - En la app de la tele: lee window.NativePad (la app Android recoge el mando de Xbox y los móviles).
//  - En el navegador del PC o del móvil: Gamepad API estándar.
//  - Siempre: teclado (y las flechas/OK del mando de la tele) y, en el móvil, los controles táctiles.
//
// Dos formas de leerlo:
//   pad       -> todo junto (para menús: cualquiera manda)
//   entradas  -> cada mando/móvil/teclado por separado (para partidas de varios jugadores)

import { MandoWeb } from './receptor.js';

export const BTN = {
  A: 0, B: 1, X: 2, Y: 3, LB: 4, RB: 5, LT: 6, RT: 7,
  SELECT: 8, START: 9, L3: 10, R3: 11, UP: 12, DOWN: 13, LEFT: 14, RIGHT: 15, HOME: 16,
};

const N = 17;
const mayor = (a, b) => (Math.abs(b) > Math.abs(a) ? b : a);
const DEADZONE = 0.22;

// Teclado -> botón
const KEY_BTN = {
  Space: 'A', Enter: 'A', NumpadEnter: 'A', KeyZ: 'A',
  Escape: 'B', Backspace: 'B', KeyX: 'B',
  KeyC: 'X', KeyV: 'Y', KeyP: 'START', Tab: 'SELECT', KeyQ: 'LB', KeyE: 'RB',
  ArrowUp: 'UP', ArrowDown: 'DOWN', ArrowLeft: 'LEFT', ArrowRight: 'RIGHT',
};

// El mando de la tele a veces no trae e.code: lo sacamos de e.key.
const KEY_CODE = { ArrowUp: 'ArrowUp', ArrowDown: 'ArrowDown', ArrowLeft: 'ArrowLeft', ArrowRight: 'ArrowRight',
  Enter: 'Enter', ' ': 'Space', Escape: 'Escape', Backspace: 'Backspace', Tab: 'Tab' };
function codigo(e) {
  if (e.code && e.code !== 'Unidentified') return e.code;
  return KEY_CODE[e.key] || (e.key && e.key.length === 1 ? 'Key' + e.key.toUpperCase() : e.key);
}

function dead(x, y) {
  const m = Math.hypot(x, y);
  if (m < DEADZONE) return [0, 0];
  const k = Math.min(1, (m - DEADZONE) / (1 - DEADZONE)) / m;
  return [x * k, y * k];
}

function vacio() { return new Array(N).fill(false); }
function deMascara(mask) { const b = vacio(); for (let i = 0; i < N; i++) b[i] = (mask & (1 << i)) !== 0; return b; }

/** Cruceta también mueve el stick izquierdo. */
function sumarCruceta(b, lx, ly) {
  const dx = (b[BTN.RIGHT] ? 1 : 0) - (b[BTN.LEFT] ? 1 : 0);
  const dy = (b[BTN.DOWN] ? 1 : 0) - (b[BTN.UP] ? 1 : 0);
  if (!dx && !dy) return [lx, ly];
  const x = lx + dx, y = ly + dy, m = Math.hypot(x, y);
  return m > 1 ? [x / m, y / m] : [x, y];
}

/** Estado del teclado como si fuera un mando. */
function estadoTeclado(teclas, recientes) {
  // Una pulsación muy rápida (bajar y subir entre dos fotogramas) también cuenta
  const k = new Set(teclas);
  const ahora = performance.now();
  for (const [c, t] of recientes) { if (ahora - t < 70) k.add(c); else recientes.delete(c); }
  const b = vacio();
  for (const code of k) { const n = KEY_BTN[code]; if (n) b[BTN[n]] = true; }
  const lx = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0);
  const ly = (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0) - (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0);
  const rx = (k.has('KeyL') ? 1 : 0) - (k.has('KeyJ') ? 1 : 0);
  const ry = (k.has('KeyK') ? 1 : 0) - (k.has('KeyI') ? 1 : 0);
  const m = Math.hypot(lx, ly) || 1;
  return { b, lx: lx / m, ly: ly / m, rx, ry };
}

/** Pulsos de navegación para menús ('left'|'right'|'up'|'down'), con repetición al mantener. */
function navDe(o, now) {
  let dir = null;
  if (o.down('LEFT') || o.lx < -0.5) dir = 'left';
  else if (o.down('RIGHT') || o.lx > 0.5) dir = 'right';
  else if (o.down('UP') || o.ly < -0.5) dir = 'up';
  else if (o.down('DOWN') || o.ly > 0.5) dir = 'down';
  const n = o._nav;
  if (dir !== n.dir) { n.dir = dir; n.next = now + 380; return dir; }
  if (dir && now >= n.next) { n.next = now + 170; return dir; }
  return null;
}

class Pad {
  constructor() {
    this.buttons = vacio();
    this.prev = vacio();
    this.lx = 0; this.ly = 0; this.rx = 0; this.ry = 0; this.lt = 0; this.rt = 0;
    this.connected = false;
    this.source = 'teclado';       // 'tele' | 'navegador' | 'teclado'
    this.name = '';
    this.keys = new Set();
    this.recientes = new Map();
    this.tecladoUsado = false;
    this.tactilUsado = false;
    this._nav = { dir: null, next: 0 };
    this.v = { mask: 0, lx: 0, ly: 0 };   // controles táctiles (comun/tactil.js)
    this._taps = 0;                       // pulsaciones sueltas: cuentan un fotograma
    this._tapsE = 0;                      // lo mismo, para `entradas`
    this._arr = { x: 0, y: 0 };           // arrastre de cámara acumulado (radianes)
    this._listeners = new Set();
    this.capturaTexto = null;             // si un campo quiere las letras del teclado, no las tratamos como botones

    addEventListener('keydown', (e) => {
      if (this.capturaTexto && this.capturaTexto(e)) { e.preventDefault(); return; }
      const id = codigo(e);
      if (KEY_BTN[id] || /^Key[WASDIJKL]$/.test(id)) e.preventDefault();
      if (!e.repeat) this.recientes.set(id, performance.now());
      this.keys.add(id);
      this.tecladoUsado = true;
      this._emitActivity();
    });
    addEventListener('keyup', (e) => this.keys.delete(codigo(e)));
    addEventListener('blur', () => this.keys.clear());
  }

  /** Llamar una vez por fotograma, antes de leer nada. */
  update() {
    for (let i = 0; i < N; i++) this.prev[i] = this.buttons[i];
    let b = vacio();
    let lx = 0, ly = 0, rx = 0, ry = 0, lt = 0, rt = 0;
    this.connected = false;

    if (window.NativePad && typeof window.NativePad.poll === 'function') {
      const s = String(window.NativePad.poll()).split(',');
      this.source = 'tele';
      this.connected = s[0] === '1';
      b = deMascara(parseInt(s[1], 10) || 0);
      lx = +s[2] || 0; ly = +s[3] || 0; rx = +s[4] || 0; ry = +s[5] || 0; lt = +s[6] || 0; rt = +s[7] || 0;
      if (!this.name && window.NativePad.name) this.name = String(window.NativePad.name());
    } else if (navigator.getGamepads) {
      for (const gp of navigator.getGamepads()) {
        if (!gp || !gp.connected) continue;
        this.source = 'navegador';
        this.connected = true;
        this.name = gp.id;
        for (let i = 0; i < N && i < gp.buttons.length; i++) b[i] = gp.buttons[i].pressed;
        lx = gp.axes[0] || 0; ly = gp.axes[1] || 0; rx = gp.axes[2] || 0; ry = gp.axes[3] || 0;
        lt = gp.buttons[6] ? gp.buttons[6].value : 0;
        rt = gp.buttons[7] ? gp.buttons[7].value : 0;
        break;
      }
    }
    // Móviles conectados por la web (WebRTC): se suman al resto
    if (window.MandoWeb) {
      const w = window.MandoWeb.suma();
      if (w.n) {
        this.connected = true;
        for (let i = 0; i < N; i++) if (w.mask & (1 << i)) b[i] = true;
        lx = mayor(lx, w.lx); ly = mayor(ly, w.ly); rx = mayor(rx, w.rx); ry = mayor(ry, w.ry);
      }
    }
    if (!this.connected && this.source !== 'tele') this.source = 'teclado';
    if (lt > 0.5) b[BTN.LT] = true;
    if (rt > 0.5) b[BTN.RT] = true;

    // Teclado encima de todo (también el mando de la tele: flechas + OK)
    const t = estadoTeclado(this.keys, this.recientes);
    for (let i = 0; i < N; i++) if (t.b[i]) b[i] = true;

    [lx, ly] = dead(lx, ly);
    [rx, ry] = dead(rx, ry);
    if (t.lx || t.ly) { lx = t.lx; ly = t.ly; }
    if (t.rx || t.ry) { rx = t.rx; ry = t.ry; }
    [lx, ly] = sumarCruceta(b, lx, ly);

    // Táctil
    const vm = this.v.mask | this._taps;
    this._taps = 0;
    if (vm) for (let i = 0; i < N; i++) if (vm & (1 << i)) b[i] = true;
    if (this.v.lx || this.v.ly) { lx = this.v.lx; ly = this.v.ly; }

    this.buttons = b;
    this.lx = lx; this.ly = ly; this.rx = rx; this.ry = ry; this.lt = lt; this.rt = rt;
    for (let i = 0; i < N; i++) if (b[i] && !this.prev[i]) { this._emitActivity(); break; }
  }

  down(name) { return this.buttons[BTN[name]]; }
  pressed(name) { const i = BTN[name]; return this.buttons[i] && !this.prev[i]; }
  released(name) { const i = BTN[name]; return !this.buttons[i] && this.prev[i]; }
  any() { return this.buttons.some((v, i) => v && !this.prev[i]); }
  nav(now = performance.now()) { return navDe(this, now); }

  /** Pulsa un botón durante un fotograma (botones táctiles, paneles). */
  tap(name) { const bit = 1 << BTN[name]; this._taps |= bit; this._tapsE |= bit; this._emitActivity(); }
  /** La cámara táctil va sumando aquí; el juego lo recoge con arrastre(). */
  arrastrar(x, y) { this._arr.x += x; this._arr.y += y; }
  arrastre() { const a = { x: this._arr.x, y: this._arr.y }; this._arr.x = 0; this._arr.y = 0; return a; }

  /** Avisa con cualquier pulsación (sirve para desbloquear el sonido). */
  onActivity(fn) { this._listeners.add(fn); }
  _emitActivity() { for (const fn of this._listeners) fn(); }
}

export const pad = new Pad();

// ---------- Varios jugadores: cada mando/móvil/teclado/pantalla es un "dispositivo" ----------

export class Dispositivo {
  constructor(id, tipo, nombre) {
    this.id = id;
    this.tipo = tipo;            // 'mando' | 'movil' | 'teclado' | 'tactil'
    this.nombre = nombre;
    this.buttons = vacio();
    this.prev = vacio();
    this.lx = 0; this.ly = 0; this.rx = 0; this.ry = 0;
    this.conectado = false;
    this._nav = { dir: null, next: 0 };
  }
  down(n) { return this.buttons[BTN[n]]; }
  pressed(n) { const i = BTN[n]; return this.buttons[i] && !this.prev[i]; }
  any() { return this.buttons.some((v, i) => v && !this.prev[i]); }
  nav(now = performance.now()) { return navDe(this, now); }
  get etiqueta() {
    if (this.tipo === 'movil') return this.nombre || 'Móvil';
    if (this.tipo === 'teclado') return 'Teclado';
    if (this.tipo === 'tactil') return 'Pantalla táctil';
    return /xbox/i.test(this.nombre) ? 'Mando Xbox' : 'Mando';
  }
}

class Entradas {
  constructor() { this.mapa = new Map(); }

  _poner(id, tipo, nombre, b, lx, ly, rx, ry, vistos) {
    let d = this.mapa.get(id);
    if (!d) { d = new Dispositivo(id, tipo, nombre); this.mapa.set(id, d); }
    if (nombre) d.nombre = nombre;
    d.prev = d.buttons;
    d.buttons = b;
    [d.lx, d.ly] = dead(lx, ly);
    [d.rx, d.ry] = dead(rx, ry);
    [d.lx, d.ly] = sumarCruceta(b, d.lx, d.ly);
    vistos.add(id);
  }

  /** Llamar una vez por fotograma. */
  update() {
    const vistos = new Set();
    if (window.NativePad && typeof window.NativePad.dispositivos === 'function') {
      for (const parte of String(window.NativePad.dispositivos()).split(';')) {
        if (!parte) continue;
        const c = parte.split('|');
        const b = deMascara(parseInt(c[2], 10) || 0);
        if (+c[7] > 0.5) b[BTN.LT] = true;
        if (+c[8] > 0.5) b[BTN.RT] = true;
        this._poner(c[0], c[0][0] === 'm' ? 'movil' : 'mando', c[1], b, +c[3] || 0, +c[4] || 0, +c[5] || 0, +c[6] || 0, vistos);
      }
    } else if (navigator.getGamepads) {
      for (const gp of navigator.getGamepads()) {
        if (!gp || !gp.connected) continue;
        const b = vacio();
        for (let i = 0; i < N && i < gp.buttons.length; i++) b[i] = gp.buttons[i].pressed;
        this._poner('gp' + gp.index, 'mando', gp.id, b, gp.axes[0] || 0, gp.axes[1] || 0, gp.axes[2] || 0, gp.axes[3] || 0, vistos);
      }
    }
    if (window.MandoWeb && !window.NativePad) {
      for (const parte of window.MandoWeb.dispositivos().split(';')) {
        if (!parte) continue;
        const c = parte.split('|');
        const b = deMascara(parseInt(c[2], 10) || 0);
        this._poner(c[0], 'movil', c[1], b, +c[3] || 0, +c[4] || 0, +c[5] || 0, +c[6] || 0, vistos);
      }
    }
    // El teclado cuenta como un jugador más (en la tele no: allí el teclado es el mando de la tele)
    if (!window.NativePad && pad.tecladoUsado) {
      const t = estadoTeclado(pad.keys, pad.recientes);
      this._poner('teclado', 'teclado', 'Teclado', t.b, t.lx, t.ly, t.rx, t.ry, vistos);
      const d = this.mapa.get('teclado'); d.lx = t.lx; d.ly = t.ly; d.rx = t.rx; d.ry = t.ry; // sin zona muerta
    }
    // La pantalla táctil del móvil, si se ha usado
    if (pad.tactilUsado) {
      const vm = pad.v.mask | pad._tapsE;
      pad._tapsE = 0;
      this._poner('tactil', 'tactil', 'Pantalla', deMascara(vm), pad.v.lx, pad.v.ly, 0, 0, vistos);
      const d = this.mapa.get('tactil'); d.lx = pad.v.lx; d.ly = pad.v.ly;
    }
    for (const [id, d] of this.mapa) {
      d.conectado = vistos.has(id);
      if (!d.conectado) { d.prev = d.buttons; d.buttons = vacio(); d.lx = d.ly = d.rx = d.ry = 0; }
    }
  }

  lista() { return [...this.mapa.values()].filter((d) => d.conectado); }
  get(id) { return this.mapa.get(id) || null; }
}

export const entradas = new Entradas();
