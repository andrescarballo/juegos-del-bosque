// La fiesta del bosque — un tablero en una isla. Por turnos, cada jugador tira el dado y avanza:
// las casillas azules dan bellotas, las rojas quitan y los regalos traen sorpresas. Al pasar por la estrella
// se puede comprar por 10 bellotas. Al acabar cada ronda se juega un minijuego (los juegos de la consola)
// y los mejores ganan bellotas. Al final gana quien tenga más estrellas (y, si empatan, más bellotas).
import { vestir, tenir, ESTACION } from '../comun/estaciones.js';
import * as THREE from '../lib/three.min.js';
import { pad, entradas } from '../comun/pad.js';
import { suena } from '../comun/sonido.js';
import { enTele, params, volverAlMenu, alPulsarAtras, escenario, vibrar } from '../comun/tv.js';
import { controlesTactiles } from '../comun/tactil.js';
import { partida, perfilPorId } from '../comun/perfiles.js';
import { especialConY, especial, poder } from '../comun/especial.js';
import { crearPersonaje, animarPersonaje } from '../comun/personajes.js';
import { crearCielo, mat, rng } from '../comun/mundo.js';
import { hayNaturaleza, plantar, unoDe, adornar, RECETA_PRADO, ARBOLES, ABETOS, ARBUSTOS, HIERBAS, PEDRUSCOS, SETAS, SETITAS, FLORES, ROCAS, PACK } from '../comun/naturaleza.js';
import { leerFiesta, guardarFiesta, borrarFiesta } from '../comun/fiesta.js';

const BOT = params.has('bot');
const PRECIO = 10;                  // bellotas por estrella
const PREMIO = [10, 6, 4, 2];       // bellotas por puesto en el minijuego
const BELLOTAS_INICIO = 5;
const MINIJUEGOS = [
  { id: 'globo', nombre: 'Globo arriba', icono: '🎈', c: '#3fb6f5', reglas: 'Gana quien dé más toques al globo' },
  { id: 'pompas', nombre: 'Lluvia de pompas', icono: '🫧', c: '#ff6fae', reglas: 'Dos niveles: gana quien haga más puntos' },
  { id: 'escondidos', nombre: 'El rebaño secreto', icono: '🐑', c: '#8f6bff', reglas: 'Gana quien marque más veces a los demás' },
  { id: 'escondite', nombre: '¿Dónde está el conejo?', icono: '🐰', c: '#52c97a', reglas: 'Tres rondas: gana quien encuentre más veces al conejo' },
  { id: 'carrera', nombre: 'La gran carrera', icono: '🏁', c: '#3f6fe8', reglas: 'Dos vueltas: gana quien llegue primero' },
  { id: 'pintar', nombre: 'Pintabosque', icono: '🎨', c: '#ff7a45', reglas: 'Un minuto: gana quien más suelo pinte de su color' },
  { id: 'despensa', nombre: 'La despensa', icono: '🌰', c: '#c8864a', reglas: 'Un minuto: gana quien más bellotas guarde en su madriguera' },
];

escenario(document.getElementById('esc'));
const $ = (id) => document.getElementById(id);
const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
controlesTactiles({ camara: false, botones: [{ b: 'A', txt: 'A', color: '#3dbb4c' }, { b: 'B', txt: 'B', color: '#ff4d4d', x: 30, y: 5 }], pausa: true, girar: true });
const A = '<span class="boton-a">A</span>', B = '<span class="boton-a boton-b">B</span>';
const azar = Math.random;

// ---------- Render ----------
const renderer = new THREE.WebGLRenderer({ canvas: $('lienzo'), antialias: !enTele, powerPreference: 'high-performance' });
const escena = new THREE.Scene();
const camara = new THREE.PerspectiveCamera(42, innerWidth / innerHeight, 0.5, 700);
function ajustar() {
  const objetivo = parseInt(params.get('ancho') || (enTele ? '1280' : '1920'), 10);
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, objetivo / innerWidth));
  renderer.setSize(innerWidth, innerHeight, false);
  camara.aspect = innerWidth / innerHeight;
  camara.updateProjectionMatrix();
}
addEventListener('resize', ajustar);
ajustar();
escena.fog = new THREE.Fog('#dff3ff', 90, 220);
escena.add(new THREE.HemisphereLight('#e6f4ff', '#8fcf6a', 1.9));
const sol = new THREE.DirectionalLight('#fff0dc', 2.1);
sol.position.set(-30, 60, 25);
escena.add(sol);
const cielo = crearCielo(THREE, escena);
const dummy = new THREE.Object3D();
const tmp = new THREE.Vector3();

// ---------- La isla y el camino ----------
const PUNTOS = [[0, 12], [9, 12.5], [16, 8], [17, 0], [12, -6], [5, -6], [0, -11], [-8, -12.5], [-15, -8], [-17, 0], [-13, 6], [-7, 6]];
const curva = new THREE.CatmullRomCurve3(PUNTOS.map(([x, z]) => new THREE.Vector3(x, 0, z)), true, 'catmullrom', 0.5);
// S = salida, A = azul (+3), R = roja (−3), G = regalo (sorpresa)
const PATRON = 'SAARGAARAGARAAGAARAGARAAGAARAG';
const N = PATRON.length;
const casillas = curva.getSpacedPoints(N).slice(0, N).map((p, i) => ({ i, x: p.x, z: p.z, tipo: PATRON[i] }));
const ALTO = 0.36;   // altura de la casilla: los personajes se apoyan encima

