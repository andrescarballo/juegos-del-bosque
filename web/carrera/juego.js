// La gran carrera — carrera a pie por un circuito del bosque. 3 vueltas, troncos que saltar, barro que frena
// y regalos con objetos (piña, pompa, miel, zanahoria, nube). De 1 a 4 jugadores más corredores de la máquina.
import { vestir, tenir, ESTACION, REGLA, racha } from '../comun/estaciones.js';
import * as THREE from '../lib/three.min.js';
import { pad, entradas } from '../comun/pad.js';
import { suena } from '../comun/sonido.js';
import { enTele, params, volverAlMenu, alPulsarAtras, escenario, vibrar } from '../comun/tv.js';
import { controlesTactiles, esTactil } from '../comun/tactil.js';
import { partida, perfilPorId, ANIMALES } from '../comun/perfiles.js';
import { especialConY, especial, poder } from '../comun/especial.js';
import { crearPersonaje, animarPersonaje } from '../comun/personajes.js';
import { crearCielo, mat, rng } from '../comun/mundo.js';
import { hayNaturaleza, plantar, unoDe, adornar, RECETA_PRADO, ARBOLES, ABETOS, ARBUSTOS, HIERBAS, PEDRUSCOS, SETAS, SETITAS, FLORES, ROCAS, PACK } from '../comun/naturaleza.js';
import { FIESTA, resultadoFiesta, volverAlTablero, OPCIONES_FIESTA } from '../comun/fiesta.js';

const BOT = params.has('bot');
const VUELTAS = parseInt(params.get('vueltas') || (FIESTA ? '2' : '3'), 10);
// 4 corredores: con más, el Chromecast no llega a 60 fps (cada animal son ~25 llamadas de dibujo)
const CORREDORES = Math.max(2, Math.min(6, parseInt(params.get('corredores') || '4', 10)));
const ANCHO_PISTA = 8;
const VEL = 10.5, ACEL = 26;
const SALTO = 8.5, G = 26;
const T_TROPIEZO = 1.2, T_POMPA = 1.6, T_ACELERON = 2, T_NUBE = 3;

escenario(document.getElementById('esc'));
const $ = (id) => document.getElementById(id);
const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const clamp = THREE.MathUtils.clamp;
controlesTactiles({ camara: false, botones: [{ b: 'A', txt: 'A', color: '#3dbb4c' }, { b: 'X', txt: 'X', color: '#3aa0ff', x: 30, y: 5 }], pausa: true });
if (esTactil) $('ayuda').innerHTML = '<span>Dedo a la izquierda: correr · <span class="boton-a">A</span> saltar · <span class="boton-a" style="background:#3aa0ff">X</span> objeto</span>';
const azar = rng(Date.now() & 0xffff);

// ---------- Render ----------
const renderer = new THREE.WebGLRenderer({ canvas: $('lienzo'), antialias: !enTele, powerPreference: 'high-performance' });
const escena = new THREE.Scene();
let camara = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.5, 600);   // luego, la de la primera vista
function ajustar() {
  // En la tele, algo menos que en los demás juegos: se ve mucho paisaje y el Chromecast va justo
  const objetivo = parseInt(params.get('ancho') || (enTele ? '1120' : esTactil ? '1600' : '1920'), 10);
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, objetivo / innerWidth));
  renderer.setSize(innerWidth, innerHeight, false);
  camara.aspect = innerWidth / innerHeight;
  camara.updateProjectionMatrix();
}
addEventListener('resize', ajustar);
ajustar();
escena.fog = new THREE.Fog('#dff3ff', 80, 200);
escena.add(new THREE.HemisphereLight('#e6f4ff', '#8fcf6a', 1.9));
const sol = new THREE.DirectionalLight('#fff0dc', 2.1);
sol.position.set(-30, 60, 25);
escena.add(sol);
const cielo = crearCielo(THREE, escena);
const dummy = new THREE.Object3D();

let adornoCarrera = [];   // con pantalla partida se aclara (se dibuja una vez por jugador)
// ---------- Circuito ----------
const PUNTOS = [[0, 34], [24, 32], [42, 20], [44, -2], [28, -12], [16, -26], [-6, -36], [-30, -28], [-42, -8], [-30, 8], [-36, 24], [-16, 36]];
const curva = new THREE.CatmullRomCurve3(PUNTOS.map(([x, z]) => new THREE.Vector3(x, 0, z)), true, 'catmullrom', 0.5);
const NS = 600;
const centro = curva.getSpacedPoints(NS).slice(0, NS);       // puntos del centro de la pista, igual de separados
const tang = centro.map((p, i) => centro[(i + 1) % NS].clone().sub(centro[(i - 1 + NS) % NS]).normalize());
const LARGO = curva.getLength();
// Pista: una cinta de tierra con bordes de piedra
{
  const pos = [], idx = [];
  const borde = [];
  for (let i = 0; i <= NS; i++) {
    const p = centro[i % NS], t = tang[i % NS];
    const n = new THREE.Vector3(-t.z, 0, t.x);
    const a = p.clone().addScaledVector(n, ANCHO_PISTA / 2), b = p.clone().addScaledVector(n, -ANCHO_PISTA / 2);
    pos.push(a.x, 0.02, a.z, b.x, 0.02, b.z);
    if (i < NS) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
    if (i % 4 === 0 && i < NS) borde.push(a, b);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx); g.computeVertexNormals();
  escena.add(new THREE.Mesh(g, mat(THREE, '#d9b07a', { side: THREE.DoubleSide })));
  const piedras = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(0.28, 0), mat(THREE, '#f3efe7', { flatShading: true }), borde.length);
  borde.forEach((p, k) => { dummy.position.set(p.x, 0.12, p.z); dummy.scale.set(1, 0.6, 1); dummy.rotation.set(0, k, 0); dummy.updateMatrix(); piedras.setMatrixAt(k, dummy.matrix); });
  escena.add(piedras);
}
const suelo = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), mat(THREE, '#86d860'));
suelo.rotation.x = -Math.PI / 2;
escena.add(suelo);

/** El punto del centro más cercano a (x, z), buscando cerca de `pista` (índice anterior). */
function puntoCercano(x, z, pista = -1) {
  let mejor = 0, md = Infinity;
  const desde = pista < 0 ? 0 : pista - 30, hasta = pista < 0 ? NS : pista + 30;
  for (let k = desde; k < hasta; k++) {
    const i = ((k % NS) + NS) % NS, p = centro[i];
    const d = (p.x - x) ** 2 + (p.z - z) ** 2;
    if (d < md) { md = d; mejor = i; }
  }
  return { i: mejor, d: Math.sqrt(md) };
}

