// El rebaño secreto — Cada jugador es una oveja más de un rebaño de ovejas iguales que se mueven solas.
// Todos juegan a la vez en la misma pantalla: acércate a otro jugador sin que se note y márcalo (A).
// Si marcas a una oveja normal, te equivocas: te quedas aturdido y se ve quién eres.
import { vestir, tenir, ESTACION } from '../comun/estaciones.js';
import * as THREE from '../lib/three.min.js';
import { pad, entradas } from '../comun/pad.js';
import { suena } from '../comun/sonido.js';
import { enTele, params, volverAlMenu, alPulsarAtras, escenario, vibrar } from '../comun/tv.js';
import { controlesTactiles, esTactil } from '../comun/tactil.js';
import { partida, perfilPorId } from '../comun/perfiles.js';
import { FIESTA, resultadoFiesta, volverAlTablero, OPCIONES_FIESTA } from '../comun/fiesta.js';
import { especialConY, especial, poder } from '../comun/especial.js';
import { crearPersonaje, animarPersonaje, conModelos } from '../comun/personajes.js';
import { hayNaturaleza, plantar, unoDe, adornar, RECETA_PRADO, ARBOLES, ABETOS, ARBUSTOS, HIERBAS, PEDRUSCOS, SETAS, SETITAS, FLORES, ROCAS, PACK } from '../comun/naturaleza.js';

const BOT = params.has('bot');
const DURACION = parseInt(params.get('tiempo') || (FIESTA ? '90' : '150'), 10);
const N_OVEJAS = 40;               // las del rebaño (sin contar a los jugadores)
const ANCHO = 15, FONDO = 9;       // el prado va de -15 a 15 (x) y de -9 a 9 (z)
const PASO = 2.1, TROTE = 4.2;     // velocidades (iguales para ovejas y jugadores)
const ALCANCE = 1.35;              // distancia para marcar
const T_ATURDIDO = 1.8, T_DELATADO = 3, T_INMUNE = 1.5;

escenario(document.getElementById('esc'));
const $ = (id) => document.getElementById(id);
const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
controlesTactiles({ camara: false, botones: [{ b: 'A', txt: 'A', color: '#3dbb4c' }, { b: 'B', txt: 'B', color: '#ff4d4d', x: 30, y: 5 }], pausa: true });
if (esTactil) $('ayuda').innerHTML = '<span>Muévete como una oveja más · <span class="boton-a">A</span> marcar · <span class="boton-a boton-b">B</span> trotar</span>';
function rng(seed) { return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const azar = rng(5);
const clamp = THREE.MathUtils.clamp;

// ---------- Render ----------
const renderer = new THREE.WebGLRenderer({ canvas: $('lienzo'), antialias: !enTele, powerPreference: 'high-performance' });
const escena = new THREE.Scene();
const camara = new THREE.PerspectiveCamera(38, innerWidth / innerHeight, 0.5, 300);
function ajustar() {
  const objetivo = parseInt(params.get('ancho') || (enTele ? '1280' : esTactil ? '1600' : '1920'), 10);
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, objetivo / innerWidth));
  renderer.setSize(innerWidth, innerHeight, false);
  camara.aspect = innerWidth / innerHeight;
  camara.updateProjectionMatrix();
  // Que se vea el prado entero
  const t = Math.tan(THREE.MathUtils.degToRad(camara.fov / 2));
  const d = Math.max(16.5 / t, (ANCHO + 2.5) / (t * camara.aspect)) * 0.82;
  camara.position.set(0, d * 0.82, d * 0.6);
  camara.lookAt(0, 0, 0.8);
}
addEventListener('resize', ajustar);
ajustar();

escena.background = new THREE.Color('#9fdcff');
escena.fog = new THREE.Fog('#bfe8ff', 45, 90);
escena.add(new THREE.HemisphereLight('#eef8ff', '#8fcf6a', 1.9));
const sol = new THREE.DirectionalLight('#fff2dc', 2.0);
sol.position.set(-12, 30, 14);
escena.add(sol);
const mats = new Map();
function mat(color, opts = {}) {
  const k = color + JSON.stringify(opts);
  if (!mats.has(k)) mats.set(k, new THREE.MeshLambertMaterial({ color, ...opts }));
  return mats.get(k);
}
const dummy = new THREE.Object3D();

