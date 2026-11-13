// Saltabosques — plataformas con desplazamiento lateral. Corre, salta, pisa bichos, recoge bellotas
// y llega al arco de arcoíris del final de cada mundo. De 1 a 4 jugadores en la misma pantalla.
import { vestir, tenir, tenirCielo, ESTACION, REGLA, racha } from '../comun/estaciones.js';
import * as THREE from '../lib/three.min.js';
import { pad, entradas } from '../comun/pad.js';
import { suena } from '../comun/sonido.js';
import { enTele, params, records, volverAlMenu, alPulsarAtras, escenario, vibrar } from '../comun/tv.js';
import { controlesTactiles, esTactil } from '../comun/tactil.js';
import { partida, perfilPorId, recordDe, ponerRecord, recordEquipo, ponerRecordEquipo } from '../comun/perfiles.js';
import { hayNaturaleza, adornar, ARBOLES, ABETOS, ARBUSTOS, HIERBAS, FLORES, SETITAS } from '../comun/naturaleza.js';
import { especialConY, especial, poder } from '../comun/especial.js';
import { crearPersonaje, animarPersonaje } from '../comun/personajes.js';

const JUEGO = 'bosque';
const BOT = params.has('bot');
const MUNDO_INICIAL = Math.max(1, parseInt(params.get('mundo') || '1', 10) || 1);

// ---------- Física (1 = una casilla) ----------
const G = 34, CAIDA_MAX = 22;
const ANDAR = 6, CORRER = 9.5, ACEL = 40, ACEL_AIRE = 22;
const SALTO = 15.5, SALTO_CORRIENDO = 16.5;   // ~3,7 casillas de alto
const COYOTE = 0.1, BUFFER = 0.12;
const REBOTE_PISOTON = 11, MUELLE = 24.5;
const ANCHO_J = 0.7, ALTO_J = 1.25;
const CORAZONES = 3, CORAZONES_MAX = 4, VIDAS = 3;
const BELLOTAS_VIDA = 50;
const FILAS = 15;

escenario(document.getElementById('esc'));
const $ = (id) => document.getElementById(id);
const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const clamp = THREE.MathUtils.clamp;
controlesTactiles({ camara: false, botones: [{ b: 'A', txt: 'A', color: '#3dbb4c' }, { b: 'B', txt: 'B', color: '#ff4d4d', x: 30, y: 5 }], pausa: true });
if (esTactil) $('ayuda').innerHTML = '<span>Dedo a la izquierda: mover · <span class="boton-a">A</span> saltar · <span class="boton-a boton-b">B</span> correr</span>';
function rng(seed) { return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// ---------- Trozos de nivel ----------
// 15 filas (la de arriba primero). Suelo en las dos de abajo.
//  #  tierra        T  tocón (sólido)       B  ladrillo (se rompe de un cabezazo)
//  R  colmena con bellota   H  colmena con corazón   =  tabla (se sube desde abajo)
//  m  plataforma que se mueve (varias m seguidas = una)   P  pinchos   M  muelle
//  o  bellota   E  escarabajo   C  castaña pinchuda (no se puede pisar)   A  abeja
//  S  salida    K  banderín de control   F  meta
function trozo(txt) {
  const filas = txt.trim().split('\n').map((l) => l.trim());
  if (filas.length !== FILAS) throw new Error('Un trozo de nivel tiene que tener 15 filas: ' + filas.length);
  const w = Math.max(...filas.map((f) => f.length));
  return filas.map((f) => f.padEnd(w, '.'));
}
const T = {
  inicio: trozo(`
............
............
............
............
............
............
............
............
............
............
............
............
..S.........
############
############`),
  llano: trozo(`
..........
..........
..........
..........
..........
..........
..........
..........
..........
..........
...oooo...
..........
..........
##########
##########`),
  bloques: trozo(`
..............
..............
..............
..............
..............
..............
.......o......
..............
..............
...BRBRB......
..............
..............
.........E....
##############
##############`),
  hueco: trozo(`
..........
..........
..........
..........
..........
..........
..........
..........
..........
....ooo...
..........
..........
..........
###...####
###...####`),
  huecoGrande: trozo(`
............
............
............
............
............
............
............
............
....ooo.....
............
............
............
............
###.....####
###.....####`),
  escalera: trozo(`
..............
..............
..............
..............
..............
..............
..............
......oo......
..............
.....####.....
....######....
...########...
..##########..
##############
##############`),
  plataformas: trozo(`
................
................
................
................
................
................
................
.......ooo......
......====......
................
..===......===..
................
................
##............##
##............##`),
  enemigos: trozo(`
................
................
................
................
................
................
................
................
................
................
................
................
....E....E...E..
################
################`),
  tocones: trozo(`
..............
..............
..............
..............
..............
..............
..............
..............
.......o......
..............
.......T......
...T...T..E...
...T...T......
##############
##############`),
  pinchos: trozo(`
..............
..............
..............
..............
..............
..............
..............
..............
....oooo......
..............
...======.....
..............
..............
##PPPPPPPP####
##############`),
  abejas: trozo(`
................
................
................
................
................
................
......A.........
................
...........A....
................
................
....o.o.o.o.....
................
################
################`),
  muelle: trozo(`
..............
..............
..............
..ooooo.......
..............
..======......
..............
..............
..............
..............
..............
..............
.......M......
##############
##############`),
  control: trozo(`
......
......
......
......
......
......
......
......
......
......
......
......
...K..
######
######`),
  sorpresa: trozo(`
............
............
............
............
............
............
............
............
............
....RHR.....
............
............
..........C.
############
############`),
  alto: trozo(`
..................
..................
..................
..................
..................
.......oooo.......
..................
.....BBBBBBBB.....
..................
..................
...===......===...
..................
..................
###............###
###............###`),
  movil: trozo(`
..................
..................
..................
..................
..................
..................
..................
..................
........ooo.......
..................
.......mmm........
..................
..................
###............###
###............###`),
  castanas: trozo(`
................
................
................
................
................
................
................
................
................
.....ooo........
....=====.......
................
..C.......C.....
################
################`),
  meta: trozo(`
................
................
................
................
................
................
................
................
................
................
................
................
.........F......
################
################`),
};

const MUNDOS = [
  { nombre: 'La pradera', tema: 'pradera', tiempo: 150,
    trozos: ['inicio', 'llano', 'bloques', 'hueco', 'enemigos', 'escalera', 'sorpresa', 'plataformas', 'llano', 'control', 'tocones', 'enemigos', 'muelle', 'hueco', 'castanas', 'meta'] },
  { nombre: 'El bosque', tema: 'bosque', tiempo: 170,
    trozos: ['inicio', 'enemigos', 'bloques', 'huecoGrande', 'abejas', 'tocones', 'pinchos', 'control', 'plataformas', 'sorpresa', 'alto', 'castanas', 'enemigos', 'escalera', 'meta'] },
  { nombre: 'La cueva', tema: 'cueva', tiempo: 180,
    trozos: ['inicio', 'pinchos', 'abejas', 'movil', 'control', 'alto', 'enemigos', 'huecoGrande', 'movil', 'sorpresa', 'castanas', 'plataformas', 'pinchos', 'escalera', 'meta'] },
  { nombre: 'Las nubes', tema: 'nubes', tiempo: 190,
    trozos: ['inicio', 'plataformas', 'movil', 'abejas', 'alto', 'control', 'movil', 'pinchos', 'castanas', 'plataformas', 'abejas', 'huecoGrande', 'alto', 'muelle', 'meta'] },
];

const TEMAS = {
  pradera: { cielo: ['#6cc4ff', '#ffe4f3'], niebla: '#ffe4f3', tierra: '#b7835a', hierba: '#6fd04f', colinas: ['#8fdc6a', '#7fd65a'], luz: 1.9, nubes: true },
  bosque: { cielo: ['#7fd0c0', '#f4ffe0'], niebla: '#e8f7d8', tierra: '#8f6244', hierba: '#3fb85a', colinas: ['#3f9e5a', '#56b86a'], luz: 1.7, nubes: true, arboles: true },
  cueva: { cielo: ['#2b2148', '#5a3d7a'], niebla: '#3a2c5a', tierra: '#6d5a7d', hierba: '#9b7ad8', colinas: ['#4a3a68', '#5a4878'], luz: 1.2, cristales: true },
  nubes: { cielo: ['#4fa8ff', '#ffe9c9'], niebla: '#ffe9f2', tierra: '#ffffff', hierba: '#fff3fb', colinas: ['#ffffff', '#ffeefa'], luz: 2.0, nubes: true },
};

// ---------- Render ----------
const renderer = new THREE.WebGLRenderer({ canvas: $('lienzo'), antialias: !enTele, powerPreference: 'high-performance' });
const escena = new THREE.Scene();
const camara = new THREE.PerspectiveCamera(34, innerWidth / innerHeight, 0.5, 400);
let distCam = 30;
function ajustar() {
  const objetivo = parseInt(params.get('ancho') || (enTele ? '1280' : esTactil ? '1600' : '1920'), 10);
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, objetivo / innerWidth));
  renderer.setSize(innerWidth, innerHeight, false);
  camara.aspect = innerWidth / innerHeight;
  camara.updateProjectionMatrix();
  const t = Math.tan(THREE.MathUtils.degToRad(camara.fov / 2));
  distCam = Math.max((FILAS + 1.5) / 2 / t, 18 / (t * camara.aspect));
}
addEventListener('resize', ajustar);
ajustar();
const ANCHO_VISTA = () => 2 * distCam * Math.tan(THREE.MathUtils.degToRad(camara.fov / 2)) * camara.aspect;