// Árboles alrededor (fuera de la pista)
{
  const arboles = [];
  for (let n = 0; n < 3000 && arboles.length < 120; n++) {
    const x = (azar() * 2 - 1) * 90, z = (azar() * 2 - 1) * 80;
    if (puntoCercano(x, z).d < ANCHO_PISTA / 2 + 3.5) continue;
    if (arboles.some((t) => Math.hypot(t.x - x, t.z - z) < 4)) continue;
    arboles.push({ x, z, h: 2.2 + azar() * 1.8, s: 1.3 + azar() * 0.8 });
  }
  if (hayNaturaleza) {
    // Árboles del pack, y matorrales y setas junto a la pista
    const g = {};
    const poner = (n, o) => (g[n] = g[n] || []).push(o);
    for (const t of arboles) poner(unoDe(azar() < 0.35 ? ABETOS : ARBOLES, azar()), { x: t.x, z: t.z, alto: (t.h + t.s * 1.4) * 1.3, giro: azar() * 6.3 });
    // Mucho adorno a los lados de la pista (más cerca, más denso)
    adornoCarrera = adornar(escena, azar, (r) => {
      const x = (r() * 2 - 1) * 85, z = (r() * 2 - 1) * 75, d = puntoCercano(x, z).d;
      if (d < ANCHO_PISTA / 2 + 0.9 || d > 26 || r() < d / 30) return null;
      return arboles.some((t) => Math.hypot(t.x - x, t.z - z) < 1.2) ? null : { x, y: 0, z };
    }, RECETA_PRADO, 1.8);
    for (const n in g) escena.add(plantar(n, g[n]));
  } else {
  const tr = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.25, 0.4, 1, 7), mat(THREE, '#9b6a43'), arboles.length);
  const co = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), mat(THREE, '#ffffff', { flatShading: true }), arboles.length);
  const C = ['#5cc56a', '#4cb85e', '#7fd66a', '#3fae5b', '#9be06e', '#ff9ad5', '#ffc18a'];
  arboles.forEach((t, i) => {
    dummy.position.set(t.x, t.h / 2, t.z); dummy.scale.set(1, t.h, 1); dummy.rotation.set(0, 0, 0); dummy.updateMatrix(); tr.setMatrixAt(i, dummy.matrix);
    dummy.position.set(t.x, t.h + 0.8, t.z); dummy.scale.setScalar(t.s); dummy.rotation.set(azar(), azar(), azar()); dummy.updateMatrix(); co.setMatrixAt(i, dummy.matrix);
    co.setColorAt(i, new THREE.Color(C[i % C.length]));
  });
  escena.add(tr, co);
  }
}
// Salida: línea blanca y arco de arcoíris
{
  const p = centro[0], t = tang[0], ang = Math.atan2(t.x, t.z);
  const linea = new THREE.Mesh(new THREE.PlaneGeometry(ANCHO_PISTA, 0.6), new THREE.MeshBasicMaterial({ color: '#ffffff' }));
  linea.rotation.set(-Math.PI / 2, 0, ang); linea.position.set(p.x, 0.04, p.z);
  escena.add(linea);
  const g = new THREE.Group();
  ['#ff5d73', '#ff9f43', '#ffd93d', '#6bd968', '#4cc3ff', '#7b7bff', '#c17bff'].forEach((c, k) => g.add(new THREE.Mesh(new THREE.TorusGeometry(ANCHO_PISTA / 2 + 1.2 - k * 0.22, 0.12, 6, 32, Math.PI), new THREE.MeshBasicMaterial({ color: c }))));
  // El arco está en el plano XY: con el giro de la pista queda cruzando el camino de lado a lado
  g.position.set(p.x, 0, p.z); g.rotation.y = ang;
  escena.add(g);
}

// ---------- Obstáculos: troncos (saltar) y barro (frena) ----------
const troncos = [130, 290, 470].map((i) => ({ i, p: centro[i], t: tang[i] }));
for (const o of troncos) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, ANCHO_PISTA - 0.6, 10), mat(THREE, '#8f5f3c'));
  // Atravesado en la pista: primero tumbado (Z) y luego girado según la dirección de la pista (Y)
  m.rotation.order = 'YXZ';
  m.rotation.set(0, Math.atan2(o.t.x, o.t.z), Math.PI / 2);
  m.position.set(o.p.x, 0.35, o.p.z);
  escena.add(m);
}
const barros = [];
for (const [i, lado] of [[70, 1], [200, -1], [360, 1], [410, -1], [540, 0]]) {
  const p = centro[i], t = tang[i], n = new THREE.Vector3(-t.z, 0, t.x);
  const c = p.clone().addScaledVector(n, lado * ANCHO_PISTA * 0.22);
  const m = new THREE.Mesh(new THREE.CircleGeometry(1.7, 20), new THREE.MeshLambertMaterial({ color: '#7a5236' }));
  m.rotation.x = -Math.PI / 2; m.position.set(c.x, 0.03, c.z); m.scale.set(1.2, 0.8, 1);
  escena.add(m);
  barros.push({ x: c.x, z: c.z, r: 1.7 });
}

// ---------- Regalos con objetos ----------
const OBJETOS = {
  pina: { icono: '🌰', nombre: 'Piña' },
  pompa: { icono: '🫧', nombre: 'Pompa' },
  miel: { icono: '🍯', nombre: 'Miel' },
  zanahoria: { icono: '🥕', nombre: 'Zanahoria' },
  nube: { icono: '🌧️', nombre: 'Nube' },
};
const filasRegalo = [100, 250, 420, 560];
const regalos = [];
for (const i of filasRegalo) {
  const p = centro[i], t = tang[i], n = new THREE.Vector3(-t.z, 0, t.x);
  for (let k = 0; k < 4; k++) {
    const c = p.clone().addScaledVector(n, (k - 1.5) * (ANCHO_PISTA / 4.5));
    regalos.push({ x: c.x, z: c.z, oculto: 0 });
  }
}
const mRegalo = new THREE.InstancedMesh(new THREE.BoxGeometry(0.8, 0.8, 0.8), new THREE.MeshLambertMaterial({ color: '#ffffff', emissive: '#ffffff', emissiveIntensity: 0.25 }), regalos.length);
const mLazo = new THREE.InstancedMesh(new THREE.BoxGeometry(0.84, 0.18, 0.84), new THREE.MeshLambertMaterial({ color: '#ffffff' }), regalos.length * 2);
const COL_REGALO = ['#ff5d73', '#4cc3ff', '#ffd93d', '#c17bff'];
regalos.forEach((r, k) => { mRegalo.setColorAt(k, new THREE.Color(COL_REGALO[k % 4])); });
escena.add(mRegalo, mLazo);
function pintarRegalos(t) {
  regalos.forEach((r, k) => {
    const s = r.oculto > 0 ? 0 : 1;
    dummy.position.set(r.x, 0.8 + Math.sin(t * 3 + k) * 0.12, r.z); dummy.rotation.set(0, t * 1.5 + k, 0); dummy.scale.setScalar(s); dummy.updateMatrix();
    mRegalo.setMatrixAt(k, dummy.matrix);
    dummy.updateMatrix(); mLazo.setMatrixAt(k * 2, dummy.matrix);
    dummy.rotation.set(0, t * 1.5 + k, Math.PI / 2); dummy.updateMatrix(); mLazo.setMatrixAt(k * 2 + 1, dummy.matrix);
  });
  mRegalo.instanceMatrix.needsUpdate = true; mLazo.instanceMatrix.needsUpdate = true;
}