{
  const isla = new THREE.Mesh(new THREE.CylinderGeometry(25, 23, 3, 64), mat(THREE, '#86d860'));
  isla.position.y = -1.5;
  const arena = new THREE.Mesh(new THREE.CylinderGeometry(27, 26, 1, 64), mat(THREE, '#ffe3a3'));
  arena.position.y = -1.9;
  const agua = new THREE.Mesh(new THREE.PlaneGeometry(700, 700), new THREE.MeshLambertMaterial({ color: '#5fc8ff', emissive: '#2a8fd0', emissiveIntensity: 0.25 }));
  agua.rotation.x = -Math.PI / 2; agua.position.y = -1.6;
  escena.add(isla, arena, agua);

  const COL = { S: '#ffffff', A: '#3aa0ff', R: '#ff4d6d', G: '#ffc531' };
  const geoCasilla = new THREE.CylinderGeometry(1.2, 1.3, ALTO, 28);
  const geoCentro = new THREE.CylinderGeometry(0.7, 0.7, 0.04, 24);
  for (const c of casillas) {
    const m = new THREE.Mesh(geoCasilla, mat(THREE, COL[c.tipo]));
    m.position.set(c.x, ALTO / 2, c.z);
    escena.add(m);
    const centro = new THREE.Mesh(geoCentro, mat(THREE, c.tipo === 'S' ? '#ffd93d' : new THREE.Color(COL[c.tipo]).lerp(new THREE.Color('#ffffff'), 0.35).getStyle()));
    centro.position.set(c.x, ALTO + 0.02, c.z);
    escena.add(centro);
    if (c.tipo === 'R') {
      const raya = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.06, 0.22), mat(THREE, '#ffffff'));
      raya.position.set(c.x, ALTO + 0.05, c.z); escena.add(raya);
    } else if (c.tipo === 'A') {
      for (const r of [0, Math.PI / 2]) {
        const raya = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.06, 0.22), mat(THREE, '#ffffff'));
        raya.rotation.y = r; raya.position.set(c.x, ALTO + 0.05, c.z); escena.add(raya);
      }
    } else if (c.tipo === 'G') {
      const caja = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.62, 0.62), mat(THREE, '#ff5d73'));
      caja.position.set(c.x, ALTO + 0.33, c.z);
      const l1 = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.66, 0.16), mat(THREE, '#ffffff'));
      const l2 = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.66, 0.66), mat(THREE, '#ffffff'));
      l1.position.copy(caja.position); l2.position.copy(caja.position);
      c.caja = new THREE.Group(); c.caja.add(caja, l1, l2); escena.add(c.caja);
    } else {
      const arco = new THREE.Group();
      ['#ff5d73', '#ff9f43', '#ffd93d', '#6bd968', '#4cc3ff', '#7b7bff'].forEach((col, k) => arco.add(new THREE.Mesh(new THREE.TorusGeometry(1.9 - k * 0.14, 0.07, 6, 28, Math.PI), new THREE.MeshBasicMaterial({ color: col }))));
      const sig = casillas[1];
      arco.position.set(c.x, 0, c.z); arco.rotation.y = Math.atan2(sig.x - c.x, sig.z - c.z) + Math.PI / 2;
      escena.add(arco);
    }
  }
  // Piedrecitas entre casillas
  const piedras = [];
  for (let i = 0; i < N; i++) {
    const a = casillas[i], b = casillas[(i + 1) % N];
    for (const t of [0.42, 0.58]) piedras.push([a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t]);
  }
  const mp = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.22, 0.25, 0.12, 10), mat(THREE, '#fff6e0'), piedras.length);
  piedras.forEach(([x, z], k) => { dummy.position.set(x, 0.06, z); dummy.rotation.set(0, 0, 0); dummy.scale.setScalar(1); dummy.updateMatrix(); mp.setMatrixAt(k, dummy.matrix); });
  escena.add(mp);

  // Árboles, flores y nubes (todo instanciado)
  const r = rng(7);
  const lejos = (x, z, m) => casillas.every((c) => Math.hypot(c.x - x, c.z - z) > m);
  const arboles = [];
  for (let n = 0; n < 3000 && arboles.length < 34; n++) {
    const a = r() * Math.PI * 2, d = Math.sqrt(r()) * 22.5, x = Math.cos(a) * d, z = Math.sin(a) * d;
    if (!lejos(x, z, 3.8) || arboles.some((t) => Math.hypot(t.x - x, t.z - z) < 3.4)) continue;
    arboles.push({ x, z, h: 1.4 + r() * 1.2, s: 0.9 + r() * 0.5 });
  }
  if (hayNaturaleza) {
    const g = {};
    const poner = (n, o) => (g[n] = g[n] || []).push(o);
    for (const t of arboles) poner(unoDe(['Tree_Birch_small_green', 'Tree_Simple_small', 'Tree_Park_medium_green', 'Tree_Maple_red', 'Tree_Spruce_small', 'Tree_Cypress_small', 'Tree_Oak_small_green'], r()), { x: t.x, z: t.z, alto: t.h + 1.6, giro: r() * 6.3 });
    adornar(escena, r, (q) => {
      const a = q() * Math.PI * 2, d = Math.sqrt(q()) * 23.8, x = Math.cos(a) * d, z = Math.sin(a) * d;
      return lejos(x, z, 1.7) && arboles.every((t) => Math.hypot(t.x - x, t.z - z) > 1) ? { x, y: 0, z } : null;
    }, RECETA_PRADO, 0.9);
    for (const n in g) escena.add(plantar(n, g[n]));
  } else {
  const tr = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.22, 0.34, 1, 7), mat(THREE, '#9b6a43'), arboles.length);
  const co = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), mat(THREE, '#ffffff', { flatShading: true }), arboles.length);
  const C = ['#5cc56a', '#4cb85e', '#7fd66a', '#3fae5b', '#9be06e', '#ff9ad5', '#ffc18a'];
  arboles.forEach((t, i) => {
    dummy.position.set(t.x, t.h / 2, t.z); dummy.scale.set(1, t.h, 1); dummy.rotation.set(0, 0, 0); dummy.updateMatrix(); tr.setMatrixAt(i, dummy.matrix);
    dummy.position.set(t.x, t.h + 0.7, t.z); dummy.scale.setScalar(t.s); dummy.rotation.set(r(), r(), r()); dummy.updateMatrix(); co.setMatrixAt(i, dummy.matrix);
    co.setColorAt(i, new THREE.Color(C[i % C.length]));
  });
  escena.add(tr, co);
  }
  const nFlores = 160;
  const fl = new THREE.InstancedMesh(new THREE.SphereGeometry(0.13, 6, 4), mat(THREE, '#ffffff'), nFlores);
  const FLOR = ['#ff6fb1', '#ffffff', '#ffd23f', '#b48cff', '#ff8a5c'];
  for (let i = 0, n = 0; i < nFlores && n < 2000; n++) {
    const a = r() * Math.PI * 2, d = Math.sqrt(r()) * 23.5, x = Math.cos(a) * d, z = Math.sin(a) * d;
    if (!lejos(x, z, 1.6)) continue;
    dummy.position.set(x, 0.08, z); dummy.scale.set(1, 0.6, 1); dummy.rotation.set(0, 0, 0); dummy.updateMatrix();
    fl.setMatrixAt(i, dummy.matrix); fl.setColorAt(i, new THREE.Color(FLOR[i % FLOR.length])); i++;
  }
  escena.add(fl);
  const nubes = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 12, 8), new THREE.MeshLambertMaterial({ color: '#ffffff', emissive: '#ffffff', emissiveIntensity: 0.45 }), 40);
  for (let n = 0; n < 8; n++) {
    const a = (n / 8) * Math.PI * 2 + r() * 0.4, d = 55 + r() * 30, y = 18 + r() * 10;
    for (let k = 0; k < 5; k++) {
      const s = 2 + r() * 2.4;
      dummy.position.set(Math.cos(a) * d + (k - 2) * 2.4, y + r() * 1.5, Math.sin(a) * d + r() * 2);
      dummy.scale.set(s * 1.2, s * 0.8, s); dummy.rotation.set(0, 0, 0); dummy.updateMatrix();
      nubes.setMatrixAt(n * 5 + k, dummy.matrix);
    }
  }
  escena.add(nubes);
}