const hemi = new THREE.HemisphereLight('#e6f4ff', '#a6dd84', 1.9);
const sol = new THREE.DirectionalLight('#fff0dc', 2.0);
sol.position.set(-20, 40, 30);
escena.add(hemi, sol, sol.target);

const mats = new Map();
function mat(color, opts = {}) {
  const k = color + JSON.stringify(opts);
  if (!mats.has(k)) mats.set(k, new THREE.MeshLambertMaterial({ color, ...opts }));
  return mats.get(k);
}
const dummy = new THREE.Object3D();

// Texturas dibujadas (ladrillo y colmena)
function textura(dibujar) {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  dibujar(c.getContext('2d'));
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const TEX_LADRILLO = textura((x) => {
  x.fillStyle = '#e07a4f'; x.fillRect(0, 0, 64, 64);
  x.strokeStyle = '#a84a2c'; x.lineWidth = 4;
  for (const y of [2, 22, 42, 62]) { x.beginPath(); x.moveTo(0, y); x.lineTo(64, y); x.stroke(); }
  [[32, 2, 22], [12, 22, 42], [52, 22, 42], [32, 42, 62]].forEach(([px, a, b]) => { x.beginPath(); x.moveTo(px, a); x.lineTo(px, b); x.stroke(); });
});
const TEX_COLMENA = textura((x) => {
  x.fillStyle = '#ffc21a'; x.fillRect(0, 0, 64, 64);
  x.strokeStyle = '#e08a00'; x.lineWidth = 3;
  for (let r = 0; r < 4; r++) for (let q = 0; q < 4; q++) {
    const cx = 8 + q * 16 + (r % 2) * 8, cy = 8 + r * 15;
    x.beginPath();
    for (let k = 0; k < 6; k++) { const a = Math.PI / 3 * k + Math.PI / 6; x.lineTo(cx + Math.cos(a) * 7, cy + Math.sin(a) * 7); }
    x.closePath(); x.stroke();
  }
  x.strokeStyle = '#fff6c2'; x.lineWidth = 4; x.strokeRect(3, 3, 58, 58);
});
const matLadrillo = new THREE.MeshLambertMaterial({ map: TEX_LADRILLO });
const matColmena = new THREE.MeshLambertMaterial({ map: TEX_COLMENA, emissive: '#ffb000', emissiveIntensity: 0.15 });
const matUsado = mat('#a07858');

// Cielo (sigue a la cámara)
const uCieloA = { value: new THREE.Color() }, uCieloB = { value: new THREE.Color() };
const cielo = new THREE.Mesh(new THREE.PlaneGeometry(500, 200), new THREE.ShaderMaterial({
  depthWrite: false, fog: false, uniforms: { arriba: uCieloA, abajo: uCieloB },
  vertexShader: 'varying vec2 vU; void main(){ vU = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `uniform vec3 arriba; uniform vec3 abajo; varying vec2 vU;
    void main(){ gl_FragColor = vec4(mix(abajo, arriba, smoothstep(0.45, 0.75, vU.y)), 1.0);
    #include <colorspace_fragment>
    }`,
}));
cielo.renderOrder = -1;
escena.add(cielo);

// ---------- Partículas ----------
const N_PART = 240;
const partMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.16, 0.16, 0.16), new THREE.MeshBasicMaterial(), N_PART);
partMesh.frustumCulled = false;
const parts = Array.from({ length: N_PART }, (_, i) => { partMesh.setColorAt(i, new THREE.Color('#fff')); return { p: new THREE.Vector3(), v: new THREE.Vector3(), r: 0, vida: 0 }; });
escena.add(partMesh);
let sigPart = 0;
function chispas(x, y, n, color, fuerza = 5) {
  const c = new THREE.Color(color);
  for (let k = 0; k < n; k++) {
    const q = parts[sigPart];
    partMesh.setColorAt(sigPart, c);
    sigPart = (sigPart + 1) % N_PART;
    q.p.set(x, y, (Math.random() - 0.5) * 0.6);
    q.v.set(Math.random() - 0.5, Math.random() * 0.9 + 0.3, (Math.random() - 0.5) * 0.4).normalize().multiplyScalar(fuerza * (0.5 + Math.random()));
    q.r = Math.random() * 6; q.vida = 0.5 + Math.random() * 0.4;
  }
  partMesh.instanceColor.needsUpdate = true;
}
function actualizarChispas(dt) {
  for (let i = 0; i < N_PART; i++) {
    const q = parts[i];
    if (q.vida > 0) {
      q.vida -= dt; q.v.y -= 20 * dt; q.p.addScaledVector(q.v, dt); q.r += dt * 8;
      dummy.position.copy(q.p); dummy.rotation.set(q.r, q.r * 0.7, 0); dummy.scale.setScalar(Math.min(1, q.vida * 3));
    } else dummy.scale.setScalar(0);
    dummy.updateMatrix();
    partMesh.setMatrixAt(i, dummy.matrix);
  }
  partMesh.instanceMatrix.needsUpdate = true;
}

// ---------- Nivel ----------
const SOLIDOS = new Set(['#', 'T', 'B', 'R', 'H', 'U', 'P']);
let mapa = [];          // mapa[j][i], j = 0 abajo
let W = 0;
let nivelObj = null;    // todo lo que se dibuja del nivel (se borra al cambiar)
let inst = {};          // índices de instancias de bloques y bellotas
let moviles = [], enemigos = [], banderas = [], meta = null, salida = { x: 2, y: 2 };
let fondo = null;

function tile(i, j) { if (j < 0 || j >= FILAS) return '.'; if (i < 0 || i >= W) return '#'; return mapa[j][i]; }
function solido(i, j) { if (i < 0 || i >= W) return true; if (j < 0 || j >= FILAS) return false; return SOLIDOS.has(mapa[j][i]); }

function construirNivel(mundo) {
  const def = MUNDOS[(mundo - 1) % MUNDOS.length];
  const tema = TEMAS[def.tema];
  // Juntar los trozos
  const filas = Array.from({ length: FILAS }, () => '');
  for (const n of def.trozos) T[n].forEach((f, r) => { filas[r] += f; });
  W = filas[0].length;
  mapa = Array.from({ length: FILAS }, (_, j) => filas[FILAS - 1 - j].split(''));

  if (nivelObj) { escena.remove(nivelObj); nivelObj.traverse((o) => { if (o.isInstancedMesh) o.dispose(); }); }
  nivelObj = new THREE.Group();
  escena.add(nivelObj);
  moviles = []; enemigos.forEach((e) => e.quitar()); enemigos = []; banderas = []; meta = null; inst = { B: {}, R: {}, H: {}, o: {} };

  // Colores del tema
  uCieloA.value.set(tema.cielo[0]); uCieloB.value.set(tema.cielo[1]);
  tenirCielo(uCieloA.value, uCieloB.value);
  escena.fog = new THREE.Fog(tema.niebla, 45, 120);
  queueMicrotask(() => vestir(THREE, escena, { lejos: 30 }));   // cuando el nivel ya esté montado, lo viste de la estación
  hemi.intensity = tema.luz;
  const listas = { tierra: [], hierba: [], T: [], B: [], R: [], H: [], tabla: [], P: [], o: [] };
  for (let j = 0; j < FILAS; j++) for (let i = 0; i < W; i++) {
    const c = mapa[j][i];
    if (c === '#') { listas.tierra.push([i, j]); if (tile(i, j + 1) !== '#') listas.hierba.push([i, j]); }
    else if (c === 'P') { listas.tierra.push([i, j]); listas.P.push([i, j]); }
    else if (c === 'T' || c === 'B' || c === 'R' || c === 'H') listas[c].push([i, j]);
    else if (c === '=') listas.tabla.push([i, j]);
    else if (c === 'o') { listas.o.push([i, j]); mapa[j][i] = '.'; }
    else if (c === 'm') {
      let k = i; while (k < W && mapa[j][k] === 'm') { mapa[j][k] = '.'; k++; }
      moviles.push(new Movil(i, j, k - i));
    }
    else if (c === 'E' || c === 'C' || c === 'A') { enemigos.push(new Enemigo(c, i + 0.5, j, mundo)); mapa[j][i] = '.'; }
    else if (c === 'S') { salida = { x: i + 0.5, y: j }; mapa[j][i] = '.'; }
    else if (c === 'K') { banderas.push(new Bandera(i + 0.5, j)); mapa[j][i] = '.'; }
    else if (c === 'F') { meta = new Meta(i + 0.5, j); mapa[j][i] = '.'; }
    else if (c === 'M') { mapa[j][i] = 'M'; }
  }
  const caja = new THREE.BoxGeometry(1, 1, 1.4);
  const instanciar = (lista, geo, material, colocar, clave) => {
    if (!lista.length) return null;
    const m = new THREE.InstancedMesh(geo, material, lista.length);
    lista.forEach(([i, j], k) => {
      colocar(i, j); dummy.updateMatrix(); m.setMatrixAt(k, dummy.matrix);
      if (clave) inst[clave][i + ',' + j] = k;
    });
    nivelObj.add(m);
    return m;
  };
  const normal = (i, j) => { dummy.position.set(i + 0.5, j + 0.5, 0); dummy.scale.set(1, 1, 1); dummy.rotation.set(0, 0, 0); };
  instanciar(listas.tierra, caja, mat(tema.tierra), normal);
  instanciar(listas.hierba, new THREE.BoxGeometry(1.02, 0.28, 1.5), mat(tema.hierba), (i, j) => { dummy.position.set(i + 0.5, j + 0.9, 0); dummy.scale.set(1, 1, 1); dummy.rotation.set(0, 0, 0); });
  instanciar(listas.T, new THREE.CylinderGeometry(0.48, 0.5, 1, 12), mat('#9b6a43'), normal);
  inst.mB = instanciar(listas.B, caja, matLadrillo, normal, 'B');
  inst.mR = instanciar(listas.R, caja, matColmena, normal, 'R');
  inst.mH = instanciar(listas.H, caja, matColmena, normal, 'H');
  // Bloques ya usados: uno por cada colmena, escondidos hasta que se usan
  const usados = [...listas.R, ...listas.H];
  inst.U = {};
  inst.mU = instanciar(usados, caja, matUsado, (i, j) => { dummy.position.set(i + 0.5, j + 0.5, 0); dummy.scale.setScalar(0); dummy.rotation.set(0, 0, 0); }, 'U');
  instanciar(listas.tabla, new THREE.BoxGeometry(1, 0.3, 1.2), mat('#c48a5c'), (i, j) => { dummy.position.set(i + 0.5, j + 0.85, 0); dummy.scale.set(1, 1, 1); dummy.rotation.set(0, 0, 0); });
  const pinchos = listas.P.flatMap(([i, j]) => [[i + 0.2, j], [i + 0.5, j], [i + 0.8, j]]);
  instanciar(pinchos, new THREE.ConeGeometry(0.16, 0.5, 6), mat('#e8e8f0'), (x, j) => { dummy.position.set(x, j + 1.2, 0); dummy.scale.set(1, 1, 1); dummy.rotation.set(0, 0, 0); });
  // Bellotas: cuerpo y sombrero en dos instancias
  inst.mO1 = instanciar(listas.o, new THREE.SphereGeometry(0.26, 12, 10), mat('#c8864a'), (i, j) => { dummy.position.set(i + 0.5, j + 0.45, 0); dummy.scale.set(1, 1.2, 1); dummy.rotation.set(0, 0, 0); }, 'o');
  inst.mO2 = instanciar(listas.o, new THREE.SphereGeometry(0.28, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), mat('#7a4e2a'), (i, j) => { dummy.position.set(i + 0.5, j + 0.62, 0); dummy.scale.set(1, 0.8, 1); dummy.rotation.set(0, 0, 0); });
  inst.oPos = listas.o.map(([i, j]) => ({ i, j, cogida: false }));
  // Muelles
  for (let j = 0; j < FILAS; j++) for (let i = 0; i < W; i++) if (mapa[j][i] === 'M') {
    const g = new THREE.Group();
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.45, 0.2, 12), mat('#5a5a6a'));
    base.position.y = 0.1;
    const muelle = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.06, 6, 16), mat('#ff4d6d'));
    muelle.rotation.x = Math.PI / 2; muelle.position.y = 0.3;
    const tapa = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.12, 12), mat('#ff4d6d'));
    tapa.position.y = 0.48;
    g.add(base, muelle, tapa);
    g.position.set(i + 0.5, j, 0);
    g.userData = { tapa, t: 0 };
    nivelObj.add(g);
    mapa[j][i] = '.';
    inst.muelles = inst.muelles || [];
    inst.muelles.push({ i, j, g });
  }
  // Fondo con paralaje
  if (fondo) escena.remove(fondo);
  fondo = new THREE.Group();
  const a = rng(mundo * 7);
  const nCol = Math.ceil(W / 10) + 6;
  const colinas = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 18, 10), mat('#ffffff'), nCol);
  for (let k = 0; k < nCol; k++) {
    const s = 9 + a() * 9;
    dummy.position.set(-20 + k * 9 + a() * 4, -1, -26 - a() * 10); dummy.scale.set(s, 4 + a() * 7, s * 0.5); dummy.rotation.set(0, 0, 0); dummy.updateMatrix();
    colinas.setMatrixAt(k, dummy.matrix);
    colinas.setColorAt(k, new THREE.Color(tema.colinas[k % 2]));
  }
  fondo.add(colinas);
  if (!tema.cristales && (tema.arboles || def.tema === 'pradera')) {
    // El campo sigue por detrás del camino (un prado hasta las colinas) y, bajo él, tierra: antes se veía el cielo
    // por debajo del suelo y las colinas asomaban enteras, como bolas flotando
    const prado = new THREE.Mesh(new THREE.PlaneGeometry(W + 400, 70), mat(tema.colinas[1]));
    prado.rotation.x = -Math.PI / 2; prado.position.set(W / 2, 0.6, -36.2);
    const tierra = new THREE.Mesh(new THREE.PlaneGeometry(W + 400, 60), mat('#' + new THREE.Color(tema.tierra).multiplyScalar(0.72).getHexString()));
    tierra.position.set(W / 2, 0.6 - 30, -1.2);
    fondo.add(prado, tierra);
  }
  if (tema.nubes) {
    const nNub = Math.ceil(W / 14) + 4;
    const nub = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 12, 8), new THREE.MeshLambertMaterial({ color: '#fff', emissive: '#fff', emissiveIntensity: 0.5 }), nNub * 4);
    for (let n = 0; n < nNub; n++) for (let k = 0; k < 4; k++) {
      const s = 1.8 + a() * 1.6;
      dummy.position.set(-10 + n * 14 + (k - 1.5) * 2 + a(), 15 + a() * 5 + (n % 2) * 3, -30); dummy.scale.set(s * 1.3, s * 0.8, s); dummy.updateMatrix();
      nub.setMatrixAt(n * 4 + k, dummy.matrix);
    }
    fondo.add(nub);
  }
  if (hayNaturaleza && !tema.cristales && (tema.arboles || def.tema === 'pradera')) {
    // Fondo con árboles, matorrales y flores del pack (se mueve con el paralaje)
    const sitio = (z0, z1) => (r) => ({ x: -20 + r() * (W * 0.6 + 50), y: 0.6, z: z0 + r() * (z1 - z0) });   // de z0 a z1: siempre detrás del camino
    adornar(fondo, a, sitio(-6, -12), [[tema.arboles ? [...ARBOLES, ...ABETOS] : ARBOLES, Math.ceil(W / (tema.arboles ? 3 : 7)), 4, 8]], 1 / 0.7);
    adornar(fondo, a, sitio(-4.5, -8), [[ARBUSTOS, Math.ceil(W / 3), 0.9, 1.8], [FLORES, Math.ceil(W / 6), 0.5, 0.9], [HIERBAS, Math.ceil(W / 1.5), 0.4, 0.8], [SETITAS, Math.ceil(W / 8), 0.3, 0.6]]);
  } else if (tema.arboles || tema.cristales) {
    const n = Math.ceil(W / 4);
    const tronco = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.35, 0.5, 1, 7), mat(tema.cristales ? '#8f7ad8' : '#7a5236', tema.cristales ? { emissive: '#6a4ad0', emissiveIntensity: 0.4 } : {}), n);
    const copa = new THREE.InstancedMesh(tema.cristales ? new THREE.OctahedronGeometry(1, 0) : new THREE.IcosahedronGeometry(1, 1), mat(tema.cristales ? '#c9a7ff' : '#3fae5b', { flatShading: true, ...(tema.cristales ? { emissive: '#a77bff', emissiveIntensity: 0.5 } : {}) }), n);
    for (let k = 0; k < n; k++) {
      const x = k * 4 + a() * 3, h = 3 + a() * 4, z = -6 - a() * 4;
      dummy.position.set(x, tema.cristales ? 1 + h / 2 : h / 2, z); dummy.scale.set(1, h, 1); dummy.rotation.set(0, 0, 0); dummy.updateMatrix();
      tronco.setMatrixAt(k, dummy.matrix);
      dummy.position.set(x, h + 1, z); dummy.scale.setScalar(tema.cristales ? 0.9 : 1.8 + a()); dummy.rotation.set(a(), a(), a()); dummy.updateMatrix();
      copa.setMatrixAt(k, dummy.matrix);
    }
    fondo.add(tronco, copa);
  }
  escena.add(fondo);
}

function ponerInstancia(m, k, x, y, escala) {
  if (!m) return;
  dummy.position.set(x, y, 0); dummy.scale.setScalar(escala); dummy.rotation.set(0, 0, 0); dummy.updateMatrix();
  m.setMatrixAt(k, dummy.matrix);
  m.instanceMatrix.needsUpdate = true;
}

// Cabezazo a un bloque desde abajo
const golpes = [];   // bloques que botan un momento
function cabezazo(i, j, jugador) {
  const c = tile(i, j);
  if (c === 'B') {
    mapa[j][i] = '.';
    ponerInstancia(inst.mB, inst.B[i + ',' + j], 0, 0, 0);
    chispas(i + 0.5, j + 0.5, 14, '#e07a4f', 7);
    suena('romper');
    jugador.puntos += 10;
    aplastarEncima(i, j, jugador);
  } else if (c === 'R' || c === 'H') {
    mapa[j][i] = 'U';
    const clave = i + ',' + j;
    ponerInstancia(c === 'R' ? inst.mR : inst.mH, inst[c][clave], 0, 0, 0);
    golpes.push({ k: inst.U[clave], i, j, t: 0 });
    if (c === 'R') { jugador.cogerBellota(i + 0.5, j + 1.4); }
    else {
      jugador.corazones = Math.min(CORAZONES_MAX, jugador.corazones + 1);
      suena('objeto');
      flotante('❤', i + 0.5, j + 1.6, '#ff4d6d');
    }
    aplastarEncima(i, j, jugador);
    marcadorSucio = true;
  } else if (SOLIDOS.has(c)) suena('bloque');
}
function aplastarEncima(i, j, jugador) {
  for (const e of enemigos) if (e.vivo && Math.abs(e.x - (i + 0.5)) < 0.9 && Math.abs(e.y - (j + 1)) < 0.3) e.morir(jugador, true);
}
function actualizarGolpes(dt) {
  for (const g of golpes) {
    g.t += dt;
    const sube = Math.sin(Math.min(1, g.t / 0.2) * Math.PI) * 0.3;
    ponerInstancia(inst.mU, g.k, g.i + 0.5, g.j + 0.5 + sube, 1);
  }
  for (let k = golpes.length - 1; k >= 0; k--) if (golpes[k].t > 0.2) golpes.splice(k, 1);
}

// ---------- Cuerpos y choques con el mapa ----------
/** Mueve un cuerpo {x, y (pies), vx, vy, w, h} contra el mapa. Devuelve lo que ha tocado. */
function mover(c, dt, { tablas = true } = {}) {
  const r = { suelo: false, pared: 0, techo: null, plataforma: null };
  const yPrev = c.y;
  // Horizontal
  c.x += c.vx * dt;
  const y0 = Math.floor(c.y + 0.02), y1 = Math.floor(c.y + c.h - 0.02);
  if (c.vx > 0) {
    const i = Math.floor(c.x + c.w / 2);
    for (let j = y0; j <= y1; j++) if (solido(i, j)) { c.x = i - c.w / 2 - 0.001; c.vx = 0; r.pared = 1; break; }
  } else if (c.vx < 0) {
    const i = Math.floor(c.x - c.w / 2);
    for (let j = y0; j <= y1; j++) if (solido(i, j)) { c.x = i + 1 + c.w / 2 + 0.001; c.vx = 0; r.pared = -1; break; }
  }
  // Vertical
  c.y += c.vy * dt;
  const i0 = Math.floor(c.x - c.w / 2 + 0.03), i1 = Math.floor(c.x + c.w / 2 - 0.03);
  if (c.vy <= 0) {
    // Un pelín por debajo de los pies: si está justo encima del suelo también cuenta como suelo
    const j = Math.floor(c.y - 0.01);
    for (let i = i0; i <= i1; i++) {
      if (solido(i, j) || (tablas && tile(i, j) === '=' && yPrev >= j + 1 - 0.06)) { c.y = j + 1; c.vy = 0; r.suelo = true; break; }
    }
    if (!r.suelo && tablas) for (const p of moviles) {
      if (c.x + c.w / 2 > p.x0 && c.x - c.w / 2 < p.x1 && yPrev >= p.y - 0.08 && c.y <= p.y) { c.y = p.y; c.vy = 0; r.suelo = true; r.plataforma = p; break; }
    }
  } else {
    const j = Math.floor(c.y + c.h);
    let mejor = null;
    for (let i = i0; i <= i1; i++) if (solido(i, j)) { if (!mejor || Math.abs(i + 0.5 - c.x) < Math.abs(mejor + 0.5 - c.x)) mejor = i; }
    if (mejor !== null) { c.y = j - c.h - 0.001; c.vy = 0; r.techo = { i: mejor, j }; }
  }
  return r;
}

// ---------- Plataformas que se mueven ----------
class Movil {
  constructor(i, j, ancho) {
    this.ancho = ancho; this.base = i; this.y = j + 1; this.t = 0; this.dx = 0;
    this.m = new THREE.Mesh(new THREE.BoxGeometry(ancho, 0.35, 1.2), mat('#ffb347'));
    this.calc();
    nivelObj.add(this.m);
  }
  calc() {
    const x = this.base + Math.sin(this.t * 0.9) * 3;
    this.dx = x - (this.x0 ?? x);
    this.x0 = x; this.x1 = x + this.ancho;
    this.m.position.set(x + this.ancho / 2, this.y - 0.17, 0);
  }
  paso(dt) { this.t += dt; this.calc(); }
}

// ---------- Banderines y meta ----------
class Bandera {
  constructor(x, j) {
    this.x = x; this.y = j; this.activa = false;
    this.g = new THREE.Group();
    const palo = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.4, 8), mat('#ffffff'));
    palo.position.y = 1.2;
    this.tela = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.6), new THREE.MeshLambertMaterial({ color: '#b9b4c9', side: THREE.DoubleSide }));
    this.tela.position.set(0.48, 2.05, 0);
    this.g.add(palo, this.tela);
    this.g.position.set(x, j, -0.3);
    nivelObj.add(this.g);
  }
  activar() {
    if (this.activa) return;
    this.activa = true;
    this.tela.material.color.set('#3dbb4c');
    suena('bandera');
    chispas(this.x + 0.4, this.y + 2, 18, '#7dff9a', 5);
    salida = { x: this.x, y: this.y };
  }
}
class Meta {
  constructor(x, j) {
    this.x = x; this.y = j;
    this.g = new THREE.Group();
    ['#ff5d73', '#ff9f43', '#ffd93d', '#6bd968', '#4cc3ff', '#7b7bff', '#c17bff'].forEach((c, k) => {
      const a = new THREE.Mesh(new THREE.TorusGeometry(2.6 - k * 0.22, 0.12, 6, 32, Math.PI), new THREE.MeshBasicMaterial({ color: c }));
      this.g.add(a);
    });
    this.g.position.set(x, j, -0.5);
    nivelObj.add(this.g);
  }
}

// ---------- Enemigos ----------
const geoEsfera = new THREE.SphereGeometry(1, 16, 12);
function geoPinchuda() {
  const g = new THREE.IcosahedronGeometry(1, 1);
  const p = g.attributes.position;
  const v = new THREE.Vector3();
  // Los vértices originales del icosaedro salen hacia fuera como pinchos
  for (let k = 0; k < p.count; k++) {
    v.fromBufferAttribute(p, k);
    const esPunta = Math.abs(v.length() - 1) < 1e-3 && [0.5257, 0.8507, 0].some((n) => Math.abs(Math.abs(v.x) - n) < 1e-3);
    v.multiplyScalar(esPunta ? 1.45 : 0.95);
    p.setXYZ(k, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return g;
}
const GEO_CASTANA = geoPinchuda();
const ojoBlanco = new THREE.MeshBasicMaterial({ color: '#ffffff' }), ojoNegro = new THREE.MeshBasicMaterial({ color: '#2a2238' });
function ojos(g, x, y, z, s) {
  for (const k of [-1, 1]) {
    const b = new THREE.Mesh(geoEsfera, ojoBlanco); b.scale.setScalar(s); b.position.set(x + k * s * 1.2, y, z);
    const n = new THREE.Mesh(geoEsfera, ojoNegro); n.scale.setScalar(s * 0.55); n.position.set(x + k * s * 1.2, y, z + s * 0.6);
    g.add(b, n);
  }
}

class Enemigo {
  constructor(tipo, x, j, mundo) {
    this.tipo = tipo;
    this.x = x; this.y = j; this.vy = 0; this.y0 = j + 0.5;
    const rapido = 1 + Math.min(0.5, (mundo - 1) * 0.08);
    this.vel = (tipo === 'E' ? 2.0 : tipo === 'C' ? 1.4 : 1.6) * rapido;
    this.vx = -this.vel;
    this.w = tipo === 'A' ? 0.8 : 0.85; this.h = tipo === 'A' ? 0.7 : 0.8;
    this.vivo = true; this.muerto = 0; this.activo = false; this.t = Math.random() * 6;
    this.g = new THREE.Group();
    this.cuerpo = new THREE.Group();
    this.g.add(this.cuerpo);
    if (tipo === 'E') {
      const caparazon = new THREE.Mesh(new THREE.SphereGeometry(0.48, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), mat('#3a5bd9'));
      caparazon.scale.set(1, 0.9, 0.85); caparazon.position.y = 0.22;
      const raya = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.42, 0.84), mat('#1f2f80')); raya.position.y = 0.42;
      const cabeza = new THREE.Mesh(geoEsfera, mat('#2a2a4a')); cabeza.scale.setScalar(0.22); cabeza.position.set(0, 0.3, 0.42);
      this.patas = [];
      for (const k of [-1, 1]) for (const z of [-0.2, 0.15]) {
        const p = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.3, 5), mat('#2a2a4a'));
        p.position.set(k * 0.38, 0.12, z); p.rotation.z = k * 0.6; this.patas.push(p); this.cuerpo.add(p);
      }
      this.cuerpo.add(caparazon, raya, cabeza);
      ojos(this.cuerpo, 0, 0.36, 0.58, 0.07);
    } else if (tipo === 'C') {
      const bola = new THREE.Mesh(GEO_CASTANA, mat('#8a5a2b', { flatShading: true })); bola.scale.setScalar(0.38); bola.position.y = 0.42;
      const cara = new THREE.Mesh(geoEsfera, mat('#c98a4b')); cara.scale.set(0.26, 0.2, 0.12); cara.position.set(0, 0.38, 0.36);
      this.cuerpo.add(bola, cara);
      ojos(this.cuerpo, 0, 0.42, 0.45, 0.06);
      this.bola = bola;
    } else {
      const bola = new THREE.Mesh(geoEsfera, mat('#ffd23f')); bola.scale.set(0.36, 0.3, 0.3);
      const r1 = new THREE.Mesh(new THREE.TorusGeometry(0.31, 0.05, 6, 16), mat('#2a2238')); r1.rotation.y = Math.PI / 2; r1.position.x = -0.06; r1.scale.set(1, 0.95, 1.05);
      const r2 = r1.clone(); r2.position.x = -0.2; r2.scale.setScalar(0.85);
      this.alas = [];
      for (const k of [-1, 1]) {
        const a = new THREE.Mesh(new THREE.CircleGeometry(0.22, 12), new THREE.MeshBasicMaterial({ color: '#e8f6ff', transparent: true, opacity: 0.8, side: THREE.DoubleSide }));
        a.position.set(0, 0.3, k * 0.12); a.rotation.x = -Math.PI / 2; this.alas.push(a); this.cuerpo.add(a);
      }
      this.cuerpo.add(bola, r1, r2);
      ojos(this.cuerpo, 0.24, 0.08, 0.2, 0.06);
      this.cuerpo.position.y = 0.35;
    }
    this.g.position.set(x, j, 0.1);
    escena.add(this.g);
  }
  get pisable() { return this.tipo !== 'C'; }
  paso(dt, camX) {
    if (!this.activo && Math.abs(this.x - camX) < ANCHO_VISTA() / 2 + 3) this.activo = true;
    this.t += dt;
    if (!this.vivo) {
      this.muerto += dt;
      if (this.aplastado) this.cuerpo.scale.set(1.3, Math.max(0.15, 1 - this.muerto * 6), 1.3);
      else { this.vy -= G * dt; this.y += this.vy * dt; this.g.rotation.z += dt * 8; }
      this.g.position.set(this.x, this.y, 0.1);
      this.g.visible = this.muerto < (this.aplastado ? 0.5 : 2);
      return;
    }
    if (!this.activo) return;
    if (this.tipo === 'A') {
      // Vuela de lado a lado y arriba y abajo
      this.x += this.vx * dt;
      if (Math.abs(this.x - this.xBase()) > 3 || solido(Math.floor(this.x + Math.sign(this.vx) * 0.5), Math.floor(this.y))) this.vx = -this.vx;
      this.y = this.y0 + Math.sin(this.t * 2.2) * 1.2 - 0.35;
      for (const a of this.alas) a.rotation.z = Math.sin(this.t * 40) * 0.5;
    } else {
      this.vy = Math.max(-CAIDA_MAX, this.vy - G * dt);
      const r = mover(this, dt);
      if (r.pared) this.vx = r.pared > 0 ? -this.vel : this.vel;
      else if (this.vx === 0) this.vx = -this.vel;
      // La castaña no se tira por los bordes
      if (this.tipo === 'C' && r.suelo) {
        const delante = Math.floor(this.x + Math.sign(this.vx) * 0.5);
        if (!solido(delante, Math.floor(this.y) - 1) && tile(delante, Math.floor(this.y) - 1) !== '=') this.vx = -this.vx;
      }
      if (this.y < -4) { this.vivo = false; this.muerto = 5; }
      if (this.patas) this.patas.forEach((p, k) => { p.rotation.x = Math.sin(this.t * 14 + k * 1.6) * 0.5; });
      if (this.bola) this.bola.rotation.z -= this.vx * dt / 0.38;
    }
    if (this.xb === undefined) this.xb = this.x;
    this.g.position.set(this.x, this.y, 0.1);
    this.g.rotation.y = this.vx > 0 ? Math.PI / 2 : -Math.PI / 2;
    if (this.tipo === 'A') this.g.rotation.y = this.vx > 0 ? 0 : Math.PI;
  }
  xBase() { if (this.xb === undefined) this.xb = this.x; return this.xb; }
  morir(j, porDebajo = false) {
    if (!this.vivo) return;
    this.vivo = false; this.muerto = 0;
    this.aplastado = !porDebajo && this.tipo !== 'A';
    if (!this.aplastado) this.vy = 8;
    if (j) { j.puntos += 100; flotante('+100', this.x, this.y + 1.2, VARIOS ? j.color : null); marcadorSucio = true; }
    suena('pisoton');
    chispas(this.x, this.y + 0.4, 10, this.tipo === 'A' ? '#ffd23f' : '#3a5bd9', 4);
  }
  quitar() { escena.remove(this.g); }
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
let marcadorSucio = true;

class Jugador {
  constructor(def, i) {
    this.perfil = def.perfil; this.dispositivo = def.dispositivo; this.i = i;
    this.color = def.perfil.color || '#ff4d6d';
    this.pj = crearPersonaje(THREE, def.perfil);
    this.pj.g.scale.multiplyScalar(0.95);
    escena.add(this.pj.g);
    this.w = ANCHO_J; this.h = ALTO_J;
    this.etiqueta = null;
    if (VARIOS) {
      const e = document.createElement('div');
      e.className = 'etiqueta'; e.textContent = def.perfil.nombre; e.style.setProperty('--c', this.color);
      $('flotantes').appendChild(e); this.etiqueta = e;
    }
    this.reiniciarPartida();
  }
  reiniciarPartida() { this.puntos = 0; this.vidas = VIDAS; this.bellotas = 0; this.corazones = CORAZONES; this.fuera = false; }
  aparecer(x, y) {
    this.x = x; this.y = y; this.vx = 0; this.vy = 0;
    this.suelo = false; this.coyote = 0; this.buffer = 0; this.saltando = false;
    this.mira = 1; this.giro = 1.2; this.paso = 0; this.aplasta = 0;
    this.invencible = 1.5;
    this.pj.g.visible = !this.fuera;
  }
  entrada() {
    if (BOT) return entradaBot(this);
    const d = this.dispositivo ? entradas.get(this.dispositivo) : pad;
    if (!d) return { lx: 0, salto: false, mantiene: false, correr: false };
    return { lx: d.lx, salto: d.pressed('A'), mantiene: d.down('A'), correr: d.down('B') || d.down('X') || d.down('RT') };
  }
  cogerBellota(x, y) {
    this.bellotas++; this.puntos += 10;
    suena('bellota');
    chispas(x, y, 6, '#c8864a', 3);
    if (this.bellotas % BELLOTAS_VIDA === 0) { this.vidas++; suena('objeto'); flotante('+1 vida', this.x, this.y + 2, this.color); }
    marcadorSucio = true;
  }
  actualizar(dt, e, activo) {
    if (this.fuera || this.cayendo) return;
    const lx = activo ? e.lx : 0;
    const pw = this.pw = poder(this.pj);   // el especial del animal
    const max = (e.correr ? CORRER : ANDAR) * pw.vel;
    const acel = (this.suelo ? ACEL : ACEL_AIRE) * (this.suelo ? REGLA.agarre : 1);   // invierno: resbala
    const objetivo = (Math.abs(lx) > 0.15 ? Math.sign(lx) * Math.min(1, Math.abs(lx) * 1.25) * max : 0) + racha().x;   // otoño: viento
    if (this.vx < objetivo) this.vx = Math.min(objetivo, this.vx + acel * dt);
    else if (this.vx > objetivo) this.vx = Math.max(objetivo, this.vx - acel * dt * (objetivo === 0 && this.suelo ? 1.4 : 1));
    if (Math.abs(lx) > 0.15) this.mira = Math.sign(lx);

    if (activo && e.salto) this.buffer = BUFFER; else this.buffer = Math.max(0, this.buffer - dt);
    this.coyote = this.suelo ? COYOTE : Math.max(0, this.coyote - dt);
    if (this.buffer > 0 && this.coyote > 0) {
      this.vy = (Math.abs(this.vx) > ANDAR + 0.5 ? SALTO_CORRIENDO : SALTO) * (1 + (REGLA.salto - 1) * 0.5);   // primavera: algo más de salto
      this.suelo = false; this.coyote = 0; this.buffer = 0; this.saltando = true;
      suena('salto');
    }
    if (pw.salto && !this.cayendo) {
      // la altura crece con el cuadrado de la velocidad: se suaviza para que el conejo o la oveja no se salgan del nivel
      this.vy = SALTO_CORRIENDO * Math.pow(pw.salto, 0.6); this.suelo = false; this.coyote = 0; this.saltando = false;
      if (pw.avance) this.vx = this.mira * CORRER * (1 + 0.5 * pw.avance);
    }
    if (pw.rugido) for (const en of enemigos) if (en.vivo && Math.hypot(en.x - this.x - this.mira * pw.lejos, en.y - this.y) < pw.rugido) en.morir(this, true);
    // Salto corto si se suelta A pronto
    if (this.saltando && !e.mantiene && this.vy > 5) this.vy = 5;
    if (this.vy <= 0) this.saltando = false;
    this.vy = Math.max(-CAIDA_MAX * (pw.grav < 1 ? 0.35 : 1), this.vy - G * dt * (this.vy < 0 ? pw.grav : 1));   // el búho planea

    const antesSuelo = this.suelo;
    const pasos = Math.max(1, Math.ceil(dt / 0.012));
    let r = null;
    for (let k = 0; k < pasos; k++) {
      r = mover(this, dt / pasos);
      if (r.plataforma) this.x += r.plataforma.dx / pasos;
      if (r.techo) { cabezazo(r.techo.i, r.techo.j, this); break; }
    }
    this.suelo = r.suelo;
    if (this.suelo && !antesSuelo) { this.aplasta = 1; }
    // Pinchos y muelles bajo los pies
    if (this.suelo) {
      const jb = Math.round(this.y) - 1;
      const pies = [Math.floor(this.x - this.w / 2 + 0.05), Math.floor(this.x), Math.floor(this.x + this.w / 2 - 0.05)];
      if (pies.some((i) => tile(i, jb) === 'P') && !pw.invulnerable) { this.herir(); this.vy = 12; this.suelo = false; }
      for (const m of inst.muelles || []) {
        if (Math.abs(this.x - (m.i + 0.5)) < 0.65 && Math.abs(this.y - m.j) < 0.6) {
          this.vy = MUELLE; this.suelo = false; this.saltando = false; m.g.userData.t = 0.25; suena('muelle');
        }
      }
    }
    // Bellotas
    for (const o of inst.oPos || []) {
      if (o.cogida) continue;
      if (Math.abs(this.x - (o.i + 0.5)) < 0.7 && this.y < o.j + 1 && this.y + this.h > o.j) {
        o.cogida = true;
        const k = inst.o[o.i + ',' + o.j];
        ponerInstancia(inst.mO1, k, 0, 0, 0); ponerInstancia(inst.mO2, k, 0, 0, 0);
        this.cogerBellota(o.i + 0.5, o.j + 0.5);
      }
    }
    for (const b of banderas) if (!b.activa && Math.abs(this.x - b.x) < 0.8) b.activar();
    if (meta && this.x > meta.x - 0.5 && estado === 'jugando') llegarMeta(this);
    if (this.y < -3) this.caer();

    this.invencible = Math.max(0, this.invencible - dt);
  }
  pintar(dt) {
    if (this.fuera) { this.pj.g.visible = false; return; }
    const rapidez = Math.abs(this.vx);
    this.giro += (this.mira * 1.15 - this.giro) * Math.min(1, dt * 14);
    if (this.suelo && rapidez > 0.5) this.paso += dt * (6 + rapidez * 1.4); else this.paso *= Math.exp(-dt * 10);
    this.aplasta = Math.max(0, this.aplasta - dt * 5);
    this.pj.g.position.set(this.x, this.y, 0.2);
    this.pj.g.rotation.y = this.giro;
    animarPersonaje(this.pj, { paso: this.paso, suelo: this.suelo, aplasta: this.aplasta, mirar: this.vy > 2 ? -0.4 : 0, dt });
    this.pj.g.visible = this.invencible <= 0 || Math.floor(this.invencible * 10) % 2 === 0;
    if (this.etiqueta) {
      tmp.set(this.x, this.y + 2.1, 0.2).project(camara);
      this.etiqueta.style.display = this.pj.g.visible || this.invencible > 0 ? 'block' : 'none';
      this.etiqueta.style.left = ((tmp.x + 1) / 2 * innerWidth) + 'px';
      this.etiqueta.style.top = ((1 - tmp.y) / 2 * innerHeight) + 'px';
    }
  }
  herir() {
    if (this.invencible > 0 || this.fuera) return;
    this.corazones--;
    marcadorSucio = true;
    if (this.corazones <= 0) { this.perderVida(); return; }
    this.invencible = 2;
    this.vy = 9; this.vx = -this.mira * 6; this.suelo = false;
    suena('golpe');
    vibrar(250, this.dispositivo || undefined);
  }
  caer() { this.corazones = 0; this.perderVida(); }
  perderVida() {
    suena('golpe');
    vibrar(400, this.dispositivo || undefined);
    chispas(this.x, Math.max(0.5, this.y + 0.6), 20, this.color, 6);
    this.vidas--;
    this.corazones = CORAZONES;
    marcadorSucio = true;
    if (this.vidas <= 0) {
      this.fuera = true;
      this.pj.g.visible = false;
      if (this.etiqueta) this.etiqueta.style.display = 'none';
      if (VARIOS && vivos().length) mensaje(`¡${esc(this.perfil.nombre)} está fuera!<small>Vuelve en el siguiente mundo</small>`, 1600);
      if (!vivos().length) terminar();
      return;
    }
    reaparecer(this);
  }
}
const jugadores = defs.map((d, i) => new Jugador(d, i));
const vivos = () => jugadores.filter((j) => !j.fuera);

/** Vuelve a salir: solo, en el último banderín; con más gente, junto a los demás. */
function reaparecer(j) {
  const otros = vivos().filter((o) => o !== j && o.suelo && !o.cayendo);
  if (VARIOS && otros.length) {
    const o = otros[0];
    j.aparecer(o.x, o.y + 3);
  } else {
    j.aparecer(salida.x, salida.y);
    if (!VARIOS) { cam.x = Math.max(cam.minX(), salida.x); }
  }
  j.invencible = 2.5;
}

// ---------- Cámara ----------
const cam = {
  x: 0,
  minX() { return ANCHO_VISTA() / 2; },
  maxX() { return W - ANCHO_VISTA() / 2; },
};
function actualizarCamara(dt) {
  const v = vivos();
  if (v.length) {
    let mn = Infinity, mx = -Infinity, s = 0;
    for (const j of v) { mn = Math.min(mn, j.x); mx = Math.max(mx, j.x); s += j.x; }
    let obj = VARIOS ? (mn + mx) / 2 : s / v.length + 2;
    obj = clamp(obj, cam.minX(), Math.max(cam.minX(), cam.maxX()));
    cam.x += (obj - cam.x) * Math.min(1, dt * 5);
    // Nadie se sale de la pantalla
    const medio = ANCHO_VISTA() / 2 - 0.6;
    for (const j of v) {
      if (j.x < cam.x - medio) { j.x = cam.x - medio; if (j.vx < 0) j.vx = 0; }
      if (j.x > cam.x + medio) { j.x = cam.x + medio; if (j.vx > 0) j.vx = 0; }
    }
  }
  const cy = FILAS / 2 + 0.4;
  camara.position.set(cam.x, cy, distCam);
  camara.lookAt(cam.x, cy, 0);
  cielo.position.set(cam.x, 20, -80);
  if (fondo) fondo.position.x = cam.x * 0.55;
  sol.position.set(cam.x - 20, 40, 30); sol.target.position.set(cam.x, 0, 0);
}

// ---------- Partida ----------
let estado = 'intro', estadoAntesPausa = 'jugando', tAntesPausa = 0, tEstado = 0;
let mundo = MUNDO_INICIAL, tiempo = 150, ultimoSegundo = -1, nuevoRecord = false;
const ids = defs.map((d) => d.perfil.id).filter(Boolean);
function leerRecord() { return LIBRE ? records.leer(JUEGO) : VARIOS ? recordEquipo(JUEGO, ids) : recordDe(ids[0], JUEGO); }
function guardarRecord(v) { if (LIBRE) records.guardar(JUEGO, v); else if (VARIOS) ponerRecordEquipo(JUEGO, ids, v); else ponerRecord(ids[0], JUEGO, v); }
let record = leerRecord();
const total = () => jugadores.reduce((s, j) => s + j.puntos, 0);
const vuelta = () => Math.floor((mundo - 1) / MUNDOS.length);
const nombreMundo = () => MUNDOS[(mundo - 1) % MUNDOS.length].nombre + (vuelta() ? ` (vuelta ${vuelta() + 1})` : '');

function pintarArriba() {
  $('record').firstChild.textContent = VARIOS ? `Récord juntos ${record}` : `Récord ${record}`;
  $('total').textContent = String(total());
  $('nivel').textContent = `Mundo ${mundo} · ${nombreMundo()}`;
}
function pintarTiempo() {
  const s = Math.max(0, Math.ceil(tiempo));
  $('tiempo').textContent = String(s);
  $('tiempo').classList.toggle('prisa', s <= 20 && estado === 'jugando');
}
function pintarMarcador() {
  $('marcador').innerHTML = jugadores.map((j) => {
    const corazones = j.fuera ? 'fuera' : '❤'.repeat(Math.max(0, j.corazones));
    return `<span class="chip${j.fuera ? ' fuera' : ''}" style="--c:${j.color}"><i></i>${esc(j.perfil.nombre || 'Puntos')} <b>${j.puntos}</b>`
      + `<span class="vidas">${corazones}</span><span class="poder">×${j.vidas} · 🌰${j.bellotas}</span></span>`;
  }).join('');
}
function mensaje(html, ms = 1200) {
  const m = $('mensaje');
  m.innerHTML = html; m.classList.add('ver');
  clearTimeout(mensaje.t);
  if (ms) mensaje.t = setTimeout(() => m.classList.remove('ver'), ms);
}
function panel(html) { const p = $('panel'); if (html) { p.innerHTML = html; p.classList.add('ver'); } else p.classList.remove('ver'); }
function cambiar(e) { estado = e; tEstado = 0; }
function flotante(txt, x, y, color) {
  tmp.set(x, y, 0).project(camara);
  const d = document.createElement('div');
  d.className = 'mas1 txt'; d.textContent = txt;
  if (color) d.style.setProperty('--morado', color);
  d.style.left = ((tmp.x + 1) / 2 * innerWidth) + 'px';
  d.style.top = ((1 - tmp.y) / 2 * innerHeight) + 'px';
  $('flotantes').appendChild(d);
  setTimeout(() => d.remove(), 900);
}

function cargarMundo(n, { repetir = false } = {}) {
  mundo = n;
  construirNivel(n);
  tiempo = MUNDOS[(n - 1) % MUNDOS.length].tiempo;
  ultimoSegundo = -1;
  cam.x = cam.minX();
  jugadores.forEach((j, k) => { j.cayendo = false; j.aparecer(salida.x + k * 1.1, salida.y); j.invencible = 0; });
  pintarArriba(); pintarTiempo(); marcadorSucio = true;
  cambiar('intro');
  mensaje(repetir ? `¡Otra vez!<small>${nombreMundo()}</small>` : `Mundo ${n}<small>${nombreMundo()}</small>`, 1700);
}
function empezar() {
  jugadores.forEach((j) => j.reiniciarPartida());
  nuevoRecord = false;
  panel(null);
  cargarMundo(MUNDO_INICIAL);
}
function llegarMeta(j) {
  cambiar('meta');
  for (const o of jugadores) if (!o.fuera) especial(o.pj);
  const extra = Math.ceil(tiempo) * 5;
  for (const o of vivos()) o.puntos += extra;
  j.puntos += 500;
  suena('fanfarria');
  chispas(meta.x, meta.y + 2.5, 60, '#ffd93d', 8);
  mensaje(`¡${VARIOS ? esc(j.perfil.nombre) + ' llega a' : 'Llegaste a'} la meta!<small>+${extra} por el tiempo${VARIOS ? ' cada uno' : ''}</small>`, 2600);
  marcadorSucio = true;
}
function siguienteMundo() {
  // Los que se quedaron fuera vuelven con una vida
  for (const j of jugadores) if (j.fuera) { j.fuera = false; j.vidas = 1; j.corazones = CORAZONES; }
  cargarMundo(mundo + 1);
}
function seAcaboElTiempo() {
  cambiar('tiempo');
  mensaje('¡Se acabó el tiempo!', 1800);
  suena('golpe');
  for (const j of vivos()) { j.vidas--; j.corazones = CORAZONES; if (j.vidas <= 0) j.fuera = true; }
  marcadorSucio = true;
}
const OPCIONES_FIN = `<div class="opciones"><span data-tap="A"><span class="boton-a">A</span> Otra vez</span>`
  + `<span data-tap="Y"><span class="boton-a" style="background:#ffc531">Y</span> Jugadores</span>`
  + `<span data-tap="B"><span class="boton-a boton-b">B</span> Menú</span></div>`;
function terminar() {
  cambiar('fin');
  suena('cae'); vibrar(300);
  const pts = total();
  if (pts > record) { record = pts; nuevoRecord = true; guardarRecord(record); setTimeout(() => suena('record'), 800); }
  pintarArriba();
  let tabla = '';
  if (VARIOS) {
    const max = Math.max(...jugadores.map((j) => j.puntos));
    const unico = jugadores.filter((j) => j.puntos === max).length === 1;
    tabla = `<div class="tabla">${jugadores.map((j) => `<span class="chip grande" style="--c:${j.color}"><i></i>${esc(j.perfil.nombre)} <b>${j.puntos}</b>${unico && j.puntos === max ? ' 👑' : ''}</span>`).join('')}</div>`;
  }
  const lineaRecord = nuevoRecord ? `<p class="nuevo">¡NUEVO RÉCORD${VARIOS ? ' JUNTOS' : ''}!</p>` : `<p>${VARIOS ? 'Récord juntos' : 'Récord'}: ${record}</p>`;
  setTimeout(() => { if (estado === 'fin') panel(`<h2>¡Llegaste al mundo ${mundo}!</h2><p>${VARIOS ? 'Entre todos' : 'Puntos'}: ${pts}</p>${tabla}${lineaRecord}${OPCIONES_FIN}`); }, 700);
}
function pausar(si) {
  if (si) {
    estadoAntesPausa = estado; tAntesPausa = tEstado;
    cambiar('pausa');
    panel(`<h2>Pausa</h2><div class="opciones"><span data-tap="A"><span class="boton-a">A</span> Seguir</span><span data-tap="B"><span class="boton-a boton-b">B</span> Salir al menú</span></div>`);
  } else { panel(null); estado = estadoAntesPausa; tEstado = tAntesPausa; }
}

// Choques jugador-enemigo
function choques() {
  for (const j of vivos()) {
    if (j.cayendo) continue;
    for (const e of enemigos) {
      if (!e.vivo || !e.activo) continue;
      const ex0 = e.x - e.w / 2, ex1 = e.x + e.w / 2, ey0 = e.y, ey1 = e.y + e.h;
      if (j.x + j.w / 2 < ex0 || j.x - j.w / 2 > ex1 || j.y + j.h < ey0 || j.y > ey1) continue;
      const desdeArriba = j.vy < 0 && j.y > ey0 + e.h * 0.45;
      if (desdeArriba && e.pisable) {
        e.morir(j);
        j.vy = j.entradaUltima && j.entradaUltima.mantiene ? REBOTE_PISOTON + 4 : REBOTE_PISOTON;
        j.y = ey1;
      } else if (j.pw && (j.pw.empuja || j.pw.invulnerable)) e.morir(j, true);   // embestida o bola: se lo lleva por delante
      else j.herir();
    }
  }
}

// Piloto automático para pruebas (?bot=1): corre a la derecha y salta huecos, paredes y bichos
function entradaBot(j) {
  const dir = 1;
  const delante = Math.floor(j.x + dir * 1.2), pie = Math.round(j.y) - 1;
  let saltar = false;
  if (solido(delante, Math.round(j.y)) || solido(delante, Math.round(j.y) + 1)) saltar = true;
  if (!solido(delante, pie) && tile(delante, pie) !== '=' && !solido(delante + 1, pie)) saltar = true;
  for (const e of enemigos) if (e.vivo && e.activo && e.x > j.x && e.x - j.x < 2.6 && Math.abs(e.y - j.y) < 1.5) saltar = true;
  for (const m of inst.muelles || []) if (m.i + 0.5 > j.x && m.i + 0.5 - j.x < 1.2) saltar = false;
  return { lx: dir, salto: saltar && j.suelo, mantiene: true, correr: true };
}

alPulsarAtras(() => {
  if (estado === 'pausa' || estado === 'fin') volverAlMenu();
  else pausar(true);
  return true;
});
const irAJugadores = () => { location.href = new URL('../jugadores/index.html#bosque', location.href).href; };

// ---------- Bucle ----------
let antes = performance.now(), fpsN = 0, fpsT = 0, verFps = params.has('fps');
let tJugado = 0;
function bucle(now) {
  const dt = Math.max(0, Math.min(0.05, (now - antes) / 1000));   // el primer fotograma puede llegar con tiempo negativo
  antes = now;
  tEstado += dt;
  pad.update(); entradas.update();
  if (estado !== 'fin' && estado !== 'pausa') especialConY(jugadores.filter((j) => !j.fuera));
  if (pad.pressed('SELECT')) verFps = !verFps;

  if (estado === 'pausa') {
    if (pad.pressed('A') || pad.pressed('START')) pausar(false);
    else if (pad.pressed('B')) volverAlMenu();
  } else if (estado === 'fin') {
    if (tEstado > 1.2) {
      if (pad.pressed('A') || (BOT && tEstado > 3)) empezar();
      else if (pad.pressed('Y')) irAJugadores();
      else if (pad.pressed('B')) volverAlMenu();
    }
  } else if (pad.pressed('START')) pausar(true);

  if (estado === 'intro' && tEstado > 1.6) { cambiar('jugando'); mensaje('¡Ya!', 600); }
  if (estado === 'meta' && tEstado > 3) siguienteMundo();
  if (estado === 'tiempo' && tEstado > 2.2) { if (vivos().length) cargarMundo(mundo, { repetir: true }); else terminar(); }

  if (estado !== 'pausa') {
    const jugando = estado === 'jugando';
    for (const m of moviles) m.paso(jugando ? dt : 0);
    for (const j of jugadores) {
      const e = jugando ? j.entrada() : { lx: estado === 'meta' ? 0.6 : 0, salto: false, mantiene: false, correr: false };
      j.entradaUltima = e;
      j.actualizar(dt, e, jugando || estado === 'meta');
    }
    for (const e of enemigos) e.paso(jugando ? dt : 0, cam.x);
    if (jugando) {
      choques();
      tiempo -= dt; tJugado += dt;
      const s = Math.ceil(tiempo);
      if (s !== ultimoSegundo) { ultimoSegundo = s; pintarTiempo(); if (s <= 10 && s > 0) suena('tictac'); }
      if (tiempo <= 0) seAcaboElTiempo();
    }
    for (const m of inst.muelles || []) {
      const u = m.g.userData; u.t = Math.max(0, u.t - dt);
      u.tapa.position.y = 0.48 + Math.sin((u.t / 0.25) * Math.PI) * 0.35;
    }
    actualizarGolpes(dt);
    for (const j of jugadores) j.pintar(dt);
    // Bellotas giran
    if (inst.mO1) { inst.mO1.rotation.y = 0; }
    actualizarCamara(dt);
  }
  $('ayuda').style.opacity = tJugado < 10 ? 1 : 0;
  if (marcadorSucio) { pintarMarcador(); pintarArriba(); marcadorSucio = false; }
  actualizarChispas(dt);
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
  get estado() { return estado; }, get mundo() { return mundo; }, get puntos() { return total(); }, get tiempo() { return +tiempo.toFixed(1); },
  get ancho() { return W; }, get camX() { return +cam.x.toFixed(1); },
  get jugadores() { return jugadores.map((j) => ({ n: j.perfil.nombre, x: +j.x.toFixed(1), y: +j.y.toFixed(1), suelo: j.suelo, pata: +(j.pj.patas[0]?.rotation.x || 0).toFixed(2), vidas: j.vidas, cor: j.corazones, bell: j.bellotas, pts: j.puntos, fuera: j.fuera })); },
  irA(x) { const j = jugadores[0]; j.x = x; j.y = 12; j.vy = 0; cam.x = clamp(x, cam.minX(), cam.maxX()); },
};
empezar();
vestir(THREE, escena, { lejos: 30 });
requestAnimationFrame(bucle);