// Prado con valla
const prado = new THREE.Mesh(new THREE.BoxGeometry(ANCHO * 2 + 3, 1, FONDO * 2 + 3), mat('#86d860'));
prado.position.y = -0.5;
escena.add(prado);
const fuera = new THREE.Mesh(new THREE.PlaneGeometry(300, 300), mat('#6fc24c'));
fuera.rotation.x = -Math.PI / 2; fuera.position.y = -0.9;
escena.add(fuera);
{
  const postes = [], tablas = [];
  for (let x = -ANCHO - 1.2; x <= ANCHO + 1.21; x += 2.4) { postes.push([x, -FONDO - 1.2]); postes.push([x, FONDO + 1.2]); }
  for (let z = -FONDO - 1.2 + 2.4; z < FONDO + 1.2; z += 2.4) { postes.push([-ANCHO - 1.2, z]); postes.push([ANCHO + 1.2, z]); }
  const mp = new THREE.InstancedMesh(new THREE.BoxGeometry(0.22, 1.1, 0.22), mat('#b07a4f'), postes.length);
  postes.forEach(([x, z], i) => { dummy.position.set(x, 0.55, z); dummy.rotation.set(0, 0, 0); dummy.scale.set(1, 1, 1); dummy.updateMatrix(); mp.setMatrixAt(i, dummy.matrix); });
  escena.add(mp);
  const L = [[0, -FONDO - 1.2, ANCHO * 2 + 2.6, 0], [0, FONDO + 1.2, ANCHO * 2 + 2.6, 0], [-ANCHO - 1.2, 0, FONDO * 2 + 2.6, Math.PI / 2], [ANCHO + 1.2, 0, FONDO * 2 + 2.6, Math.PI / 2]];
  for (const [x, z, l, r] of L) for (const y of [0.45, 0.85]) tablas.push([x, y, z, l, r]);
  const mt = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 0.12, 0.08), mat('#d39a68'), tablas.length);
  tablas.forEach(([x, y, z, l, r], i) => { dummy.position.set(x, y, z); dummy.rotation.set(0, r, 0); dummy.scale.set(l, 1, 1); dummy.updateMatrix(); mt.setMatrixAt(i, dummy.matrix); });
  escena.add(mt);
}
// Obstáculos: árboles y arbustos (las ovejas los rodean)
const obstaculos = [];
{
  const sitios = [[-9, -4, 1.0, 'arbol'], [8, 3.5, 1.0, 'arbol'], [-2, 5, 0.9, 'arbusto'], [3, -5.5, 0.9, 'arbusto'], [-12, 5.5, 0.8, 'arbusto'], [12, -6, 0.8, 'arbusto'], [0, 0, 0.7, 'roca']];
  if (hayNaturaleza) {
    const g = {};
    const poner = (n, o) => (g[n] = g[n] || []).push(o);
    for (const [x, z, r, t] of sitios) {
      if (t === 'arbol') poner('Tree_Oak_medium_green', { x, z, alto: 4.6, giro: x });
      else if (t === 'arbusto') poner('Bush_Clumps_large', { x, z, s: (r * 1.7) / PACK.Bush_Clumps_large.radio, giro: z });
      else poner('Boulder_02', { x, z, y: -0.1, s: 1.1 / PACK.Boulder_02.radio, giro: 1 });
    }
    // Hierba y alguna seta por el prado (sin colisión)
    // Prado: hierba, flores, setas y piedrecitas; fuera de la valla, matorrales y tocones
    const libre = (x, z) => sitios.every(([ox, oz, r]) => Math.hypot(ox - x, oz - z) > r * 1.7 + 0.3);
    adornar(escena, azar, (r) => { const x = (r() * 2 - 1) * (ANCHO + 0.5), z = (r() * 2 - 1) * (FONDO + 0.5); return libre(x, z) ? { x, y: 0, z } : null; },
      [[HIERBAS, 230, 0.25, 0.45], [FLORES, 18, 0.35, 0.55], [SETITAS, 16, 0.2, 0.4], [ROCAS, 10, 0.2, 0.4]]);
    adornar(escena, azar, (r) => {
      const x = (r() * 2 - 1) * (ANCHO + 9), z = (r() * 2 - 1) * (FONDO + 7);
      return Math.abs(x) < ANCHO + 2 && Math.abs(z) < FONDO + 2 ? null : { x, y: -0.9, z };
    }, [[ARBUSTOS, 50, 0.8, 1.4], [HIERBAS, 120, 0.35, 0.6], [FLORES, 16, 0.4, 0.6], [['Tree_Stump'], 4, 0.5, 0.8], [SETITAS, 10, 0.3, 0.5]]);
    // Bosque alrededor del prado, solo detrás y a los lados (delante taparía la cámara)
    for (let k = 0, n = 0; k < 40 && n < 400; n++) {
      const x = (azar() * 2 - 1) * 45, z = -FONDO - 4 - azar() * 25 + (Math.abs(x) > ANCHO + 5 ? azar() * 22 : 0);
      if (Math.abs(x) < ANCHO + 4 && z > -FONDO - 3) continue;
      poner(unoDe(ARBOLES, azar()), { x, z, y: -0.9, alto: 4 + azar() * 2.5, giro: azar() * 6 }); k++;
    }
    for (const n in g) escena.add(plantar(n, g[n]));
  } else {
  const troncos = sitios.filter((s) => s[3] === 'arbol');
  const mtr = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.3, 0.42, 2.4, 8), mat('#9b6a43'), troncos.length);
  const mco = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), mat('#5cc56a', { flatShading: true }), troncos.length * 3);
  troncos.forEach(([x, z], i) => {
    dummy.position.set(x, 1.2, z); dummy.rotation.set(0, 0, 0); dummy.scale.set(1, 1, 1); dummy.updateMatrix(); mtr.setMatrixAt(i, dummy.matrix);
    for (let k = 0; k < 3; k++) { dummy.position.set(x + (k - 1) * 0.6, 3 + (k === 1 ? 0.7 : 0), z + (k === 1 ? -0.3 : 0.2)); dummy.scale.setScalar(k === 1 ? 1.5 : 1.2); dummy.rotation.set(k, k * 2, 0); dummy.updateMatrix(); mco.setMatrixAt(i * 3 + k, dummy.matrix); }
  });
  escena.add(mtr, mco);
  const arbustos = sitios.filter((s) => s[3] === 'arbusto');
  const mar = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), mat('#3fae5b', { flatShading: true }), arbustos.length * 3);
  arbustos.forEach(([x, z, r], i) => { for (let k = 0; k < 3; k++) { dummy.position.set(x + (k - 1) * r * 0.7, 0.5, z + (k % 2) * 0.3); dummy.scale.setScalar(r * (k === 1 ? 1 : 0.8)); dummy.rotation.set(k, k, 0); dummy.updateMatrix(); mar.setMatrixAt(i * 3 + k, dummy.matrix); } });
  escena.add(mar);
  const roca = new THREE.Mesh(new THREE.DodecahedronGeometry(0.9, 0), mat('#b3abcf', { flatShading: true }));
  roca.position.set(0, 0.3, 0); roca.scale.set(1.2, 0.7, 1);
  escena.add(roca);
  }
  for (const [x, z, r, t] of sitios) obstaculos.push({ x, z, r: t === 'arbusto' ? r * 1.7 : t === 'arbol' ? 0.6 : 1.0 });
}
// Flores
{
  const n = 80, m = new THREE.InstancedMesh(new THREE.SphereGeometry(0.1, 6, 4), mat('#ffffff'), n);
  const C = ['#ff6fb1', '#ffffff', '#ffd23f', '#b48cff'];
  for (let i = 0; i < n; i++) { dummy.position.set((azar() * 2 - 1) * ANCHO, 0.05, (azar() * 2 - 1) * FONDO); dummy.scale.set(1, 0.5, 1); dummy.rotation.set(0, 0, 0); dummy.updateMatrix(); m.setMatrixAt(i, dummy.matrix); m.setColorAt(i, new THREE.Color(C[i % 4])); }
  escena.add(m);
}