// ---------- Corredores ----------
const datosPartida = partida.leer();
let defs = [];
if (datosPartida && datosPartida.juego === 'carrera' && Array.isArray(datosPartida.jugadores)) {
  defs = datosPartida.jugadores.map((j) => ({ perfil: perfilPorId(j.perfil), dispositivo: j.dispositivo })).filter((j) => j.perfil);
}
// Para pruebas: ?jugadores=N crea N jugadores sin perfil (no toca los perfiles guardados)
if (params.has('jugadores')) {
  const n = Math.max(1, Math.min(4, parseInt(params.get('jugadores'), 10) || 2));
  defs = Array.from({ length: n }, (_, i) => ({ perfil: { id: null, nombre: 'J' + (i + 1), animal: ['zorro', 'oso', 'conejo', 'buho'][i], pelo: 'natural', accesorio: 'nada', color: ['#ff4d6d', '#2fb4ff', '#3dbb4c', '#ffb020'][i] }, dispositivo: 'prueba' + i }));
}
const LIBRE = defs.length === 0;
if (LIBRE) defs = [{ perfil: { id: null, nombre: 'Tú', animal: 'zorro', pelo: 'natural', accesorio: 'nada', color: '#ff4d6d' }, dispositivo: null }];
const NOMBRES_CPU = { oveja: 'Lana', zorro: 'Rufo', conejo: 'Saltarina', cervatillo: 'Bambú', jabali: 'Trufo', ardilla: 'Chispa', erizo: 'Pincho', buho: 'Ulises', oso: 'Bruno' };
const COLORES_CPU = ['#9b8cff', '#ff9f43', '#3dbb4c', '#2fb4ff', '#ff6fb1'];
const usados = new Set(defs.map((d) => d.perfil.animal));
const cpuAnimales = ANIMALES.map((a) => a.id).filter((a) => !usados.has(a) && a !== 'oveja').sort(() => azar() - 0.5);
while (defs.length < CORREDORES) {
  const a = cpuAnimales.shift() || 'oveja';
  defs.push({ perfil: { id: null, nombre: NOMBRES_CPU[a] || 'CPU', animal: a, pelo: 'natural', accesorio: 'nada', color: COLORES_CPU[defs.length % COLORES_CPU.length] }, dispositivo: null, cpu: true });
}
const tmp = new THREE.Vector3();
const humanos = () => corredores.filter((c) => c.humano);

