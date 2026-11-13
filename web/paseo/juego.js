// De paseo — un mundo que no se acaba: colinas, bosques, ríos para cruzar a nado, manzanos
// (salta a su lado y caen manzanas para comer) y setas que hacen saltar muy alto. No hay que ganar nada.
// El mundo se genera a trozos alrededor de los jugadores y siempre sale igual (misma semilla).
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
import { hayNaturaleza, PACK, materialDe, unoDe, DENSIDAD, ARBOLES, ABETOS, ROCAS, PEDRUSCOS, ARBUSTOS, HIERBAS, FLORES as FLORES_PACK, SETITAS } from '../comun/naturaleza.js';

const BOT = params.has('bot');
const SEMILLA = parseInt(params.get('semilla') || '7', 10);
const CH = 32;              // lado de cada trozo de mundo
const SEG = 16;             // cuadritos del suelo por trozo
const RADIO = enTele ? 2 : 3;   // trozos que se ven alrededor
const AGUA = -0.4;          // altura del agua
const VEL = 6.5, VEL_AGUA = 3.2, SALTO = 9, SALTO_SETA = 17, G = 24;
const CORREA = 16;          // lo más que se puede separar un jugador del grupo

escenario(document.getElementById('esc'));
const $ = (id) => document.getElementById(id);
const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const clamp = THREE.MathUtils.clamp;
controlesTactiles({ camara: true, botones: [{ b: 'A', txt: 'A', color: '#3dbb4c' }], pausa: true });
if (esTactil) $('ayuda').innerHTML = '<span>Dedo a la izquierda: andar · a la derecha: mirar · <span class="boton-a">A</span> saltar</span>';

// ---------- Render ----------
const renderer = new THREE.WebGLRenderer({ canvas: $('lienzo'), antialias: !enTele, powerPreference: 'high-performance' });
const escena = new THREE.Scene();
const camara = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.2, 700);
function ajustar() {
  const objetivo = parseInt(params.get('ancho') || (enTele ? '1180' : esTactil ? '1600' : '1920'), 10);
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, objetivo / innerWidth));
  renderer.setSize(innerWidth, innerHeight, false);
  camara.aspect = innerWidth / innerHeight;
  camara.fov = camara.aspect < 1 ? 80 : 55;
  camara.updateProjectionMatrix();
}
addEventListener('resize', ajustar);
ajustar();
const NIEBLA = (RADIO + 0.3) * CH;
escena.fog = new THREE.Fog('#dff3ff', NIEBLA * 0.45, NIEBLA);
escena.add(new THREE.HemisphereLight('#e6f4ff', '#8fcf6a', 1.9));
const sol = new THREE.DirectionalLight('#fff0dc', 2.1);
sol.position.set(-30, 60, 25);
escena.add(sol);
const cielo = crearCielo(THREE, escena);
const dummy = new THREE.Object3D();
const tmp = new THREE.Vector3();

// ---------- El terreno: una función de altura que vale para cualquier punto del mundo ----------
function hash(x, z) {
  let h = (Math.imul(x, 374761393) + Math.imul(z, 668265263) + Math.imul(SEMILLA, 1442695041)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function ruido(x, z) {
  const xi = Math.floor(x), zi = Math.floor(z), fx = x - xi, fz = z - zi;
  const u = fx * fx * (3 - 2 * fx), v = fz * fz * (3 - 2 * fz);
  const a = hash(xi, zi), b = hash(xi + 1, zi), c = hash(xi, zi + 1), d = hash(xi + 1, zi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
const fbm = (x, z) => ruido(x, z) * 0.6 + ruido(x * 2.1 + 5.3, z * 2.1 - 1.7) * 0.28 + ruido(x * 4.3 - 3, z * 4.3 + 8) * 0.12;
const suave = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
/** Cuánto río hay en (x, z): 1 en el centro del cauce, 0 lejos. Los ríos son las curvas donde el ruido vale 0,5. */
function rio(x, z) { return suave(0.085, 0.045, Math.abs(fbm(x / 110 + 40, z / 110 - 17) - 0.5)); }
function altura(x, z) {
  const base = 0.6 + fbm(x / 50, z / 50) * 4.8 + (ruido(x / 9, z / 9) - 0.5) * 0.7;
  const r = rio(x, z);
  return base + (-1.4 - base) * r;
}
function normal(x, z, out) {
  const e = 0.5;
  return out.set(altura(x - e, z) - altura(x + e, z), 2 * e, altura(x, z - e) - altura(x, z + e)).normalize();
}

// ---------- Piezas compartidas ----------
const GEO = {
  tronco: new THREE.CylinderGeometry(0.22, 0.34, 1, 7),
  copa: new THREE.IcosahedronGeometry(1, 1),
  pino: new THREE.ConeGeometry(1, 1, 8),
  manzana: new THREE.SphereGeometry(0.2, 10, 8),
  flor: new THREE.SphereGeometry(0.13, 6, 4),
  roca: new THREE.DodecahedronGeometry(0.7, 0),
  sombrero: new THREE.SphereGeometry(0.75, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2),
  pie: new THREE.CylinderGeometry(0.24, 0.3, 0.6, 10),
  lunar: new THREE.SphereGeometry(0.12, 8, 6),
  hierba: new THREE.ConeGeometry(0.08, 0.5, 4),
  nenufar: new THREE.CylinderGeometry(1, 1, 0.04, 10, 1, false, 0.5, Math.PI * 2 - 0.5),
};
const MAT = {
  suelo: sueloSuave(new THREE.MeshLambertMaterial({ vertexColors: true })),
  tronco: mat(THREE, '#9b6a43'),
  copa: mat(THREE, '#ffffff', { flatShading: true }),
  manzana: new THREE.MeshLambertMaterial({ color: '#ff3b3b', emissive: '#a01010', emissiveIntensity: 0.25 }),
  flor: mat(THREE, '#ffffff'),
  roca: mat(THREE, '#b3abcf', { flatShading: true }),
  seta: new THREE.MeshLambertMaterial({ color: '#ff4d6d', emissive: '#c0203c', emissiveIntensity: 0.2 }),
  pie: mat(THREE, '#fff6e0'),
  lunar: mat(THREE, '#ffffff'),
  hierba: mat(THREE, '#5fb848'),
  nenufar: mat(THREE, '#4caf50'),
  florAgua: mat(THREE, '#ff9ad5'),
};
/** Arena y fondo del río por píxel según la altura (con colores por vértice se veían los triángulos en las orillas). */
function sueloSuave(m) {
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = 'varying float vAlt;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n  vAlt = position.y;');
    sh.fragmentShader = 'varying float vAlt;\n' + sh.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
      float hA = vAlt - (${AGUA.toFixed(2)});
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(1.0, 0.77, 0.36), smoothstep(0.75, 0.45, hA));     // arena (lineal)
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.21, 0.58, 0.43), smoothstep(-0.1, -0.35, hA));  // fondo del río`);
  };
  m.customProgramCacheKey = () => 'suelo-suave';
  return m;
}
const COPAS = ['#5cc56a', '#4cb85e', '#7fd66a', '#3fae5b', '#9be06e', '#ff9ad5', '#ffc18a'];
const FLORES = ['#ff6fb1', '#ffffff', '#ffd23f', '#b48cff', '#ff8a5c'];
const C_HIERBA = new THREE.Color('#86d860'), C_HIERBA2 = new THREE.Color('#6fc44f'), C_ARENA = new THREE.Color('#ffe3a3'), C_FONDO = new THREE.Color('#7fc9b0'), C_ALTO = new THREE.Color('#a8e070');
for (const c of [C_HIERBA, C_HIERBA2, C_ALTO]) tenir(c, 'suelo');

// Agua: un plano grande que sigue a la cámara
const agua = new THREE.Mesh(new THREE.PlaneGeometry(NIEBLA * 2.4, NIEBLA * 2.4), new THREE.MeshLambertMaterial({ color: '#4fc0ff', emissive: '#2a8fd0', emissiveIntensity: 0.3, transparent: true, opacity: 0.82 }));
agua.rotation.x = -Math.PI / 2; agua.position.y = AGUA;
escena.add(agua);

// ---------- Trozos de mundo ----------
const trozos = new Map();   // "cx,cz" -> trozo
const clave = (cx, cz) => cx + ',' + cz;

