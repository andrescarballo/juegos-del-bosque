// ¿Dónde está el conejo? — el conejo se esconde en un arbusto, un tronco, un montón de hojas o una madriguera.
// Da pistas (el escondite se mueve, caen hojitas, asoman las orejas). Acércate y mira con A. 5 rondas.
import { vestir, tenir, ESTACION, REGLA, racha } from '../comun/estaciones.js';
import * as THREE from '../lib/three.min.js';
import { pad, entradas } from '../comun/pad.js';
import { suena } from '../comun/sonido.js';
import { enTele, params, records, volverAlMenu, alPulsarAtras, escenario, vibrar } from '../comun/tv.js';
import { controlesTactiles, esTactil } from '../comun/tactil.js';
import { partida, perfilPorId, recordDe, ponerRecord, recordEquipo, ponerRecordEquipo } from '../comun/perfiles.js';
import { especialConY, especial, poder } from '../comun/especial.js';
import { crearPersonaje, animarPersonaje } from '../comun/personajes.js';
import { crearCielo, crearClaro, Escondite, TIPOS_ESCONDITE, rng } from '../comun/mundo.js';
import { FIESTA, resultadoFiesta, volverAlTablero, OPCIONES_FIESTA } from '../comun/fiesta.js';

const JUEGO = 'escondite';
const BOT = params.has('bot');
const RONDAS = FIESTA ? 3 : 5;
const RADIO = 21;
const N_ESCONDITES = 16;
const VEL = 7;
const T_MAX_RONDA = 90;           // si nadie lo encuentra, sale solo
const PROB_CAMBIA = 0.3;          // al fallar, a veces el conejo se cambia de escondite
const ARCO = ['#ff5d73', '#ff9f43', '#ffd93d', '#6bd968', '#4cc3ff', '#7b7bff', '#c17bff'];

escenario(document.getElementById('esc'));
const $ = (id) => document.getElementById(id);
const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const clamp = THREE.MathUtils.clamp;
controlesTactiles({ camara: true, botones: [{ b: 'A', txt: 'A', color: '#3dbb4c' }], pausa: true });
if (esTactil) $('ayuda').innerHTML = '<span>Dedo a la izquierda: mover · <span class="boton-a">A</span> mirar · Dedo a la derecha: cámara</span>';
const azar = rng(Date.now() & 0xffff);

// Tapa blanca para "cerrar los ojos"
const tapa = document.createElement('div');
tapa.style.cssText = 'position:fixed;inset:0;background:#fffaf2;display:grid;place-items:center;text-align:center;opacity:0;transition:opacity .4s;pointer-events:none;z-index:5';
tapa.innerHTML = '<div class="txt" style="font-size:9vmin"><div id="tapaTxt">¡Ojos cerrados!</div><div id="tapaNum" style="font-size:16vmin">3</div></div>';
document.body.appendChild(tapa);

// ---------- Render ----------
const renderer = new THREE.WebGLRenderer({ canvas: $('lienzo'), antialias: !enTele, powerPreference: 'high-performance' });
const escena = new THREE.Scene();
const camara = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.1, 600);
function ajustar() {
  const objetivo = parseInt(params.get('ancho') || (enTele ? '1280' : esTactil ? '1600' : '1920'), 10);
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, objetivo / innerWidth));
  renderer.setSize(innerWidth, innerHeight, false);
  camara.aspect = innerWidth / innerHeight;
  camara.fov = camara.aspect < 1 ? 80 : 55;
  camara.updateProjectionMatrix();
}
addEventListener('resize', ajustar);
ajustar();
escena.fog = new THREE.Fog('#dff3ff', 50, 140);
escena.add(new THREE.HemisphereLight('#e6f4ff', '#8fcf6a', 1.9));
const sol = new THREE.DirectionalLight('#fff0dc', 2.1);
sol.position.set(-30, 60, 25);
escena.add(sol);
const cielo = crearCielo(THREE, escena);

