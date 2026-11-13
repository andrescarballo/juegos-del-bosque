// Globo arriba — uno o varios jugadores dan toques al globo con la cabeza para que no toque el suelo.
import { vestir, tenir, ESTACION, REGLA, racha } from '../comun/estaciones.js';
import * as THREE from '../lib/three.min.js';
import { pad, entradas } from '../comun/pad.js';
import { suena } from '../comun/sonido.js';
import { enTele, params, records, volverAlMenu, alPulsarAtras, escenario, vibrar } from '../comun/tv.js';
import { controlesTactiles, esTactil } from '../comun/tactil.js';
import { partida, perfilPorId, recordDe, ponerRecord, recordEquipo, ponerRecordEquipo } from '../comun/perfiles.js';
import { hayNaturaleza, adornar, plantar, unoDe, RECETA_PRADO, HIERBAS, FLORES, SETITAS, ARBUSTOS, ROCAS, ARBOLES, ABETOS } from '../comun/naturaleza.js';
import { especialConY, especial, poder } from '../comun/especial.js';
import { crearPersonaje, animarPersonaje } from '../comun/personajes.js';
import { FIESTA, resultadoFiesta, volverAlTablero, OPCIONES_FIESTA } from '../comun/fiesta.js';

const JUEGO = 'globo';
const BOT = params.has('bot');           // ?bot=1 juega solo (para pruebas)
const ISLA = 20.5;                       // radio por el que puede andar la oveja
const PARED_GLOBO = 15.5;                // el viento no se lleva el globo fuera de la isla
const REBOTE = 4.6;
const CAIDA_MAX = 2.2;
const ARCO = ['#ff5d73', '#ff9f43', '#ffd93d', '#6bd968', '#4cc3ff', '#7b7bff', '#c17bff'];
const COLORES_GLOBO = ['#ff3d64', '#ffc21a', '#2fb4ff'];

escenario(document.getElementById('esc'));
const $ = (id) => document.getElementById(id);
controlesTactiles({ camara: true, botones: [{ b: 'A', txt: 'A', color: '#3dbb4c' }], pausa: true });
if (esTactil) $('ayuda').innerHTML = '<span>Dedo a la izquierda: mover · <span class="boton-a">A</span> saltar · Dedo a la derecha: cámara</span>';

// Aleatorio con semilla: la isla siempre igual
function rng(seed) { return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const azar = rng(7);

// ---------- Render ----------
const renderer = new THREE.WebGLRenderer({ canvas: $('lienzo'), antialias: !enTele, powerPreference: 'high-performance' });
const escena = new THREE.Scene();
const camara = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.1, 600);
function ajustar() {
  // En la tele renderizamos a ~720p: la gráfica del Chromecast es justita.
  const objetivo = parseInt(params.get('ancho') || (enTele ? '1280' : esTactil ? '1600' : '1920'), 10);
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, objetivo / innerWidth));
  renderer.setSize(innerWidth, innerHeight, false);
  camara.aspect = innerWidth / innerHeight;
  camara.fov = camara.aspect < 1 ? 85 : 60; // en vertical, más ángulo para ver algo a los lados
  camara.updateProjectionMatrix();
}
addEventListener('resize', ajustar);
ajustar();

escena.fog = new THREE.Fog('#ffd9f0', 80, 260);
escena.add(new THREE.HemisphereLight('#dff3ff', '#a6dd84', 1.9));
const sol = new THREE.DirectionalLight('#fff0dc', 2.2);
sol.position.set(-30, 60, 25);
escena.add(sol);

const mats = new Map();
function mat(color, opts = {}) {
  const k = color + JSON.stringify(opts);
  if (!mats.has(k)) mats.set(k, new THREE.MeshLambertMaterial({ color, ...opts }));
  return mats.get(k);
}