function crearTrozo(cx, cz) {
  const x0 = cx * CH, z0 = cz * CH;
  const g = new THREE.Group();
  // Suelo
  const geo = new THREE.PlaneGeometry(CH, CH, SEG, SEG);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position, nor = geo.attributes.normal;
  const col = new Float32Array(pos.count * 3);
  const n = new THREE.Vector3(), c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i) + x0 + CH / 2, z = pos.getZ(i) + z0 + CH / 2;
    const h = altura(x, z);
    pos.setY(i, h);
    normal(x, z, n); nor.setXYZ(i, n.x, n.y, n.z);
    // La hierba por vértice (cambia despacio); la arena y el fondo los pone el shader según la altura
    c.copy(C_HIERBA).lerp(C_HIERBA2, ruido(x / 7, z / 7)); if (h > 4) c.lerp(C_ALTO, Math.min(1, (h - 4) / 2));
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const suelo = new THREE.Mesh(geo, MAT.suelo);
  suelo.position.set(x0 + CH / 2, 0, z0 + CH / 2);
  g.add(suelo);

  // Cosas encima, siempre las mismas para el mismo trozo
  const r = rng((Math.imul(cx, 73856093) ^ Math.imul(cz, 19349663) ^ SEMILLA) | 0);
  const libre = (x, z, m, lista) => lista.every((o) => Math.hypot(o.x - x, o.z - z) > m);
  const seco = (x, z) => altura(x, z) > AGUA + 0.7 && rio(x, z) < 0.01;
  const arboles = [], rocas = [], setas = [], colisiones = [];
  const espeso = ruido(cx * 0.37 + 11, cz * 0.37 - 4);   // hay zonas de bosque y zonas de prado
  const nArb = Math.round(4 + espeso * 18);
  for (let k = 0; k < nArb * 3 && arboles.length < nArb; k++) {
    const x = x0 + r() * CH, z = z0 + r() * CH;
    if (!seco(x, z) || !libre(x, z, 3, arboles) || Math.hypot(x - salida.x, z - salida.z) < 7) continue;
    const tipo = r() < 0.28 ? 'manzano' : r() < 0.3 ? 'pino' : 'arbol';
    arboles.push({ x, z, y: altura(x, z), tipo, h: 1.6 + r() * 1.6, s: 1.1 + r() * 0.7, col: COPAS[Math.floor(r() * COPAS.length)], agita: 0 });
    colisiones.push({ x, z, r: 0.45 });
  }
  for (let k = 0; k < 10 && rocas.length < 3; k++) {
    const x = x0 + r() * CH, z = z0 + r() * CH;
    if (altura(x, z) < AGUA - 0.3 || !libre(x, z, 2.5, arboles) || Math.hypot(x - salida.x, z - salida.z) < 5) continue;
    const s = 0.5 + r() * 0.9;
    rocas.push({ x, z, y: altura(x, z), s, giro: r() * 6 });
    colisiones.push({ x, z, r: s * 0.8 });
  }
  if (r() < 0.35) {
    for (let k = 0; k < 10; k++) {
      const x = x0 + r() * CH, z = z0 + r() * CH;
      if (!seco(x, z) || !libre(x, z, 2.5, arboles) || Math.hypot(x - salida.x, z - salida.z) < 5) continue;
      setas.push({ x, z, y: altura(x, z), aplasta: 0 });
      break;
    }
  }

  const pack = [];   // cosas del pack de este trozo (se dibujan todas juntas, ver reconstruirBosque)
  if (hayNaturaleza) {
    for (const a of arboles) {
      const n = a.tipo === 'manzano' ? unoDe(['Tree_Park_medium_green', 'Tree_Park_large_green'], r()) : unoDe(a.tipo === 'pino' ? ABETOS : ARBOLES, r());
      const P = PACK[n], alto = (a.h + a.s * 1.6) * 1.15, sc = alto / P.alto;
      a.item = { n, x: a.x, y: a.y - 0.05, z: a.z, s: sc, giro: r() * 6.3 };
      pack.push(a.item);
      a.cx = a.x; a.cy = a.y + P.copaY * sc; a.cz = a.z; a.s = P.copaR * sc;
    }
    for (const o of rocas) { const n = unoDe(o.s > 1 ? PEDRUSCOS : ROCAS, r()); pack.push({ n, x: o.x, y: o.y - 0.1, z: o.z, s: (o.s * 1.1) / PACK[n].radio, giro: o.giro }); }
    // Mucho adorno (sin colisión): hierba, matorrales, flores, setitas, piedras, tocones; juncos en las orillas
    const D = DENSIDAD, prado = 1 - espeso;
    const receta = [[HIERBAS, 46 * D, 0.3, 0.65], [ARBUSTOS, (3 + espeso * 7) * D, 0.8, 1.5], [FLORES_PACK, (2 + prado * 6) * D, 0.4, 0.75],
      [SETITAS, (1 + espeso * 5) * D, 0.25, 0.5], [ROCAS, 3 * D, 0.25, 0.6], [['Tree_Stump', 'Fallen_Log'], espeso > 0.5 && r() < 0.6 ? 1 : 0, 0.5, 0.8]];
    for (const [lista, n, a0, a1] of receta) {
      for (let k = 0, i = 0; k < Math.round(n) && i < n * 4; i++) {
        const x = x0 + r() * CH, z = z0 + r() * CH;
        if (!seco(x, z) || Math.hypot(x - salida.x, z - salida.z) < 2.5) continue;
        const nom = unoDe(lista, r());
        pack.push({ n: nom, x, y: altura(x, z) - 0.03, z, s: (a0 + r() * (a1 - a0)) / PACK[nom].alto, giro: r() * 6, adorno: true }); k++;
      }
    }
    for (let k = 0, i = 0; k < 14 * D && i < 60; i++) {
      const x = x0 + r() * CH, z = z0 + r() * CH, h = altura(x, z);
      if (h < AGUA - 0.15 || h > AGUA + 0.5) continue;   // juncos y hierba alta justo en la orilla
      pack.push({ n: 'Grass_large', x, y: h - 0.05, z, s: (0.7 + r() * 0.5) / PACK.Grass_large.alto, giro: r() * 6, adorno: true }); k++;
    }
  }
  // Troncos y copas
  if (arboles.length && !hayNaturaleza) {
    const tr = new THREE.InstancedMesh(GEO.tronco, MAT.tronco, arboles.length);
    const nc = arboles.filter((a) => a.tipo !== 'pino').length, np = arboles.length - nc;
    const co = nc ? new THREE.InstancedMesh(GEO.copa, MAT.copa, nc) : null;
    const pi = np ? new THREE.InstancedMesh(GEO.pino, MAT.copa, np * 2) : null;
    let kc = 0, kp = 0;
    arboles.forEach((a, i) => {
      dummy.position.set(a.x, a.y + a.h / 2 - 0.1, a.z); dummy.scale.set(1, a.h, 1); dummy.rotation.set(0, 0, 0); dummy.updateMatrix();
      tr.setMatrixAt(i, dummy.matrix);
      if (a.tipo === 'pino') {
        for (let k = 0; k < 2; k++) {
          dummy.position.set(a.x, a.y + a.h + 0.4 + k * 1.1, a.z); dummy.scale.set(a.s * (1.3 - k * 0.35), 2, a.s * (1.3 - k * 0.35)); dummy.rotation.set(0, r() * 3, 0); dummy.updateMatrix();
          pi.setMatrixAt(kp, dummy.matrix); pi.setColorAt(kp, new THREE.Color(k ? '#4cb85e' : '#3a9c50'));
          (a.conos = a.conos || []).push({ m: pi, k: kp, matriz: dummy.matrix.clone() }); kp++;
        }
        a.cx = a.x; a.cy = a.y + a.h + 1; a.cz = a.z;
      } else {
        a.copa = { m: co, k: kc, rot: new THREE.Euler(r(), r(), r()) };
        a.cx = a.x; a.cy = a.y + a.h + 0.6; a.cz = a.z;
        dummy.position.set(a.cx, a.cy, a.cz); dummy.scale.setScalar(a.s); dummy.rotation.copy(a.copa.rot); dummy.updateMatrix();
        co.setMatrixAt(kc, dummy.matrix); co.setColorAt(kc, new THREE.Color(a.tipo === 'manzano' ? '#4cb85e' : a.col)); kc++;
      }
    });
    g.add(tr);
    if (co) g.add(co);
    if (pi) g.add(pi);
  }
  // Manzanas: colgando de los manzanos y alguna ya en el suelo
  const manzanas = [];
  for (const a of arboles) {
    if (a.tipo !== 'manzano') continue;
    a.manzanas = [];
    for (let k = 0; k < 5; k++) {
      const ang = r() * Math.PI * 2, el = 0.15 + r() * 0.9;
      const rr = a.item ? 1.02 : 0.95;   // en los árboles del pack, justo en la superficie de la copa
      const m = { x: a.cx + Math.cos(ang) * Math.cos(el) * a.s * rr, y: a.cy + Math.sin(el) * a.s * 0.8 - 0.1, z: a.cz + Math.sin(ang) * Math.cos(el) * a.s * rr, estado: 'arbol', vy: 0 };
      manzanas.push(m); a.manzanas.push(m);
    }
    if (r() < 0.6) {
      const ang = r() * Math.PI * 2, d = 1.2 + r() * 1.2, x = a.x + Math.cos(ang) * d, z = a.z + Math.sin(ang) * d;
      manzanas.push({ x, z, y: altura(x, z) + 0.18, estado: 'suelo', vy: 0 });
    }
  }
  let mz = null;
  if (manzanas.length) { mz = new THREE.InstancedMesh(GEO.manzana, MAT.manzana, manzanas.length); g.add(mz); }
  // Flores y matas de hierba
  const nFl = 26 + Math.round((1 - espeso) * 30);
  const fl = new THREE.InstancedMesh(GEO.flor, MAT.flor, nFl);
  for (let k = 0; k < nFl; k++) {
    const x = x0 + r() * CH, z = z0 + r() * CH, y = altura(x, z);
    dummy.position.set(x, y < AGUA + 0.6 ? -50 : y + 0.08, z); dummy.scale.set(1, 0.6, 1); dummy.rotation.set(0, 0, 0); dummy.updateMatrix();
    fl.setMatrixAt(k, dummy.matrix); fl.setColorAt(k, new THREE.Color(FLORES[k % FLORES.length]));
  }
  g.add(fl);
  const nHi = hayNaturaleza ? 16 : 40;
  const hi = new THREE.InstancedMesh(GEO.hierba, MAT.hierba, nHi);
  for (let k = 0; k < nHi; k++) {
    const x = x0 + r() * CH, z = z0 + r() * CH, y = altura(x, z);
    dummy.position.set(x, y < AGUA + 0.6 ? -50 : y + 0.2, z); dummy.scale.set(1, 0.6 + r() * 0.8, 1); dummy.rotation.set((r() - 0.5) * 0.5, 0, (r() - 0.5) * 0.5); dummy.updateMatrix();
    hi.setMatrixAt(k, dummy.matrix);
  }
  g.add(hi);
  if (rocas.length && !hayNaturaleza) {
    const ro = new THREE.InstancedMesh(GEO.roca, MAT.roca, rocas.length);
    rocas.forEach((o, k) => { dummy.position.set(o.x, o.y + o.s * 0.2, o.z); dummy.scale.set(o.s * 1.3, o.s * 0.85, o.s); dummy.rotation.set(0, o.giro, 0); dummy.updateMatrix(); ro.setMatrixAt(k, dummy.matrix); });
    g.add(ro);
  }
  for (const s of setas) {
    s.g = new THREE.Group();
    if (hayNaturaleza) {
      const m = new THREE.Mesh(PACK.Mushroom_Red_large.geo, materialDe('Mushroom_Red_large'));
      m.scale.setScalar(1.5 / PACK.Mushroom_Red_large.alto);
      s.g.add(m); s.g.position.set(s.x, s.y - 0.05, s.z); g.add(s.g);
      continue;
    }
    const pie = new THREE.Mesh(GEO.pie, MAT.pie); pie.position.y = 0.3;
    const som = new THREE.Mesh(GEO.sombrero, MAT.seta); som.position.y = 0.55; som.scale.set(1, 0.9, 1);
    s.g.add(pie, som);
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * Math.PI * 2, l = new THREE.Mesh(GEO.lunar, MAT.lunar);
      l.position.set(Math.cos(a) * 0.45, 0.55 + 0.45, Math.sin(a) * 0.45); l.scale.set(1, 0.5, 1);
      s.g.add(l);
    }
    const top = new THREE.Mesh(GEO.lunar, MAT.lunar); top.position.y = 1.32; s.g.add(top);
    s.g.position.set(s.x, s.y, s.z);
    g.add(s.g);
  }
  // Un amigo que pasea por aquí (a veces) y bellotas doradas escondidas (en rocas, en alto...)
  const amigos = [];
  if (r() < 0.24 && Math.hypot(x0 + CH / 2 - salida.x, z0 + CH / 2 - salida.z) > 10) {
    for (let k = 0; k < 10; k++) {
      const x = x0 + 4 + r() * (CH - 8), z = z0 + 4 + r() * (CH - 8);
      if (!seco(x, z)) continue;
      amigos.push({ animal: ANIMALES[Math.floor(r() * ANIMALES.length)].id, casa: { x, z }, x, z, ang: r() * 6, pj: null, t: 0, obj: null, paso: 0, vista: 0 });
      break;
    }
  }
  const doradas = [];
  for (let k = 0, n = r() < 0.5 ? 1 + Math.floor(r() * 2) : 0; k < 12 && doradas.length < n; k++) {
    const o = rocas.length && r() < 0.5 ? rocas[Math.floor(r() * rocas.length)] : null;
    const x = o ? o.x : x0 + r() * CH, z = o ? o.z : z0 + r() * CH;
    if (!o && !seco(x, z)) continue;
    // Encima de una roca, flotando bajito o muy alta (para el salto especial o una seta)
    const y = altura(x, z) + (o ? o.s * 1.3 + 0.6 : r() < 0.35 ? 3.4 : 0.9);
    doradas.push({ x, y, z, cogida: false, fase: r() * 6 });
  }
  // Nenúfares en el agua, alguno con flor
  const hojas = [];
  for (let k = 0; k < 40 && hojas.length < 9; k++) {
    const x = x0 + r() * CH, z = z0 + r() * CH;
    if (altura(x, z) < AGUA - 0.6 && hojas.every((o) => Math.hypot(o.x - x, o.z - z) > 1.4)) hojas.push({ x, z, s: 0.45 + r() * 0.4, giro: r() * 6, flor: r() < 0.35 });
  }
  if (hojas.length) {
    const mh = new THREE.InstancedMesh(GEO.nenufar, MAT.nenufar, hojas.length);
    const fl = hojas.filter((o) => o.flor);
    const mf = fl.length ? new THREE.InstancedMesh(GEO.flor, MAT.florAgua, fl.length) : null;
    hojas.forEach((o, k) => { dummy.position.set(o.x, AGUA + 0.03, o.z); dummy.rotation.set(0, o.giro, 0); dummy.scale.set(o.s, 1, o.s); dummy.updateMatrix(); mh.setMatrixAt(k, dummy.matrix); });
    fl.forEach((o, k) => { dummy.position.set(o.x + 0.1, AGUA + 0.12, o.z); dummy.rotation.set(0, 0, 0); dummy.scale.set(1.3, 0.9, 1.3); dummy.updateMatrix(); mf.setMatrixAt(k, dummy.matrix); });
    g.add(mh); if (mf) g.add(mf);
  }
  escena.add(g);
  const t = { cx, cz, g, arboles, manzanas, mz, setas, colisiones, pack, amigos, doradas, sucio: true };
  pintarManzanas(t);
  return t;
}
function pintarManzanas(t) {
  if (!t.mz) return;
  t.manzanas.forEach((m, k) => {
    dummy.position.set(m.x, m.y, m.z); dummy.rotation.set(0, k, 0); dummy.scale.setScalar(m.estado === 'comida' || m.oculta ? 0 : 1); dummy.updateMatrix();
    t.mz.setMatrixAt(k, dummy.matrix);
  });
  t.mz.instanceMatrix.needsUpdate = true;
  t.sucio = false;
}
function quitarTrozo(t) {
  for (const a of t.amigos) if (a.pj) escena.remove(a.pj.g);
  escena.remove(t.g);
  t.g.traverse((o) => { if (o.isMesh && o.geometry && !Object.values(GEO).includes(o.geometry)) o.geometry.dispose(); if (o.isInstancedMesh) o.dispose(); });
}
// ---------- El bosque del pack: una InstancedMesh por modelo para todo el mundo (no una por trozo) ----------
const POOL = new Map();   // nombre -> { im, cap }
const centro = { x: 1e9, z: 1e9 };   // trozo donde está el grupo
const RADIO_ADORNO = enTele ? 1 : 2;
let bosqueSucio = true;
function ponerItem(it, encoge = 1, w = 0) {
  dummy.position.set(it.x + w, it.y, it.z); dummy.rotation.set(0, it.giro, 0); dummy.scale.setScalar(it.s * encoge); dummy.updateMatrix();
  it.im.setMatrixAt(it.k, dummy.matrix);
}
function reconstruirBosque() {
  bosqueSucio = false;
  if (!hayNaturaleza) return;
  const listas = new Map();
  for (const t of trozos.values()) {
    if (!t.g.visible) continue;
    // Las plantitas solo en los trozos de alrededor: más lejos la niebla no deja verlas y la tele va justa
    const cerca = Math.abs(t.cx - centro.x) <= RADIO_ADORNO && Math.abs(t.cz - centro.z) <= RADIO_ADORNO;
    for (const it of t.pack) {
      if (it.adorno && !cerca) continue; if (!listas.has(it.n)) listas.set(it.n, []); listas.get(it.n).push(it); }
  }
  for (const [n, p] of POOL) if (!listas.has(n)) p.im.count = 0;
  for (const [n, items] of listas) {
    let p = POOL.get(n);
    if (!p || p.cap < items.length) {
      if (p) { escena.remove(p.im); p.im.dispose(); }
      const cap = Math.ceil(items.length * 1.4) + 8;
      p = { im: new THREE.InstancedMesh(PACK[n].geo, materialDe(n), cap), cap };
      p.im.frustumCulled = false;
      escena.add(p.im);
      POOL.set(n, p);
    }
    items.forEach((it, k) => { it.k = k; it.im = p.im; ponerItem(it, it.encoge ?? 1); });
    p.im.count = items.length;
    p.im.instanceMatrix.needsUpdate = true;
  }
}