// ---------- El claro y los escondites ----------
const sitios = [];
for (let n = 0; n < 2000 && sitios.length < N_ESCONDITES; n++) {
  const a = azar() * Math.PI * 2, r = 4.5 + Math.sqrt(azar()) * (RADIO - 6.5);
  const x = Math.cos(a) * r, z = Math.sin(a) * r;
  if (sitios.some((s) => Math.hypot(s.x - x, s.z - z) < 4.6)) continue;
  sitios.push({ x, z, r: 2 });
}
const claro = crearClaro(THREE, escena, { radio: RADIO, semilla: 9, nArboles: 16, huecos: [...sitios, { x: 0, z: 0, r: 3 }] });
const escondites = sitios.map((s, i) => new Escondite(THREE, escena, TIPOS_ESCONDITE[i % TIPOS_ESCONDITE.length], s.x, s.z, azar() * Math.PI * 2));
for (const e of escondites) claro.colisiones.push({ x: e.x, z: e.z, r: e.radio * 0.8 });

// Banderines de "aquí no está"
const geoPalo = new THREE.CylinderGeometry(0.035, 0.035, 1.2, 6);
const geoBandera = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0.55, -0.17, 0), new THREE.Vector3(0, -0.34, 0)]);
geoBandera.computeVertexNormals();
let banderas = [];
function plantar(e, color) {
  if (banderas.some((b) => b.e === e)) return;
  const g = new THREE.Group();
  const palo = new THREE.Mesh(geoPalo, new THREE.MeshLambertMaterial({ color: '#ffffff' })); palo.position.y = 0.6;
  const tela = new THREE.Mesh(geoBandera, new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide })); tela.position.y = 1.2;
  g.add(palo, tela);
  g.position.set(e.x + e.radio * 0.7, e.alto * 0.4, e.z + e.radio * 0.7);
  escena.add(g);
  banderas.push({ e, g });
}
function quitarBanderas() { for (const b of banderas) escena.remove(b.g); banderas = []; }

// ---------- El conejo ----------
const conejo = crearPersonaje(THREE, { animal: 'conejo', pelo: 'natural', accesorio: 'nada' });
conejo.g.visible = false;
escena.add(conejo.g);
const salida = { t: 0, x: 0, z: 0, dx: 0, dz: 0 };
let escondido = null;     // el escondite donde está

// ---------- Hojitas y confeti (una llamada de dibujo) ----------
const N_PIEZAS = 180;
const piezas = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.2, 0.13), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }), N_PIEZAS);
piezas.frustumCulled = false;
const lista = Array.from({ length: N_PIEZAS }, (_, i) => { piezas.setColorAt(i, new THREE.Color('#fff')); return { p: new THREE.Vector3(), v: new THREE.Vector3(), r: new THREE.Euler(), w: new THREE.Vector3(), vida: 0, flota: false }; });
escena.add(piezas);
const dummy = new THREE.Object3D();
let sig = 0;
function lanzar(x, y, z, n, colores, fuerza = 1, flota = false) {
  for (let k = 0; k < n; k++) {
    const q = lista[sig];
    piezas.setColorAt(sig, new THREE.Color(colores[k % colores.length]));
    sig = (sig + 1) % N_PIEZAS;
    q.p.set(x, y, z);
    q.v.set(Math.random() - 0.5, Math.random() * 0.8 + 0.4, Math.random() - 0.5).normalize().multiplyScalar((2 + Math.random() * 3) * fuerza);
    q.w.set(Math.random() * 8, Math.random() * 8, Math.random() * 8);
    q.vida = 1.2 + Math.random() * 0.6; q.flota = flota;
  }
  piezas.instanceColor.needsUpdate = true;
}
function actualizarPiezas(dt) {
  for (let i = 0; i < N_PIEZAS; i++) {
    const q = lista[i];
    if (q.vida > 0) {
      q.vida -= dt;
      q.v.y -= (q.flota ? 2.5 : 6) * dt; q.v.multiplyScalar(Math.exp(-(q.flota ? 2 : 1.2) * dt));
      q.p.addScaledVector(q.v, dt);
      if (q.p.y < 0.05) { q.p.y = 0.05; q.v.set(0, 0, 0); }
      q.r.x += q.w.x * dt; q.r.y += q.w.y * dt; q.r.z += q.w.z * dt;
      dummy.position.copy(q.p); dummy.rotation.copy(q.r); dummy.scale.setScalar(Math.min(1, q.vida * 2));
    } else dummy.scale.setScalar(0);
    dummy.updateMatrix();
    piezas.setMatrixAt(i, dummy.matrix);
  }
  piezas.instanceMatrix.needsUpdate = true;
}