class Corredor {
  constructor(def, i) {
    this.perfil = def.perfil; this.dispositivo = def.dispositivo; this.cpu = !!def.cpu || BOT; this.humano = !def.cpu; this.i = i;
    this.color = def.perfil.color || '#ff4d6d';
    // Los de la máquina, con menos capas de pelo: así la tele puede con seis corredores
    // Pelo más ligero en los de la máquina y, con 3 o 4 vistas, en todos (cada animal se dibuja una vez por vista)
    const muchasVistas = defs.filter((d) => !d.cpu).length > 2;
    this.pj = crearPersonaje(THREE, def.perfil, { pelo: def.cpu ? 0.35 : muchasVistas ? 0.45 : 1 });
    this.pj.g.scale.multiplyScalar(1.2);
    escena.add(this.pj.g);
    this.pos = new THREE.Vector3(); this.vel = new THREE.Vector3(); this.y = 0; this.vy = 0;
    this.angulo = 0; this.paso = 0; this.aplasta = 0;
    this.pista = 0; this.vuelta = 0; this.avance = 0; this.terminado = false; this.tFinal = 0; this.puesto = 0;
    this.objeto = null; this.tropiezo = 0; this.pompa = 0; this.aceleron = 0; this.nube = 0; this.inmuneMiel = 0;
    this.carril = (azar() - 0.5) * 0.6; this.habilidad = 0.9 + azar() * 0.08;
    this.etiqueta = document.createElement('div');
    this.etiqueta.className = 'etiqueta'; this.etiqueta.textContent = def.perfil.nombre; this.etiqueta.style.setProperty('--c', this.color);
    if (this.cpu && !this.humano) this.etiqueta.style.fontSize = '2.6vmin';
    $('flotantes').appendChild(this.etiqueta);
    // Pompa que lo atrapa y nube de lluvia
    this.burbuja = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), new THREE.MeshPhongMaterial({ color: '#9fe3ff', transparent: true, opacity: 0.35, shininess: 90, depthWrite: false }));
    this.burbuja.visible = false; escena.add(this.burbuja);
    this.nubeM = new THREE.Group();
    for (let k = 0; k < 3; k++) { const b = new THREE.Mesh(new THREE.SphereGeometry(0.5, 10, 8), mat(THREE, '#8a8fa8')); b.position.x = (k - 1) * 0.5; this.nubeM.add(b); }
    this.nubeM.visible = false; escena.add(this.nubeM);
  }
  colocarSalida(fila, col) {
    const k = (NS - 4 - fila * 6) % NS;
    const p = centro[k], t = tang[k], n = new THREE.Vector3(-t.z, 0, t.x);
    this.pos.copy(p).addScaledVector(n, (col - 0.5) * 2.6);
    this.angulo = Math.atan2(t.x, t.z);
    this.pista = k; this.vuelta = -1; this.avance = k - NS;
  }
  entrada() {
    if (this.cpu) return this.ia();
    const d = this.dispositivo ? entradas.get(this.dispositivo) : pad;
    if (!d) return { x: 0, z: 0, saltar: false, usar: false };
    // Relativo a su cámara (que va detrás): arriba = hacia delante
    const yaw = this.vista ? this.vista.yaw : 0;
    const fx = Math.sin(yaw), fz = Math.cos(yaw), rx = -fz, rz = fx;
    return { x: rx * d.lx - fx * d.ly, z: rz * d.lx - fz * d.ly, saltar: d.pressed('A'), usar: d.pressed('X') || d.pressed('B') || d.pressed('RT') };
  }
  /** Corredor de la máquina: sigue el centro con su carril, salta troncos y usa objetos. */
  ia() {
    const k = (this.pista + 14) % NS, p = centro[k], t = tang[k], n = new THREE.Vector3(-t.z, 0, t.x);
    const obj = p.clone().addScaledVector(n, this.carril * ANCHO_PISTA * 0.5);
    let dx = obj.x - this.pos.x, dz = obj.z - this.pos.z;
    const d = Math.hypot(dx, dz) || 1;
    dx /= d; dz /= d;
    let saltar = false;
    for (const o of troncos) { const dd = (o.i - this.pista + NS) % NS; if (dd > 2 && dd < 5) saltar = true; }
    // La máquina también usa su especial de vez en cuando
    if (Math.random() < 0.004) especial(this.pj);
    let usar = false;
    if (this.objeto) {
      if (this.objeto === 'zanahoria' || this.objeto === 'nube') usar = azar() < 0.02;
      else if (this.objeto === 'miel') usar = corredores.some((c) => c !== this && c.avance < this.avance && this.avance - c.avance < 25) && azar() < 0.05;
      else usar = corredores.some((c) => c !== this && c.avance > this.avance && c.avance - this.avance < 30) && azar() < 0.05;
    }
    const f = this.habilidad;
    return { x: dx * f, z: dz * f, saltar, usar };
  }
  actualizar(dt, activo) {
    if (this.terminado) activo = false;
    const e = activo ? this.entrada() : { x: 0, z: 0, saltar: false, usar: false };
    let m = Math.hypot(e.x, e.z);
    let ix = 0, iz = 0;
    if (m > 0.2) { ix = e.x / Math.max(1, m); iz = e.z / Math.max(1, m); }
    // Velocidad según el suelo y lo que le pase
    const enPista = puntoCercano(this.pos.x, this.pos.z, this.pista).d < ANCHO_PISTA / 2 + 0.3;
    let f = enPista ? 1 : 0.6;
    if (this.y < 0.05) {
      if (barros.some((b) => Math.hypot(b.x - this.pos.x, b.z - this.pos.z) < b.r)) f *= 0.5;
      if (this.inmuneMiel <= 0 && mieles.some((b) => Math.hypot(b.x - this.pos.x, b.z - this.pos.z) < b.r)) f *= 0.4;
    }
    if (this.aceleron > 0) f *= 1.55;
    if (this.nube > 0) f *= 0.55;
    // El especial del animal: más velocidad, saltos, no tropezar...
    const pw = this.pw = poder(this.pj);
    f *= pw.vel;
    if (this.tropiezo > 0 || this.pompa > 0) f = 0;
    const max = VEL * f;
    const ac = ACEL * dt * (0.25 + 0.75 * REGLA.agarre);   // invierno: resbala
    const w = racha();                                        // otoño: rachas de viento
    const tx = ix * max + w.x, tz = iz * max + w.z;
    this.vel.x += clamp(tx - this.vel.x, -ac, ac);
    this.vel.z += clamp(tz - this.vel.z, -ac, ac);
    if (e.saltar && this.y <= 0.001 && this.tropiezo <= 0 && this.pompa <= 0) { this.vy = SALTO * REGLA.salto; suena('salto'); }
    if (pw.salto && this.tropiezo <= 0 && this.pompa <= 0) {
      this.vy = SALTO * pw.salto;
      if (pw.avance) { this.vel.x += Math.sin(this.angulo) * VEL * 0.6 * pw.avance; this.vel.z += Math.cos(this.angulo) * VEL * 0.6 * pw.avance; }
    }
    if (pw.rugido) for (const o of corredores) if (o !== this && !o.terminado && Math.hypot(o.pos.x - this.pos.x - Math.sin(this.angulo) * pw.lejos, o.pos.z - this.pos.z - Math.cos(this.angulo) * pw.lejos) < pw.rugido) o.tropezar(0.9);
    this.vy -= G * dt * (this.vy < 0 ? pw.grav : 1);
    this.y = Math.max(0, this.y + this.vy * dt);
    if (this.y === 0) this.vy = 0;
    const antes = this.pos.clone();
    this.pos.x += this.vel.x * dt; this.pos.z += this.vel.z * dt;
    // Troncos: si no saltas, te chocas
    for (const o of troncos) {
      const rel = this.pos.clone().sub(o.p), a = rel.dot(o.t), b = antes.clone().sub(o.p).dot(o.t);
      const lat = Math.abs(rel.x * -o.t.z + rel.z * o.t.x);
      if (lat < ANCHO_PISTA / 2 && this.y < 0.55 && Math.sign(a) !== Math.sign(b) && Math.abs(a) < 1.5 && !pw.invulnerable) {
        this.pos.copy(antes).addScaledVector(o.t, -Math.sign(a - b) * 0.4);
        this.vel.set(0, 0, 0); this.tropezar(0.6);
      }
    }
    // No alejarse demasiado de la pista
    const pc = puntoCercano(this.pos.x, this.pos.z, this.pista);
    if (pc.d > ANCHO_PISTA * 1.4) {
      const c = centro[pc.i];
      tmp.copy(this.pos).sub(c).setLength(ANCHO_PISTA * 1.4);
      this.pos.set(c.x + tmp.x, 0, c.z + tmp.z);
    }
    // Avance por el circuito (vueltas)
    const di = ((pc.i - this.pista + NS / 2) % NS + NS) % NS - NS / 2;
    if (Math.abs(di) < NS / 4) {
      this.avance += di;
      if (this.pista > NS * 0.8 && pc.i < NS * 0.2) this.vuelta++;
      if (this.pista < NS * 0.2 && pc.i > NS * 0.8) this.vuelta--;
      this.pista = pc.i;
    }
    if (!this.terminado && this.avance >= VUELTAS * NS) llegar(this);
    // Objetos
    if (activo && e.usar && this.objeto) usarObjeto(this);
    if (!this.objeto && this.y < 1.5) {
      for (const r of regalos) if (r.oculto <= 0 && Math.hypot(r.x - this.pos.x, r.z - this.pos.z) < 1.1) { r.oculto = 4; this.objeto = sortearObjeto(this); suena('objeto'); marcadorSucio = true; break; }
    }
    this.tropiezo = Math.max(0, this.tropiezo - dt); this.pompa = Math.max(0, this.pompa - dt);
    this.aceleron = Math.max(0, this.aceleron - dt); this.nube = Math.max(0, this.nube - dt); this.inmuneMiel = Math.max(0, this.inmuneMiel - dt);
    // Animación
    const rapidez = Math.hypot(this.vel.x, this.vel.z);
    if (rapidez > 0.4 && this.tropiezo <= 0) {
      let d = Math.atan2(this.vel.x, this.vel.z) - this.angulo;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      this.angulo += d * Math.min(1, dt * 12);
    }
    if (rapidez > 0.5 && this.y < 0.05) this.paso += dt * (6 + rapidez * 1.2); else this.paso *= Math.exp(-dt * 10);
    this.aplasta = Math.max(0, this.aplasta - dt * 5);
    const flota = this.pompa > 0 ? 1.2 + Math.sin(performance.now() / 200) * 0.2 : 0;
    this.pj.g.position.set(this.pos.x, this.y + flota, this.pos.z);
    this.pj.g.rotation.set(this.tropiezo > 0 ? -0.6 : 0, this.angulo, 0);
    animarPersonaje(this.pj, { paso: this.paso, suelo: this.y < 0.05, aplasta: this.aplasta, mirar: null, dt });
    this.burbuja.visible = this.pompa > 0;
    if (this.pompa > 0) { this.burbuja.position.set(this.pos.x, flota + 0.9, this.pos.z); this.burbuja.scale.setScalar(1.3); }
    this.nubeM.visible = this.nube > 0;
    if (this.nube > 0) {
      this.nubeM.position.set(this.pos.x, 3.4, this.pos.z);
      if (Math.random() < 0.5) gotas(this.pos.x + (Math.random() - 0.5), 3, this.pos.z + (Math.random() - 0.5));
    }
  }
  tropezar(t = T_TROPIEZO) { if (this.tropiezo > 0 || (this.pw && this.pw.invulnerable)) return; this.tropiezo = t; this.aplasta = 1; suena('golpe'); if (this.humano && !this.cpu) vibrar(250, this.dispositivo || undefined); }
  pintarEtiqueta() {
    tmp.set(this.pos.x, this.y + 2.4, this.pos.z).project(camara);
    const ver = tmp.z < 1 && Math.abs(tmp.x) < 1.1 && Math.abs(tmp.y) < 1.1;
    this.etiqueta.style.display = ver ? 'block' : 'none';
    if (!ver) return;
    this.etiqueta.textContent = this.humano ? `${this.perfil.nombre} ${this.puesto}º` : this.perfil.nombre;
    this.etiqueta.style.left = ((tmp.x + 1) / 2 * innerWidth) + 'px';
    this.etiqueta.style.top = ((1 - tmp.y) / 2 * innerHeight) + 'px';
  }
}
const corredores = defs.map((d, i) => new Corredor(d, i));