// ---------- El rebaño (todas las ovejas en unas pocas llamadas de dibujo) ----------
const N = N_OVEJAS + 4;   // hueco para hasta 4 jugadores
function piezas(geo, material, porOveja) {
  const m = new THREE.InstancedMesh(geo, material, N * porOveja);
  m.frustumCulled = false;
  m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  escena.add(m);
  return m;
}
const geoLana = new THREE.IcosahedronGeometry(0.5, 1);
/** Con los modelos nuevos las piezas de bolas no se dibujan (pero el código de siempre puede seguir escribiéndolas). */
function piezasVacias(geo, material, porOveja) { const m = new THREE.InstancedMesh(geo, material, N * porOveja); m.visible = false; return m; }
const mLana = (conModelos ? piezasVacias : piezas)(geoLana, mat('#fffaf0', { flatShading: true }), 1);
const mLana2 = (conModelos ? piezasVacias : piezas)(geoLana, mat('#f6efe2', { flatShading: true }), 2);
const mCabeza = (conModelos ? piezasVacias : piezas)(new THREE.SphereGeometry(0.24, 12, 10), mat('#3b2f3f'), 1);
const mOreja = (conModelos ? piezasVacias : piezas)(new THREE.SphereGeometry(0.1, 8, 6), mat('#3b2f3f'), 2);
const mOjo = (conModelos ? piezasVacias : piezas)(new THREE.SphereGeometry(0.07, 8, 6), new THREE.MeshBasicMaterial({ color: '#ffffff' }), 2);
const mPupila = (conModelos ? piezasVacias : piezas)(new THREE.SphereGeometry(0.04, 6, 4), new THREE.MeshBasicMaterial({ color: '#1d1626' }), 2);
const geoPata = new THREE.CylinderGeometry(0.07, 0.065, 0.45, 6); geoPata.translate(0, -0.225, 0);
const mPata = (conModelos ? piezasVacias : piezas)(geoPata, mat('#3b2f3f'), 4);
const mSombra = piezas(new THREE.CircleGeometry(0.55, 16), new THREE.MeshBasicMaterial({ color: '#2a4a1a', transparent: true, opacity: 0.22, depthWrite: false }), 1);
mSombra.renderOrder = 1;

const M = new THREE.Matrix4(), L = new THREE.Matrix4(), Q = new THREE.Quaternion(), V = new THREE.Vector3(), S = new THREE.Vector3(), E = new THREE.Euler();
function local(x, y, z, sx, sy, sz, rx = 0, ry = 0, rz = 0) {
  return L.compose(V.set(x, y, z), Q.setFromEuler(E.set(rx, ry, rz)), S.set(sx, sy, sz));
}
function poner(m, k, base, loc) { M.multiplyMatrices(base, loc); m.setMatrixAt(k, M); }