// ---------- Jugadores ----------
const datosPartida = partida.leer();
let defs = [];
if (datosPartida && datosPartida.juego === JUEGO && Array.isArray(datosPartida.jugadores)) {
  defs = datosPartida.jugadores.map((j) => ({ perfil: perfilPorId(j.perfil), dispositivo: j.dispositivo })).filter((j) => j.perfil);
}
const LIBRE = defs.length === 0;
if (LIBRE) defs = [{ perfil: { id: null, nombre: '', animal: 'zorro', pelo: 'natural', accesorio: 'nada', color: '#ff4d6d' }, dispositivo: null }];
const VARIOS = defs.length > 1;
const tmp = new THREE.Vector3();

class Jugador {
  constructor(def, i) {
    this.perfil = def.perfil; this.dispositivo = def.dispositivo; this.i = i;
    this.color = def.perfil.color || '#ff4d6d';
    this.pj = crearPersonaje(THREE, def.perfil);
    escena.add(this.pj.g);
    this.pos = new THREE.Vector3(); this.vel = new THREE.Vector3();
    this.angulo = Math.PI; this.paso = 0; this.aplasta = 0; this.espera = 0; this.puntos = 0; this.encontrados = 0;
    this.etiqueta = null;
    if (VARIOS) {
      const e = document.createElement('div');
      e.className = 'etiqueta'; e.textContent = def.perfil.nombre; e.style.setProperty('--c', this.color);
      $('flotantes').appendChild(e); this.etiqueta = e;
    }
  }
  colocar(n) { const a = (this.i / n) * Math.PI * 2; this.pos.set(Math.cos(a) * 1.5, 0, Math.sin(a) * 1.5 + 1); this.vel.set(0, 0, 0); }
  entrada() {
    if (BOT) return entradaBot(this);
    const d = this.dispositivo ? entradas.get(this.dispositivo) : pad;
    return d ? [d.lx, d.ly, d.pressed('A') || d.pressed('X')] : [0, 0, false];
  }
  actualizar(dt, lx, ly, mirar) {
    const cy = Math.cos(cam.yaw), sy = Math.sin(cam.yaw);
    const dx = lx * cy + ly * sy, dz = -lx * sy + ly * cy;
    const k = Math.min(1, dt * 10 * REGLA.agarre);   // invierno: resbala
    const pw = this.pw = poder(this.pj);   // el especial del animal: corre más, o ruge y sacude los escondites
    const w = racha();                     // otoño: rachas de viento
    this.vel.x += (dx * VEL * pw.vel + w.x - this.vel.x) * k;
    this.vel.z += (dz * VEL * pw.vel + w.z - this.vel.z) * k;
    if (pw.avance) { this.vel.x += Math.sin(this.angulo) * VEL * pw.avance; this.vel.z += Math.cos(this.angulo) * VEL * pw.avance; }
    if (pw.salto) { this.aplasta = 0.8; }
    if (pw.rugido) for (const e of escondites) if (Math.hypot(e.x - this.pos.x - Math.sin(this.angulo) * pw.lejos, e.z - this.pos.z - Math.cos(this.angulo) * pw.lejos) < pw.rugido + e.radio) { e.agitar(1); if (e === escondido) e.asomar(1.4); }
    this.pos.addScaledVector(this.vel, dt);
    claro.empujar(this.pos);
    const rapidez = Math.hypot(this.vel.x, this.vel.z);
    if (rapidez > 0.3) {
      let d = Math.atan2(this.vel.x, this.vel.z) - this.angulo;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      this.angulo += d * Math.min(1, dt * 12);
    }
    if (rapidez > 0.6) this.paso += dt * 15; else this.paso *= Math.exp(-dt * 10);
    this.aplasta = Math.max(0, this.aplasta - dt * 5);
    this.espera = Math.max(0, this.espera - dt);
    this.pj.g.position.copy(this.pos);
    this.pj.g.rotation.y = this.angulo;
    animarPersonaje(this.pj, { paso: this.paso, suelo: true, aplasta: this.aplasta, mirar: this.espera > 0.3 ? 0.5 : 0, dt });
    if (mirar && this.espera <= 0) buscar(this);
  }
  pintarEtiqueta() {
    if (!this.etiqueta) return;
    tmp.set(this.pos.x, 1.6 * this.pj.escala + 0.35, this.pos.z).project(camara);
    const ver = tmp.z < 1;
    this.etiqueta.style.display = ver ? 'block' : 'none';
    if (!ver) return;
    this.etiqueta.style.left = ((tmp.x + 1) / 2 * innerWidth) + 'px';
    this.etiqueta.style.top = ((1 - tmp.y) / 2 * innerHeight) + 'px';
  }
}
const jugadores = defs.map((d, i) => new Jugador(d, i));