// La estrella: gira encima de su casilla
const estrellaM = (() => {
  const s = new THREE.Shape();
  for (let k = 0; k < 10; k++) {
    const a = (k / 10) * Math.PI * 2 + Math.PI / 2, r = k % 2 ? 0.45 : 1;
    if (k) s.lineTo(Math.cos(a) * r, Math.sin(a) * r); else s.moveTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.3, bevelEnabled: true, bevelSize: 0.08, bevelThickness: 0.08, bevelSegments: 1 });
  g.center();
  const m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ color: '#ffd23f', emissive: '#ffae00', emissiveIntensity: 0.45 }));
  const grupo = new THREE.Group();
  grupo.add(m);
  const halo = new THREE.Mesh(new THREE.RingGeometry(1.25, 1.55, 32), new THREE.MeshBasicMaterial({ color: '#fff27a', transparent: true, opacity: 0.8, side: THREE.DoubleSide }));
  halo.rotation.x = -Math.PI / 2;
  escena.add(grupo, halo);
  return { grupo, halo, x: 0, z: 0, vuela: null };
})();

// ---------- Estado de la fiesta ----------
const datos = partida.leer();
let F = leerFiesta();
function nuevaFiesta(jugadores, rondas = 5) {
  return {
    jugadores: jugadores.map((j) => ({ perfil: j.perfil, dispositivo: j.dispositivo, casilla: 0, bellotas: BELLOTAS_INICIO, estrellas: 0 })),
    rondas, ronda: 1, turno: 0, fase: 'inicio', estrella: 15, ultimo: null, minijuego: null, resultado: null,
  };
}
if (datos && datos.juego === 'fiesta' && Array.isArray(datos.jugadores)) {
  // Recién llegados de "¿Quién juega?": fiesta nueva. Se marca la partida para que recargar la página no la borre.
  F = nuevaFiesta(datos.jugadores.filter((j) => perfilPorId(j.perfil)));
  partida.guardar('fiesta+', datos.jugadores);
  guardarFiesta(F);
}
// Para pruebas: ?jugadores=N con perfiles de mentira (los minijuegos no los reconocerán)
if (params.has('jugadores')) {
  const n = Math.max(2, Math.min(4, parseInt(params.get('jugadores'), 10) || 2));
  F = nuevaFiesta(Array.from({ length: n }, (_, i) => ({ perfil: 'prueba' + i, dispositivo: null })));
}
const PERFILES_PRUEBA = ['zorro', 'oso', 'conejo', 'buho'].map((a, i) => ({ id: 'prueba' + i, nombre: 'J' + (i + 1), animal: a, pelo: 'natural', accesorio: 'nada', color: ['#ff4d6d', '#2fb4ff', '#3dbb4c', '#ffb21a'][i] }));
const perfilDe = (id) => perfilPorId(id) || PERFILES_PRUEBA.find((p) => p.id === id) || null;
if (F) F.jugadores = F.jugadores.filter((j) => perfilDe(j.perfil));
const guardar = () => { if (!params.has('jugadores')) guardarFiesta(F); };