class Oveja {
  constructor(k) {
    this.k = k;
    this.x = 0; this.z = 0; this.vx = 0; this.vz = 0; this.ang = azar() * 6.28;
    this.paso = azar() * 6; this.pasta = 0; this.salto = 0;
    this.jugador = null;            // si la lleva un jugador
    this.oculta = false;
    this.ia = { estado: 'parada', t: azar() * 3, tx: 0, tz: 0, trote: false };
    this.aturdido = 0; this.delatado = 0; this.inmune = 0;
    // Con los modelos nuevos, cada oveja es la oveja de verdad (la misma para el rebaño y para los jugadores)
    if (conModelos) { this.pj = crearPersonaje(THREE, { animal: 'oveja' }); this.pj.g.scale.multiplyScalar(0.88); this.pj.g.visible = false; escena.add(this.pj.g); }
  }
  colocarAlAzar() {
    for (let n = 0; n < 50; n++) {
      const x = (azar() * 2 - 1) * (ANCHO - 1), z = (azar() * 2 - 1) * (FONDO - 1);
      if (obstaculos.some((o) => Math.hypot(o.x - x, o.z - z) < o.r + 0.8)) continue;
      if (ovejas.some((o) => o !== this && Math.hypot(o.x - x, o.z - z) < 1)) continue;
      this.x = x; this.z = z; break;
    }
    this.vx = this.vz = 0; this.ang = azar() * 6.28;
  }
  /** Lo que hace una oveja normal: pasear, pararse, pastar, a veces trotar o dar un topetazo al aire. */
  pensar(dt) {
    const ia = this.ia;
    // Las ovejas del rebaño también brincan a veces: así brincar no te delata
    if (this.pj && azar() < dt * 0.015) especial(this.pj);
    ia.t -= dt;
    if (ia.t <= 0) {
      const r = azar();
      if (r < 0.45) { ia.estado = 'anda'; ia.trote = azar() < 0.12; ia.t = 1.5 + azar() * 3.5; const a = azar() * 6.28, d = 2 + azar() * 6; ia.tx = clamp(this.x + Math.cos(a) * d, -ANCHO + 1, ANCHO - 1); ia.tz = clamp(this.z + Math.sin(a) * d, -FONDO + 1, FONDO - 1); }
      else if (r < 0.75) { ia.estado = 'pasta'; ia.t = 1.5 + azar() * 3; }
      else { ia.estado = 'parada'; ia.t = 0.8 + azar() * 2.5; }
      if (azar() < 0.06) this.salto = 1;   // topetazo al aire, como cuando marca un jugador
    }
    let mx = 0, mz = 0, vel = 0;
    if (ia.estado === 'anda') {
      const dx = ia.tx - this.x, dz = ia.tz - this.z, d = Math.hypot(dx, dz);
      if (d < 0.3) { ia.estado = 'parada'; ia.t = 0.5 + azar() * 2; }
      else { mx = dx / d; mz = dz / d; vel = ia.trote ? TROTE : PASO; }
    }
    return { mx, mz, vel, pasta: ia.estado === 'pasta' };
  }
  mover(dt, mx, mz, vel, pasta) {
    if (this.aturdido > 0) { mx = mz = 0; vel = 0; }
    const k = Math.min(1, dt * 8);
    this.vx += (mx * vel - this.vx) * k;
    this.vz += (mz * vel - this.vz) * k;
    this.x += this.vx * dt; this.z += this.vz * dt;
    for (const o of obstaculos) {
      const dx = this.x - o.x, dz = this.z - o.z, d = Math.hypot(dx, dz), min = o.r + 0.45;
      if (d < min && d > 1e-4) { this.x = o.x + (dx / d) * min; this.z = o.z + (dz / d) * min; if (!this.jugador) this.ia.t = 0; }
    }
    if (Math.abs(this.x) > ANCHO - 0.5 || Math.abs(this.z) > FONDO - 0.5) { if (!this.jugador) this.ia.t = 0; }
    this.x = clamp(this.x, -ANCHO + 0.5, ANCHO - 0.5);
    this.z = clamp(this.z, -FONDO + 0.5, FONDO - 0.5);
    const rapidez = Math.hypot(this.vx, this.vz);
    if (rapidez > 0.3) {
      let d = Math.atan2(this.vx, this.vz) - this.ang;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      this.ang += d * Math.min(1, dt * 9);
      this.paso += dt * (4 + rapidez * 3);
    } else this.paso *= Math.exp(-dt * 8);
    this.pasta += ((pasta && rapidez < 0.3 ? 1 : 0) - this.pasta) * Math.min(1, dt * 4);
    this.salto = Math.max(0, this.salto - dt * 3.5);
    this.aturdido = Math.max(0, this.aturdido - dt);
    this.delatado = Math.max(0, this.delatado - dt);
    this.inmune = Math.max(0, this.inmune - dt);
  }
  pintar(t, dt) {
    const k = this.k;
    const s = Math.sin(this.salto * Math.PI);
    if (this.pj) {
      const g = this.pj.g;
      g.visible = true;
      g.position.set(this.x + Math.sin(this.ang) * s * 0.25, s * 0.25, this.z + Math.cos(this.ang) * s * 0.25);
      g.rotation.set(0, this.ang, this.aturdido > 0 ? Math.sin(t * 20) * 0.15 : 0);
      animarPersonaje(this.pj, { paso: this.paso, suelo: s < 0.05, aplasta: 0, mirar: this.pasta * 0.9 - s * 0.4, dt });
      poner(mSombra, k, new THREE.Matrix4().makeTranslation(this.x, 0, this.z), local(0, 0.02, 0, 1, 1, 1.25, -Math.PI / 2));
      return;
    }
    const bote = Math.abs(Math.sin(this.paso)) * 0.06 + s * 0.25;
    const base = new THREE.Matrix4().compose(V.set(this.x + Math.sin(this.ang) * s * 0.25, bote, this.z + Math.cos(this.ang) * s * 0.25), Q.setFromEuler(E.set(0, this.ang, this.aturdido > 0 ? Math.sin(t * 20) * 0.15 : 0)), S.set(1, 1, 1));
    poner(mLana, k, base, local(0, 0.72, 0, 1.15, 0.95, 1.35));
    poner(mLana2, k * 2, base, local(0.18, 0.95, -0.15, 0.55, 0.5, 0.6));
    poner(mLana2, k * 2 + 1, base, local(-0.15, 0.92, 0.2, 0.5, 0.45, 0.55));
    const bajar = this.pasta * 0.38, adel = 0.68 + this.pasta * 0.1;
    const cab = new THREE.Matrix4().multiplyMatrices(base, local(0, 0.9 - bajar, adel, 1, 1.05, 1.15, this.pasta * 0.6 + s * -0.4, Math.sin(t * 0.7 + k) * 0.15 * (1 - this.pasta), 0));
    poner(mCabeza, k, cab, local(0, 0, 0, 1, 1, 1));
    poner(mOreja, k * 2, cab, local(0.24, 0.06, -0.04, 1.4, 0.6, 0.8, 0, 0, -0.4));
    poner(mOreja, k * 2 + 1, cab, local(-0.24, 0.06, -0.04, 1.4, 0.6, 0.8, 0, 0, 0.4));
    poner(mOjo, k * 2, cab, local(0.1, 0.06, 0.19, 1, 1, 1));
    poner(mOjo, k * 2 + 1, cab, local(-0.1, 0.06, 0.19, 1, 1, 1));
    poner(mPupila, k * 2, cab, local(0.1, 0.06, 0.245, 1, 1, 1));
    poner(mPupila, k * 2 + 1, cab, local(-0.1, 0.06, 0.245, 1, 1, 1));
    const sw = Math.sin(this.paso) * 0.55;
    [[0.25, 0.4, sw], [-0.25, 0.4, -sw], [0.25, -0.38, -sw], [-0.25, -0.38, sw]].forEach(([x, z, r], i) => poner(mPata, k * 4 + i, base, local(x, 0.45, z, 1, 1, 1, r)));
    poner(mSombra, k, base, local(0, 0.02, 0, 1, 1, 1.25, -Math.PI / 2));
  }
}
const ovejas = [];
for (let k = 0; k < N; k++) ovejas.push(new Oveja(k));