// Cielo degradado
const cielo = new THREE.Mesh(
  new THREE.SphereGeometry(500, 24, 12),
  new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { arriba: { value: new THREE.Color('#58b8ff') }, horizonte: { value: new THREE.Color('#ffd9f0') }, abajo: { value: new THREE.Color('#8fdcff') } },
    vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform vec3 arriba; uniform vec3 horizonte; uniform vec3 abajo; varying vec3 vP;
      void main(){ float h = vP.y; vec3 c = h > 0.0 ? mix(horizonte, arriba, pow(h, 0.55)) : mix(horizonte, abajo, pow(-h, 0.4));
      gl_FragColor = vec4(c, 1.0);
      #include <colorspace_fragment>
      }`,
  }),
);
cielo.renderOrder = -1;
escena.add(cielo);

function DENSIDAD_BOSQUE() { return /JuegosTV\//.test(navigator.userAgent) || window.NativePad ? 0.75 : 1; }
// ---------- Un claro en medio del bosque (antes era una isla en mitad del agua) ----------
const isla = new THREE.Mesh(new THREE.CylinderGeometry(22, 22, 2, 56), mat('#7fd65a'));
isla.position.y = -1;
escena.add(isla);
const prado = new THREE.Mesh(new THREE.PlaneGeometry(1000, 1000), mat('#6cc74e'));
prado.rotation.x = -Math.PI / 2;
prado.position.y = -0.04;
escena.add(prado);
if (hayNaturaleza) {
  // El bosque de alrededor: un anillo espeso de árboles del pack, más altos cuanto más lejos, y matorral al borde
  const r0 = rng(77), anillo = {};
  for (let k = 0; k < 150 * DENSIDAD_BOSQUE(); k++) {
    const a = r0() * Math.PI * 2, d = 24 + Math.pow(r0(), 0.8) * 34, n = unoDe(r0() < 0.4 ? ABETOS : ARBOLES, r0());
    (anillo[n] = anillo[n] || []).push({ x: Math.cos(a) * d, z: Math.sin(a) * d, alto: 5 + r0() * 3.5 + (d - 24) * 0.12, giro: r0() * 6.3 });
  }
  for (const n in anillo) escena.add(plantar(n, anillo[n]));
  adornar(escena, r0, (r) => { const a = r() * Math.PI * 2, d = 21.5 + r() * 9; return { x: Math.cos(a) * d, y: 0, z: Math.sin(a) * d }; },
    [[ARBUSTOS, 70, 0.9, 1.8], [HIERBAS, 160, 0.35, 0.7], [ROCAS, 16, 0.3, 0.8], [FLORES, 20, 0.4, 0.7]]);
}

// Arcoíris de fondo
ARCO.forEach((c, i) => {
  const arco = new THREE.Mesh(new THREE.TorusGeometry(36 - i * 1.15, 0.6, 6, 72, Math.PI), new THREE.MeshBasicMaterial({ color: c, fog: false }));
  arco.position.set(0, -2, -70);
  escena.add(arco);
});

// Árboles (troncos y copas en InstancedMesh: pocas llamadas de dibujo para el Chromecast)
const colisiones = [];
const arboles = [];
while (arboles.length < 18) {
  const a = azar() * Math.PI * 2, r = 10 + azar() * 9.5;
  const x = Math.cos(a) * r, z = Math.sin(a) * r;
  if (Math.hypot(x, z - 5) < 6) continue;
  if (arboles.some((t) => Math.hypot(t.x - x, t.z - z) < 4)) continue;
  arboles.push({ x, z, h: 1.7 + azar() * 0.8, s: 1.1 + azar() * 0.5 });
}
const COPAS = ['#ff9ad5', '#8ef0c4', '#c9a7ff', '#ffc18a', '#9fe2ff', '#fff38a'];
const dummy = new THREE.Object3D();
const troncos = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.2, 0.32, 1, 7), mat('#a8704e'), arboles.length);
const copas = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), mat('#ffffff', { flatShading: true }), arboles.length * 2);
arboles.forEach((t, i) => {
  dummy.position.set(t.x, t.h / 2, t.z); dummy.scale.set(1, t.h, 1); dummy.rotation.set(0, 0, 0); dummy.updateMatrix();
  troncos.setMatrixAt(i, dummy.matrix);
  const col = new THREE.Color(COPAS[i % COPAS.length]);
  for (let k = 0; k < 2; k++) {
    dummy.position.set(t.x + (k ? 0.5 : -0.3), t.h + 0.6 + k * 0.7, t.z + (k ? -0.3 : 0.2));
    dummy.scale.setScalar(t.s * (k ? 0.8 : 1.15)); dummy.rotation.set(azar(), azar(), azar()); dummy.updateMatrix();
    copas.setMatrixAt(i * 2 + k, dummy.matrix);
    copas.setColorAt(i * 2 + k, k ? col.clone().offsetHSL(0, 0, 0.06) : col);
  }
  colisiones.push({ x: t.x, z: t.z, r: 0.45 });
});
escena.add(troncos, copas);

// Rocas
const nRocas = 9;
const rocas = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(0.7, 0), mat('#b3abcf', { flatShading: true }), nRocas);
for (let i = 0; i < nRocas; i++) {
  const a = azar() * Math.PI * 2, r = 7 + azar() * 12, s = 0.5 + azar() * 0.6;
  const x = Math.cos(a) * r, z = Math.sin(a) * r;
  dummy.position.set(x, s * 0.25, z); dummy.scale.set(s * 1.3, s * 0.8, s); dummy.rotation.set(0, azar() * 3, 0); dummy.updateMatrix();
  rocas.setMatrixAt(i, dummy.matrix);
  colisiones.push({ x, z, r: s * 0.8 });
}
escena.add(rocas);

// Plantitas por todo el claro (más en el borde, donde no se juega tanto)
if (hayNaturaleza) adornar(escena, azar, (r) => {
  const a = r() * Math.PI * 2, d = Math.sqrt(r()) * 20.8, x = Math.cos(a) * d, z = Math.sin(a) * d;
  if (d < 9 && r() < 0.75) return null;
  return colisiones.some((c) => Math.hypot(c.x - x, c.z - z) < 1.3) ? null : { x, y: 0, z };
}, [[HIERBAS, 240, 0.3, 0.55], [FLORES, 30, 0.4, 0.7], [ARBUSTOS, 26, 0.7, 1.2], [SETITAS, 20, 0.25, 0.45], [ROCAS, 14, 0.25, 0.5]]);
// Flores
const nFlores = 90;
const flores = new THREE.InstancedMesh(new THREE.SphereGeometry(0.14, 6, 4), mat('#ffffff'), nFlores);
const FLOR = ['#ff6fb1', '#ffffff', '#ffd23f', '#b48cff', '#ff8a5c'];
for (let i = 0; i < nFlores; i++) {
  const a = azar() * Math.PI * 2, r = 2 + azar() * 19;
  dummy.position.set(Math.cos(a) * r, 0.1, Math.sin(a) * r); dummy.scale.set(1, 0.6, 1); dummy.rotation.set(0, 0, 0); dummy.updateMatrix();
  flores.setMatrixAt(i, dummy.matrix);
  flores.setColorAt(i, new THREE.Color(FLOR[i % FLOR.length]));
}
escena.add(flores);

// Nubes
const nubes = new THREE.Group();
const nNubes = 12, porNube = 5;
const bolas = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 12, 8), new THREE.MeshLambertMaterial({ color: '#ffffff', emissive: '#ffffff', emissiveIntensity: 0.45 }), nNubes * porNube);
for (let n = 0; n < nNubes; n++) {
  const a = (n / nNubes) * Math.PI * 2 + azar() * 0.4, r = 55 + azar() * 40, y = 18 + azar() * 16;
  for (let k = 0; k < porNube; k++) {
    const s = 2.2 + azar() * 2.5;
    dummy.position.set(Math.cos(a) * r + (k - 2) * 2.6, y + azar() * 1.5, Math.sin(a) * r + azar() * 2);
    dummy.scale.set(s * 1.2, s * 0.8, s); dummy.rotation.set(0, 0, 0); dummy.updateMatrix();
    bolas.setMatrixAt(n * porNube + k, dummy.matrix);
  }
}
nubes.add(bolas);
escena.add(nubes);

// Sombra redonda (ayuda muchísimo a calcular dónde va a caer)
const geoSombra = new THREE.CircleGeometry(1, 24);
function sombra(radio, opacidad = 0.28) {
  const m = new THREE.Mesh(geoSombra, new THREE.MeshBasicMaterial({ color: '#3a2050', transparent: true, opacity: opacidad, depthWrite: false }));
  m.rotation.x = -Math.PI / 2;
  m.scale.setScalar(radio);
  m.renderOrder = 1;
  escena.add(m);
  return m;
}

// ---------- Globos ----------
const geoGlobo = new THREE.SphereGeometry(0.6, 22, 16);
const geoNudo = new THREE.ConeGeometry(0.09, 0.15, 8);
const geoCuerda = new THREE.CylinderGeometry(0.012, 0.012, 1.1, 4);
geoCuerda.translate(0, -0.55, 0);
const geoAro = new THREE.RingGeometry(0.66, 0.84, 32);
const geoGuia = new THREE.CylinderGeometry(0.035, 0.035, 1, 6);
geoGuia.translate(0, 0.5, 0);

class Globo {
  constructor(color, pos) {
    this.color = color;
    this.g = new THREE.Group();
    const m = new THREE.MeshPhongMaterial({ color, shininess: 80, specular: '#777777', emissive: color, emissiveIntensity: 0.18 });
    this.cuerpo = new THREE.Mesh(geoGlobo, m);
    this.cuerpo.scale.y = 1.15;
    this.g.add(this.cuerpo);
    const nudo = new THREE.Mesh(geoNudo, m);
    nudo.position.y = -0.74;
    this.g.add(nudo);
    this.cuerda = new THREE.Mesh(geoCuerda, new THREE.MeshBasicMaterial({ color: '#ffffff' }));
    this.cuerda.position.y = -0.8;
    this.g.add(this.cuerda);
    escena.add(this.g);
    this.sombra = sombra(0.62, 0.3);
    this.aro = new THREE.Mesh(geoAro, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85, depthWrite: false }));
    this.aro.rotation.x = -Math.PI / 2;
    this.aro.renderOrder = 2;
    escena.add(this.aro);
    // Línea discreta del globo al suelo: así se ve claro dónde va a caer
    this.guia = new THREE.Mesh(geoGuia, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.28, depthWrite: false }));
    escena.add(this.guia);
    this.vel = new THREE.Vector3();
    this.cd = 0;
    this.t = Math.random() * 10;
    this.estira = 0;
    this.colocar(pos);
  }
  colocar(pos) { this.g.position.copy(pos); this.vel.set(0, 0, 0); this.cd = 0; this.actualizarSombra(); }
  get pos() { return this.g.position; }
  paso(dt, gravedad) {
    this.t += dt;
    this.cd = Math.max(0, this.cd - dt);
    const v = this.vel, p = this.g.position;
    v.y = Math.max(v.y - gravedad * dt, -CAIDA_MAX);
    const w = racha();   // en otoño, el viento se lleva el globo
    v.x += (Math.sin(this.t * 0.7) * 0.35 + w.x * 0.6) * dt;
    v.z += (Math.cos(this.t * 0.53) * 0.35 + w.z * 0.6) * dt;
    const freno = Math.exp(-0.8 * dt);
    v.x *= freno; v.z *= freno;
    const r = Math.hypot(p.x, p.z);
    if (r > PARED_GLOBO) { v.x -= (p.x / r) * 6 * dt; v.z -= (p.z / r) * 6 * dt; }
    p.addScaledVector(v, dt);
    this.animar(dt);
  }
  animar(dt) {
    this.estira = Math.max(0, this.estira - dt * 4);
    const e = Math.sin(this.estira * Math.PI) * 0.18;
    this.cuerpo.scale.set(1 + e, 1.15 - e, 1 + e);
    this.g.rotation.z = Math.sin(this.t * 1.3) * 0.12 - this.vel.x * 0.05;
    this.g.rotation.x = Math.cos(this.t * 1.1) * 0.1 + this.vel.z * 0.05;
    this.actualizarSombra();
  }
  actualizarSombra() {
    const p = this.g.position;
    const h = THREE.MathUtils.clamp((p.y - 0.7) / 6, 0, 1);
    this.sombra.position.set(p.x, 0.03, p.z);
    this.sombra.scale.setScalar(THREE.MathUtils.lerp(0.75, 0.45, h));
    this.sombra.material.opacity = THREE.MathUtils.lerp(0.4, 0.18, h);
    this.aro.position.set(p.x, 0.04, p.z);
    this.guia.position.set(p.x, 0.04, p.z);
    this.guia.scale.y = Math.max(0.01, p.y - 1.9);
  }
  quitar() { escena.remove(this.g, this.sombra, this.aro, this.guia); }
}

// ---------- Confeti (una sola llamada de dibujo) ----------
const N_CONF = 180;
const confeti = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.18, 0.11), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }), N_CONF);
const piezas = Array.from({ length: N_CONF }, (_, i) => {
  confeti.setColorAt(i, new THREE.Color(ARCO[i % ARCO.length]));
  return { p: new THREE.Vector3(), v: new THREE.Vector3(), r: new THREE.Euler(), w: new THREE.Vector3(), vida: 0 };
});
confeti.frustumCulled = false;
escena.add(confeti);
let siguientePieza = 0;
function explosion(pos, n = 26, fuerza = 1) {
  for (let k = 0; k < n; k++) {
    const q = piezas[siguientePieza]; siguientePieza = (siguientePieza + 1) % N_CONF;
    q.p.copy(pos);
    q.v.set(Math.random() - 0.5, Math.random() * 0.8 + 0.4, Math.random() - 0.5).normalize().multiplyScalar((3 + Math.random() * 4) * fuerza);
    q.w.set(Math.random() * 10, Math.random() * 10, Math.random() * 10);
    q.vida = 1 + Math.random() * 0.6;
  }
}
function actualizarConfeti(dt) {
  for (let i = 0; i < N_CONF; i++) {
    const q = piezas[i];
    if (q.vida > 0) {
      q.vida -= dt;
      q.v.y -= 6 * dt; q.v.multiplyScalar(Math.exp(-1.2 * dt));
      q.p.addScaledVector(q.v, dt);
      q.r.x += q.w.x * dt; q.r.y += q.w.y * dt; q.r.z += q.w.z * dt;
      dummy.position.copy(q.p); dummy.rotation.copy(q.r); dummy.scale.setScalar(Math.min(1, q.vida * 2));
    } else {
      dummy.scale.setScalar(0);
    }
    dummy.updateMatrix();
    confeti.setMatrixAt(i, dummy.matrix);
  }
  confeti.instanceMatrix.needsUpdate = true;
}

// ---------- Jugadores ----------
// Vienen de "¿Quién juega?" (sessionStorage). Si se entra directo, juega uno con cualquier mando.
const datosPartida = partida.leer();
let defs = [];
if (datosPartida && datosPartida.juego === JUEGO && Array.isArray(datosPartida.jugadores)) {
  defs = datosPartida.jugadores.map((j) => ({ perfil: perfilPorId(j.perfil), dispositivo: j.dispositivo })).filter((j) => j.perfil);
}
const LIBRE = defs.length === 0;
if (LIBRE) defs = [{ perfil: { id: null, nombre: '', animal: 'oveja', pelo: 'natural', accesorio: 'nada', color: '#ff4d6d' }, dispositivo: null }];
const VARIOS = defs.length > 1;
const VEL = 7;
const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const cam = { yaw: 0, el: VARIOS ? 0.44 : 0.36, dist: 10.5, mira: new THREE.Vector3(0, 1.8, 5) };
const tmp = new THREE.Vector3();

class Jugador {
  constructor(def, i) {
    this.perfil = def.perfil;
    this.dispositivo = def.dispositivo;
    this.i = i;
    this.color = def.perfil.color || '#ff4d6d';
    this.pj = crearPersonaje(THREE, def.perfil);
    escena.add(this.pj.g);
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.suelo = true; this.angulo = Math.PI; this.paso = 0; this.aplasta = 0; this.toques = 0;
    this.sombra = sombra(0.62 * this.pj.escala);
    this.cabeza = new THREE.Vector3();
    this.etiqueta = null;
    if (VARIOS) {
      const e = document.createElement('div');
      e.className = 'etiqueta';
      e.textContent = def.perfil.nombre;
      e.style.setProperty('--c', this.color);
      $('flotantes').appendChild(e);
      this.etiqueta = e;
    }
  }

  colocar(n) {
    this.pos.set((this.i - (n - 1) / 2) * 2.4, 0, 5);
    this.vel.set(0, 0, 0);
    this.angulo = Math.PI; this.toques = 0; this.paso = 0;
  }

  entrada() {
    if (BOT) return entradaBot(this);
    if (!this.dispositivo) return [pad.lx, pad.ly, pad.pressed('A')];
    const d = entradas.get(this.dispositivo);
    return d ? [d.lx, d.ly, d.pressed('A')] : [0, 0, false];
  }

  actualizar(dt, lx, ly, saltar) {
    const cy = Math.cos(cam.yaw), sy = Math.sin(cam.yaw);
    const dx = lx * cy + ly * sy, dz = -lx * sy + ly * cy;
    const k = Math.min(1, dt * 10 * REGLA.agarre);   // invierno: resbala
    const pw = this.pw = poder(this.pj);   // el especial del animal
    const w = racha();                     // otoño: rachas de viento
    this.vel.x += (dx * VEL * pw.vel + w.x - this.vel.x) * k;
    this.vel.z += (dz * VEL * pw.vel + w.z - this.vel.z) * k;
    if (this.suelo && saltar) { this.vel.y = 9 * REGLA.salto; this.suelo = false; suena('salto'); }
    if (pw.salto) { this.vel.y = 9 * pw.salto; this.suelo = false; if (pw.avance) { this.vel.x += Math.sin(this.angulo) * 5 * pw.avance; this.vel.z += Math.cos(this.angulo) * 5 * pw.avance; } }
    if (pw.rugido && estado === 'jugando') for (const g of globos) if (g.cd <= 0 && Math.hypot(g.pos.x - this.pos.x - Math.sin(this.angulo) * pw.lejos, g.pos.z - this.pos.z - Math.cos(this.angulo) * pw.lejos) < pw.rugido && g.pos.y < 6) {
      g.vel.y = REBOTE; g.cd = 0.45; g.estira = 1; toque(g, this);   // ¡el rugido cuenta como toque!
    }
    this.vel.y -= 24 * dt * (this.vel.y < 0 ? pw.grav : 1);
    this.pos.addScaledVector(this.vel, dt);
    if (this.pos.y <= 0) {
      if (!this.suelo) { this.aplasta = 1; if (this.vel.y < -4) suena('aterriza'); }
      this.pos.y = 0; this.vel.y = 0; this.suelo = true;
    }
    for (const c of colisiones) {
      const ex = this.pos.x - c.x, ez = this.pos.z - c.z, d = Math.hypot(ex, ez), min = c.r + 0.45;
      if (d < min && d > 1e-4) { this.pos.x = c.x + (ex / d) * min; this.pos.z = c.z + (ez / d) * min; }
    }
    const r = Math.hypot(this.pos.x, this.pos.z);
    if (r > ISLA) { this.pos.x *= ISLA / r; this.pos.z *= ISLA / r; }

    const rapidez = Math.hypot(this.vel.x, this.vel.z);
    if (rapidez > 0.3) {
      let d = Math.atan2(this.vel.x, this.vel.z) - this.angulo;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      this.angulo += d * Math.min(1, dt * 12);
    }
    if (this.suelo && rapidez > 0.6) this.paso += dt * 15; else this.paso *= Math.exp(-dt * 10);
    this.aplasta = Math.max(0, this.aplasta - dt * 5);
    let mirar = null;
    const g = globoMasBajo();
    if (g) {
      const alto = g.pos.y - (this.pos.y + 1);
      const lejos = Math.hypot(g.pos.x - this.pos.x, g.pos.z - this.pos.z) + 0.5;
      mirar = -THREE.MathUtils.clamp(Math.atan2(alto, lejos), -0.3, 0.9);
    }
    this.pj.g.position.copy(this.pos);
    this.pj.g.rotation.y = this.angulo;
    animarPersonaje(this.pj, { paso: this.paso, suelo: this.suelo, aplasta: this.aplasta, mirar, dt });
    this.sombra.position.set(this.pos.x, 0.02, this.pos.z);
    this.sombra.scale.setScalar((0.62 * this.pj.escala) / (1 + this.pos.y * 0.25));
    // El "cabezazo" se mide igual para todos, sea cual sea el tamaño del personaje
    this.cabeza.set(this.pos.x + Math.sin(this.angulo) * 0.35, this.pos.y + 1.05, this.pos.z + Math.cos(this.angulo) * 0.35);
  }

  pintarEtiqueta() {
    if (!this.etiqueta) return;
    tmp.set(this.pos.x, this.pos.y + 1.55 * this.pj.escala + 0.35, this.pos.z).project(camara);
    const visible = tmp.z < 1;
    this.etiqueta.style.display = visible ? 'block' : 'none';
    if (!visible) return;
    this.etiqueta.style.left = ((tmp.x + 1) / 2 * innerWidth) + 'px';
    this.etiqueta.style.top = ((1 - tmp.y) / 2 * innerHeight) + 'px';
  }
}

const jugadores = defs.map((d, i) => new Jugador(d, i));

function separarJugadores() {
  for (let a = 0; a < jugadores.length; a++) {
    for (let b = a + 1; b < jugadores.length; b++) {
      const p = jugadores[a].pos, q = jugadores[b].pos;
      const dx = q.x - p.x, dz = q.z - p.z, d = Math.hypot(dx, dz), min = 0.95;
      if (d < min && d > 1e-4) {
        const m = (min - d) / 2 / d;
        p.x -= dx * m; p.z -= dz * m; q.x += dx * m; q.z += dz * m;
      }
    }
  }
}

// ---------- Cámara ----------
function actualizarCamara(dt, girar) {
  if (VARIOS) {
    // Una sola cámara que encuadra a todos
    let cx = 0, cz = 0;
    for (const j of jugadores) { cx += j.pos.x; cz += j.pos.z; }
    cx /= jugadores.length; cz /= jugadores.length;
    let lejos = 0;
    for (const j of jugadores) lejos = Math.max(lejos, Math.hypot(j.pos.x - cx, j.pos.z - cz));
    const dist = THREE.MathUtils.clamp(10.5 + lejos * 0.95, 10.5, 24);
    cam.dist += (dist - cam.dist) * Math.min(1, dt * 2);
    tmp.set(cx, 1.8, cz);
  } else {
    const j = jugadores[0];
    const arr = pad.arrastre();
    if (girar) {
      const d = j.dispositivo ? entradas.get(j.dispositivo) : null;
      const rx = d ? d.rx : pad.rx, ry = d ? d.ry : pad.ry;
      cam.yaw -= rx * 2.4 * dt + arr.x;
      cam.el = THREE.MathUtils.clamp(cam.el + ry * 1.4 * dt + arr.y, 0.08, 1.05);
    }
    tmp.set(j.pos.x, 1.8 + j.pos.y * 0.4, j.pos.z);
  }
  cam.mira.lerp(tmp, 1 - Math.exp(-6 * dt));
  const c = Math.cos(cam.el);
  camara.position.set(cam.mira.x + Math.sin(cam.yaw) * c * cam.dist, cam.mira.y + Math.sin(cam.el) * cam.dist, cam.mira.z + Math.cos(cam.yaw) * c * cam.dist);
  camara.lookAt(cam.mira.x, cam.mira.y + 0.9, cam.mira.z);
  cielo.position.copy(camara.position);
}

// ---------- Estado de la partida ----------
let estado = 'intro';     // intro | jugando | pausa | fin
let tEstado = 0;
let toques = 0;           // entre todos
let globos = [];
let nuevoRecord = false;
let duracionIntro = 2;
const ids = defs.map((d) => d.perfil.id).filter(Boolean);
function leerRecord() { return LIBRE ? records.leer(JUEGO) : VARIOS ? recordEquipo(JUEGO, ids) : recordDe(ids[0], JUEGO); }
function guardarRecord(v) { if (LIBRE) records.guardar(JUEGO, v); else if (VARIOS) ponerRecordEquipo(JUEGO, ids, v); else ponerRecord(ids[0], JUEGO, v); }
let record = leerRecord();
function pintarRecord() {
  $('record').textContent = VARIOS ? `Récord juntos ${record}` : LIBRE ? `Récord ${record}` : `Récord de ${defs[0].perfil.nombre}: ${record}`;
}
pintarRecord();
if (VARIOS) $('ayuda').innerHTML = '<span>Cada uno con su mando · stick: mover · <span class="boton-a">A</span> saltar · <span class="boton-a" style="background:#ffc531">Y</span> especial · <span class="boton-a boton-start">Menú</span> pausa</span>';

function pintarMarcador() {
  if (!VARIOS) return;
  $('marcador').innerHTML = jugadores.map((j) => `<span class="chip" style="--c:${j.color}"><i></i>${esc(j.perfil.nombre)} <b>${j.toques}</b></span>`).join('');
}

function gravedad() { return Math.min(3.8, 2.4 + toques * 0.035); }

function mensaje(txt, ms = 1200) {
  const m = $('mensaje');
  m.textContent = txt;
  m.classList.add('ver');
  clearTimeout(mensaje.t);
  if (ms) mensaje.t = setTimeout(() => m.classList.remove('ver'), ms);
}

function panel(html) {
  const p = $('panel');
  if (html) { p.innerHTML = html; p.classList.add('ver'); } else p.classList.remove('ver');
}

function cambiar(e) { estado = e; tEstado = 0; }

function empezar(primeraVez) {
  globos.forEach((g) => g.quitar());
  globos = [];
  toques = 0;
  nuevoRecord = false;
  $('toques').textContent = '0';
  $('toques').nextElementSibling.textContent = 'toques';
  jugadores.forEach((j) => j.colocar(jugadores.length));
  pintarMarcador();
  cam.yaw = 0; cam.el = VARIOS ? 0.44 : 0.36;
  globos.push(new Globo(COLORES_GLOBO[0], new THREE.Vector3(0, 5.5, 2)));
  if (jugadores.length >= 3) globos.push(new Globo(COLORES_GLOBO[1], new THREE.Vector3(3, 7, 1)));
  panel(null);
  duracionIntro = primeraVez ? 2 : 1;
  cambiar('intro');
  mensaje(primeraVez ? 'Globo arriba' : '¡Otra vez!', primeraVez ? 1800 : 1000);
}

const OPCIONES_FIN = `<div class="opciones"><span data-tap="A"><span class="boton-a">A</span> Otra vez</span>`
  + `<span data-tap="Y"><span class="boton-a" style="background:#ffc531">Y</span> Jugadores</span>`
  + `<span data-tap="B"><span class="boton-a boton-b">B</span> Menú</span></div>`;

function pausar(si) {
  if (si) {
    cambiar('pausa');
    panel(`<h2>Pausa</h2><div class="opciones"><span data-tap="A"><span class="boton-a">A</span> Seguir</span><span data-tap="B"><span class="boton-a boton-b">B</span> ${FIESTA ? 'Volver al tablero' : 'Salir al menú'}</span></div>`);
  } else {
    panel(null);
    cambiar('jugando');
  }
}

function terminar(globo) {
  cambiar('fin');
  suena('cae');
  vibrar(300);
  globo.estira = 1;
  explosion(globo.pos, 18, 0.6);
  if (toques > record) {
    record = toques; nuevoRecord = true;
    guardarRecord(record);
    pintarRecord();
    setTimeout(() => { suena('record'); explosion(globo.pos.clone().setY(2.5), 80, 1.4); }, 700);
  }
  let frase, tabla = '';
  if (FIESTA) resultadoFiesta('globo', jugadores.map((j) => ({ id: j.perfil.id, valor: j.toques })));
  if (VARIOS) {
    frase = toques === 0 ? '¡Ohhh! Se cayó' : `¡${toques} ${toques === 1 ? 'toque' : 'toques'} entre todos!`;
    const max = Math.max(...jugadores.map((j) => j.toques));
    const unico = max > 0 && jugadores.filter((j) => j.toques === max).length === 1;
    tabla = `<div class="tabla">${jugadores.map((j) => `<span class="chip grande" style="--c:${j.color}"><i></i>${esc(j.perfil.nombre)} <b>${j.toques}</b>${unico && j.toques === max ? ' 👑' : ''}</span>`).join('')}</div>`;
  } else {
    frase = toques === 0 ? '¡Ohhh! Se cayó' : `¡Has dado ${toques} ${toques === 1 ? 'toque' : 'toques'}!`;
  }
  const lineaRecord = nuevoRecord ? `<p class="nuevo">¡NUEVO RÉCORD${VARIOS ? ' JUNTOS' : ''}!</p>` : `<p>${VARIOS ? 'Récord juntos' : 'Tu récord'}: ${record}</p>`;
  setTimeout(() => {
    if (estado !== 'fin') return;
    panel(`<h2>${frase}</h2>${tabla}${lineaRecord}${FIESTA ? OPCIONES_FIESTA : OPCIONES_FIN}`);
  }, 550);
}

function toque(globo, j) {
  toques++;
  j.toques++;
  const t = $('toques');
  t.textContent = String(toques);
  t.nextElementSibling.textContent = toques === 1 ? 'toque' : 'toques';
  t.classList.remove('bump'); void t.offsetWidth; t.classList.add('bump');
  setTimeout(() => t.classList.remove('bump'), 130);
  pintarMarcador();
  suena('toque', toques);
  vibrar(35, j.dispositivo || undefined);
  explosion(globo.pos, 22);
  flotante('+1', globo.pos, VARIOS ? j.color : null);
  if (toques % 5 === 0) { suena('fanfarria'); mensaje(`¡${toques} toques!`); }
  if (toques % 10 === 0) especial(j.pj);   // lo celebra
  if (toques === 10 || toques === 25) {
    const p = j.pos.clone().add(new THREE.Vector3(2.5, 6.5, -2.5));
    if (Math.hypot(p.x, p.z) > PARED_GLOBO - 2) p.set(0, 6.5, 0);
    globos.push(new Globo(COLORES_GLOBO[globos.length % COLORES_GLOBO.length], p));
    setTimeout(() => mensaje('¡Otro globo!'), 900);
  }
}

function flotante(txt, pos, color) {
  tmp.copy(pos).project(camara);
  const d = document.createElement('div');
  d.className = 'mas1 txt';
  d.textContent = txt;
  if (color) d.style.setProperty('--morado', color);
  d.style.left = ((tmp.x + 1) / 2 * innerWidth) + 'px';
  d.style.top = ((1 - tmp.y) / 2 * innerHeight) + 'px';
  $('flotantes').appendChild(d);
  setTimeout(() => d.remove(), 1000);
}

function globoMasBajo() {
  let mejor = null;
  for (const g of globos) if (!mejor || g.pos.y < mejor.pos.y) mejor = g;
  return mejor;
}

// Piloto automático para pruebas (?bot=1)
function entradaBot(j) {
  const g = globoMasBajo();
  if (!g) return [0, 0, false];
  const ex = g.pos.x - j.pos.x, ez = g.pos.z - j.pos.z, d = Math.hypot(ex, ez);
  if (d < 0.35) return [0, 0, false];
  const cy = Math.cos(-cam.yaw), sy = Math.sin(-cam.yaw);
  const ix = ex / d, iz = ez / d, f = Math.min(1, d);
  return [(ix * cy + iz * sy) * f, (-ix * sy + iz * cy) * f, d < 1.2 && g.pos.y < 3.4 && g.pos.y > 2.2 && g.vel.y < 0];
}

// ---------- Botón "atrás" del mando de la tele ----------
alPulsarAtras(() => {
  if (estado === 'jugando' || estado === 'intro') pausar(true);
  else volverAlMenu();
  return true;
});

const irAJugadores = () => { location.href = new URL('../jugadores/index.html#globo', location.href).href; };

// ---------- Bucle ----------
let antes = performance.now(), fpsN = 0, fpsT = 0, verFps = params.has('fps');
const ayuda = $('ayuda');
let tJugado = 0;

function bucle(now) {
  const dt = Math.max(0, Math.min(0.05, (now - antes) / 1000));   // el primer fotograma puede llegar con tiempo negativo
  antes = now;
  tEstado += dt;
  pad.update();
  entradas.update();
  if (estado !== 'fin' && estado !== 'pausa') especialConY(jugadores);
  if (pad.pressed('SELECT')) verFps = !verFps;

  const activo = estado === 'jugando' || estado === 'intro';
  if (activo) {
    if (pad.pressed('START')) pausar(true);
  } else if (estado === 'pausa') {
    if (pad.pressed('A') || pad.pressed('START')) pausar(false);
    else if (pad.pressed('B')) volverAlMenu();
  } else if (estado === 'fin' && tEstado > 0.9) {
    if (FIESTA) { if (pad.pressed('A') || (BOT && tEstado > 2.5)) volverAlTablero(); }
    else if (pad.pressed('A') || (BOT && tEstado > 2.5)) empezar(false);
    else if (pad.pressed('Y')) irAJugadores();
    else if (pad.pressed('B')) volverAlMenu();
  }

  if (estado === 'intro' && tEstado > duracionIntro) { cambiar('jugando'); mensaje('¡Ya!', 700); }

  if (estado !== 'pausa') {
    for (const j of jugadores) {
      const [lx, ly, saltar] = activo ? j.entrada() : [0, 0, false];
      j.actualizar(dt, lx, ly, saltar && activo);
    }
    if (VARIOS) separarJugadores();
  }

  if (estado === 'jugando') {
    tJugado += dt;
    const grav = gravedad();
    for (const g of globos) {
      g.paso(dt, grav);
      if (g.cd > 0) continue;
      for (const j of jugadores) {
        if (g.pos.distanceTo(j.cabeza) >= 0.6 + 0.85) continue;
        tmp.set(g.pos.x - j.cabeza.x, 0, g.pos.z - j.cabeza.z);
        if (tmp.lengthSq() < 0.01) tmp.set(Math.random() - 0.5, 0, Math.random() - 0.5);
        tmp.normalize().applyAxisAngle(THREE.Object3D.DEFAULT_UP, (Math.random() - 0.5) * 1.2);
        const empuje = 1.2 + Math.random() * 1.4;
        g.vel.set(tmp.x * empuje + j.vel.x * 0.25, REBOTE, tmp.z * empuje + j.vel.z * 0.25);
        g.cd = 0.45;
        g.estira = 1;
        toque(g, j);
        break;
      }
    }
    for (const g of globos) if (g.pos.y < 0.6 * 1.15) { g.pos.y = 0.6 * 1.15; terminar(g); break; }
  } else {
    for (const g of globos) { g.t += dt; g.animar(dt); }
  }
  ayuda.style.opacity = tJugado < 12 ? 1 : 0;

  actualizarCamara(dt, estado !== 'pausa');
  for (const j of jugadores) j.pintarEtiqueta();
  actualizarConfeti(dt);
  nubes.rotation.y += dt * 0.008;
  renderer.render(escena, camara);

  fpsN++; fpsT += dt;
  if (fpsT >= 0.5) {
    const f = $('fps');
    f.style.display = verFps ? 'block' : 'none';
    if (verFps) f.textContent = `${Math.round(fpsN / fpsT)} fps · ${renderer.domElement.width}×${renderer.domElement.height} · ${renderer.info.render.calls} dibujos`;
    fpsN = 0; fpsT = 0;
  }
  requestAnimationFrame(bucle);
}

window.__juego = {
  get estado() { return estado; }, get toques() { return toques; }, get record() { return record; },
  get jugadores() { return jugadores.map((j) => ({ nombre: j.perfil.nombre, toques: j.toques, pos: [j.pos.x, j.pos.z].map((n) => +n.toFixed(2)) })); },
  get debug() { const f = (v) => [v.x, v.y, v.z].map((n) => +n.toFixed(2)); return { j: f(jugadores[0].pos), g: globos.map((g) => f(g.pos)), cd: globos.map((g) => +g.cd.toFixed(2)) }; },
};
empezar(true);
vestir(THREE, escena, { lejos: 16 });
requestAnimationFrame(bucle);