// ---------- Fichas (los personajes en el tablero) ----------
class Ficha {
  constructor(j, k) {
    this.j = j; this.k = k;
    this.perfil = perfilDe(j.perfil);
    this.color = this.perfil.color || '#ff4d6d';
    this.pj = crearPersonaje(THREE, this.perfil);
    this.pj.g.scale.multiplyScalar(0.95);
    escena.add(this.pj.g);
    this.pos = new THREE.Vector3(); this.y = 0; this.angulo = 0; this.paso = 0; this.aplasta = 0; this.baila = 0;
    this.salto = null;   // { de, a, t, dur }
  }
  /** Sitio dentro de la casilla: si hay varios, se reparten en corro. */
  sitio(casilla, salvo = null) {
    const c = casillas[casilla];
    const aqui = fichas.filter((f) => f !== salvo && f.j.casilla === casilla && !f.salto);
    const n = aqui.length, k = aqui.indexOf(this);
    if (n <= 1 || k < 0) return new THREE.Vector3(c.x, 0, c.z);
    const a = (k / n) * Math.PI * 2 + 0.6;
    return new THREE.Vector3(c.x + Math.cos(a) * 0.6, 0, c.z + Math.sin(a) * 0.6);
  }
  actualizar(dt) {
    if (this.salto) {
      const s = this.salto;
      s.t += dt;
      const f = Math.min(1, s.t / s.dur);
      this.pos.lerpVectors(s.de, s.a, f);
      this.y = Math.sin(f * Math.PI) * s.alto;
      const dx = s.a.x - s.de.x, dz = s.a.z - s.de.z;
      if (Math.hypot(dx, dz) > 0.05) this.angulo = girar(this.angulo, Math.atan2(dx, dz), dt * 14);
      this.paso += dt * 10;
      if (f >= 1) { this.salto = null; this.y = 0; this.aplasta = 0.8; s.fin(); }
    } else {
      // Se acomoda en su sitio y mira hacia la cámara
      const obj = this.sitio(this.j.casilla);
      this.pos.lerp(obj, 1 - Math.exp(-dt * 8));
      const mira = Math.atan2(camara.position.x - this.pos.x, camara.position.z - this.pos.z);
      this.angulo = girar(this.angulo, mira, dt * 4);
      this.paso *= Math.exp(-dt * 10);
      if (this.baila > 0) { this.baila -= dt; this.y = Math.abs(Math.sin(this.baila * 9)) * 0.6; } else this.y = 0;
    }
    this.aplasta = Math.max(0, this.aplasta - dt * 4);
    this.pj.g.position.set(this.pos.x, ALTO + this.y, this.pos.z);
    this.pj.g.rotation.y = this.angulo;
    animarPersonaje(this.pj, { paso: this.paso, suelo: this.y < 0.05, aplasta: this.aplasta, dt });
  }
  /** Salta a una casilla. Devuelve una promesa que se cumple al caer. */
  saltarA(casilla, { dur = 0.34, alto = 1.1 } = {}) {
    return new Promise((fin) => {
      const de = this.pos.clone();
      this.j.casilla = casilla;
      const a = this.sitio(casilla, this);
      this.salto = { de, a, t: 0, dur, alto, fin };
      suena('salto');
    });
  }
}
function girar(a, b, k) { let d = b - a; d = Math.atan2(Math.sin(d), Math.cos(d)); return a + d * Math.min(1, k); }
let fichas = [];
function crearFichas() {
  for (const f of fichas) escena.remove(f.pj.g);
  fichas = F.jugadores.map((j, k) => new Ficha(j, k));
  for (const f of fichas) { f.pos.copy(f.sitio(f.j.casilla)); f.angulo = Math.PI; }
}

// ---------- Esperas (el desarrollo de la fiesta se escribe con async/await) ----------
let reloj = 0, pausado = false;
const esperas = [];
const hasta = (cond) => new Promise((r) => esperas.push(() => { const v = cond(); if (v) { r(v); return true; } return false; }));
const esperar = (s) => { const t = reloj + s; return hasta(() => reloj >= t); };
function dispDe(j) { const d = j.dispositivo ? entradas.get(j.dispositivo) : null; return d && d.conectado ? d : null; }
/** Espera a que el jugador `j` (o cualquiera si j es null) pulse uno de los botones. Devuelve el botón. */
function boton(j, lista = ['A']) {
  const t0 = reloj;
  return hasta(() => {
    if (BOT && reloj - t0 > 0.6) return lista[0];
    const d = j ? dispDe(j) : null;
    for (const b of lista) if (d ? d.pressed(b) : pad.pressed(b)) return b;
    return false;
  });
}