/** Crea los trozos que faltan cerca de (x, z) y quita los lejanos. Con `todos`, los crea de golpe. */
function cargarAlrededor(x, z, todos = false) {
  const ccx = Math.floor(x / CH), ccz = Math.floor(z / CH);
  if (ccx !== centro.x || ccz !== centro.z) { centro.x = ccx; centro.z = ccz; bosqueSucio = true; }
  for (const [k, t] of trozos) {
    if (Math.abs(t.cx - ccx) > RADIO + 1 || Math.abs(t.cz - ccz) > RADIO + 1) { quitarTrozo(t); trozos.delete(k); bosqueSucio = true; }
    else {
      const ver = Math.abs(t.cx - ccx) <= RADIO && Math.abs(t.cz - ccz) <= RADIO;   // los del borde se guardan, pero no se dibujan
      if (ver !== t.g.visible) { t.g.visible = ver; bosqueSucio = true; }
    }
  }
  const faltan = [];
  for (let dx = -RADIO; dx <= RADIO; dx++) for (let dz = -RADIO; dz <= RADIO; dz++) {
    if (!trozos.has(clave(ccx + dx, ccz + dz))) faltan.push([ccx + dx, ccz + dz, dx * dx + dz * dz]);
  }
  faltan.sort((a, b) => a[2] - b[2]);
  // Uno por fotograma para que no dé tirones
  for (const [a, b] of todos ? faltan : faltan.slice(0, 1)) { trozos.set(clave(a, b), crearTrozo(a, b)); bosqueSucio = true; }
  if (bosqueSucio) reconstruirBosque();
}
function* cercanos(x, z) {
  const ccx = Math.floor(x / CH), ccz = Math.floor(z / CH);
  for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) { const t = trozos.get(clave(ccx + dx, ccz + dz)); if (t) yield t; }
}