/** El escondite al que está pegado el jugador (o null). */
function esconditeCerca(j) {
  let mejor = null, md = Infinity;
  for (const e of escondites) {
    const d = Math.hypot(e.x - j.pos.x, e.z - j.pos.z) - e.radio;
    if (d < 1.1 && d < md) { md = d; mejor = e; }
  }
  return mejor;
}

// ---------- Cámara (encuadra a todos; el stick derecho la gira) ----------
const cam = { yaw: 0, el: 0.85, dist: 17, mira: new THREE.Vector3(0, 1, 0) };
function actualizarCamara(dt) {
  let cx = 0, cz = 0;
  for (const j of jugadores) { cx += j.pos.x; cz += j.pos.z; }
  cx /= jugadores.length; cz /= jugadores.length;
  let lejos = 0;
  for (const j of jugadores) lejos = Math.max(lejos, Math.hypot(j.pos.x - cx, j.pos.z - cz));
  const dist = clamp(17 + lejos * 1.0, 17, 36);
  cam.dist += (dist - cam.dist) * Math.min(1, dt * 2);
  const arr = pad.arrastre();
  cam.yaw -= pad.rx * 2.2 * dt + arr.x;
  cam.el = clamp(cam.el + pad.ry * 1.2 * dt + arr.y, 0.45, 1.25);
  tmp.set(cx, 1, cz);
  cam.mira.lerp(tmp, 1 - Math.exp(-5 * dt));
  const c = Math.cos(cam.el);
  camara.position.set(cam.mira.x + Math.sin(cam.yaw) * c * cam.dist, cam.mira.y + Math.sin(cam.el) * cam.dist, cam.mira.z + Math.cos(cam.yaw) * c * cam.dist);
  camara.lookAt(cam.mira.x, cam.mira.y + 0.6, cam.mira.z);
  cielo.position.copy(camara.position);
}

// ---------- Partida ----------
let estado = 'ojos', estadoAntesPausa = 'buscando', tAntesPausa = 0, tEstado = 0;
let ronda = 1, tRonda = 0, proximaPista = 3, nuevoRecord = false;
const ids = defs.map((d) => d.perfil.id).filter(Boolean);
function leerRecord() { return LIBRE ? records.leer(JUEGO) : VARIOS ? recordEquipo(JUEGO, ids) : recordDe(ids[0], JUEGO); }
function guardarRecord(v) { if (LIBRE) records.guardar(JUEGO, v); else if (VARIOS) ponerRecordEquipo(JUEGO, ids, v); else ponerRecord(ids[0], JUEGO, v); }
let record = leerRecord();
const total = () => jugadores.reduce((s, j) => s + j.puntos, 0);