// ---------- HUD ----------
function mensaje(html, ms = 1400) {
  const m = $('mensaje'); m.innerHTML = html; m.classList.add('ver');
  clearTimeout(mensaje.t); if (ms) mensaje.t = setTimeout(() => m.classList.remove('ver'), ms);
}
function panel(html) { const p = $('panel'); if (html) { p.innerHTML = html; p.classList.add('ver'); } else p.classList.remove('ver'); }
function ayuda(html) { $('ayuda').innerHTML = html ? `<span>${html}</span>` : ''; }
const nombre = (f) => esc(f.perfil.nombre);
/** Clasificación: más estrellas y, si empatan, más bellotas. */
function clasificacion() {
  const orden = [...fichas].sort((a, b) => b.j.estrellas - a.j.estrellas || b.j.bellotas - a.j.bellotas);
  let puesto = 0, ant = null;
  return orden.map((f, k) => {
    const v = f.j.estrellas * 1000 + f.j.bellotas;
    if (v !== ant) { puesto = k + 1; ant = v; }
    return { f, puesto };
  });
}
let turnoDe = null;
function pintarFichas() {
  const puestos = new Map(clasificacion().map((c) => [c.f, c.puesto]));
  $('fichas').innerHTML = fichas.map((f) => `<div class="ficha${f === turnoDe ? ' turno' : ''}" style="--c:${f.color}"><div class="puesto">${puestos.get(f)}º</div>`
    + `<div><div class="nom">${nombre(f)}</div><div class="cuenta">⭐ <b>${f.j.estrellas}</b> &nbsp; 🌰 <b>${f.j.bellotas}</b></div></div></div>`).join('');
  $('arriba').innerHTML = F.fase === 'fin' ? '¡Fin de la fiesta!' : `Ronda ${Math.min(F.ronda, F.rondas)} de ${F.rondas}${F.ronda === F.rondas ? '<small>¡Última ronda!</small>' : ''}`;
}
function flotante(txt, pos, color) {
  tmp.set(pos.x, pos.y, pos.z).project(camara);
  const d = document.createElement('div');
  d.className = 'flota txt';
  d.innerHTML = txt;
  if (color) d.style.setProperty('--morado', color);
  d.style.left = ((tmp.x + 1) / 2 * innerWidth) + 'px';
  d.style.top = ((1 - tmp.y) / 2 * innerHeight) + 'px';
  $('flotantes').appendChild(d);
  setTimeout(() => d.remove(), 1500);
}
const encima = (f) => new THREE.Vector3(f.pos.x, ALTO + 2.6, f.pos.z);
function darBellotas(f, n) {
  const antes = f.j.bellotas;
  f.j.bellotas = Math.max(0, f.j.bellotas + n);
  const real = f.j.bellotas - antes;
  if (n >= 0) { flotante(`+${real} 🌰`, encima(f), '#2fa84a'); suena('bellota'); }
  else { flotante(`−${-real} 🌰`, encima(f), '#e0334f'); suena('golpe'); vibrar(200, f.j.dispositivo || undefined); f.aplasta = 1; }
  pintarFichas();
  return real;
}

// ---------- Cámara ----------
const camObj = { mira: new THREE.Vector3(0, 0, 0), alto: 36, atras: 27 };
let camSigue = null;   // ficha a la que sigue (null = todo el tablero)
const camMira = new THREE.Vector3(0, 0, 2), camPos = new THREE.Vector3(0, 34, 30);
function actualizarCamara(dt) {
  // Siguiendo a alguien, desde bastante arriba para que los árboles no tapen el camino
  if (camSigue) { camObj.mira.set(camSigue.pos.x, 0, camSigue.pos.z); camObj.alto = 16; camObj.atras = 10; }
  else { camObj.mira.set(0, 0, 1.5); camObj.alto = 36; camObj.atras = 27; }
  const k = 1 - Math.exp(-dt * 3);
  camMira.lerp(camObj.mira, k);
  tmp.set(camObj.mira.x, camObj.alto, camObj.mira.z + camObj.atras);
  camPos.lerp(tmp, k);
  camara.position.copy(camPos);
  camara.lookAt(camMira);
}

// ---------- Dado ----------
const dado = { el: $('dado'), girando: false, t: 0, valor: 1 };
function ponerDado(v, color) { dado.el.textContent = String(v); dado.el.style.setProperty('--c', color); }

// ---------- La fiesta ----------
async function inicio() {
  F.fase = 'inicio';
  camSigue = null;
  pintarFichas();
  const opciones = [3, 5, 7, 10];
  let k = Math.max(0, opciones.indexOf(F.rondas));
  const pinta = () => panel(`<h2>¡La fiesta del bosque!</h2>`
    + `<p>Tira el dado con ${A} y avanza. Las casillas <b style="color:#3aa0ff">azules</b> dan 3 🌰, las <b style="color:#ff4d6d">rojas</b> quitan 3 y los <b style="color:#e0a000">regalos</b> traen sorpresas.</p>`
    + `<p>Si pasas por la ⭐, puedes comprarla por ${PRECIO} 🌰. Después de cada ronda, ¡un minijuego!</p>`
    + `<div class="rondas"><span data-tap="LEFT">◀</span> <b>${opciones[k]}</b> rondas <span data-tap="RIGHT">▶</span></div>`
    + `<div class="opciones"><span data-tap="A">${A} ¡A jugar!</span><span data-tap="B">${B} Menú</span></div>`);
  pinta();
  ayuda('');
  const b = await hasta(() => {
    if (BOT && reloj > 1) return 'A';
    const dir = pad.nav();
    if (dir === 'left' || dir === 'right') { k = (k + (dir === 'left' ? -1 : 1) + opciones.length) % opciones.length; suena('mover'); pinta(); }
    return pad.pressed('A') ? 'A' : pad.pressed('B') ? 'B' : false;
  });
  if (b === 'B') { salir(); return false; }
  suena('elegir');
  F.rondas = opciones[k];
  F.fase = 'turno'; F.ronda = 1; F.turno = 0;
  guardar();
  panel(null);
  pintarFichas();
  mensaje('¡Empieza la fiesta!', 1500);
  await esperar(1.6);
  return true;
}