// ---------- Objetos en uso ----------
function sortearObjeto(c) {
  // Los de atrás tienen más suerte
  const atras = (c.puesto - 1) / Math.max(1, corredores.length - 1);
  const pesos = { pina: 3, miel: 3 - atras * 2, pompa: 1 + atras * 2, zanahoria: 1 + atras * 3, nube: atras > 0.4 ? atras * 2 : 0 };
  if (c.puesto === 1) pesos.nube = 0;
  let r = Math.random() * Object.values(pesos).reduce((a, b) => a + b, 0);
  for (const [k, w] of Object.entries(pesos)) { r -= w; if (r <= 0) return k; }
  return 'pina';
}
const proyectiles = [];
const mieles = [];
const geoPina = new THREE.ConeGeometry(0.28, 0.55, 8);
function usarObjeto(c) {
  const o = c.objeto; c.objeto = null; marcadorSucio = true;
  const fx = Math.sin(c.angulo), fz = Math.cos(c.angulo);
  if (o === 'zanahoria') { c.aceleron = T_ACELERON; suena('muelle'); }
  else if (o === 'miel') {
    const x = c.pos.x - fx * 1.8, z = c.pos.z - fz * 1.8;
    const m = new THREE.Mesh(new THREE.CircleGeometry(1.4, 20), new THREE.MeshLambertMaterial({ color: '#ffb000', emissive: '#ff9a00', emissiveIntensity: 0.3 }));
    m.rotation.x = -Math.PI / 2; m.position.set(x, 0.04, z); escena.add(m);
    mieles.push({ x, z, r: 1.4, t: 15, m });
    c.inmuneMiel = 1; suena('bloque');
  } else if (o === 'nube') {
    const lider = [...corredores].sort((a, b) => b.avance - a.avance).find((x) => x !== c && !x.terminado);
    if (lider) { lider.nube = T_NUBE; suena('golpe'); }
  } else {
    const m = o === 'pina' ? new THREE.Mesh(geoPina, mat(THREE, '#8a5a2b', { flatShading: true }))
      : new THREE.Mesh(new THREE.SphereGeometry(0.45, 14, 10), new THREE.MeshPhongMaterial({ color: '#9fe3ff', transparent: true, opacity: 0.55, shininess: 90 }));
    escena.add(m);
    let objetivo = null;
    if (o === 'pompa') objetivo = [...corredores].filter((x) => x !== c && x.avance > c.avance && !x.terminado).sort((a, b) => a.avance - b.avance)[0] || null;
    proyectiles.push({ tipo: o, x: c.pos.x + fx * 1.2, z: c.pos.z + fz * 1.2, vx: fx * (o === 'pina' ? 22 : 13), vz: fz * (o === 'pina' ? 22 : 13), t: o === 'pina' ? 2.5 : 5, de: c, objetivo, m });
    suena('disparo');
  }
}
function actualizarProyectiles(dt) {
  for (const p of proyectiles) {
    if (p.tipo === 'pompa' && p.objetivo) {
      const dx = p.objetivo.pos.x - p.x, dz = p.objetivo.pos.z - p.z, d = Math.hypot(dx, dz) || 1;
      p.vx += (dx / d * 13 - p.vx) * Math.min(1, dt * 3); p.vz += (dz / d * 13 - p.vz) * Math.min(1, dt * 3);
    }
    p.x += p.vx * dt; p.z += p.vz * dt; p.t -= dt;
    p.m.position.set(p.x, p.tipo === 'pina' ? 0.5 : 1 + Math.sin(p.t * 6) * 0.2, p.z);
    if (p.tipo === 'pina') p.m.rotation.set(p.t * 20, Math.atan2(p.vx, p.vz), 0);
    for (const c of corredores) {
      if (c === p.de && p.t > (p.tipo === 'pina' ? 2.2 : 4.6)) continue;
      if (c.terminado || Math.hypot(c.pos.x - p.x, c.pos.z - p.z) > 1 || c.y > 1.2) continue;
      if (p.tipo === 'pina') c.tropezar(); else if (!(c.pw && c.pw.invulnerable)) { c.pompa = T_POMPA; suena('pompa', 2); }
      p.t = 0; break;
    }
  }
  for (let k = proyectiles.length - 1; k >= 0; k--) if (proyectiles[k].t <= 0) { escena.remove(proyectiles[k].m); proyectiles.splice(k, 1); }
  for (const m of mieles) m.t -= dt;
  for (let k = mieles.length - 1; k >= 0; k--) if (mieles[k].t <= 0) { escena.remove(mieles[k].m); mieles.splice(k, 1); }
}