function pintarArriba() {
  $('record').firstChild.textContent = VARIOS ? `Récord juntos ${record}` : `Récord ${record}`;
  $('total').textContent = String(total());
  $('nivel').textContent = `Ronda ${Math.min(ronda, RONDAS)} de ${RONDAS}`;
}
function pintarMarcador() {
  $('marcador').innerHTML = jugadores.map((j) => `<span class="chip" style="--c:${j.color}"><i></i>${esc(j.perfil.nombre || 'Encontrados')} <b>${j.puntos}</b><span class="poder">🐰${j.encontrados}</span></span>`).join('');
}
function mensaje(html, ms = 1200) {
  const m = $('mensaje'); m.innerHTML = html; m.classList.add('ver');
  clearTimeout(mensaje.t); if (ms) mensaje.t = setTimeout(() => m.classList.remove('ver'), ms);
}
function panel(html) { const p = $('panel'); if (html) { p.innerHTML = html; p.classList.add('ver'); } else p.classList.remove('ver'); }
function cambiar(e) { estado = e; tEstado = 0; }
function flotante(txt, x, y, z, color) {
  tmp.set(x, y, z).project(camara);
  const d = document.createElement('div');
  d.className = 'mas1 txt'; d.textContent = txt;
  if (color) d.style.setProperty('--morado', color);
  d.style.left = ((tmp.x + 1) / 2 * innerWidth) + 'px'; d.style.top = ((1 - tmp.y) / 2 * innerHeight) + 'px';
  $('flotantes').appendChild(d); setTimeout(() => d.remove(), 900);
}

function intervaloPista() { const base = 2.6 + (ronda - 1) * 1.1; return base + azar() * base * 0.7; }
function esconder() {
  const antes = escondido;
  const opciones = escondites.filter((e) => e !== antes && jugadores.every((j) => Math.hypot(j.pos.x - e.x, j.pos.z - e.z) > 5));
  escondido = opciones[Math.floor(azar() * opciones.length)] || escondites[0];
}
function empezarRonda() {
  quitarBanderas();
  conejo.g.visible = false;
  esconder();
  tRonda = 0;
  proximaPista = intervaloPista();
  pintarArriba();
  cambiar('ojos');
  tapa.style.opacity = '1';
  $('tapaTxt').textContent = ronda === 1 ? '¡Ojos cerrados! El conejo se esconde…' : `Ronda ${ronda}: ¡ojos cerrados!`;
}
function empezar() {
  for (const j of jugadores) { j.puntos = 0; j.encontrados = 0; j.colocar(jugadores.length); }
  ronda = 1; nuevoRecord = false;
  panel(null);
  pintarMarcador();
  empezarRonda();
}

function pista() {
  const e = escondido;
  const r = azar();
  if (r < 0.55) { e.agitar(0.9); suena('mover'); }
  else if (r < 0.8) e.asomar(1.3);
  else { e.agitar(0.5); lanzar(e.x, e.alto, e.z, 8, e.tipo === 'hojas' ? ['#ff9f43', '#ffc93d'] : ['#6bd968', '#4cb85e'], 0.7, true); }
}

function buscar(j) {
  const e = esconditeCerca(j);
  if (!e) return;
  j.espera = 0.75;
  j.aplasta = 1;
  e.agitar(0.6);
  if (e === escondido) { encontrado(j); return; }
  suena('no');
  plantar(e, j.color);
  flotante('¡Aquí no!', e.x, e.alto + 1, e.z, VARIOS ? j.color : null);
  if (azar() < PROB_CAMBIA) {
    esconder();
    quitarBanderas();
    mensaje('¡El conejo se ha cambiado de escondite!', 1500);
  }
}