async function turno(f) {
  turnoDe = f; camSigue = f;
  pintarFichas();
  mensaje(`Turno de ${nombre(f)}`, 1300);
  await esperar(1.0);
  // Tirar el dado
  dado.el.classList.add('ver', 'gira'); dado.el.classList.remove('para');
  dado.girando = true;
  ponerDado(1 + Math.floor(azar() * 6), f.color);
  ayuda(`${nombre(f)}: pulsa ${A} para parar el dado`);
  await boton(f.j, ['A']);
  dado.girando = false;
  const n = 1 + Math.floor(azar() * 6);
  ponerDado(n, f.color);
  dado.el.classList.remove('gira'); void dado.el.offsetWidth; dado.el.classList.add('para');
  suena('elegir'); vibrar(60, f.j.dispositivo || undefined);
  ayuda('');
  await esperar(0.7);
  // Avanzar casilla a casilla
  for (let p = n; p > 0; p--) {
    await f.saltarA((f.j.casilla + 1) % N);
    ponerDado(p - 1, f.color);
    if (f.j.casilla === F.estrella) await estrella(f);
    if (f.j.casilla === 0 && p > 1) { darBellotas(f, 3); await esperar(0.3); }   // pasar por la salida también da algo
  }
  dado.el.classList.remove('ver');
  await esperar(0.25);
  // Lo que pasa en la casilla
  const tipo = casillas[f.j.casilla].tipo;
  if (tipo === 'A' || tipo === 'S') darBellotas(f, 3);
  else if (tipo === 'R') darBellotas(f, -3);
  else if (tipo === 'G') await sorpresa(f);
  await esperar(1.1);
  turnoDe = null;
  pintarFichas();
}

async function estrella(f) {
  if (f.j.bellotas < PRECIO) {
    mensaje(`⭐ ¡La estrella!<small>Hacen falta ${PRECIO} 🌰 para comprarla</small>`, 1700);
    await esperar(1.8);
    return;
  }
  panel(`<h2>⭐ ¡La estrella!</h2><p>${nombre(f)}, ¿la compras por ${PRECIO} 🌰?</p>`
    + `<div class="opciones"><span data-tap="A">${A} ¡Sí!</span><span data-tap="B">${B} No</span></div>`);
  const b = await boton(f.j, ['A', 'B']);
  panel(null);
  if (b !== 'A') { suena('mover'); await esperar(0.3); return; }
  f.j.bellotas -= PRECIO; f.j.estrellas++;
  especial(f.pj);
  suena('fanfarria'); vibrar(150, f.j.dispositivo || undefined);
  flotante('+1 ⭐', encima(f), '#e0a000');
  f.baila = 1.2;
  pintarFichas();
  await esperar(1.2);
  await moverEstrella(f.j.casilla);
}
/** La estrella vuela a otra casilla lejos de donde estaba (nunca a la salida). */
async function moverEstrella(desde) {
  const opciones = casillas.filter((c) => c.tipo !== 'S' && Math.min((c.i - desde + N) % N, (desde - c.i + N) % N) >= 7);
  const nueva = opciones[Math.floor(azar() * opciones.length)].i;
  const sigue = camSigue;
  camSigue = null;
  mensaje('¡La estrella se va volando!', 1500);
  estrellaM.vuela = { de: new THREE.Vector3(estrellaM.x, 0, estrellaM.z), a: new THREE.Vector3(casillas[nueva].x, 0, casillas[nueva].z), t: 0 };
  F.estrella = nueva;
  await hasta(() => !estrellaM.vuela);
  await esperar(0.5);
  camSigue = sigue;
}

async function sorpresa(f) {
  const otros = fichas.filter((o) => o !== f);
  const casilla = casillas[f.j.casilla];
  if (casilla.caja) casilla.salta = 1;
  suena('objeto');
  const opciones = ['bolsa', 'muelle', 'reparte', 'cambio'];
  const cual = opciones[Math.floor(azar() * opciones.length)];
  await esperar(0.5);
  if (cual === 'bolsa') {
    mensaje('🎁 ¡Una bolsa de bellotas!', 1500);
    await esperar(0.6);
    darBellotas(f, 6);
  } else if (cual === 'muelle') {
    mensaje('🎁 ¡Un muelle!<small>Avanzas 3 casillas más</small>', 1700);
    suena('muelle');
    await esperar(1.2);
    for (let p = 0; p < 3; p++) {
      await f.saltarA((f.j.casilla + 1) % N, { alto: 2 });
      if (f.j.casilla === F.estrella) await estrella(f);
    }
  } else if (cual === 'reparte') {
    mensaje('🎁 ¡Regalos!<small>Cada uno te da 2 🌰</small>', 1700);
    await esperar(1.2);
    let total = 0;
    for (const o of otros) { const q = Math.min(2, o.j.bellotas); if (q) { darBellotas(o, -q); total += q; } }
    await esperar(0.5);
    if (total) darBellotas(f, total);
  } else {
    const o = otros[Math.floor(azar() * otros.length)];
    mensaje(`🎁 ¡Cambio de sitio!<small>${nombre(f)} y ${esc(o.perfil.nombre)}</small>`, 1800);
    await esperar(1.2);
    const a = f.j.casilla, b = o.j.casilla;
    camSigue = null;
    if (a !== b) await Promise.all([f.saltarA(b, { dur: 0.9, alto: 4 }), o.saltarA(a, { dur: 0.9, alto: 4 })]);
    await esperar(0.8);
    camSigue = f;
  }
}