// ---------- Chispas: salpicaduras y trocitos (una llamada de dibujo) ----------
const N_PIEZAS = 160;
const piezas = new THREE.InstancedMesh(new THREE.SphereGeometry(0.09, 6, 4), new THREE.MeshBasicMaterial({ color: '#ffffff' }), N_PIEZAS);
piezas.frustumCulled = false;
const lista = Array.from({ length: N_PIEZAS }, (_, i) => { piezas.setColorAt(i, new THREE.Color('#fff')); return { p: new THREE.Vector3(), v: new THREE.Vector3(), vida: 0 }; });
escena.add(piezas);
let sigPieza = 0;
function lanzar(x, y, z, n, color, fuerza = 1) {
  const c = new THREE.Color(color);
  for (let k = 0; k < n; k++) {
    const q = lista[sigPieza];
    piezas.setColorAt(sigPieza, c);
    sigPieza = (sigPieza + 1) % N_PIEZAS;
    q.p.set(x, y, z);
    q.v.set(Math.random() - 0.5, Math.random() * 0.9 + 0.5, Math.random() - 0.5).normalize().multiplyScalar((2 + Math.random() * 3) * fuerza);
    q.vida = 0.7 + Math.random() * 0.4;
  }
  piezas.instanceColor.needsUpdate = true;
}
function actualizarPiezas(dt) {
  for (let i = 0; i < N_PIEZAS; i++) {
    const q = lista[i];
    if (q.vida > 0) { q.vida -= dt; q.v.y -= 12 * dt; q.p.addScaledVector(q.v, dt); dummy.position.copy(q.p); dummy.scale.setScalar(Math.min(1, q.vida * 2)); }
    else dummy.scale.setScalar(0);
    dummy.rotation.set(0, 0, 0); dummy.updateMatrix();
    piezas.setMatrixAt(i, dummy.matrix);
  }
  piezas.instanceMatrix.needsUpdate = true;
}