function salirConejo(e) {
  conejo.g.visible = true;
  salida.t = 0; salida.x = e.x; salida.z = e.z;
  const a = azar() * Math.PI * 2; salida.dx = Math.cos(a); salida.dz = Math.sin(a);
  lanzar(e.x, e.alto * 0.7, e.z, 16, e.tipo === 'hojas' ? ['#ff9f43', '#ffc93d', '#ff7a45'] : ['#6bd968', '#4cb85e', '#ffffff'], 1.2);
}
function encontrado(j) {
  const pts = 100 + Math.max(0, Math.round(45 - tRonda)) * 5;
  j.puntos += pts; j.encontrados++;
  especial(j.pj);
  suena('fanfarria');
  vibrar(80, j.dispositivo || undefined);
  salirConejo(escondido);
  lanzar(escondido.x, 2, escondido.z, 50, ARCO, 1.6);
  mensaje(`¡${VARIOS ? esc(j.perfil.nombre) + ' lo ha' : 'Lo has'} encontrado!<small>+${pts} · ${Math.round(tRonda)} segundos</small>`, 2400);
  pintarMarcador(); pintarArriba();
  cambiar('encontrado');
}
function nadieLoEncuentra() {
  suena('cae');
  salirConejo(escondido);
  mensaje('¡Estaba aquí!', 2000);
  cambiar('encontrado');
}
function siguiente() {
  if (ronda >= RONDAS) { terminar(); return; }
  ronda++;
  empezarRonda();
}
function terminar() {
  cambiar('fin');
  conejo.g.visible = false;
  const pts = total();
  if (pts > record) { record = pts; nuevoRecord = true; guardarRecord(record); setTimeout(() => suena('record'), 700); }
  pintarArriba();
  let tabla = '', titulo;
  if (FIESTA) resultadoFiesta('escondite', jugadores.map((j) => ({ id: j.perfil.id, valor: j.puntos })));
  if (VARIOS) {
    const max = Math.max(...jugadores.map((j) => j.puntos));
    const ganan = jugadores.filter((j) => j.puntos === max);
    titulo = max === 0 ? '¡El conejo ha ganado!' : ganan.length === 1 ? `¡Gana ${esc(ganan[0].perfil.nombre)}!` : '¡Empate!';
    tabla = `<div class="tabla">${[...jugadores].sort((a, b) => b.puntos - a.puntos).map((j) => `<span class="chip grande" style="--c:${j.color}"><i></i>${esc(j.perfil.nombre)} <b>${j.puntos}</b> 🐰${j.encontrados}</span>`).join('')}</div>`;
  } else {
    const n = jugadores[0].encontrados;
    titulo = `¡Lo encontraste ${n} ${n === 1 ? 'vez' : 'veces'}!`;
  }
  const lineaRecord = nuevoRecord ? `<p class="nuevo">¡NUEVO RÉCORD${VARIOS ? ' JUNTOS' : ''}!</p>` : `<p>${VARIOS ? 'Récord juntos' : 'Récord'}: ${record}</p>`;
  panel(`<h2>${titulo}</h2>${VARIOS ? '' : `<p>Puntos: ${pts}</p>`}${tabla}${lineaRecord}` + (FIESTA ? OPCIONES_FIESTA : `<div class="opciones"><span data-tap="A"><span class="boton-a">A</span> Otra vez</span>`
    + `<span data-tap="Y"><span class="boton-a" style="background:#ffc531">Y</span> Jugadores</span><span data-tap="B"><span class="boton-a boton-b">B</span> Menú</span></div>`));
}
function pausar(si) {
  if (si) {
    estadoAntesPausa = estado; tAntesPausa = tEstado; cambiar('pausa');
    panel(`<h2>Pausa</h2><div class="opciones"><span data-tap="A"><span class="boton-a">A</span> Seguir</span><span data-tap="B"><span class="boton-a boton-b">B</span> ${FIESTA ? 'Volver al tablero' : 'Salir al menú'}</span></div>`);
  } else { panel(null); estado = estadoAntesPausa; tEstado = tAntesPausa; }
}
const irAJugadores = () => { location.href = new URL('../jugadores/index.html#escondite', location.href).href; };
alPulsarAtras(() => { if (estado === 'pausa' || estado === 'fin') volverAlMenu(); else pausar(true); return true; });

// Piloto para pruebas: va al escondite sin bandera más cercano y mira
function entradaBot(j) {
  let mejor = null, md = Infinity;
  for (const e of escondites) {
    if (banderas.some((b) => b.e === e)) continue;
    const d = Math.hypot(e.x - j.pos.x, e.z - j.pos.z);
    if (d < md) { md = d; mejor = e; }
  }
  if (!mejor) return [0, 0, false];
  const ex = mejor.x - j.pos.x, ez = mejor.z - j.pos.z, d = Math.hypot(ex, ez);
  const cy = Math.cos(-cam.yaw), sy = Math.sin(-cam.yaw);
  const ix = ex / d, iz = ez / d;
  const cerca = d - mejor.radio < 1;
  return cerca ? [0, 0, true] : [ix * cy + iz * sy, -ix * sy + iz * cy, false];
}