// ---------- Jugadores ----------
const datosPartida = partida.leer();
let defs = [];
if (datosPartida && datosPartida.juego === 'escondidos' && Array.isArray(datosPartida.jugadores)) {
  defs = datosPartida.jugadores.map((j) => ({ perfil: perfilPorId(j.perfil), dispositivo: j.dispositivo })).filter((j) => j.perfil);
}
const POCOS = defs.length < 2;
const jugadores = defs.map((d, i) => ({ perfil: d.perfil, dispositivo: d.dispositivo, color: d.perfil.color || '#ff4d6d', i, marcas: 0, oveja: null, etiqueta: null, aro: null }));
const geoAro = new THREE.RingGeometry(0.75, 0.95, 32);
for (const j of jugadores) {
  j.aro = new THREE.Mesh(geoAro, new THREE.MeshBasicMaterial({ color: j.color, transparent: true, opacity: 0.9, depthWrite: false }));
  j.aro.rotation.x = -Math.PI / 2; j.aro.renderOrder = 2; j.aro.visible = false;
  escena.add(j.aro);
  const e = document.createElement('div');
  e.className = 'etiqueta'; e.textContent = j.perfil.nombre; e.style.setProperty('--c', j.color); e.style.display = 'none';
  $('flotantes').appendChild(e); j.etiqueta = e;
}

function entradaDe(j) {
  if (BOT) return entradaBot(j);
  const d = entradas.get(j.dispositivo);
  if (!d) return { lx: 0, ly: 0, marcar: false, trotar: false };
  return { lx: d.lx, ly: d.ly, marcar: d.pressed('A'), trotar: d.down('B') || d.down('X') };
}
// Piloto para pruebas: se mueve como una oveja y a veces marca a quien tenga delante
function entradaBot(j) {
  const o = j.oveja;
  if (!j.bot) j.bot = new Oveja(-1);
  const b = j.bot; b.x = o.x; b.z = o.z;
  const p = b.pensar(1 / 60);
  return { lx: p.mx * (p.vel ? 1 : 0), ly: p.mz * (p.vel ? 1 : 0), marcar: Math.random() < 0.01, trotar: p.vel > PASO };
}

/** La oveja que tiene delante (o null). */
function delanteDe(o) {
  let mejor = null, md = ALCANCE;
  const fx = Math.sin(o.ang), fz = Math.cos(o.ang);
  for (const p of ovejas) {
    if (p === o || p.oculta) continue;
    const dx = p.x - o.x, dz = p.z - o.z, d = Math.hypot(dx, dz);
    if (d > md || d < 1e-3) continue;
    if ((dx * fx + dz * fz) / d < 0.35) continue;   // tiene que estar delante
    mejor = p; md = d;
  }
  return mejor;
}