// Gotas de lluvia y polvo (una llamada de dibujo)
const N_GOTAS = 120;
const mGotas = new THREE.InstancedMesh(new THREE.BoxGeometry(0.05, 0.3, 0.05), new THREE.MeshBasicMaterial({ color: '#7fc8ff' }), N_GOTAS);
mGotas.frustumCulled = false;
const lGotas = Array.from({ length: N_GOTAS }, () => ({ x: 0, y: -10, z: 0 }));
let sigGota = 0;
escena.add(mGotas);
function gotas(x, y, z) { const g = lGotas[sigGota]; sigGota = (sigGota + 1) % N_GOTAS; g.x = x; g.y = y; g.z = z; }
function actualizarGotas(dt) {
  lGotas.forEach((g, i) => { g.y -= 12 * dt; dummy.position.set(g.x, g.y, g.z); dummy.rotation.set(0, 0, 0); dummy.scale.setScalar(g.y > 0 ? 1 : 0); dummy.updateMatrix(); mGotas.setMatrixAt(i, dummy.matrix); });
  mGotas.instanceMatrix.needsUpdate = true;
}

// ---------- Vistas: una por jugador (pantalla partida con 2, 3 o 4) ----------
// Cada vista va detrás de su jugador, mirando hacia donde sigue la pista.
const HFOV = 82;   // ángulo horizontal: igual en pantalla entera que partida
class Vista {
  constructor(c, k, n) {
    this.c = c; this.k = k; this.n = n;
    this.cam = new THREE.PerspectiveCamera(45, 1, 0.5, 700);   // más lejos que el cielo (500)
    this.yaw = 0; this.mira = new THREE.Vector3(); this.iniciada = false;
    c.vista = this;
    if (n > 1) {
      this.hud = document.createElement('div');
      this.hud.className = 'hudvista';
      $('flotantes').appendChild(this.hud);
    }
  }
  /** Rectángulo en fracciones de pantalla (desde arriba a la izquierda). */
  get rect() {
    if (this.n === 1) return { x: 0, y: 0, w: 1, h: 1 };
    if (this.n === 2) return { x: 0, y: this.k * 0.5, w: 1, h: 0.5 };
    return { x: (this.k % 2) * 0.5, y: Math.floor(this.k / 2) * 0.5, w: 0.5, h: 0.5 };
  }
  actualizar(dt) {
    const c = this.c;
    const k = (c.pista + 10) % NS;
    const yawObj = Math.atan2(tang[k].x, tang[k].z);
    if (!this.iniciada) { this.yaw = yawObj; this.mira.copy(c.pos); this.iniciada = true; }
    let dy = yawObj - this.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    this.yaw += dy * Math.min(1, dt * 2.5);
    tmp.set(c.pos.x, 0, c.pos.z);
    this.mira.lerp(tmp, 1 - Math.exp(-8 * dt));
    const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw), dist = 8;
    this.cam.position.set(this.mira.x - fx * dist, 2.3 + dist * 0.5, this.mira.z - fz * dist);
    this.cam.lookAt(this.mira.x + fx * 6, 1, this.mira.z + fz * 6);
    const r = this.rect, aspect = (innerWidth * r.w) / (innerHeight * r.h);
    const vfov = clamp(THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(HFOV / 2)) / aspect)), 40, 58);   // en franjas muy apaisadas, mínimo 40º en vertical
    if (Math.abs(this.cam.aspect - aspect) > 1e-3 || Math.abs(this.cam.fov - vfov) > 1e-2) {
      this.cam.aspect = aspect; this.cam.fov = vfov; this.cam.updateProjectionMatrix();
    }
  }
  pintarHud() {
    if (!this.hud) return;
    const c = this.c, r = this.rect;
    this.hud.style.left = `calc(${r.x * 100}% + 1.6vmin)`;
    this.hud.style.top = `calc(${r.y * 100}% + 1.4vmin)`;
    this.hud.style.setProperty('--c', c.color);
    const vuelta = Math.min(VUELTAS, Math.max(1, Math.floor(c.avance / NS) + 1));
    this.hud.innerHTML = `<b>${c.terminado ? '🏁 ' : ''}${c.puesto}º</b><span>${esc(c.perfil.nombre)}<br><small>${c.terminado ? reloj(c.tFinal) : `vuelta ${vuelta} de ${VUELTAS}`}</small></span>`
      + (c.objeto ? `<i>${OBJETOS[c.objeto].icono}</i>` : '');
  }
}
const vistas = humanos().map((c, k, hs) => new Vista(c, k, hs.length));
const PARTIDA = vistas.length > 1;
// En pantalla partida, menos plantitas: la escena se dibuja una vez por vista y la tele no llega
if (PARTIDA) { const queda = vistas.length === 2 ? 0.3 : 0.12; for (const m of adornoCarrera) m.count = Math.floor(m.count * queda); }
if (PARTIDA) {
  const st = document.createElement('style');
  st.textContent = `.hudvista { position: absolute; display: flex; align-items: center; gap: 1.4vmin; background: rgba(255,255,255,.9); color: #4a3b6a;
      border-radius: 99vmin; padding: .6vmin 2.4vmin .6vmin .8vmin; font-size: 2.6vmin; line-height: 1.1; box-shadow: 0 .6vmin 0 rgba(0,0,0,.1); }
    .hudvista b { font-size: 4.6vmin; color: #fff; background: var(--c); border-radius: 99vmin; padding: .2vmin 1.6vmin; }
    .hudvista small { font-size: 2vmin; color: #7a6a9a; }
    .hudvista i { font-style: normal; font-size: 4vmin; }
    .separa { position: fixed; background: #fff; z-index: 1; }
    #clasif { position: fixed; left: 50%; top: 50%; width: 50%; height: 50%; display: grid; place-items: center; background: linear-gradient(135deg, #8f6bff, #4fc3ff); }
    #clasif div { font-size: 3.6vmin; color: #fff; line-height: 1.5; text-align: left; -webkit-text-stroke: .8vmin #5b37a8; paint-order: stroke fill; }`;
  document.head.appendChild(st);
  const barra = (css) => { const d = document.createElement('div'); d.className = 'separa'; d.style.cssText = css; document.body.appendChild(d); };
  barra('left:0;right:0;top:calc(50% - 3px);height:6px');
  if (vistas.length > 2) barra('top:0;bottom:0;left:calc(50% - 3px);width:6px');
  if (vistas.length === 3) { const d = document.createElement('div'); d.id = 'clasif'; d.innerHTML = '<div></div>'; document.body.appendChild(d); }
  // En pantalla partida cada vista lleva su marcador; en el centro, solo el tiempo
  $('marcador').style.display = 'none';
  $('nivel').style.display = 'none';
  $('arriba').style.top = 'calc(50% - 50px)';
  $('tiempo').style.fontSize = '56px';
}
camara = vistas[0].cam;
function actualizarCamaras(dt) { for (const v of vistas) v.actualizar(dt); }
function dibujar() {
  if (!PARTIDA) {
    cielo.position.copy(camara.position);
    renderer.render(escena, camara);
    return;
  }
  const W = innerWidth, H = innerHeight;
  // Las matrices de la escena, una sola vez por fotograma (no una vez por cada vista)
  escena.matrixWorldAutoUpdate = true;
  escena.updateMatrixWorld();
  escena.matrixWorldAutoUpdate = false;
  renderer.setScissorTest(true);
  for (const v of vistas) {
    const r = v.rect;
    const x = Math.round(r.x * W), w = Math.round(r.w * W), h = Math.round(r.h * H), y = Math.round(H - r.y * H - h);
    renderer.setViewport(x, y, w, h); renderer.setScissor(x, y, w, h);
    cielo.position.copy(v.cam.position);
    renderer.render(escena, v.cam);
  }
  renderer.setScissorTest(false);
  renderer.setViewport(0, 0, W, H);
  escena.matrixWorldAutoUpdate = true;
}