async function ruleta() {
  camSigue = null; turnoDe = null;
  pintarFichas();
  mensaje('¡Hora del minijuego!', 1500);
  await esperar(1.5);
  const cartas = () => `<h2>¡Minijuego!</h2><div id="ruleta">${MINIJUEGOS.map((m, k) => `<div class="carta" style="--c:${m.c}" data-k="${k}"><span>${m.icono}</span>${m.nombre.replace(/[¡!]/g, '')}</div>`).join('')}</div><p id="reglas">&nbsp;</p>`;
  panel(cartas());
  const posibles = MINIJUEGOS.map((m, k) => k).filter((k) => MINIJUEGOS[k].id !== F.ultimo);
  const elegido = posibles[Math.floor(azar() * posibles.length)];
  // La luz va pasando por las cartas cada vez más despacio hasta pararse en la elegida
  const pasos = MINIJUEGOS.length * 3 + ((elegido - 0 + MINIJUEGOS.length) % MINIJUEGOS.length);
  for (let p = 0; p <= pasos; p++) {
    const k = p % MINIJUEGOS.length;
    document.querySelectorAll('.carta').forEach((c) => c.classList.toggle('sel', +c.dataset.k === k));
    suena('mover');
    await esperar(0.06 + Math.pow(p / pasos, 3) * 0.4);
  }
  const m = MINIJUEGOS[elegido];
  suena('fanfarria');
  $('reglas').textContent = m.reglas;
  $('panel').insertAdjacentHTML('beforeend', `<div class="opciones"><span data-tap="A">${A} ¡A jugar!</span></div>`);
  await esperar(0.5);
  await boton(null, ['A']);
  suena('elegir');
  F.fase = 'minijuego'; F.minijuego = m.id; F.ultimo = m.id; F.resultado = null;
  guardar();
  partida.guardar(m.id, F.jugadores.map((j) => ({ perfil: j.perfil, dispositivo: j.dispositivo })));
  await esperar(0.3);
  location.href = `../${m.id}/index.html?fiesta=1${BOT ? '&bot=1' : ''}`;
  await hasta(() => false);
}

async function premios() {
  camSigue = null;
  const m = MINIJUEGOS.find((x) => x.id === F.minijuego);
  const res = F.resultado;
  if (!res || !res.length) {
    panel(`<h2>Minijuego sin terminar</h2><p>Esta vez nadie gana bellotas.</p><div class="opciones"><span data-tap="A">${A} Seguir</span></div>`);
    await boton(null, ['A']);
    panel(null);
    return;
  }
  // Se apuntan las bellotas antes de enseñarlas, así recargar la página no las da dos veces
  const filas = res.map((r) => ({ ...r, f: fichas.find((f) => f.j.perfil === r.id), premio: PREMIO[r.puesto - 1] || 0 })).filter((r) => r.f);
  for (const r of filas) r.f.j.bellotas += r.premio;
  F.resultado = null;
  guardar();
  pintarFichas();
  suena('fanfarria');
  for (const r of filas) if (r.puesto === 1) { r.f.baila = 2; especial(r.f.pj); }
  panel(`<h2>${m ? m.icono + ' ' : ''}¡Premios!</h2><div class="tabla">${filas.map((r) => `<span class="chip" style="--c:${r.f.color}"><i></i>${r.puesto}º ${esc(r.f.perfil.nombre)} <b class="mas">+${r.premio} 🌰</b>${r.puesto === 1 ? ' 👑' : ''}</span>`).join('')}</div>`
    + `<div class="opciones"><span data-tap="A">${A} Seguir</span></div>`);
  await esperar(0.8);
  await boton(null, ['A']);
  suena('elegir');
  panel(null);
}

async function final() {
  F.fase = 'fin';
  guardar();
  camSigue = null; turnoDe = null;
  pintarFichas();
  const cl = clasificacion();
  const ganan = cl.filter((c) => c.puesto === 1);
  for (const c of ganan) { c.f.baila = 999; especial(c.f.pj); }
  suena('record');
  const titulo = ganan.length === 1 ? `¡Gana ${nombre(ganan[0].f)}!` : `¡Empate entre ${ganan.map((c) => nombre(c.f)).join(' y ')}!`;
  panel(`<h2>${titulo}</h2><div class="tabla">${cl.map((c) => `<span class="chip" style="--c:${c.f.color}"><i></i>${c.puesto}º ${nombre(c.f)} <b>⭐ ${c.f.j.estrellas}</b> 🌰 ${c.f.j.bellotas}${c.puesto === 1 ? ' 👑' : ''}</span>`).join('')}</div>`
    + `<div class="opciones"><span data-tap="A">${A} Otra fiesta</span><span data-tap="B">${B} Menú</span></div>`);
  confeti = 6;
  await esperar(1.2);
  const b = await boton(null, ['A', 'B']);
  confeti = 0;
  if (b === 'B') { salir(); return false; }
  suena('elegir');
  F = nuevaFiesta(F.jugadores, F.rondas);
  guardar();
  crearFichas();
  return true;
}

function salir() { borrarFiesta(); volverAlMenu(); }

async function fiesta() {
  crearFichas();
  estrellaM.x = casillas[F.estrella].x; estrellaM.z = casillas[F.estrella].z;
  pintarFichas();
  await esperar(0.3);
  for (;;) {
    if (F.fase === 'inicio' && !(await inicio())) return;
    if (F.fase === 'turno') {
      while (F.turno < fichas.length) {
        await turno(fichas[F.turno]);
        F.turno++;
        guardar();
      }
      F.fase = 'ruleta';
      guardar();
    }
    if (F.fase === 'ruleta') await ruleta();
    if (F.fase === 'minijuego') F.resultado = null;   // se salió del minijuego sin acabarlo
    if (F.fase === 'minijuego' || F.fase === 'premios') {
      await premios();
      F.ronda++; F.turno = 0;
      F.fase = F.ronda > F.rondas ? 'fin' : 'turno';
      guardar();
      pintarFichas();
      if (F.fase === 'turno' && F.ronda === F.rondas) { mensaje('¡Última ronda!', 1600); await esperar(1.7); }
    }
    if (F.fase === 'fin' && !(await final())) return;
  }
}