// ---------- Confeti ----------
const N_CONF = 160;
const confeti = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.2, 0.12), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }), N_CONF);
confeti.frustumCulled = false;
const piezasConf = Array.from({ length: N_CONF }, (_, i) => { confeti.setColorAt(i, new THREE.Color('#fff')); return { p: new THREE.Vector3(), v: new THREE.Vector3(), r: 0, vida: 0 }; });
escena.add(confeti);
let sigConf = 0;
function explosion(x, z, color, n = 40) {
  const c = new THREE.Color(color);
  for (let k = 0; k < n; k++) {
    const q = piezasConf[sigConf]; confeti.setColorAt(sigConf, k % 3 ? c : new THREE.Color('#ffffff')); sigConf = (sigConf + 1) % N_CONF;
    q.p.set(x, 1, z); q.v.set(Math.random() - 0.5, Math.random() + 0.6, Math.random() - 0.5).normalize().multiplyScalar(4 + Math.random() * 4); q.r = Math.random() * 6; q.vida = 1 + Math.random() * 0.5;
  }
  confeti.instanceColor.needsUpdate = true;
}
function actualizarConfeti(dt) {
  for (let i = 0; i < N_CONF; i++) {
    const q = piezasConf[i];
    if (q.vida > 0) { q.vida -= dt; q.v.y -= 9 * dt; q.p.addScaledVector(q.v, dt); q.r += dt * 9; dummy.position.copy(q.p); dummy.rotation.set(q.r, q.r * 0.6, 0); dummy.scale.setScalar(Math.min(1, q.vida * 2)); }
    else dummy.scale.setScalar(0);
    dummy.updateMatrix(); confeti.setMatrixAt(i, dummy.matrix);
  }
  confeti.instanceMatrix.needsUpdate = true;
}

// ---------- Partida ----------
let estado = 'intro', estadoAntesPausa = 'jugando', tAntesPausa = 0, tEstado = 0, tiempo = DURACION, ultimoSegundo = -1;
const tmp = new THREE.Vector3();
function mensaje(html, ms = 1200) {
  const m = $('mensaje'); m.innerHTML = html; m.classList.add('ver');
  clearTimeout(mensaje.t); if (ms) mensaje.t = setTimeout(() => m.classList.remove('ver'), ms);
}
function panel(html) { const p = $('panel'); if (html) { p.innerHTML = html; p.classList.add('ver'); } else p.classList.remove('ver'); }
function cambiar(e) { estado = e; tEstado = 0; }
function pintarMarcador() {
  $('marcador').innerHTML = jugadores.map((j) => `<span class="chip" style="--c:${j.color}"><i></i>${esc(j.perfil.nombre)} <b>${j.marcas}</b></span>`).join('');
}
function pintarTiempo() {
  const s = Math.max(0, Math.ceil(tiempo));
  $('tiempo').textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  $('tiempo').classList.toggle('prisa', s <= 15 && estado === 'jugando');
}
function flotante(txt, x, z, color) {
  tmp.set(x, 1.8, z).project(camara);
  const d = document.createElement('div');
  d.className = 'mas1 txt'; d.textContent = txt;
  if (color) d.style.setProperty('--morado', color);
  d.style.left = ((tmp.x + 1) / 2 * innerWidth) + 'px'; d.style.top = ((1 - tmp.y) / 2 * innerHeight) + 'px';
  $('flotantes').appendChild(d); setTimeout(() => d.remove(), 900);
}

function empezar() {
  panel(null);
  // Todas las ovejas (las de los jugadores también) se reparten al azar: nadie sabe cuál es la suya
  for (const o of ovejas) { o.jugador = null; o.oculta = false; o.aturdido = o.delatado = o.inmune = 0; }
  for (let k = N_OVEJAS + jugadores.length; k < N; k++) ovejas[k].oculta = true;
  const libres = ovejas.filter((o) => !o.oculta);
  for (const o of libres) o.colocarAlAzar();
  const huecos = [...libres].sort(() => azar() - 0.5);
  jugadores.forEach((j, i) => { j.marcas = 0; j.oveja = huecos[i]; huecos[i].jugador = j; });
  tiempo = DURACION; ultimoSegundo = -1;
  pintarMarcador(); pintarTiempo();
  cambiar('intro');
  mensaje('¿Cuál eres tú?<small>Muévete con disimulo para encontrarte</small>', 2600);
}

function marcar(j) {
  const o = j.oveja;
  o.salto = 1;
  const v = delanteDe(o);
  if (!v) return;
  if (v.jugador && v.jugador !== j) {
    if (v.inmune > 0) return;
    const victima = v.jugador;
    j.marcas++;
    especial(o.pj);
    suena('pisoton'); suena('fanfarria');
    vibrar(60, j.dispositivo); vibrar(400, victima.dispositivo);
    explosion(v.x, v.z, victima.color);
    flotante(`¡${victima.perfil.nombre}!`, v.x, v.z, victima.color);
    // La víctima pasa a otra oveja cualquiera del rebaño (y tiene que volver a encontrarse)
    const otra = ovejas.filter((p) => !p.oculta && !p.jugador && Math.hypot(p.x - v.x, p.z - v.z) > 5);
    const nueva = otra[Math.floor(azar() * otra.length)] || v;
    v.jugador = null; v.salto = 1;
    nueva.jugador = victima; nueva.inmune = T_INMUNE; nueva.ia.t = 0;
    victima.oveja = nueva;
    pintarMarcador();
  } else if (!v.jugador) {
    // ¡Era una oveja normal! Te quedas aturdido y se ve quién eres
    suena('no');
    vibrar(250, j.dispositivo);
    o.aturdido = T_ATURDIDO; o.delatado = T_DELATADO;
    v.salto = 0.6;
  }
}