// ---------- Partida ----------
let estado = 'cuenta', estadoAntesPausa = 'carrera', tAntesPausa = 0, tEstado = 0, tCarrera = 0;
let llegadas = [];
let marcadorSucio = true;
function mensaje(html, ms = 1200) {
  const m = $('mensaje'); m.innerHTML = html; m.classList.add('ver');
  clearTimeout(mensaje.t); if (ms) mensaje.t = setTimeout(() => m.classList.remove('ver'), ms);
}
function panel(html) { const p = $('panel'); if (html) { p.innerHTML = html; p.classList.add('ver'); } else p.classList.remove('ver'); }
function cambiar(e) { estado = e; tEstado = 0; }
const reloj = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
function pintarMarcador() {
  if (PARTIDA) {
    for (const v of vistas) v.pintarHud();
    const cl = document.querySelector('#clasif div');
    if (cl) cl.innerHTML = [...corredores].sort((a, b) => a.puesto - b.puesto).map((c) => `${c.puesto}º ${esc(c.perfil.nombre)}`).join('<br>');
    return;
  }
  $('marcador').innerHTML = humanos().map((c) => `<span class="chip" style="--c:${c.color}"><i></i>${esc(c.perfil.nombre)} <b>${c.terminado ? '🏁 ' : ''}${c.puesto}º</b>`
    + `<span class="poder">${c.terminado ? '' : `vuelta ${Math.min(VUELTAS, Math.max(1, Math.floor(c.avance / NS) + 1))}`}${c.objeto ? ' ' + OBJETOS[c.objeto].icono : ''}</span></span>`).join('');
  const lider = humanos().reduce((a, b) => (b.avance > a.avance ? b : a));
  $('nivel').textContent = `Vuelta ${Math.min(VUELTAS, Math.max(1, Math.floor(lider.avance / NS) + 1))} de ${VUELTAS}`;
}
function puestos() {
  const orden = [...corredores].sort((a, b) => {
    if (a.terminado && b.terminado) return a.tFinal - b.tFinal;
    if (a.terminado !== b.terminado) return a.terminado ? -1 : 1;
    return b.avance - a.avance;
  });
  orden.forEach((c, k) => { if (c.puesto !== k + 1) { c.puesto = k + 1; marcadorSucio = true; } });
}
function llegar(c) {
  c.terminado = true; c.tFinal = tCarrera;
  especial(c.pj);   // lo celebra con su movimiento especial
  llegadas.push(c);
  puestos();
  if (c.humano) { suena(c.puesto === 1 ? 'fanfarria' : 'bandera'); mensaje(`¡${esc(c.perfil.nombre)} llega ${c.puesto}º!`, 1800); }
  if (humanos().every((h) => h.terminado)) setTimeout(() => { if (estado === 'carrera') terminar(); }, 1800);
}
function empezar() {
  panel(null);
  llegadas = []; tCarrera = 0;
  corredores.forEach((c, k) => {
    c.terminado = false; c.objeto = null; c.tropiezo = c.pompa = c.aceleron = c.nube = 0; c.vel.set(0, 0, 0); c.y = 0; c.vy = 0;
    c.colocarSalida(Math.floor(k / 2), k % 2);
  });
  for (const p of proyectiles) escena.remove(p.m); proyectiles.length = 0;
  for (const m of mieles) escena.remove(m.m); mieles.length = 0;
  for (const r of regalos) r.oculto = 0;
  for (const v of vistas) v.iniciada = false;
  puestos();
  cambiar('cuenta');
}
function terminar() {
  cambiar('fin');
  // Los que no han llegado, por orden de avance
  puestos();
  const filas = [...corredores].sort((a, b) => a.puesto - b.puesto).map((c) => `<span class="chip grande" style="--c:${c.color};${c.humano ? '' : 'opacity:.75'}"><i></i>${c.puesto}º ${esc(c.perfil.nombre)}${c.terminado ? ` <b>${reloj(c.tFinal)}</b>` : ''}${c.puesto === 1 ? ' 👑' : ''}</span>`).join('');
  const mejor = humanos().reduce((a, b) => (b.puesto < a.puesto ? b : a));
  if (FIESTA) resultadoFiesta('carrera', humanos().map((c) => ({ id: c.perfil.id, valor: -c.puesto })));
  panel(`<h2>${mejor.puesto === 1 ? `¡Gana ${esc(mejor.perfil.nombre)}!` : `¡${esc(mejor.perfil.nombre)} llega ${mejor.puesto}º!`}</h2><div class="tabla" style="flex-direction:column;align-items:center">${filas}</div>`
    + (FIESTA ? OPCIONES_FIESTA : `<div class="opciones"><span data-tap="A"><span class="boton-a">A</span> Otra vez</span><span data-tap="Y"><span class="boton-a" style="background:#ffc531">Y</span> Jugadores</span><span data-tap="B"><span class="boton-a boton-b">B</span> Menú</span></div>`));
}
function pausar(si) {
  if (si) {
    estadoAntesPausa = estado; tAntesPausa = tEstado; cambiar('pausa');
    panel(`<h2>Pausa</h2><div class="opciones"><span data-tap="A"><span class="boton-a">A</span> Seguir</span><span data-tap="B"><span class="boton-a boton-b">B</span> ${FIESTA ? 'Volver al tablero' : 'Salir al menú'}</span></div>`);
  } else { panel(null); estado = estadoAntesPausa; tEstado = tAntesPausa; }
}
const irAJugadores = () => { location.href = new URL('../jugadores/index.html#carrera', location.href).href; };
alPulsarAtras(() => { if (estado === 'pausa' || estado === 'fin') volverAlMenu(); else pausar(true); return true; });