async function pocosJugadores() {
  camSigue = null;
  panel(`<h2>¡Hacen falta amigos!</h2><p>La fiesta se juega con 2, 3 o 4 jugadores, cada uno con su mando o su móvil.</p>`
    + `<div class="opciones"><span data-tap="A">${A} Elegir jugadores</span><span data-tap="B">${B} Menú</span></div>`);
  const b = await boton(null, ['A', 'B']);
  if (b === 'A') location.href = new URL('../jugadores/index.html#fiesta', location.href).href;
  else volverAlMenu();
}

// ---------- Pausa ----------
let panelAntes = null;
function pausar(si) {
  if (si === pausado) return;
  pausado = si;
  const p = $('panel');
  if (si) {
    panelAntes = p.classList.contains('ver') ? p.innerHTML : null;
    panel(`<h2>Pausa</h2><p>La fiesta se queda guardada mientras no salgas.</p><div class="opciones"><span data-tap="A">${A} Seguir</span><span data-tap="B">${B} Salir al menú</span></div>`);
  } else panel(panelAntes);
}
alPulsarAtras(() => { if (pausado) salir(); else pausar(true); return true; });

// ---------- Confeti ----------
let confeti = 0, tConfeti = 0;
const COLORES_CONFETI = ['#ff5d73', '#ffd93d', '#6bd968', '#4cc3ff', '#c17bff', '#ff9f43'];
function lanzarConfeti() {
  const d = document.createElement('div');
  d.className = 'flota';
  d.textContent = ['🎉', '⭐', '🎊', '✨'][Math.floor(azar() * 4)];
  d.style.left = (azar() * 100) + '%'; d.style.top = (60 + azar() * 40) + '%';
  d.style.color = COLORES_CONFETI[Math.floor(azar() * COLORES_CONFETI.length)];
  $('flotantes').appendChild(d);
  setTimeout(() => d.remove(), 1500);
}

// ---------- Bucle ----------
let antes = performance.now(), fpsN = 0, fpsT = 0, verFps = params.has('fps');
function bucle(now) {
  const dt = Math.max(0, Math.min(0.05, (now - antes) / 1000));
  antes = now;
  pad.update(); entradas.update();
  if (pad.pressed('SELECT')) verFps = !verFps;
  if (!pausado && fichas.length) especialConY(fichas.map((f) => ({ dispositivo: f.j.dispositivo, pj: f.pj })));
  if (pausado) {
    if (pad.pressed('A') || pad.pressed('START')) pausar(false);
    else if (pad.pressed('B')) salir();
  } else {
    if (pad.pressed('START') && F) pausar(true);
    else {
      reloj += dt;
      for (let k = 0; k < esperas.length; k++) if (esperas[k]()) { esperas.splice(k, 1); k--; }
    }
  }
  const t = now / 1000;
  if (!pausado) {
    for (const f of fichas) f.actualizar(dt);
    if (dado.girando) { dado.t += dt; if (dado.t > 0.07) { dado.t = 0; dado.el.textContent = String(1 + Math.floor(azar() * 6)); } }
    if (estrellaM.vuela) {
      const v = estrellaM.vuela;
      v.t += dt / 1.6;
      const f = Math.min(1, v.t), s = f * f * (3 - 2 * f);
      estrellaM.x = v.de.x + (v.a.x - v.de.x) * s; estrellaM.z = v.de.z + (v.a.z - v.de.z) * s;
      estrellaM.grupo.position.y = 2.6 + Math.sin(f * Math.PI) * 9;
      if (f >= 1) { estrellaM.vuela = null; suena('cristal'); }
    }
    for (const c of casillas) if (c.salta) { c.salta = Math.max(0, c.salta - dt * 2); c.caja.position.y = Math.sin(c.salta * Math.PI) * 1.2; c.caja.rotation.y = c.salta * 6; }
    if (confeti > 0) { tConfeti += dt; if (tConfeti > 0.12) { tConfeti = 0; lanzarConfeti(); } }
  }
  if (!estrellaM.vuela) estrellaM.grupo.position.y = 2.6 + Math.sin(t * 2) * 0.25;
  estrellaM.grupo.position.x = estrellaM.x; estrellaM.grupo.position.z = estrellaM.z;
  estrellaM.grupo.rotation.y = t * 1.6;
  estrellaM.halo.position.set(estrellaM.x, ALTO + 0.06, estrellaM.z);
  estrellaM.halo.material.opacity = 0.5 + Math.sin(t * 4) * 0.3;
  estrellaM.halo.visible = !estrellaM.vuela;
  actualizarCamara(dt);
  cielo.position.copy(camara.position);
  renderer.render(escena, camara);

  fpsN++; fpsT += dt;
  if (fpsT >= 0.5) {
    const e = $('fps'); e.style.display = verFps ? 'block' : 'none';
    if (verFps) e.textContent = `${Math.round(fpsN / fpsT)} fps · ${renderer.info.render.calls} dibujos`;
    fpsN = 0; fpsT = 0;
  }
  requestAnimationFrame(bucle);
}

window.__fiesta = {
  get estado() { return F && { fase: F.fase, ronda: F.ronda, rondas: F.rondas, turno: F.turno, estrella: F.estrella, jugadores: F.jugadores.map((j) => ({ ...j })) }; },
  get esperas() { return esperas.length; },
};

vestir(THREE, escena, { lejos: 30 });
requestAnimationFrame(bucle);
if (F && F.jugadores.length >= 2) fiesta(); else pocosJugadores();