// ---------- Bucle ----------
let antes = performance.now(), fpsN = 0, fpsT = 0, verFps = params.has('fps'), tJugado = 0;
function bucle(now) {
  const dt = Math.max(0, Math.min(0.05, (now - antes) / 1000));   // el primer fotograma puede llegar con tiempo negativo
  antes = now; tEstado += dt;
  pad.update(); entradas.update();
  if (estado !== 'fin' && estado !== 'pausa') especialConY(jugadores);
  if (pad.pressed('SELECT')) verFps = !verFps;

  if (estado === 'pausa') {
    if (pad.pressed('A') || pad.pressed('START')) pausar(false);
    else if (pad.pressed('B')) volverAlMenu();
  } else if (estado === 'fin') {
    if (tEstado > 1) {
      if (FIESTA) { if (pad.pressed('A') || (BOT && tEstado > 3)) volverAlTablero(); }
      else if (pad.pressed('A') || (BOT && tEstado > 3)) empezar();
      else if (pad.pressed('Y')) irAJugadores();
      else if (pad.pressed('B')) volverAlMenu();
    }
  } else if (pad.pressed('START')) pausar(true);

  if (estado === 'ojos') {
    const n = Math.max(1, 3 - Math.floor(tEstado));
    $('tapaNum').textContent = String(n);
    if (tEstado > 3) { tapa.style.opacity = '0'; cambiar('buscando'); mensaje('¡A buscar!', 900); }
  }
  if (estado === 'encontrado' && tEstado > 2.8) siguiente();

  if (estado !== 'pausa') {
    const buscando = estado === 'buscando';
    for (const j of jugadores) {
      const [lx, ly, mirar] = buscando ? j.entrada() : [0, 0, false];
      j.actualizar(dt, lx, ly, mirar && buscando);
    }
    // Que no se pisen
    for (let a = 0; a < jugadores.length; a++) for (let b = a + 1; b < jugadores.length; b++) {
      const p = jugadores[a].pos, q = jugadores[b].pos, dx = q.x - p.x, dz = q.z - p.z, d = Math.hypot(dx, dz);
      if (d < 0.95 && d > 1e-4) { const m = (0.95 - d) / 2 / d; p.x -= dx * m; p.z -= dz * m; q.x += dx * m; q.z += dz * m; }
    }
    if (buscando) {
      tRonda += dt; tJugado += dt;
      $('tiempo').textContent = String(Math.floor(tRonda));
      proximaPista -= dt;
      if (proximaPista <= 0) { pista(); proximaPista = intervaloPista(); }
      if (tRonda > T_MAX_RONDA) nadieLoEncuentra();
    }
    for (const e of escondites) e.paso(dt);
    // El conejo sale de un salto y se va dando brincos
    if (conejo.g.visible) {
      salida.t += dt;
      const t = salida.t, d = t * 3.2;
      conejo.g.position.set(salida.x + salida.dx * (1.6 + d), Math.abs(Math.sin(t * 7)) * 0.8, salida.z + salida.dz * (1.6 + d));
      conejo.g.rotation.y = Math.atan2(salida.dx, salida.dz);
      animarPersonaje(conejo, { paso: t * 14, suelo: Math.sin(t * 7) > -0.2, aplasta: 0, mirar: null, dt });
      if (t > 2.6) conejo.g.visible = false;
    }
    actualizarCamara(dt);
  }
  $('ayuda').style.opacity = tJugado < 12 ? 1 : 0;
  for (const j of jugadores) j.pintarEtiqueta();
  actualizarPiezas(dt);
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
  get estado() { return estado; }, get ronda() { return ronda; }, get tRonda() { return +tRonda.toFixed(1); }, get puntos() { return total(); },
  get escondites() { return escondites.length; }, get banderas() { return banderas.length; },
  get jugadores() { return jugadores.map((j) => ({ n: j.perfil.nombre, pts: j.puntos, enc: j.encontrados, x: +j.pos.x.toFixed(1), z: +j.pos.z.toFixed(1) })); },
  pista() { pista(); },
};
empezar();
vestir(THREE, escena, { lejos: 16 });
requestAnimationFrame(bucle);