// ---------- Mariposas que acompañan al grupo ----------
const N_MARIPOSAS = 8;
// Ala con forma (lóbulo grande delante y pequeño detrás), con la bisagra en x = 0
const geoAla = (() => {
  const b = [[0, 0.03], [0.07, 0.15], [0.2, 0.19], [0.31, 0.14], [0.33, 0.05], [0.22, -0.01], [0.26, -0.08], [0.2, -0.15], [0.1, -0.14], [0.02, -0.05]], v = [];
  for (let i = 0; i < b.length - 1; i++) v.push(0.1, 0, 0, b[i][0], b[i][1], 0, b[i + 1][0], b[i + 1][1], 0);
  v.push(0.1, 0, 0, b[b.length - 1][0], b[b.length - 1][1], 0, b[0][0], b[0][1], 0);
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(v), 3)); g.computeVertexNormals();
  return g;
})();
const cuerposMariposa = new THREE.InstancedMesh(new THREE.CapsuleGeometry(0.022, 0.2, 2, 6).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#3a2a3f' }), 8);
cuerposMariposa.frustumCulled = false;
const alas = new THREE.InstancedMesh(geoAla, new THREE.MeshBasicMaterial({ color: '#ffffff', side: THREE.DoubleSide }), N_MARIPOSAS * 2);
alas.frustumCulled = false;
const mariposas = Array.from({ length: N_MARIPOSAS }, (_, i) => {
  const c = new THREE.Color(['#ffd23f', '#ff8ad8', '#8fd3ff', '#ffffff', '#c9a3ff'][i % 5]);
  alas.setColorAt(i * 2, c); alas.setColorAt(i * 2 + 1, c);
  return { p: new THREE.Vector3((Math.random() - 0.5) * 20, 2, (Math.random() - 0.5) * 20), v: new THREE.Vector3(), fase: Math.random() * 6, obj: new THREE.Vector3(), t: 0 };
});
escena.add(alas, cuerposMariposa);
function actualizarMariposas(dt, cx, cz, t) {
  mariposas.forEach((m, i) => {
    // ¡Atrapada! (hay que saltar: vuelan alto)
    for (const j of jugadores) {
      if (Math.hypot(j.pos.x - m.p.x, j.pos.y + 0.9 - m.p.y, j.pos.z - m.p.z) < 0.85) {
        j.mariposas++; marcadorSucio = true; suena('pompa', 3);
        lanzar(m.p.x, m.p.y, m.p.z, 10, '#ffffff', 0.6);
        flotante('🦋 ¡Atrapada!', m.p.x, m.p.y + 0.6, m.p.z, VARIOS ? j.color : null);
        if (!vistos.mariposa) { vistos.mariposa = true; mensaje('¡Una mariposa!<small>Salta para atraparlas</small>', 2200); }
        m.t = 0; m.p.set(cx + (Math.random() - 0.5) * 40, 6, cz + (Math.random() - 0.5) * 40);
        break;
      }
    }
    m.t -= dt;
    if (m.t <= 0 || m.p.distanceTo(tmp.set(cx, m.p.y, cz)) > 26) {
      m.t = 2 + Math.random() * 3;
      const a = Math.random() * Math.PI * 2, d = 3 + Math.random() * 12, x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d;
      m.obj.set(x, Math.max(altura(x, z), AGUA) + 0.8 + Math.random() * 1.6, z);
      if (m.p.distanceTo(m.obj) > 30) m.p.copy(m.obj).add(tmp.set(0, 4, 0));
    }
    tmp.copy(m.obj).sub(m.p).clampLength(0, 2.2);
    m.v.lerp(tmp, Math.min(1, dt * 2));
    m.p.addScaledVector(m.v, dt);
    m.p.y += Math.sin(t * 5 + m.fase) * dt * 0.8;
    const aleteo = Math.sin(t * 22 + m.fase) * 1.1, rumbo = Math.atan2(m.v.x, m.v.z);
    for (let k = 0; k < 2; k++) {
      dummy.position.copy(m.p);
      dummy.rotation.set(0, rumbo + Math.PI / 2, 0);
      dummy.rotateX(-Math.PI / 2);
      dummy.rotateY(k ? Math.PI + aleteo : -aleteo);
      dummy.scale.setScalar(1); dummy.updateMatrix();
      alas.setMatrixAt(i * 2 + k, dummy.matrix);
    }
    dummy.position.copy(m.p); dummy.rotation.set(0, rumbo, 0); dummy.updateMatrix();
    cuerposMariposa.setMatrixAt(i, dummy.matrix);
  });
  alas.instanceMatrix.needsUpdate = true; cuerposMariposa.instanceMatrix.needsUpdate = true;
}

// ---------- Jugadores ----------
const datosPartida = partida.leer();
let defs = [];
if (datosPartida && datosPartida.juego === 'paseo' && Array.isArray(datosPartida.jugadores)) {
  defs = datosPartida.jugadores.map((j) => ({ perfil: perfilPorId(j.perfil), dispositivo: j.dispositivo })).filter((j) => j.perfil);
}
if (params.has('jugadores')) {
  const n = Math.max(1, Math.min(4, parseInt(params.get('jugadores'), 10) || 2));
  defs = Array.from({ length: n }, (_, i) => ({ perfil: { id: null, nombre: 'J' + (i + 1), animal: ['zorro', 'oso', 'conejo', 'buho'][i], pelo: 'natural', accesorio: 'nada', color: ['#ff4d6d', '#2fb4ff', '#3dbb4c', '#ffb020'][i] }, dispositivo: 'prueba' + i }));
}
const LIBRE = defs.length === 0;
if (LIBRE) defs = [{ perfil: { id: null, nombre: '', animal: 'oveja', pelo: 'natural', accesorio: 'nada', color: '#ff4d6d' }, dispositivo: null }];
const VARIOS = defs.length > 1;

// Salida: el primer sitio seco cerca del centro
const salida = (() => {
  for (let d = 0; d < 400; d += 2) for (let a = 0; a < 6.28; a += 0.5) {
    const x = Math.cos(a) * d, z = Math.sin(a) * d;
    if (altura(x, z) > AGUA + 1 && rio(x, z) === 0) return { x, z };
  }
  return { x: 0, z: 0 };
})();

class Jugador {
  constructor(def, i) {
    this.perfil = def.perfil; this.dispositivo = def.dispositivo; this.i = i;
    this.color = def.perfil.color || '#ff4d6d';
    this.pj = crearPersonaje(THREE, def.perfil);
    escena.add(this.pj.g);
    const a = (i / defs.length) * Math.PI * 2;
    this.pos = new THREE.Vector3(salida.x + Math.cos(a) * 1.6 * (VARIOS ? 1 : 0), 0, salida.z + Math.sin(a) * 1.6 * (VARIOS ? 1 : 0));
    this.pos.y = altura(this.pos.x, this.pos.z);
    this.vel = new THREE.Vector3(); this.vy = 0;
    this.angulo = Math.PI; this.paso = 0; this.aplasta = 0;
    this.suelo = true; this.nadando = false;
    this.manzanas = 0; this.andado = 0; this.mariposas = 0; this.doradas = 0;
    this.bot = { t: 0, x: 0, z: 0 };
    this.etiqueta = null;
    if (VARIOS) {
      const e = document.createElement('div');
      e.className = 'etiqueta'; e.textContent = def.perfil.nombre; e.style.setProperty('--c', this.color);
      $('flotantes').appendChild(e); this.etiqueta = e;
    }
  }
  entrada() {
    if (BOT) {
      // Pasea solo: elige un rumbo cada pocos segundos y salta de vez en cuando
      this.bot.t -= 1 / 60;
      if (this.bot.t <= 0) { this.bot.t = 2 + Math.random() * 4; const a = Math.random() * Math.PI * 2; this.bot.x = Math.cos(a); this.bot.z = Math.sin(a); }
      if (Math.random() < 0.004) especial(this.pj);
      return [this.bot.x, this.bot.z, Math.random() < 0.02, Math.random() < 0.3];
    }
    const d = this.dispositivo ? entradas.get(this.dispositivo) : pad;
    return d ? [d.lx, d.ly, d.pressed('A'), d.down('B') || d.down('X') || d.down('RT')] : [0, 0, false, false];
  }
  actualizar(dt, activo) {
    const [lx, ly, saltar, correr] = activo ? this.entrada() : [0, 0, false, false];
    const pw = this.pw = poder(this.pj);   // el especial del animal
    const cy = Math.cos(cam.yaw), sy = Math.sin(cam.yaw);
    const dx = lx * cy + ly * sy, dz = -lx * sy + ly * cy;
    const suelo = altura(this.pos.x, this.pos.z);
    const hondo = suelo < AGUA - 0.45;
    const max = (hondo && this.pos.y < AGUA + 0.3 ? VEL_AGUA : VEL * (correr ? 1.75 : 1)) * pw.vel;   // B: correr
    const k = Math.min(1, dt * (this.nadando ? 10 : this.suelo ? 10 * REGLA.agarre : 3));   // invierno: resbala
    const w = racha();                                                                      // otoño: rachas de viento
    this.vel.x += (dx * max + w.x - this.vel.x) * k;
    this.vel.z += (dz * max + w.z - this.vel.z) * k;
    const antes = this.pos.clone();
    this.pos.x += this.vel.x * dt; this.pos.z += this.vel.z * dt;
    // Árboles y rocas
    for (const t of cercanos(this.pos.x, this.pos.z)) for (const c of t.colisiones) {
      const ex = this.pos.x - c.x, ez = this.pos.z - c.z, d = Math.hypot(ex, ez), min = c.r + 0.4;
      if (d < min && d > 1e-4 && this.pos.y < altura(c.x, c.z) + 2.5) { this.pos.x = c.x + (ex / d) * min; this.pos.z = c.z + (ez / d) * min; }
    }
    // No alejarse demasiado de los demás
    if (VARIOS) {
      tmp.set(this.pos.x - grupo.x, 0, this.pos.z - grupo.z);
      if (tmp.length() > CORREA) { tmp.setLength(CORREA); this.pos.x = grupo.x + tmp.x; this.pos.z = grupo.z + tmp.z; }
    }
    this.andado += Math.hypot(this.pos.x - antes.x, this.pos.z - antes.z);
    // Altura: suelo, agua o aire
    const h = altura(this.pos.x, this.pos.z);
    const flota = AGUA - 0.55;
    const piso = h < flota ? flota : h;
    const enAgua = h < flota + 0.1;
    if (saltar && (this.suelo || this.nadando)) {
      this.vy = (this.nadando ? SALTO * 0.6 : SALTO) * REGLA.salto; this.suelo = false;
      suena('salto');
      if (this.nadando) lanzar(this.pos.x, AGUA, this.pos.z, 10, '#bfeaff');
      else sacudirManzano(this);
    }
    if (pw.salto) {
      this.vy = SALTO * pw.salto * (this.nadando ? 0.8 : 1.15); this.suelo = false;
      if (pw.avance) { this.vel.x += Math.sin(this.angulo) * VEL * pw.avance; this.vel.z += Math.cos(this.angulo) * VEL * pw.avance; }
      if (!this.nadando) sacudirZona(this.pos.x, this.pos.z, 2.6);
    }
    if (pw.rugido) { const rx = this.pos.x + Math.sin(this.angulo) * pw.lejos, rz = this.pos.z + Math.cos(this.angulo) * pw.lejos; sacudirZona(rx, rz, pw.rugido + 2, true); asustar(rx, rz, pw.rugido + 3); }
    if (pw.empuja) sacudirZona(this.pos.x, this.pos.z, 1.6, true);   // embestida o bola contra un árbol: ¡caen manzanas!
    this.vy -= G * dt * (this.vy < 0 ? pw.grav : 1);
    this.pos.y += this.vy * dt;
    // Setas: al caer encima (o al chocar con ellas) lanzan muy alto
    for (const t of cercanos(this.pos.x, this.pos.z)) for (const s of t.setas) {
      if (Math.hypot(this.pos.x - s.x, this.pos.z - s.z) < 1 && this.pos.y < s.y + 1.5 && this.vy <= 0.5) {
        this.vy = SALTO_SETA; this.suelo = false; s.aplasta = 1;
        suena('muelle'); vibrar(80, this.dispositivo || undefined);
        if (!vistos.seta) { vistos.seta = true; mensaje('¡Boing!<small>Las setas te lanzan por los aires</small>', 2200); }
      }
    }
    if (this.pos.y <= piso) {
      if (!this.suelo && !this.nadando && this.vy < -6) this.aplasta = Math.min(1, -this.vy / 14);
      if (enAgua && !this.nadando && this.vy < -2) { lanzar(this.pos.x, AGUA, this.pos.z, 18, '#bfeaff', 1.2); suena('pompa', 1); }
      this.pos.y = piso; this.vy = 0;
      this.nadando = enAgua; this.suelo = !enAgua;
      if (enAgua && !vistos.agua) { vistos.agua = true; mensaje('¡A nadar!', 1500); }
    } else if (this.pos.y > piso + 0.05) { this.suelo = false; this.nadando = false; }
    if (this.nadando) {
      this.pos.y = flota + Math.sin(performance.now() / 300 + this.i) * 0.05;
      if (Math.hypot(this.vel.x, this.vel.z) > 1 && Math.random() < 0.15) lanzar(this.pos.x, AGUA, this.pos.z, 1, '#e0f6ff', 0.4);
    }
    // Comer manzanas del suelo
    for (const t of cercanos(this.pos.x, this.pos.z)) for (const m of t.manzanas) {
      if (m.estado === 'suelo' && Math.hypot(m.x - this.pos.x, m.z - this.pos.z) < (pw.empuja ? 1.5 : 0.9) && Math.abs(m.y - this.pos.y) < 1.2) {
        m.estado = 'comida'; t.sucio = true;
        this.manzanas++; this.aplasta = 0.6;
        if (this.manzanas % 3 === 0) especial(this.pj);   // cada tres manzanas, lo celebra
        suena('bellota'); vibrar(40, this.dispositivo || undefined);
        lanzar(m.x, m.y + 0.2, m.z, 8, '#fff3c4', 0.6);
        flotante('🍎 ¡Ñam!', this.pos.x, this.pos.y + 2.2, this.pos.z, VARIOS ? this.color : null);
        marcadorSucio = true;
      }
    }
    // Animación
    const rapidez = Math.hypot(this.vel.x, this.vel.z);
    if (rapidez > 0.3) {
      let d = Math.atan2(this.vel.x, this.vel.z) - this.angulo;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      this.angulo += d * Math.min(1, dt * 12);
    }
    if (rapidez > 0.6 && (this.suelo || this.nadando)) this.paso += dt * (this.nadando ? 9 : 15); else this.paso *= Math.exp(-dt * 10);
    this.aplasta = Math.max(0, this.aplasta - dt * 5);
    this.pj.g.position.copy(this.pos);
    this.pj.g.rotation.set(this.nadando ? 0.25 : 0, this.angulo, 0);
    animarPersonaje(this.pj, { paso: this.paso, suelo: this.suelo || this.nadando, aplasta: this.aplasta, dt });
  }
  pintarEtiqueta() {
    if (!this.etiqueta) return;
    tmp.set(this.pos.x, this.pos.y + 1.6 * this.pj.escala + 0.4, this.pos.z).project(camara);
    const ver = tmp.z < 1;
    this.etiqueta.style.display = ver ? 'block' : 'none';
    if (!ver) return;
    this.etiqueta.style.left = ((tmp.x + 1) / 2 * innerWidth) + 'px';
    this.etiqueta.style.top = ((1 - tmp.y) / 2 * innerHeight) + 'px';
  }
}
const vistos = {};   // cosas que ya se han explicado (nadar, setas...)

/** Sacude los manzanos de una zona (salto del especial, rugido, embestida). fuerte = caen más. */
function sacudirZona(x, z, radio, fuerte = false) {
  let alguno = false;
  for (const t of cercanos(x, z)) for (const a of t.arboles) {
    if (Math.hypot(a.x - x, a.z - z) > radio) continue;
    a.agita = 1;
    if (a.tipo !== 'manzano') continue;
    for (const m of a.manzanas.filter((q) => q.estado === 'arbol').slice(0, fuerte ? 3 : 2)) { m.estado = 'cae'; m.vy = 0; m.vx = (Math.random() - 0.5) * 2; m.vz = (Math.random() - 0.5) * 2; alguno = true; }
  }
  if (alguno) suena('toque', 3);
}
/** Saltar al lado de un manzano lo sacude y hace caer manzanas. */
function sacudirManzano(j) {
  for (const t of cercanos(j.pos.x, j.pos.z)) for (const a of t.arboles) {
    if (a.tipo !== 'manzano' || Math.hypot(a.x - j.pos.x, a.z - j.pos.z) > 2.6) continue;
    a.agita = 1;
    const quedan = a.manzanas.filter((m) => m.estado === 'arbol');
    if (!quedan.length) continue;
    for (const m of quedan.sort(() => Math.random() - 0.5).slice(0, 2)) { m.estado = 'cae'; m.vy = 0; m.vx = (Math.random() - 0.5) * 2; m.vz = (Math.random() - 0.5) * 2; }
    suena('toque', 3);
    if (!vistos.manzano) { vistos.manzano = true; mensaje('¡Caen manzanas!<small>Pasa por encima para comértelas</small>', 2400); }
    return;
  }
}
/** Distancia de un punto al segmento cámara-jugadores y en qué parte del segmento cae (0 = cámara, 1 = jugadores). */
const seg = { a: new THREE.Vector3(), b: new THREE.Vector3(), d: new THREE.Vector3() };
function tapa(a) {
  seg.d.subVectors(seg.b, seg.a);
  const l2 = seg.d.lengthSq() || 1;
  const t = ((a.cx - seg.a.x) * seg.d.x + (a.cy - seg.a.y) * seg.d.y + (a.cz - seg.a.z) * seg.d.z) / l2;
  if (t < 0 || t > 0.92) return false;
  const px = seg.a.x + seg.d.x * t - a.cx, py = seg.a.y + seg.d.y * t - a.cy, pz = seg.a.z + seg.d.z * t - a.cz;
  return Math.hypot(px, py, pz) < a.s + 1.2;
}
let tapados = 0;   // árboles entre la cámara y los jugadores (la cámara sube para mirar por encima)
function actualizarManzanas(dt) {
  seg.a.copy(camara.position); seg.b.copy(cam.mira);
  tapados = 0;
  for (const t of trozos.values()) {
    for (const a of t.arboles) {
      const obj = tapa(a) ? 1 : 0;
      tapados += obj;
      const antes = a.tapa || 0;
      a.tapa = antes + clamp(obj - antes, -dt * 4, dt * 4);
      if (!a.agita) continue;   // solo se tocan los que se están sacudiendo
      a.agita = Math.max(0, (a.agita || 0) - dt * 2.5);
      const encoge = 1;   // los árboles ya no se encogen: es la cámara la que sube
      if (a.item) {
        if (!a.item.im) continue;
        a.item.encoge = encoge;
        ponerItem(a.item, encoge * (1 + a.agita * 0.04), Math.sin(a.agita * 30) * 0.12 * a.agita);
        a.item.im.instanceMatrix.needsUpdate = true;
        
      } else if (a.copa) {
        const w = Math.sin(a.agita * 30) * 0.12 * a.agita;
        dummy.position.set(a.cx + w, a.cy, a.cz); dummy.scale.setScalar(a.s * (1 + a.agita * 0.05) * encoge); dummy.rotation.copy(a.copa.rot); dummy.updateMatrix();
        a.copa.m.setMatrixAt(a.copa.k, dummy.matrix); a.copa.m.instanceMatrix.needsUpdate = true;
        
      } else if (a.conos) {
        for (const c of a.conos) {
          dummy.matrix.copy(c.matriz);
          dummy.matrix.decompose(dummy.position, dummy.quaternion, dummy.scale);
          dummy.scale.multiplyScalar(encoge); dummy.updateMatrix();
          c.m.setMatrixAt(c.k, dummy.matrix); c.m.instanceMatrix.needsUpdate = true;
        }
      }
    }
    for (const m of t.manzanas) {
      if (m.estado !== 'cae') continue;
      m.vy -= G * dt; m.y += m.vy * dt; m.x += m.vx * dt; m.z += m.vz * dt;
      const suelo = Math.max(altura(m.x, m.z), AGUA) + 0.18;
      if (m.y <= suelo) { m.y = suelo; m.estado = 'suelo'; suena('aterriza'); }
      t.sucio = true;
    }
    for (const s of t.setas) {
      if (!s.aplasta) continue;
      s.aplasta = Math.max(0, s.aplasta - dt * 3);
      const a = Math.sin(s.aplasta * Math.PI);
      s.g.scale.set(1 + a * 0.3, 1 - a * 0.4, 1 + a * 0.3);
    }
    if (t.sucio) pintarManzanas(t);
  }
}
const jugadores = defs.map((d, i) => new Jugador(d, i));

// ---------- Amigos: animales que pasean por el mundo. Al acercarte te saludan con su especial ----------
const NOMBRES = { oveja: 'Lana', zorro: 'Rufo', conejo: 'Saltarina', cervatillo: 'Bambú', jabali: 'Trufo', ardilla: 'Chispa', erizo: 'Pincho', buho: 'Ulises', oso: 'Bruno' };
const conocidos = new Set();
function actualizarAmigos(dt) {
  for (const t of trozos.values()) for (const a of t.amigos) {
    const lejos = Math.hypot(a.x - grupo.x, a.z - grupo.z) > 45;
    if (lejos || !t.g.visible) { if (a.pj) a.pj.g.visible = false; continue; }
    if (!a.pj) { a.pj = crearPersonaje(THREE, { animal: a.animal }); escena.add(a.pj.g); }
    a.pj.g.visible = true;
    // ¿Hay algún jugador cerca?
    let cerca = null, dc = 3.2;
    for (const j of jugadores) { const d = Math.hypot(j.pos.x - a.x, j.pos.z - a.z); if (d < dc) { dc = d; cerca = j; } }
    let vx = 0, vz = 0;
    if (cerca) {
      a.ang += Math.atan2(Math.sin(Math.atan2(cerca.pos.x - a.x, cerca.pos.z - a.z) - a.ang), Math.cos(Math.atan2(cerca.pos.x - a.x, cerca.pos.z - a.z) - a.ang)) * Math.min(1, dt * 6);
      if (!a.saludado) {
        a.saludado = true; especial(a.pj); suena('fanfarria');
        const nuevo = !conocidos.has(a.animal);
        conocidos.add(a.animal);
        flotante(`¡Hola! Soy ${NOMBRES[a.animal]}`, a.x, altura(a.x, a.z) + 2.4, a.z, '#7b3fe4');
        if (nuevo) mensaje(`¡Nuevo amigo: ${NOMBRES[a.animal]}!<small>${conocidos.size} de ${ANIMALES.length} amigos</small>`, 2400);
        marcadorSucio = true;
      }
    } else {
      // Pasea cerca de su casa
      a.t -= dt;
      if (a.t <= 0 || !a.obj) { a.t = 2 + Math.random() * 4; const g = Math.random() * 6.3, d = Math.random() * 6; a.obj = Math.random() < 0.35 ? null : { x: a.casa.x + Math.cos(g) * d, z: a.casa.z + Math.sin(g) * d }; if (Math.random() < 0.15) especial(a.pj); }
      if (a.obj) {
        const dx = a.obj.x - a.x, dz = a.obj.z - a.z, d = Math.hypot(dx, dz);
        if (d > 0.3 && altura(a.obj.x, a.obj.z) > AGUA + 0.3) { vx = (dx / d) * 1.5; vz = (dz / d) * 1.5; a.ang += Math.atan2(Math.sin(Math.atan2(dx, dz) - a.ang), Math.cos(Math.atan2(dx, dz) - a.ang)) * Math.min(1, dt * 5); }
        else a.obj = null;
      }
      if (a.huye > 0) { a.huye -= dt; vx = Math.sin(a.ang) * 4; vz = Math.cos(a.ang) * 4; }
    }
    a.x += vx * dt; a.z += vz * dt;
    if (Math.hypot(vx, vz) > 0.2) a.paso += dt * 12; else a.paso *= Math.exp(-dt * 8);
    a.pj.g.position.set(a.x, Math.max(altura(a.x, a.z), AGUA - 0.55), a.z);
    a.pj.g.rotation.y = a.ang;
    animarPersonaje(a.pj, { paso: a.paso, suelo: true, dt });
  }
}
/** El rugido asusta a los amigos: pegan un brinco y salen corriendo un momento. */
function asustar(x, z, radio) {
  for (const t of trozos.values()) for (const a of t.amigos) {
    if (!a.pj || Math.hypot(a.x - x, a.z - z) > radio) continue;
    especial(a.pj); a.huye = 1.2; a.ang = Math.atan2(a.x - x, a.z - z);
  }
}

// ---------- Bellotas doradas ----------
const N_DORADAS = 120;
const matOro = new THREE.MeshLambertMaterial({ color: '#ffcf3a', emissive: '#d98a00', emissiveIntensity: 0.55 });
const mOroCuerpo = new THREE.InstancedMesh(new THREE.SphereGeometry(0.26, 12, 9), matOro, N_DORADAS);
const mOroGorro = new THREE.InstancedMesh(new THREE.SphereGeometry(0.29, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshLambertMaterial({ color: '#b86f10', emissive: '#7a4200', emissiveIntensity: 0.3 }), N_DORADAS);
mOroCuerpo.frustumCulled = mOroGorro.frustumCulled = false;
escena.add(mOroCuerpo, mOroGorro);
function actualizarDoradas(t) {
  let k = 0;
  for (const tr of trozos.values()) {
    if (!tr.g.visible) continue;
    for (const o of tr.doradas) {
      if (o.cogida || k >= N_DORADAS) continue;
      for (const j of jugadores) {
        if (Math.hypot(j.pos.x - o.x, j.pos.y + 0.7 - o.y, j.pos.z - o.z) < 1.1) {
          o.cogida = true; j.doradas++; marcadorSucio = true;
          suena('bellota'); suena('objeto'); vibrar(60, j.dispositivo || undefined);
          lanzar(o.x, o.y, o.z, 16, '#ffd84a', 1.2);
          flotante('✨ +1', o.x, o.y + 0.8, o.z, '#e0a000');
          if (!vistos.dorada) { vistos.dorada = true; mensaje('¡Una bellota dorada!<small>Hay más escondidas: en las rocas y muy arriba</small>', 2600); }
          if (j.doradas % 5 === 0) especial(j.pj);
          break;
        }
      }
      if (o.cogida) continue;
      const y = o.y + Math.sin(t * 2 + o.fase) * 0.15;
      dummy.position.set(o.x, y, o.z); dummy.rotation.set(0, t * 2 + o.fase, 0); dummy.scale.set(0.9, 1.1, 0.9); dummy.updateMatrix(); mOroCuerpo.setMatrixAt(k, dummy.matrix);
      dummy.position.y = y + 0.12; dummy.scale.setScalar(1); dummy.updateMatrix(); mOroGorro.setMatrixAt(k, dummy.matrix);
      k++;
    }
  }
  mOroCuerpo.count = mOroGorro.count = k;
  mOroCuerpo.instanceMatrix.needsUpdate = mOroGorro.instanceMatrix.needsUpdate = true;
  // Un brillo de vez en cuando para que se vean de lejos
  if (Math.random() < 0.08) for (const tr of cercanos(grupo.x, grupo.z)) for (const o of tr.doradas) if (!o.cogida && Math.random() < 0.3) lanzar(o.x, o.y + 0.3, o.z, 1, '#fff4b0', 0.35);
}
const grupo = new THREE.Vector3(salida.x, 0, salida.z);

// ---------- Cámara: encuadra a todos; el stick derecho la gira ----------
const cam = { yaw: 0, el: 0.5, extra: 0, dist: 10, mira: new THREE.Vector3(salida.x, altura(salida.x, salida.z) + 1, salida.z) };
function actualizarCamara(dt) {
  let cx = 0, cy = 0, cz = 0;
  for (const j of jugadores) { cx += j.pos.x; cy += j.pos.y; cz += j.pos.z; }
  const n = jugadores.length;
  cx /= n; cy /= n; cz /= n;
  grupo.set(cx, cy, cz);
  let lejos = 0;
  for (const j of jugadores) lejos = Math.max(lejos, Math.hypot(j.pos.x - cx, j.pos.z - cz));
  const dist = clamp(10 + lejos * 1.1, 10, 30);
  cam.dist += (dist - cam.dist) * Math.min(1, dt * 2);
  const arr = pad.arrastre();
  let rx = pad.rx, ry = pad.ry;
  for (const j of jugadores) { const d = j.dispositivo ? entradas.get(j.dispositivo) : null; if (d && Math.abs(d.rx) > Math.abs(rx)) rx = d.rx; if (d && Math.abs(d.ry) > Math.abs(ry)) ry = d.ry; }
  cam.yaw -= rx * 2.2 * dt + arr.x;
  cam.el = clamp(cam.el + ry * 1.2 * dt + arr.y, 0.2, 1.2);
  tmp.set(cx, Math.max(cy, AGUA) + 1, cz);
  cam.mira.lerp(tmp, 1 - Math.exp(-6 * dt));
  // Si un árbol tapa a los jugadores, la cámara sube poco a poco para mirar por encima
  cam.extra += ((tapados ? 0.5 : 0) - cam.extra) * Math.min(1, dt * (tapados ? 2.5 : 0.8));
  const el = Math.min(1.35, cam.el + cam.extra);
  const c = Math.cos(el);
  const px = cam.mira.x + Math.sin(cam.yaw) * c * cam.dist, pz = cam.mira.z + Math.cos(cam.yaw) * c * cam.dist;
  let py = cam.mira.y + Math.sin(el) * cam.dist;
  py = Math.max(py, Math.max(altura(px, pz), AGUA) + 1.6);   // que no se meta dentro de una colina
  camara.position.set(px, py, pz);
  camara.lookAt(cam.mira.x, cam.mira.y + 0.5, cam.mira.z);
  cielo.position.copy(camara.position);
  agua.position.x = Math.round(camara.position.x / 8) * 8; agua.position.z = Math.round(camara.position.z / 8) * 8;
}

// ---------- HUD ----------
let marcadorSucio = true;
function mensaje(html, ms = 1400) {
  const m = $('mensaje'); m.innerHTML = html; m.classList.add('ver');
  clearTimeout(mensaje.t); if (ms) mensaje.t = setTimeout(() => m.classList.remove('ver'), ms);
}
function panel(html) { const p = $('panel'); if (html) { p.innerHTML = html; p.classList.add('ver'); } else p.classList.remove('ver'); }
function flotante(txt, x, y, z, color) {
  tmp.set(x, y, z).project(camara);
  if (tmp.z > 1) return;
  const d = document.createElement('div');
  d.className = 'mas1 txt'; d.textContent = txt;
  if (color) d.style.setProperty('--morado', color);
  d.style.left = ((tmp.x + 1) / 2 * innerWidth) + 'px';
  d.style.top = ((1 - tmp.y) / 2 * innerHeight) + 'px';
  $('flotantes').appendChild(d);
  setTimeout(() => d.remove(), 1000);
}
const metros = () => Math.round(jugadores.reduce((s, j) => Math.max(s, j.andado), 0));
function pintarMarcador() {
  $('marcador').innerHTML = jugadores.map((j) => `<span class="chip" style="--c:${j.color}">${VARIOS ? `<i></i>${esc(j.perfil.nombre)} ` : ''}<b>🍎 ${j.manzanas} · 🦋 ${j.mariposas} · ✨ ${j.doradas}</b></span>`).join('')
    + `<span class="chip" style="--c:#7b3fe4">🐾 ${conocidos.size} de ${ANIMALES.length} amigos · 🚶 ${metros()} m</span>`;
}

// ---------- Pausa ----------
let pausado = false;
function pausar(si) {
  pausado = si;
  if (si) panel(`<h2>Pausa</h2><p>🍎 ${jugadores.reduce((s, j) => s + j.manzanas, 0)} manzanas · 🚶 ${metros()} metros</p>`
    + `<div class="opciones"><span data-tap="A"><span class="boton-a">A</span> Seguir</span><span data-tap="Y"><span class="boton-a" style="background:#ffc531">Y</span> Jugadores</span><span data-tap="B"><span class="boton-a boton-b">B</span> Menú</span></div>`);
  else panel(null);
}
alPulsarAtras(() => { if (pausado) volverAlMenu(); else pausar(true); return true; });
const irAJugadores = () => { location.href = new URL('../jugadores/index.html#paseo', location.href).href; };

// ---------- Bucle ----------
cargarAlrededor(salida.x, salida.z, true);
for (const j of jugadores) j.pos.y = altura(j.pos.x, j.pos.z);
let antes = performance.now(), fpsN = 0, fpsT = 0, verFps = params.has('fps'), tJugado = 0;
mensaje('¡A pasear!<small>Este mundo no se acaba nunca</small>', 2600);
function bucle(now) {
  const dt = Math.max(0, Math.min(0.05, (now - antes) / 1000));
  antes = now;
  pad.update(); entradas.update();
  if (!pausado) especialConY(jugadores);
  if (pad.pressed('SELECT')) verFps = !verFps;
  if (pausado) {
    if (pad.pressed('A') || pad.pressed('START')) pausar(false);
    else if (pad.pressed('Y')) irAJugadores();
    else if (pad.pressed('B')) volverAlMenu();
  } else if (pad.pressed('START')) pausar(true);

  if (!pausado) {
    tJugado += dt;
    for (const j of jugadores) j.actualizar(dt, true);
    if (VARIOS) {
      for (let a = 0; a < jugadores.length; a++) for (let b = a + 1; b < jugadores.length; b++) {
        const p = jugadores[a].pos, q = jugadores[b].pos, dx = q.x - p.x, dz = q.z - p.z, d = Math.hypot(dx, dz);
        if (d < 0.9 && d > 1e-4 && Math.abs(p.y - q.y) < 1) { const m = (0.9 - d) / 2 / d; p.x -= dx * m; p.z -= dz * m; q.x += dx * m; q.z += dz * m; }
      }
    }
    actualizarManzanas(dt);
    actualizarAmigos(dt);
    actualizarDoradas(now / 1000);
    actualizarPiezas(dt);
    actualizarMariposas(dt, grupo.x, grupo.z, now / 1000);
    cargarAlrededor(grupo.x, grupo.z);
  }
  actualizarCamara(dt);
  for (const j of jugadores) j.pintarEtiqueta();
  if (marcadorSucio) { pintarMarcador(); marcadorSucio = false; }
  $('ayuda').style.opacity = tJugado < 12 ? 1 : 0;
  renderer.render(escena, camara);

  fpsN++; fpsT += dt;
  if (fpsT >= 0.5) {
    const f = $('fps'); f.style.display = verFps ? 'block' : 'none';
    if (verFps) f.textContent = `${Math.round(fpsN / fpsT)} fps · ${renderer.info.render.calls} dibujos · ${trozos.size} trozos`;
    fpsN = 0; fpsT = 0;
    marcadorSucio = true;   // los metros cambian solos
  }
  requestAnimationFrame(bucle);
}

window.__juego = {
  get jugadores() { return jugadores.map((j) => ({ n: j.perfil.nombre, x: +j.pos.x.toFixed(1), y: +j.pos.y.toFixed(2), z: +j.pos.z.toFixed(1), suelo: j.suelo, nada: j.nadando, manzanas: j.manzanas })); },
  get trozos() { return trozos.size; },
  ir(x, z) { for (const j of jugadores) { j.pos.set(x, altura(x, z) + 1, z); } },
  altura, rio,
  manzano() { for (const t of cercanos(grupo.x, grupo.z)) for (const a of t.arboles) if (a.tipo === 'manzano') return { x: a.x, z: a.z, quedan: a.manzanas.filter((m) => m.estado === 'arbol').length, suelo: t.manzanas.filter((m) => m.estado === 'suelo').length }; return null; },
  saltar() { for (const j of jugadores) { j.vy = SALTO; j.suelo = false; sacudirManzano(j); } },
  esp() { for (const j of jugadores) especial(j.pj); },
  andar(x, z) { for (const j of jugadores) { j.bot.x = x; j.bot.z = z; j.bot.t = 99; } },
  amigo() { for (const t of trozos.values()) for (const a of t.amigos) return { x: a.x, z: a.z, animal: a.animal }; return null; },
};
vestir(THREE, escena, { lejos: 14 });
requestAnimationFrame(bucle);