// ---------- Bucle ----------
let antes = performance.now(), fpsN = 0, fpsT = 0, verFps = params.has('fps'), ultimaCuenta = -1, tJugado = 0;
function bucle(now) {
  const dt = Math.max(0, Math.min(0.05, (now - antes) / 1000));   // el primer fotograma puede llegar con tiempo negativo
  antes = now; tEstado += dt;
  pad.update(); entradas.update();
  if (estado !== 'fin' && estado !== 'pausa') especialConY(humanos());
  if (pad.pressed('SELECT')) verFps = !verFps;

  if (estado === 'pausa') {
    if (pad.pressed('A') || pad.pressed('START')) pausar(false);
    else if (pad.pressed('B')) volverAlMenu();
  } else if (estado === 'fin') {
    if (tEstado > 1) {
      if (FIESTA) { if (pad.pressed('A') || (BOT && tEstado > 4)) volverAlTablero(); }
      else if (pad.pressed('A') || (BOT && tEstado > 4)) empezar();
      else if (pad.pressed('Y')) irAJugadores();
      else if (pad.pressed('B')) volverAlMenu();
    }
  } else if (pad.pressed('START')) pausar(true);

  if (estado === 'cuenta') {
    const n = 3 - Math.floor(tEstado);
    if (n !== ultimaCuenta && n > 0) { ultimaCuenta = n; mensaje(String(n), 800); suena('tictac'); }
    if (tEstado >= 3) { cambiar('carrera'); ultimaCuenta = -1; mensaje('¡Ya!', 700); suena('fanfarria'); }
  }
  if (estado !== 'pausa') {
    const corriendo = estado === 'carrera';
    for (const c of corredores) c.actualizar(dt, corriendo);
    // Empujones entre corredores
    for (let a = 0; a < corredores.length; a++) for (let b = a + 1; b < corredores.length; b++) {
      const p = corredores[a].pos, q = corredores[b].pos, dx = q.x - p.x, dz = q.z - p.z, d = Math.hypot(dx, dz);
      if (d < 0.9 && d > 1e-4) { const m = (0.9 - d) / 2 / d; p.x -= dx * m; p.z -= dz * m; q.x += dx * m; q.z += dz * m; }
      // Embestida y bola rodante: tumban a quien tocan
      if (d < 1.1) { const A = corredores[a], B = corredores[b]; if (A.pw && A.pw.empuja) B.tropezar(0.8); if (B.pw && B.pw.empuja) A.tropezar(0.8); }
    }
    if (corriendo) {
      tCarrera += dt; tJugado += dt;
      $('tiempo').textContent = reloj(tCarrera);
      puestos();
      // Si el primer jugador ya llegó hace mucho, se acaba
      if (llegadas.some((c) => c.humano) && tCarrera - llegadas.find((c) => c.humano).tFinal > 25) terminar();
    }
    for (const r of regalos) r.oculto = Math.max(0, r.oculto - dt);
    actualizarProyectiles(corriendo ? dt : 0);
    actualizarCamaras(dt);
  }
  pintarRegalos(now / 1000);
  actualizarGotas(dt);
  if (!PARTIDA) for (const c of corredores) c.pintarEtiqueta();
  if (marcadorSucio) { pintarMarcador(); marcadorSucio = false; }
  $('ayuda').style.opacity = tJugado < 10 ? 1 : 0;
  dibujar();

  fpsN++; fpsT += dt;
  if (fpsT >= 0.5) {
    const f = $('fps'); f.style.display = verFps ? 'block' : 'none';
    if (verFps) f.textContent = `${Math.round(fpsN / fpsT)} fps · ${renderer.domElement.width}×${renderer.domElement.height} · ${renderer.info.render.calls} dibujos`;
    fpsN = 0; fpsT = 0;
    marcadorSucio = true;   // la vuelta de cada uno cambia sin que cambien los puestos
  }
  requestAnimationFrame(bucle);
}

window.__juego = {
  get estado() { return estado; }, get tiempo() { return +tCarrera.toFixed(1); }, get largo() { return Math.round(LARGO); },
  get corredores() { return corredores.map((c) => ({ n: c.perfil.nombre, h: c.humano, puesto: c.puesto, vuelta: +(c.avance / NS).toFixed(2), obj: c.objeto, fin: c.terminado })); },
  get vistas() { const f = (v) => [v.x, v.z].map((n) => +n.toFixed(1)); return vistas.map((v) => ({ quien: v.c.perfil.nombre, pos: f(v.c.pos), pista: v.c.pista, centro: f(centro[v.c.pista]), cam: f(v.cam.position), yaw: +v.yaw.toFixed(2), tang: +Math.atan2(tang[v.c.pista].x, tang[v.c.pista].z).toFixed(2) })); },
  get salida() { const f = (v) => [v.x, v.z].map((n) => +n.toFixed(1)); return { c596: f(centro[596]), c590: f(centro[590]), c0: f(centro[0]), corr: corredores.map((c) => f(c.pos)) }; },
  get mallas() { return corredores.map((c) => { let n = 0, pelo = 0; c.pj.g.traverse((o) => { if (o.isMesh) { n++; if (!o.frustumCulled) pelo++; } }); return c.perfil.animal + ":" + n + "(pelo " + pelo + ")"; }); },
  get dbg() { const c = corredores[0]; return { pista: c.pista, avance: c.avance, pos: [c.pos.x, c.pos.z], pc: puntoCercano(c.pos.x, c.pos.z, c.pista), todo: puntoCercano(c.pos.x, c.pos.z), vel: [c.vel.x, c.vel.z], estado }; },
};
empezar();
vestir(THREE, escena, { lejos: 14 });
requestAnimationFrame(bucle);