function terminar() {
  cambiar('fin');
  suena('fanfarria');
  const max = Math.max(...jugadores.map((j) => j.marcas));
  const ganan = jugadores.filter((j) => j.marcas === max);
  const titulo = max === 0 ? '¡Nadie ha marcado!' : ganan.length === 1 ? `¡Gana ${esc(ganan[0].perfil.nombre)}!` : `¡Empate entre ${ganan.map((j) => esc(j.perfil.nombre)).join(' y ')}!`;
  const tabla = `<div class="tabla">${[...jugadores].sort((a, b) => b.marcas - a.marcas).map((j) => `<span class="chip grande" style="--c:${j.color}"><i></i>${esc(j.perfil.nombre)} <b>${j.marcas}</b>${ganan.length === 1 && j === ganan[0] && max > 0 ? ' 👑' : ''}</span>`).join('')}</div>`;
  if (FIESTA) resultadoFiesta('escondidos', jugadores.map((j) => ({ id: j.perfil.id, valor: j.marcas })));
  // Al acabar se ve quién era quién
  for (const j of jugadores) j.oveja.delatado = 99;
  setTimeout(() => {
    if (estado !== 'fin') return;
    panel(`<h2>${titulo}</h2>${tabla}` + (FIESTA ? OPCIONES_FIESTA : `<div class="opciones"><span data-tap="A"><span class="boton-a">A</span> Otra vez</span>`
      + `<span data-tap="Y"><span class="boton-a" style="background:#ffc531">Y</span> Jugadores</span><span data-tap="B"><span class="boton-a boton-b">B</span> Menú</span></div>`));
  }, 1500);
}

function pausar(si) {
  if (si) {
    estadoAntesPausa = estado; tAntesPausa = tEstado; cambiar('pausa');
    panel(`<h2>Pausa</h2><div class="opciones"><span data-tap="A"><span class="boton-a">A</span> Seguir</span><span data-tap="B"><span class="boton-a boton-b">B</span> ${FIESTA ? 'Volver al tablero' : 'Salir al menú'}</span></div>`);
  } else { panel(null); estado = estadoAntesPausa; tEstado = tAntesPausa; }
}
const irAJugadores = () => { location.href = new URL('../jugadores/index.html#escondidos', location.href).href; };
alPulsarAtras(() => { if (estado === 'pausa' || estado === 'fin' || estado === 'pocos') volverAlMenu(); else pausar(true); return true; });

// ---------- Bucle ----------
let antes = performance.now(), fpsN = 0, fpsT = 0, verFps = params.has('fps'), tJugado = 0;
function bucle(now) {
  const dt = Math.max(0, Math.min(0.05, (now - antes) / 1000));   // el primer fotograma puede llegar con tiempo negativo
  antes = now; tEstado += dt;
  pad.update(); entradas.update();
  if (estado !== 'fin' && estado !== 'pausa' && estado !== 'pocos') especialConY(jugadores.map((j) => ({ dispositivo: j.dispositivo, pj: j.oveja && j.oveja.pj })));
  if (pad.pressed('SELECT')) verFps = !verFps;

  if (estado === 'pocos') {
    if (pad.pressed('A') || pad.pressed('Y')) irAJugadores();
    else if (pad.pressed('B')) volverAlMenu();
  } else if (estado === 'pausa') {
    if (pad.pressed('A') || pad.pressed('START')) pausar(false);
    else if (pad.pressed('B')) volverAlMenu();
  } else if (estado === 'fin') {
    if (tEstado > 1.5) {
      if (FIESTA) { if (pad.pressed('A') || (BOT && tEstado > 4)) volverAlTablero(); }
      else if (pad.pressed('A') || (BOT && tEstado > 4)) empezar();
      else if (pad.pressed('Y')) irAJugadores();
      else if (pad.pressed('B')) volverAlMenu();
    }
  } else if (pad.pressed('START')) pausar(true);

  if (estado === 'intro' && tEstado > 2.6) { cambiar('jugando'); mensaje('¡Ya!', 600); }

  if (estado !== 'pausa') {
    const jugando = estado === 'jugando' || estado === 'intro';
    for (const o of ovejas) {
      if (o.oculta) continue;
      if (o.jugador && jugando) {
        const e = entradaDe(o.jugador);
        const m = Math.hypot(e.lx, e.ly);
        // Mismo andar que las demás ovejas: o paras o vas a su velocidad
        if (m > 0.35) o.mover(dt, e.lx / m, e.ly / m, e.trotar ? TROTE : PASO, false);
        else o.mover(dt, 0, 0, 0, false);
        if (estado === 'jugando' && e.marcar && o.aturdido <= 0) marcar(o.jugador);
      } else if (estado === 'fin') o.mover(dt, 0, 0, 0, true);
      else { const p = o.pensar(dt); o.mover(dt, p.mx, p.mz, p.vel, p.pasta); }
    }
    // Que no se pisen unas a otras
    for (let a = 0; a < ovejas.length; a++) for (let b = a + 1; b < ovejas.length; b++) {
      const p = ovejas[a], q = ovejas[b];
      if (p.oculta || q.oculta) continue;
      const dx = q.x - p.x, dz = q.z - p.z, d2 = dx * dx + dz * dz;
      if (d2 < 0.81 && d2 > 1e-6) { const d = Math.sqrt(d2), m = (0.9 - d) / 2 / d; p.x -= dx * m; p.z -= dz * m; q.x += dx * m; q.z += dz * m; }
    }
    if (estado === 'jugando') {
      tiempo -= dt; tJugado += dt;
      const s = Math.ceil(tiempo);
      if (s !== ultimoSegundo) { ultimoSegundo = s; pintarTiempo(); if (s <= 10 && s > 0) suena('tictac'); }
      if (tiempo <= 0) terminar();
    }
  }
  const t = now / 1000;
  for (const o of ovejas) { if (!o.oculta) o.pintar(t, dt); else if (o.pj) o.pj.g.visible = false; }
  for (let k = 0; k < N; k++) if (ovejas[k].oculta) {
    M.makeScale(0, 0, 0);
    mLana.setMatrixAt(k, M); mCabeza.setMatrixAt(k, M); mSombra.setMatrixAt(k, M);
    for (let i = 0; i < 2; i++) { mLana2.setMatrixAt(k * 2 + i, M); mOreja.setMatrixAt(k * 2 + i, M); mOjo.setMatrixAt(k * 2 + i, M); mPupila.setMatrixAt(k * 2 + i, M); }
    for (let i = 0; i < 4; i++) mPata.setMatrixAt(k * 4 + i, M);
  }
  for (const m of [mLana, mLana2, mCabeza, mOreja, mOjo, mPupila, mPata, mSombra]) m.instanceMatrix.needsUpdate = true;
  // Delatados: aro de su color y su nombre encima
  for (const j of jugadores) {
    const o = j.oveja;
    const ver = !!o && o.delatado > 0 && (o.delatado > 0.8 || Math.floor(o.delatado * 8) % 2 === 0);
    j.aro.visible = ver;
    j.etiqueta.style.display = ver ? 'block' : 'none';
    if (ver) {
      j.aro.position.set(o.x, 0.05, o.z);
      tmp.set(o.x, 2.1, o.z).project(camara);
      j.etiqueta.style.left = ((tmp.x + 1) / 2 * innerWidth) + 'px';
      j.etiqueta.style.top = ((1 - tmp.y) / 2 * innerHeight) + 'px';
    }
  }
  $('ayuda').style.opacity = tJugado < 12 && estado !== 'pocos' ? 1 : 0;
  actualizarConfeti(dt);
  renderer.render(escena, camara);

  fpsN++; fpsT += dt;
  if (fpsT >= 0.5) {
    const f = $('fps'); f.style.display = verFps ? 'block' : 'none';
    if (verFps) f.textContent = `${Math.round(fpsN / fpsT)} fps · ${renderer.domElement.width}×${renderer.domElement.height} · ${renderer.info.render.calls} dibujos`;
    fpsN = 0; fpsT = 0;
  }
  requestAnimationFrame(bucle);
}

window.__juego = {
  get estado() { return estado; }, get tiempo() { return +tiempo.toFixed(1); },
  get jugadores() { return jugadores.map((j) => ({ n: j.perfil.nombre, marcas: j.marcas, x: +j.oveja.x.toFixed(1), z: +j.oveja.z.toFixed(1), aturdido: j.oveja.aturdido > 0, delatado: j.oveja.delatado > 0 })); },
  /** Para pruebas: pone al jugador 0 justo detrás de `objetivo` ('jugador' o 'oveja') mirándolo, y marca. */
  probarMarca(objetivo) {
    const yo = jugadores[0].oveja;
    const v = objetivo === 'jugador' ? jugadores[1].oveja : ovejas.find((o) => !o.oculta && !o.jugador);
    v.inmune = 0; yo.aturdido = 0;
    yo.x = v.x - 0.95; yo.z = v.z; yo.ang = Math.PI / 2;
    marcar(jugadores[0]);
    return { marcas: jugadores[0].marcas, aturdido: yo.aturdido > 0, delatado: yo.delatado > 0, victimaMovida: objetivo === 'jugador' ? jugadores[1].oveja !== v : null };
  },
};

if (POCOS) {
  // Ovejas paseando de fondo y un aviso: hacen falta al menos dos
  for (let k = N_OVEJAS; k < N; k++) ovejas[k].oculta = true;
  for (const o of ovejas) if (!o.oculta) o.colocarAlAzar();
  cambiar('pocos');
  panel(`<h2>El rebaño secreto</h2><p>Se juega de 2 a 4 a la vez: cada uno es una oveja del rebaño. Acércate a otro jugador sin que se note y márcalo.</p>`
    + `<div class="opciones"><span data-tap="A"><span class="boton-a">A</span> Elegir jugadores</span><span data-tap="B"><span class="boton-a boton-b">B</span> Menú</span></div>`);
} else empezar();
vestir(THREE, escena, { lejos: 30 });
requestAnimationFrame(bucle);
