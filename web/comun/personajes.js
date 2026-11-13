// Personajes: los nueve animales en GLB (modelos/animales/*.glb, con esqueleto y sin clips de animación).
// Toda la animación es procedural, sobre los huesos (sacada del prototipo "Bichos del bosque"):
// el juego mueve p.g como siempre y animarPersonaje() deduce de ese movimiento el paso, el salto y los giros.
//
//   const p = crearPersonaje(THREE, perfil);  escena.add(p.g);
//   animarPersonaje(p, { paso, suelo, aplasta, mirar, dt })   (la misma llamada que antes)
//   p.g (lo mueve el juego) · p.cabeza · p.patas · p.alas · p.escala · p.aplicar(otroPerfil)
//
// Los modelos se cargan antes de que arranque el juego (await en este módulo). Si algo falla, o con ?bolas en la
// dirección, se usan los animales de bolas de siempre (personajes-bolas.js).
import * as THREE from '../lib/three.min.js';
import { ANIMALES } from './perfiles.js';
import * as Bolas from './personajes-bolas.js';
import { REGLA } from './estaciones.js';

export const materialToon = Bolas.materialToon;
export function datosAnimal(id) { return ANIMALES.find((x) => x.id === id) || ANIMALES[0]; }
export function colorBase(perfil) { return Bolas.colorBase(perfil); }

// Alto de cada animal en el juego. Las proporciones entre ellos son las del prototipo (el conejo y el erizo, pequeños;
// el cervatillo y el oso, los más altos); la oveja mide lo de siempre. El alcance en los juegos es igual para todos.
const ALTO = { oveja: 1.37, zorro: 1.3, conejo: 1.15, cervatillo: 1.65, jabali: 1.4, ardilla: 1.2, erizo: 0.86, buho: 1.15, oso: 1.5 };

// ---------- Especies: qué hueso es cada cosa y cómo se mueve cada animal ----------
const PI = Math.PI;
const BN = (n) => 'Bone_' + n;
const cad = (...ns) => ns.map(BN);
const cuatro = (fl, fr, bl, br) => [{ b: fl, front: true }, { b: fr, front: true }, { b: bl, front: false }, { b: br, front: false }];
const BASE = {
  walk: 1.4, run: 5, jump: 6, turnWalk: 8, turnRun: 5,
  ampWalk: 0.45, ampRun: 0.8, liftWalk: 0.8, liftRun: 1.3, maxRate: 18,
  walkOff: [0, PI, PI, 2 * PI], runOff: [0, 0.7, PI + 0.4, PI + 1.1],
  bobWalk: 0.012, bobRun: 0.05, bobHop: 0, pitchRun: 0.08, pitchWalk: 0, rollWalk: 0.04, swayWalk: 0.04,
  headRun: 0, headNod: 0.05, headSway: 0, lookAmp: 0.4, lookSnap: 5, counterRoll: 0,
  earBack: 0.3, earFlop: 0, tailRun: 0.4, tailFreq: 5, tailAmp: 0.25, tailBurst: false, tailDrag: 0.1, sniff: false, height: 1, skid: 0.5, lean: 0,
};
const POSE = {
  legPose: (front, sw, lift) => [sw, lift, -lift * 0.6],
  airPose: (front, vy) => (front ? [-0.45 - 0.45 * vy, 0.45, -0.2] : [0.45 + 0.45 * vy, 0.45 + 0.3 * Math.max(0, -vy), -0.2]),
};
const ESPECIES = {
  zorro: {
    rig: { root: BN('000'), spine: cad('012', '011', '010'), neck: BN('020'), head: BN('018'), snout: BN('030'), ears: cad('033', '036'),
      tail: cad('017', '016', '015', '014'), legs: cuatro(cad('024', '023', '022'), cad('028', '027', '026'), cad('005', '004', '003'), cad('009', '008', '007')) },
    style: { skid: 0.6,  height: 1.15, walk: 1.5, run: 6.2, jump: 6.8, turnWalk: 10, turnRun: 6.5, ampWalk: 0.5, ampRun: 0.9, liftWalk: 0.7, liftRun: 1.2,
      bobWalk: 0.008, bobRun: 0.045, pitchRun: 0.09, rollWalk: 0.025, headRun: 0.14, headNod: 0.03, lookAmp: 0.5, lookSnap: 7,
      earBack: 0.45, tailRun: -0.4, tailFreq: 2.2, tailAmp: 0.3, tailDrag: 0.24 },
  },
  conejo: {
    rig: { root: BN('000'), spine: cad('015'), head: BN('014'), ears: cad('021', '019'), tail: cad('017'),
      legs: cuatro(cad('004', '003', '002'), cad('007', '006', '005'), cad('010', '009'), cad('013', '012')) },
    style: { skid: 0.2,  height: 0.9, walk: 1.3, run: 5.2, jump: 7, turnWalk: 10, turnRun: 7, ampWalk: 0.5, ampRun: 0.85, liftWalk: 0.6, liftRun: 1, maxRate: 11.5,
      walkOff: [0.3, 0.5, PI, PI], runOff: [0.3, 0.5, PI, PI], bobWalk: 0, bobHop: 0.1, bobRun: 0.16, pitchWalk: 0.15, pitchRun: 0.2, rollWalk: 0, swayWalk: 0,
      headNod: 0, lookAmp: 0.5, lookSnap: 9, earBack: 0.5, earFlop: 0.28, tailRun: 0.3, tailFreq: 14, tailAmp: 0.3, tailBurst: true },
  },
  oveja: {
    rig: { root: BN('000'), spine: [], neck: BN('006'), head: BN('004'), ears: cad('020', '018'), tail: cad('021'), jiggle: cad('003'),
      legs: cuatro(cad('012', '011', '010'), cad('016', '015', '014'), cad('031', '030', '029'), cad('026', '025', '024')) },
    style: { height: 1.2, walk: 1.15, run: 4.6, jump: 5.8, ampWalk: 0.42, liftWalk: 0.6, maxRate: 16, runOff: [0, 0.25, PI, PI + 0.25],
      bobWalk: 0.014, bobRun: 0.07, pitchRun: 0.12, rollWalk: 0.075, headNod: 0.11, lookAmp: 0.35, lookSnap: 3,
      earBack: 0.3, earFlop: 0.15, tailFreq: 13, tailAmp: 0.4, tailBurst: true },
  },
  cervatillo: {
    rig: { root: 'Hips', spine: ['chest'], head: 'head', snout: 'headend', ears: ['earend', 'R_earend'], tail: ['tailstart', 'tail1', 'tail2'],
      legs: cuatro(['frontleg', 'frontleg0', 'frontleg1'], ['R_frontleg', 'R_frontleg0', 'R_frontleg1'], ['backleg', 'backleg0', 'backleg1'], ['R_backleg', 'R_backleg0', 'R_backleg1']) },
    style: { skid: 0.4,  height: 1.55, walk: 1.25, run: 6.4, jump: 7.8, turnWalk: 9, turnRun: 6, ampWalk: 0.36, liftWalk: 1.15, liftRun: 1.5, maxRate: 14,
      walkOff: [PI, 0, 1.5 * PI, 0.5 * PI], runOff: [0, 0.45, PI + 0.15, PI + 0.6], bobWalk: 0.006, bobRun: 0.075, pitchRun: 0.14, rollWalk: 0.03,
      headRun: -0.1, headNod: 0.09, lookAmp: 0.75, lookSnap: 11, earBack: 0.25, tailRun: 1.1, tailFreq: 17, tailAmp: 0.55, tailBurst: true },
    pata: 0.45,   // largo de pata, en fracción del alto (sus huesos no sirven para medirlo)
    legPose: (front, sw, lift) => (front ? [sw, -lift * 0.45, lift * 1.25] : [sw * 0.85, lift * 0.7, -lift * 0.95]),
    airPose: (front, vy) => (front ? [-0.55 - 0.25 * vy, -0.6, 1.5] : [0.55 + 0.45 * vy, 0.25, -0.3]),
  },
  jabali: {
    rig: { root: BN('000'), spine: cad('004', '003', '002'), neck: BN('018'), head: BN('016'), snout: BN('028'), ears: cad('030', '032'),
      tail: cad('015', '014', '013'), legs: cuatro(cad('022', '021', '020'), cad('026', '025', '024'), cad('008', '007', '006'), cad('012', '011', '010')) },
    style: { skid: 1,  height: 1.25, walk: 1.5, run: 5.4, turnRun: 3.5, ampWalk: 0.5, ampRun: 0.85, liftWalk: 0.75, maxRate: 19,
      bobWalk: 0.018, bobRun: 0.053, pitchRun: 0.07, rollWalk: 0.05, swayWalk: 0.05, headRun: 0.24, headNod: 0.04, lookAmp: 0.3, lookSnap: 2.5,
      earBack: 0.4, tailRun: 0.75, tailFreq: 7, tailAmp: 0.3, sniff: true },
  },
  erizo: {
    rig: { root: BN('000'), spine: cad('007', '006'), head: BN('009'), snout: BN('008'), ears: [], tail: [],
      legs: cuatro(cad('011', '010'), cad('013', '012'), cad('005', '004'), cad('003', '002')) },
    style: { skid: 0.1,  height: 0.75, walk: 1.1, run: 3.6, jump: 3.8, turnWalk: 10, turnRun: 8, ampWalk: 0.5, ampRun: 0.75, liftWalk: 0.5, liftRun: 0.7, maxRate: 34,
      bobWalk: 0.004, bobRun: 0.012, pitchRun: 0.02, rollWalk: 0.06, swayWalk: 0.09, headNod: 0.02, lookAmp: 0.3, lookSnap: 6, sniff: true },
  },
  buho: {
    rig: { root: BN('000'), spine: cad('001', '003'), head: BN('002'), ears: cad('017', '019'), tail: cad('011'), wings: cad('015', '013'),
      legs: [{ b: cad('006', '005'), front: false }, { b: cad('009', '008'), front: false }] },
    style: { skid: 0.2,  height: 1.0, walk: 0.9, run: 3.2, jump: 7.4, turnWalk: 7, ampWalk: 0.5, ampRun: 0.7, liftWalk: 0.8, liftRun: 1, maxRate: 13,
      walkOff: [0, PI], runOff: [0, PI], bobWalk: 0.02, bobRun: 0.05, pitchRun: 0.04, rollWalk: 0.17, swayWalk: 0.12, headNod: 0, counterRoll: 1,
      lookAmp: 0.45, lookSnap: 10, earBack: 0.2, tailRun: 0.3, tailFreq: 3, tailAmp: 0.1 },
  },
  ardilla: {
    rig: { root: BN('000'), spine: cad('003', '002'), neck: BN('035'), head: BN('033'), ears: cad('065', '062'), tail: cad('019', '018', '017', '016', '015'),
      // brazos (hombro, codo, muñeca) y el hueso de la bellota: solo la saca para roerla (su especial)
      arms: [cad('026', '025', '024'), cad('031', '030', '029')], nut: BN('022'),
      // El auto-rig pegó a los huesos de la cola parte de la espalda, la nuca y las orejas (estaban cerca), y a las
      // clavículas algo de la cabeza: al tumbarse para correr se estiraban en pico. Se les quita ese peso (la cola
      // de verdad es un trozo aparte de la malla y no se toca).
      remiendo: [{ de: cad('016', '017', '018', '019', '020'), a: BN('001'), salvoSuTrozo: true }, { de: cad('027', '032'), a: BN('033'), alto: 0.45, fondo: 0.58 }],
      legs: [{ b: cad('013', '012', '011'), front: false }, { b: cad('008', '007', '006'), front: false }] },
    style: { skid: 0.2, lean: 1.0,  height: 1.05, walk: 1.2, run: 5, jump: 7.2, turnWalk: 11, turnRun: 8, ampWalk: 0.5, ampRun: 0.8, liftWalk: 0.6, liftRun: 0.9, maxRate: 12,
      walkOff: [0, 0.2], runOff: [0, 0.2], bobWalk: 0, bobHop: 0.09, bobRun: 0.14, pitchWalk: 0.08, pitchRun: 0.14, rollWalk: 0, swayWalk: 0, headNod: 0,
      lookAmp: 0.8, lookSnap: 12, earBack: 0.3, tailRun: -0.3, tailFreq: 9, tailAmp: 0.22, tailBurst: true, tailDrag: 0.2 },
  },
  oso: {
    rig: { root: BN('000'), spine: cad('012', '011', '010'), head: BN('014'), ears: [], tail: [],
      legs: cuatro(cad('019', '018', '017'), cad('024', '023', '022'), cad('005', '004', '003'), cad('009', '008', '007')) },
    style: { skid: 0.8,  height: 1.3, walk: 1.25, run: 4.8, jump: 5.4, turnWalk: 6, turnRun: 3.5, ampWalk: 0.5, liftWalk: 0.7, liftRun: 1.1, maxRate: 15,
      walkOff: [0, PI, 0.4, PI + 0.4], bobWalk: 0.02, bobRun: 0.06, pitchRun: 0.1, rollWalk: 0.11, swayWalk: 0.1, headRun: 0.1, headNod: 0.03, headSway: 0.2,
      lookAmp: 0.35, lookSnap: 2.5 },
  },
};
for (const d of Object.values(ESPECIES)) { d.style = { ...BASE, ...d.style }; for (const k in POSE) if (!d[k]) d[k] = POSE[k]; }

// Dónde llevan los accesorios, en fracciones del alto del modelo (medido a ojo sobre cada animal):
// centro de la cabeza (cy, cz), coronilla (top), ojos (ojoY, ojoZ), ancho de la cabeza y cuello (bufanda)
const CABEZA = {
  zorro: { cy: 0.69, cz: 0.36, top: 0.82, ojoY: 0.71, ojoZ: 0.41, ancho: 0.56, cuelloY: 0.55, cuelloZ: 0.24 },
  conejo: { cy: 0.52, cz: 0.16, top: 0.64, ojoY: 0.54, ojoZ: 0.26, ancho: 0.48, cuelloY: 0.42, cuelloZ: 0.08 },
  oveja: { cy: 0.66, cz: 0.30, top: 0.80, ojoY: 0.67, ojoZ: 0.42, ancho: 0.44, cuelloY: 0.56, cuelloZ: 0.30 },
  cervatillo: { cy: 0.78, cz: 0.24, top: 0.88, ojoY: 0.80, ojoZ: 0.31, ancho: 0.42, cuelloY: 0.66, cuelloZ: 0.16 },
  jabali: { cy: 0.46, cz: 0.46, top: 0.64, ojoY: 0.60, ojoZ: 0.63, ancho: 0.66, cuelloY: 0.40, cuelloZ: 0.36 },
  erizo: { cy: 0.42, cz: 0.42, top: 0.60, ojoY: 0.50, ojoZ: 0.59, ancho: 0.54, cuelloY: 0.33, cuelloZ: 0.36 },
  buho: { cy: 0.75, cz: 0.08, top: 0.90, ojoY: 0.76, ojoZ: 0.33, ancho: 0.72, cuelloY: 0.55, cuelloZ: 0.03 },
  ardilla: { cy: 0.68, cz: 0.25, top: 0.81, ojoY: 0.70, ojoZ: 0.38, ancho: 0.50, cuelloY: 0.55, cuelloZ: 0.14 },
  oso: { cy: 0.56, cz: 0.18, top: 0.77, ojoY: 0.66, ojoZ: 0.37, ancho: 0.72, cuelloY: 0.45, cuelloZ: 0.12 },
};

// Movimiento especial de cada animal (botón Y en los juegos, y al celebrar)
const ESPECIAL = {
  zorro: { tipo: 'pounce', dur: 1.1, recarga: 2, nombre: 'Salto de caza', poder: 'Salta lejísimos hacia delante' },
  conejo: { tipo: 'binky', dur: 1.0, recarga: 2, nombre: 'Pirueta', poder: 'El salto más alto de todos' },
  oveja: { tipo: 'pronk', dur: 2.3, recarga: 3, nombre: 'Rebote de lana', poder: 'Tres botes, cada uno más alto. La lana la protege de todo' },
  cervatillo: { tipo: 'pronk', dur: 1.8, recarga: 3, nombre: 'Brincos', poder: 'Tres brincos largos, el más veloz' },
  jabali: { tipo: 'charge', dur: 1.6, recarga: 3.5, nombre: 'Embestida', poder: 'Corre a toda pastilla y aparta a todos' },
  erizo: { tipo: 'ball', dur: 2.6, recarga: 4, nombre: 'Bola rodante', poder: 'Rueda deprisa y nada le hace daño' },
  buho: { tipo: 'flap', dur: 2.6, recarga: 2.5, nombre: 'Vuelo', poder: 'Tres aleteos: sube alto y planea despacito' },
  ardilla: { tipo: 'throw', dur: 0.9, recarga: 2.5, nombre: 'Bellotazo', poder: 'Lanza su bellota lejos: tumba, espanta o revienta lo que pille' },
  oso: { tipo: 'stand', dur: 2.0, recarga: 3, nombre: 'Rugido', poder: 'Se pone de pie y ruge: aparta todo lo que tiene cerca' },
};
/**
 * Lo que el especial hace en el juego, según el tiempo t desde que empezó. Cada animal sirve para una cosa distinta:
 * lejos (zorro), alto (conejo), aire (búho), a salvo (oveja, erizo), veloz (cervatillo, ardilla), a empujones (jabalí, oso).
 *   vel: multiplica la velocidad · saltos: [instantes] con fuerza `salto` (× el salto normal; puede ser una lista) · avance: impulso hacia delante
 *   grav: multiplica la gravedad al caer (planear) · invulnerable · empuja (aparta/tumba a quien toca) · rugido: radio, en el instante `rugeEn`
 *   lejos: a qué distancia por delante cae ese golpe (0 = alrededor del animal; la bellota de la ardilla, 6)
 */
const PODER = {
  zorro: { vel: 1.3, saltos: [0.18], salto: 1.15, avance: 1.7 },
  conejo: { vel: 1.15, saltos: [0], salto: 1.65 },
  oveja: { vel: 1.2, saltos: [0, 0.6, 1.35], salto: [0.75, 0.95, 1.2], invulnerable: true },
  cervatillo: { vel: 1.55, saltos: [0, 0.6, 1.2], salto: 0.9 },
  jabali: { vel: 1.9, empuja: true },
  erizo: { vel: 1.45, invulnerable: true, empuja: true },
  buho: { vel: 1.1, saltos: [0, 0.5, 1.0], salto: [1.0, 0.7, 0.7], grav: 0.25 },   // tres aleteos: es quien más rato está en el aire
  ardilla: { vel: 0.6, rugido: 2.2, rugeEn: 0.55, lejos: 6 },   // la bellota cae 6 m por delante (en las pompas, hacia arriba)
  oso: { vel: (t) => (t < 0.9 ? 0.25 : 1), rugido: 4.5, rugeEn: 0.45 },
};
export function textoPoder(animal) { return (ESPECIAL[animal] || ESPECIAL.oveja).poder; }
export function nombreEspecial(animal) { return (ESPECIAL[animal] || ESPECIAL.oveja).nombre; }
/** pounce | binky | pronk | charge | ball | flap | nibble | stand (para elegir el sonido, por ejemplo). */
export function tipoEspecial(animal) { return (ESPECIAL[animal] || ESPECIAL.oveja).tipo; }
/** 0 = el especial está listo; 1 = acaba de usarse (para pintar la recarga, si un juego quiere). */
export function recargaEspecial(p) { const A = p && p._; if (!A) return 0; return A.accion ? 1 : Math.min(1, A.recarga / Math.max(0.1, A.recargaTotal || 1)); }
/** Hace el movimiento especial del animal. Devuelve false si ya lo estaba haciendo. */
/**
 * Lo que el especial le hace ahora al juego. Los juegos lo leen cada fotograma al mover al jugador:
 * { activo, vel, salto (0 o la fuerza de un salto que hay que dar YA), avance, grav, invulnerable, empuja, rugido (0 o radio), lejos }
 * Al llamarlo, el personaje deja que el juego haga los saltos de verdad (la animación ya no se eleva sola).
 */
export function poder(p) {
  const r = { activo: false, vel: 1, salto: 0, avance: 0, grav: 1, invulnerable: false, empuja: false, rugido: 0, lejos: 0 };
  if (!p || !p._) return r;
  const A = p._;
  A.fisica = true;
  const ac = A.accion;
  if (!ac) return r;
  const P = PODER[p.perfil.animal] || {}, t = ac.t;
  r.activo = true;
  r.vel = typeof P.vel === 'function' ? P.vel(t) : P.vel ?? 1;
  r.grav = P.grav ?? 1;
  r.invulnerable = !!P.invulnerable; r.empuja = !!P.empuja;
  ac.hechos = ac.hechos || new Set();
  (P.saltos || []).forEach((ts, i) => { if (t >= ts && !ac.hechos.has(i)) { ac.hechos.add(i); r.salto = (Array.isArray(P.salto) ? P.salto[i] : P.salto) || 1; if (i === 0) r.avance = P.avance || 0; } });
  if (P.rugido && t >= P.rugeEn && !ac.hechos.has('r')) { ac.hechos.add('r'); r.rugido = P.rugido; r.lejos = P.lejos || 0; }
  return r;
}
export function especial(p) {
  if (!p || !p._) { if (p) p._bolasSalto = 1; return !!p; }
  const A = p._;
  if (A.accion || A.recarga > 0) return false;
  const E = ESPECIAL[p.perfil.animal] || ESPECIAL.oveja;
  A.accion = { tipo: E.tipo, dur: E.dur, t: 0, recarga: E.recarga || 2 };
  return true;
}

// ---------- Carga de los modelos ----------
const FUENTES = {};   // animal -> { escena, alto (del modelo), cabeza: { centro, top, frente, ancho, bajo }, piernas }
async function cargar() {
  const [{ GLTFLoader }, { clone }] = await Promise.all([import('../lib/addons/GLTFLoader.js'), import('../lib/addons/SkeletonUtils.js')]);
  clonar = clone;
  const loader = new GLTFLoader();
  await Promise.all(Object.keys(ESPECIES).map(async (id) => {
    const gltf = await loader.loadAsync(new URL(`../modelos/animales/${id}.glb`, import.meta.url).href);
    FUENTES[id] = preparar(id, gltf.scene);
  }));
}
let clonar = null;

/** Cosas que se calculan una vez por modelo: tamaño, dónde está la cabeza (para los accesorios), materiales ligeros. */
function preparar(id, escena) {
  escena.updateMatrixWorld(true);
  const caja = new THREE.Box3().setFromObject(escena, true);
  const alto = caja.max.y - caja.min.y;
  escena.traverse((o) => {
    if (o.isMesh) {
      // Lambert en vez de Standard: se ve casi igual (rugosidad 1, sin metal) y la tele va mucho más suelta
      const m = o.material;
      o.material = new THREE.MeshLambertMaterial({ map: m.map || null, color: m.color ? m.color.clone() : 0xffffff, side: m.side });
      if (o.material.map) {
        const t = o.material.map;
        t.colorSpace = THREE.SRGBColorSpace;
        // Sin mipmaps: la textura es un mosaico de trocitos muy juntos y, al verse pequeña (la tele pinta a
        // 1180 px y sin antialias), las versiones reducidas mezclan trocitos vecinos y salen rayas en la cara.
        t.generateMipmaps = false; t.minFilter = THREE.LinearFilter; t.needsUpdate = true;
      }
    }
  });
  if (ESPECIES[id].rig.nut) soltarPieza(escena, ESPECIES[id].rig.nut);
  for (const r of ESPECIES[id].rig.remiendo || []) remendar(escena, r);
  const C = CABEZA[id], A = alto, y0 = caja.min.y;
  return {
    escena, alto, suelo: y0,
    cabeza: { centro: new THREE.Vector3(0, y0 + C.cy * A, C.cz * A), top: y0 + C.top * A, ojoY: y0 + C.ojoY * A, frente: C.ojoZ * A,
      ancho: C.ancho * A, cuelloY: y0 + C.cuelloY * A, cuelloZ: C.cuelloZ * A },
  };
}

/** Trozos sueltos de una malla: devuelve raiz(i), que da el mismo número a los vértices unidos entre sí. */
function trozosDe(g) {
  const P = g.attributes.position, n = P.count, padre = new Int32Array(n), porSitio = new Map();
  const raiz = (x) => { while (padre[x] !== x) { padre[x] = padre[padre[x]]; x = padre[x]; } return x; };
  // misma posición = mismo vértice; los triángulos unen los suyos
  for (let i = 0; i < n; i++) { const k = `${P.getX(i).toFixed(4)},${P.getY(i).toFixed(4)},${P.getZ(i).toFixed(4)}`; if (porSitio.has(k)) padre[i] = porSitio.get(k); else { porSitio.set(k, i); padre[i] = i; } }
  const idx = g.index, nt = (idx ? idx.count : n) / 3, v = (t) => (idx ? idx.getX(t) : t);
  for (let t = 0; t < nt; t++) { const a = raiz(v(t * 3)); padre[raiz(v(t * 3 + 1))] = a; padre[raiz(v(t * 3 + 2))] = a; }
  return raiz;
}

/**
 * La bellota de la ardilla es un trozo suelto de la malla, pero viene pegada sobre todo al hueso del pecho. Aquí se
 * busca ese trozo (los vértices unidos entre sí) y se cuelga entero de su propio hueso: así cada ardilla puede
 * esconderla (hueso encogido) o sacarla sin tocar el modelo.
 */
function soltarPieza(escena, nombreHueso) {
  escena.traverse((o) => {
    if (!o.isSkinnedMesh) return;
    const huesos = o.skeleton.bones, cual = huesos.findIndex((h) => h.name === nombreHueso);
    if (cual < 0) return;
    const suyos = new Set([cual, ...huesos.map((h, i) => (h.parent === huesos[cual] ? i : -1)).filter((i) => i >= 0)]);
    const g = o.geometry, P = g.attributes.position, SI = g.attributes.skinIndex, SW = g.attributes.skinWeight, n = P.count;
    const raiz = trozosDe(g);
    // el trozo con más vértices que ya siguen sobre todo a ese hueso (o a su hijo)
    const votos = new Map();
    for (let i = 0; i < n; i++) {
      let mejor = 0; for (let k = 1; k < 4; k++) if (SW.getComponent(i, k) > SW.getComponent(i, mejor)) mejor = k;
      if (suyos.has(SI.getComponent(i, mejor))) { const r = raiz(i); votos.set(r, (votos.get(r) || 0) + 1); }
    }
    let trozo = -1, max = 0; for (const [r, c] of votos) if (c > max) { max = c; trozo = r; }
    if (trozo < 0) return;
    // …y los trocitos sueltos que van con él (el sombrerito de la bellota): los que caen dentro de su caja
    const caja = new THREE.Box3(), punto = new THREE.Vector3(), cajas = new Map();
    for (let i = 0; i < n; i++) { const r = raiz(i); if (!cajas.has(r)) cajas.set(r, new THREE.Box3()); cajas.get(r).expandByPoint(punto.fromBufferAttribute(P, i)); }
    caja.copy(cajas.get(trozo)).expandByScalar(caja.copy(cajas.get(trozo)).getSize(punto).length() * 0.12);
    const piezas = new Set([trozo]);
    const largo = cajas.get(trozo).getSize(punto).length(), centro = new THREE.Vector3();
    for (const [r, c] of cajas) {
      if (window.DEPURA_PIEZAS) console.log('PIEZA', r === trozo, c.min.toArray().map((x) => x.toFixed(2)).join(','), c.max.toArray().map((x) => x.toFixed(2)).join(','));
      if (c.getSize(punto).length() < largo * 1.5 && caja.containsPoint(c.getCenter(centro))) piezas.add(r);
    }
    for (let i = 0; i < n; i++) if (piezas.has(raiz(i))) { SI.setXYZW(i, cual, 0, 0, 0); SW.setXYZW(i, 1, 0, 0, 0); }
    SI.needsUpdate = true; SW.needsUpdate = true;
  });
}

/**
 * Quita de la malla el peso de los huesos `de` y lo reparte entre los demás huesos de cada vértice (o se lo da entero
 * a `a` si no le queda ninguno). Solo en una zona (por encima de `alto` y por delante de `fondo`, en fracciones de la
 * caja de la malla) o, con salvoSuTrozo, en todo menos en el trozo suelto que más sigue a esos huesos (el suyo).
 */
function remendar(escena, { de, a, alto = 0, fondo = 0, salvoSuTrozo = false }) {
  escena.traverse((o) => {
    if (!o.isSkinnedMesh) return;
    const huesos = o.skeleton.bones, malos = new Set(de.map((n) => huesos.findIndex((h) => h.name === n))), bueno = huesos.findIndex((h) => h.name === a);
    if (bueno < 0) return;
    const g = o.geometry, P = g.attributes.position, SI = g.attributes.skinIndex, SW = g.attributes.skinWeight, n = P.count;
    const pesoMalo = (i) => { let s = 0; for (let k = 0; k < 4; k++) if (malos.has(SI.getComponent(i, k))) s += SW.getComponent(i, k); return s; };
    let raiz = null, suyo = -1;
    if (salvoSuTrozo) {
      raiz = trozosDe(g);
      const suma = new Map(); let max = 0;
      for (let i = 0; i < n; i++) { const r = raiz(i), s = (suma.get(r) || 0) + pesoMalo(i); suma.set(r, s); if (s > max) { max = s; suyo = r; } }
    }
    g.computeBoundingBox();
    const c = g.boundingBox, w = [0, 0, 0, 0];
    for (let i = 0; i < n; i++) {
      if (raiz && raiz(i) === suyo) continue;
      if ((P.getY(i) - c.min.y) / (c.max.y - c.min.y) < alto || (P.getZ(i) - c.min.z) / (c.max.z - c.min.z) < fondo) continue;
      let quitado = 0, queda = 0;
      for (let k = 0; k < 4; k++) { w[k] = SW.getComponent(i, k); if (malos.has(SI.getComponent(i, k))) { quitado += w[k]; w[k] = 0; } else queda += w[k]; }
      if (!quitado) continue;
      if (queda < 0.05) { SI.setXYZW(i, bueno, 0, 0, 0); SW.setXYZW(i, 1, 0, 0, 0); }
      else SW.setXYZW(i, w[0] / queda, w[1] / queda, w[2] / queda, w[3] / queda);
    }
    SI.needsUpdate = true; SW.needsUpdate = true;
  });
}

let USAR_GLB = !/[?&]bolas\b/.test(location.search);
if (USAR_GLB) {
  try { await cargar(); } catch (e) { console.warn('No se pudieron cargar los animales GLB; uso los de bolas.', e); USAR_GLB = false; }
}
export const conModelos = USAR_GLB;

// ---------- Color del pelo: tiñe la textura sin perder los ojos ni el dibujo ----------
const ARCO = ['#ff5d73', '#ff9f43', '#ffd93d', '#6bd968', '#4cc3ff', '#7b7bff', '#c17bff'];
const cacheMat = new Map();
/** Material de una malla según el color de pelo. "natural" = el del modelo, compartido por todos. */
function materialPara(base, pelo, eje) {
  if (!pelo || pelo === 'natural') return base;
  const k = base.uuid + pelo;
  if (cacheMat.has(k)) return cacheMat.get(k);
  const m = base.clone();
  const arco = pelo === 'arcoiris';
  const uni = { uTinte: { value: new THREE.Color(arco ? '#ffffff' : pelo) }, uEje: { value: eje } };
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uni);
    sh.vertexShader = 'uniform vec4 uEje;\nvarying float vAltura;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n  vAltura = dot(position, uEje.xyz) + uEje.w;');
    sh.fragmentShader = 'uniform vec3 uTinte;\nvarying float vAltura;\n'
      + (arco ? 'vec3 arcoiris(float h) { return clamp(abs(mod(h * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0); }\n' : '')
      + sh.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
        float lum = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114));
        vec3 tinte = ${arco ? 'mix(arcoiris(vAltura * 1.6), vec3(1.0), 0.25)' : 'uTinte'};
        // Lo oscuro (ojos, nariz) se queda oscuro; lo claro toma el color elegido
        diffuseColor.rgb = mix(diffuseColor.rgb, tinte * (0.3 + lum * 1.05), smoothstep(0.08, 0.3, lum) * 0.85);`);
  };
  m.customProgramCacheKey = () => 'tinte-' + (arco ? 'arco' : 'color');
  cacheMat.set(k, m);
  return m;
}

// ---------- Accesorios (los mismos de siempre, colocados en la cabeza de cada modelo) ----------
let GA = null;
function geoAcc() {
  if (GA) return GA;
  GA = {
    esfera: new THREE.SphereGeometry(1, 16, 12), cono: new THREE.ConeGeometry(1, 1, 12), cono5: new THREE.ConeGeometry(1, 1, 6),
    cil: new THREE.CylinderGeometry(1, 1, 1, 16), anillo: new THREE.CylinderGeometry(1, 1, 1, 16, 1, true),
    cupula: new THREE.SphereGeometry(1, 18, 9, 0, Math.PI * 2, 0, Math.PI / 2), toro: new THREE.TorusGeometry(1, 0.2, 8, 24),
  };
  return GA;
}
const matAcc = new Map();
const lam = (c, extra = {}) => { const k = c + JSON.stringify(extra); if (!matAcc.has(k)) matAcc.set(k, new THREE.MeshLambertMaterial({ color: c, ...extra })); return matAcc.get(k); };
/** Construye el accesorio en unidades de "cabeza de bolas" (ancho ~0,62, origen en el centro de la cabeza). */
function crearAccesorio(p, { top, frente, ojoY, cuelloY, cuelloZ }) {
  const geo = geoAcc(), acc = new THREE.Group(), cj = lam(p.color);
  const malla = (g, m, padre, x, y, z, sx, sy = sx, sz = sx, rx = 0, ry = 0, rz = 0) => {
    const o = new THREE.Mesh(g, m); o.position.set(x, y, z); o.scale.set(sx, sy, sz); o.rotation.set(rx, ry, rz); padre.add(o); return o;
  };
  const E = (m, padre, ...a) => malla(geo.esfera, m, padre, ...a);
  switch (p.accesorio) {
    case 'corona': {
      acc.position.set(0, top + 0.03, -0.02);
      const oro = lam('#ffcc33', { side: THREE.DoubleSide });
      malla(geo.anillo, oro, acc, 0, 0, 0, 0.15, 0.1, 0.15);
      for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2; malla(geo.cono5, oro, acc, Math.sin(a) * 0.15, 0.09, Math.cos(a) * 0.15, 0.035, 0.09, 0.035); }
      E(cj, acc, 0, 0, 0.155, 0.03);
      break;
    }
    case 'lazo':
      acc.position.set(0.17, top + 0.02, 0.02); acc.rotation.z = -0.35; acc.scale.setScalar(1.35);
      malla(geo.cono, cj, acc, -0.07, 0, 0, 0.08, 0.14, 0.06, 0, 0, -Math.PI / 2);
      malla(geo.cono, cj, acc, 0.07, 0, 0, 0.08, 0.14, 0.06, 0, 0, Math.PI / 2);
      E(cj, acc, 0, 0, 0, 0.04);
      break;
    case 'gorro':
      acc.position.set(0, top - 0.08, -0.01);
      malla(geo.cupula, cj, acc, 0, 0, 0, 0.25);
      malla(geo.toro, lam('#fff4e0'), acc, 0, 0.01, 0, 0.245, 0.245, 0.245, Math.PI / 2);
      E(lam('#fff4e0'), acc, 0, 0.28, 0, 0.075);
      break;
    case 'gafas': {
      acc.position.set(0, ojoY, frente + 0.03);
      const vidrio = new THREE.MeshPhongMaterial({ color: '#221a2a', shininess: 90, specular: '#888888' });
      for (const s of [-1, 1]) malla(geo.cil, vidrio, acc, s * 0.12, 0, 0, 0.085, 0.025, 0.085, Math.PI / 2);
      malla(geo.cil, cj, acc, 0, 0.01, 0, 0.014, 0.08, 0.014, 0, 0, Math.PI / 2);
      break;
    }
    case 'flor':
      acc.position.set(-0.19, top, 0.08); acc.rotation.set(0.3, 0, 0.4); acc.scale.setScalar(1.3);
      for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2; E(cj, acc, Math.cos(a) * 0.06, Math.sin(a) * 0.06, 0, 0.055, 0.055, 0.025); }
      E(lam('#ffd93d'), acc, 0, 0, 0.01, 0.038);
      break;
    case 'copa': {
      acc.position.set(0, top + 0.1, -0.03);
      const tela = lam('#2b2233');
      malla(geo.cil, tela, acc, 0, 0, 0, 0.13, 0.26, 0.13);
      malla(geo.cil, tela, acc, 0, -0.12, 0, 0.22, 0.02, 0.22);
      malla(geo.cil, cj, acc, 0, -0.08, 0, 0.135, 0.05, 0.135);
      break;
    }
    case 'bufanda':
      acc.position.set(0, cuelloY, cuelloZ);
      acc.rotation.x = 0.3;   // un poco inclinada, como el cuello
      malla(geo.toro, cj, acc, 0, 0, 0, 0.24, 0.24, 0.26, Math.PI / 2);
      malla(geo.cil, cj, acc, 0.13, -0.13, 0.18, 0.05, 0.22, 0.02, 0.2, 0, 0.15);
      break;
    default: return null;
  }
  return acc;
}

// ---------- Crear un personaje ----------
const _m = new THREE.Matrix4(), _m2 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _v = new THREE.Vector3(), _s = new THREE.Vector3();
const _eu = new THREE.Euler(0, 0, 0, 'YXZ');
let semilla = 1;

export function crearPersonaje(THREE_, perfil = {}, opciones = {}) {
  if (!USAR_GLB) { const b = Bolas.crearPersonaje(THREE_, perfil, opciones); b.g.userData.sinEstacion = true; return b; }
  const g = new THREE.Group();
  g.userData.sinEstacion = true;
  const res = { g, cuerpo: null, cabeza: null, patas: [], alas: [], escala: 1, aplicar, glb: true };
  function aplicar(p) {
    p = { animal: 'oveja', pelo: 'natural', accesorio: 'nada', color: '#ff4d6d', ...p };
    if (!FUENTES[p.animal]) p.animal = 'oveja';
    for (const c of [...g.children]) g.remove(c);
    const F = FUENTES[p.animal], def = ESPECIES[p.animal];
    res.escala = datosAnimal(p.animal).escala || 1;
    g.scale.setScalar(res.escala);
    const interno = new THREE.Group();   // aquí van el aplastarse y el tamaño del modelo
    const pivote = new THREE.Group();    // en el centro del cuerpo: para rodar y dar vueltas
    const modelo = clonar(F.escena);
    const centroY = F.alto * 0.42;
    pivote.position.y = centroY;
    pivote.add(modelo);
    interno.add(pivote);
    g.add(interno);
    const s = (ALTO[p.animal] / res.escala) / F.alto;
    modelo.position.y = -F.suelo - centroY;
    interno.scale.setScalar(s);
    // Materiales (color de pelo) y huesos
    const huesos = {};
    g.updateWorldMatrix(true, true);
    const raizInv = _m.copy(modelo.matrixWorld).invert().clone();
    const raizQ = modelo.getWorldQuaternion(new THREE.Quaternion()).invert();
    // Eje para el arcoíris: altura normalizada del modelo dentro de cada malla
    modelo.traverse((o) => {
      if (o.isMesh) {
        o.frustumCulled = false;
        const loc = _m2.multiplyMatrices(raizInv, o.matrixWorld);   // malla -> modelo
        const e = loc.elements;
        const eje = new THREE.Vector4(e[1] / F.alto, e[5] / F.alto, e[9] / F.alto, (e[13] - F.suelo) / F.alto);
        o.material = materialPara(o.material, p.pelo, eje);
      }
      if (o.isBone) {
        huesos[o.name] = o;
        const w = raizQ.clone().multiply(o.getWorldQuaternion(_q2));
        o.userData.rest = { q: o.quaternion.clone(), p: o.position.clone(), w, wi: w.clone().invert() };
        o.userData.e = new THREE.Vector3();
      }
    });
    const get = (n) => huesos[n] || null;
    const R = def.rig, lista = (a) => (a || []).map(get).filter(Boolean);
    const B = { root: get(R.root), spine: lista(R.spine), neck: get(R.neck), head: get(R.head), snout: get(R.snout), ears: lista(R.ears),
      tail: lista(R.tail), wings: lista(R.wings), jiggle: lista(R.jiggle), arms: (R.arms || []).map(lista), nut: get(R.nut), legs: R.legs.map((l) => ({ b: lista(l.b), front: l.front })) };
    const rootUp = new THREE.Matrix3().setFromMatrix4(_m2.multiplyMatrices(raizInv, B.root.parent.matrixWorld).invert());
    // Largo de pata (del suelo a la cadera). En el cervatillo los huesos van en otra escala que la malla y la medida
    // salía de 23 metros (por eso corría a cámara lenta): si no cuadra con el alto del modelo, se estima.
    let legLen = B.legs[B.legs.length - 1].b[0].getWorldPosition(_v).applyMatrix4(raizInv).y - F.suelo;
    if (def.pata || !(legLen > F.alto * 0.08 && legLen < F.alto * 0.8)) legLen = F.alto * (def.pata || 0.4);
    // Accesorio: un ancla hija del hueso de la cabeza, con los ejes del personaje y en "unidades de cabeza de bolas"
    const C = F.cabeza, f = Math.max(0.5, Math.min(1.6, (C.ancho * s) / 0.62));
    const u = (v) => (v * s) / f;   // de unidades del modelo a "cabeza de bolas"
    const acc = crearAccesorio(p, { top: u(C.top - C.centro.y), frente: u(C.frente - C.centro.z), ojoY: u(C.ojoY - C.centro.y), cuelloY: u(C.cuelloY - C.centro.y), cuelloZ: u(C.cuelloZ - C.centro.z) });
    let ancla = null;
    if (acc && B.head) {
      // El ancla cuelga del modelo y cada fotograma se recoloca según el hueso de la cabeza (con la matriz entera:
      // algunos esqueletos traen escalas raras y colgarla directamente del hueso la descoloca).
      const K = new THREE.Matrix4();
      const enModelo = new THREE.Matrix4().compose(C.centro, new THREE.Quaternion(), _s.setScalar(f / s));
      const huesoEnModelo = new THREE.Matrix4().multiplyMatrices(raizInv, B.head.matrixWorld);
      const L = new THREE.Matrix4().multiplyMatrices(K, huesoEnModelo).invert().multiply(enModelo);
      ancla = new THREE.Group();
      ancla.matrixAutoUpdate = false;
      ancla.matrix.copy(enModelo);
      ancla.add(acc);
      modelo.add(ancla);
      acc.traverse((o) => { if (o.isMesh) o.frustumCulled = false; });
      ancla.userData = { K, L, modelo };
    }
    res.cuerpo = interno; res.cabeza = B.head; res.patas = B.legs.map((l) => l.b[0]); res.alas = B.wings;
    res.perfil = p;
    res._ = {
      def, S: def.style, B, rootUp, legLen, s, interno, pivote, H: F.alto, ancla, recarga: 0, recargaTotal: 1, listo: 0, rueda: 0, lenta: 0, estira: 1, nuez: 0,
      fase: Math.random() * 6, t: Math.random() * 10, turnVel: 0, brake: 0, run: 0, move: 0, rapidez: 0, vy: 0,
      ultimo: null, ultimoYaw: null, ultimoPaso: 0, mira: { t: 0, yaw: 0, cur: 0 }, tic: 2 + Math.random() * 4, semilla: semilla++,
    };
  }
  aplicar(perfil);
  return res;
}

// ---------- Animar ----------
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const _pos = new THREE.Vector3(), _escala = new THREE.Vector3();
/** Gira un hueso con ángulos en los ejes del personaje (X lateral, Y arriba, Z adelante). */
function aim(bone, x, y, z, k) {
  const e = bone.userData.e, r = bone.userData.rest;
  e.x += (x - e.x) * k; e.y += (y - e.y) * k; e.z += (z - e.z) * k;
  _q.setFromEuler(_eu.set(e.x, e.y, e.z));
  bone.quaternion.copy(r.q).multiply(r.wi).multiply(_q).multiply(r.w);
}

export function animarPersonaje(p, o) {
  if (!p.glb) return Bolas.animarPersonaje(p, o);
  const { paso = 0, suelo = true, aplasta = 0, mirar = null } = o;
  const dt = Math.max(1e-4, Math.min(0.1, o.dt || 0.016));
  const A = p._, S = A.S, D = A.def, B = A.B;
  A.t += dt;
  const t = A.t, k = 1 - Math.exp(-dt * 16);
  // Lo que ha hecho el juego con p.g desde la última vez: velocidad, subida y giro
  p.g.updateWorldMatrix(true, false);
  p.g.matrixWorld.decompose(_pos, _q2, _escala);
  const mundo = _escala.y;   // 1 = tamaño "de juego" (el alto de ALTO)
  const kTam = ((ALTO[p.perfil.animal] / p.escala) * mundo) / S.height;   // cuánto más grande que en el prototipo
  if (A.ultimo) {
    const vx = (_pos.x - A.ultimo.x) / dt, vz = (_pos.z - A.ultimo.z) / dt, vy = (_pos.y - A.ultimo.y) / dt;
    const r = Math.hypot(vx, vz);
    A.rapidez += ((r > 40 ? 0 : r) - A.rapidez) * Math.min(1, dt * 10);   // los teletransportes no cuentan
    A.vy += (clamp(vy, -30, 30) - A.vy) * Math.min(1, dt * 12);
  } else A.ultimo = new THREE.Vector3();
  A.ultimo.copy(_pos);
  const yaw = p.g.rotation.y;
  const giro = A.ultimoYaw === null ? 0 : wrap(yaw - A.ultimoYaw);
  A.ultimoYaw = yaw;
  A.turnVel += (giro / dt - A.turnVel) * Math.min(1, dt * 8);
  // Andar en el sitio: el juego avanza "paso" sin moverse (por ejemplo en "¿Quién juega?")
  const dPaso = Math.abs(paso - A.ultimoPaso) / dt;
  A.ultimoPaso = paso;
  const vel = A.rapidez / kTam;
  let move = clamp(vel / S.walk, 0, 1), run = clamp((vel - S.walk) / (S.run - S.walk), 0, 1);
  if (vel < 0.3 && dPaso > 3 && suelo) { move = 1; run = 0; }
  A.move += (move - A.move) * Math.min(1, dt * 8); A.run += (run - A.run) * Math.min(1, dt * 8);
  // Frenazo: si venía lanzado y se para de golpe, clava las manos y se echa atrás (cada animal derrapa lo suyo)
  A.lenta += (vel - A.lenta) * Math.min(1, dt * 3.5);
  A.brake += (clamp((A.lenta - vel - 0.8) / 2, 0, 1) * S.skid * (suelo ? 1 : 0) - A.brake) * Math.min(1, dt * 10);
  const brake = A.accion ? 0 : A.brake;
  move = A.move; run = A.run;
  const air = !suelo;
  const vyN = clamp(A.vy / (S.jump * kTam), -1, 1);

  // Fase del paso, según la velocidad y el largo de pata (para que los pies patinen poco)
  const amp = lerp(S.ampWalk, S.ampRun, run) * move, liftK = lerp(S.liftWalk, S.liftRun, run) * move;
  const piernaMundo = A.legLen * A.s * mundo;
  const ritmo = vel < 0.3 && move > 0.5 ? S.maxRate * 0.55 : Math.min(Math.PI * A.rapidez / (2 * Math.sin(Math.max(amp, 0.15)) * piernaMundo), S.maxRate * (1 + 0.35 * run));
  if (!air && move > 0.01) A.fase += dt * ritmo;
  const ph = A.fase;

  // lean: la ardilla va erguida cuando está quieta, pero en cuanto anda se echa a cuatro patas (el tronco se tumba
  // hacia delante, las de atrás se quedan debajo y los brazos hacen de patas delanteras). Al parar, se levanta.
  const lean = S.lean * (air ? 0.75 : Math.min(1, move * 1.4)) * (A.accion && (A.accion.tipo === 'nibble' || A.accion.tipo === 'throw') ? 0 : 1);
  B.legs.forEach((leg, i) => {
    const f = ph + lerp(S.walkOff[i], S.runOff[i], run);
    let pose = D.legPose(leg.front, -Math.sin(f) * amp, Math.max(0, Math.cos(f)) * liftK);
    if (air) pose = D.airPose(leg.front, vyN);
    else if (brake > 0.05) pose[0] -= brake * (leg.front ? 0.5 : 0.15);
    if (lean) pose = [pose[0] - lean, pose[1], pose[2]];
    for (let j = 0; j < leg.b.length; j++) aim(leg.b[j], pose[j] || 0, 0, 0, k);
  });

  // Brazos (la ardilla): recogidos junto al pecho cuando está quieta, braceando al andar y por delante,
  // como patas, cuando corre o salta. La pose del modelo (0, 0, 0) es la de sujetar la bellota.
  const roe = A.accion && A.accion.tipo === 'nibble' && A.accion.t < 1.05;
  const lanza = A.accion && A.accion.tipo === 'throw' ? A.accion.t : -1;   // coge impulso (0–0,3 s) y suelta la bellota
  B.arms.forEach((arm, i) => {
    const lado = i === 0 ? 1 : -1, f = ph + Math.PI + (i ? 0.25 : 0), cuatro = lean / Math.max(0.01, S.lean || 1);
    // de pie: manitas recogidas; a cuatro patas: los brazos bajan y dan zancadas (las dos casi a la vez, a botes)
    let hombro = lerp(0.45 + Math.sin(t * 1.3 + i) * 0.04, 0.15 - Math.sin(f) * 0.6 * move, cuatro);
    let codo = lerp(-0.25, -0.1 - Math.max(0, Math.cos(f)) * 0.5 * move, cuatro), abre = lerp(0.3, 0.1, cuatro);
    if (air) { hombro = -0.25 - vyN * 0.45; codo = -0.15; abre = 0.12; }
    if (roe) { hombro = Math.sin(t * 21) * 0.04; codo = 0; abre = 0; }
    if (lanza >= 0) { hombro = lanza < 0.3 ? -1.1 * Math.min(1, lanza / 0.2) : lerp(-1.1, 0.7, Math.min(1, (lanza - 0.3) / 0.12)); codo = lanza < 0.3 ? -0.5 : 0.2; abre = 0.05; }
    if (arm[0]) aim(arm[0], hombro, lado * abre, 0, k);
    if (arm[1]) aim(arm[1], codo, 0, 0, k);
    if (arm[2]) aim(arm[2], 0, 0, 0, k);
  });
  if (B.nut) { A.nuez += ((roe || (lanza >= 0 && lanza < 0.3) ? 1 : 0) - A.nuez) * Math.min(1, dt * 14); B.nut.scale.setScalar(Math.max(0.001, A.nuez)); }

  // Tronco
  const idle = 1 - move, R0 = B.root.userData.rest;
  const hop = 0.5 + 0.5 * Math.sin(ph + 1.2), rock = Math.sin(ph + 0.4);
  const bob = Math.abs(Math.sin(ph)) * S.bobWalk * move * (1 - run) + hop * (S.bobRun * run + S.bobHop * move * (1 - run)) + (1 + Math.sin(t * 2.1)) * 0.0035;
  B.root.position.copy(R0.p).add(_v.set(0, air ? 0 : bob * A.H, 0).applyMatrix3(A.rootUp));
  const pitch = (air ? -vyN * 0.24 : rock * (S.pitchRun * run + S.pitchWalk * move * (1 - run)) - brake * 0.14) + lean;
  const roll = Math.sin(ph) * S.rollWalk * move * (1 - run * 0.5) - clamp(A.turnVel * 0.04, -0.28, 0.28);
  aim(B.root, pitch, 0, roll, k);
  const sway = Math.sin(ph) * S.swayWalk * move * (1 - run);
  B.spine.forEach((sb, i) => { const last = i === B.spine.length - 1; aim(sb, (last ? Math.sin(ph + 1.6) * 0.05 : -rock * 0.06) * run, last ? -sway : sway, 0, k); });
  B.jiggle.forEach((jb) => aim(jb, -Math.sin(ph * 2 + 0.8) * 0.12 * move + clamp(A.vy * 0.05, -0.4, 0.4), 0, Math.sin(ph + 0.5) * 0.1 * move, k * 0.6));

  // Cabeza: mira a los lados cuando está quieto, cabecea al andar, olfatea; "mirar" la sube o la baja (el juego)
  const lk = A.mira;
  lk.t -= dt;
  if (lk.t <= 0) { lk.t = 0.8 + Math.random() * 2.6; lk.yaw = (Math.random() * 2 - 1) * S.lookAmp; }
  lk.cur += (lk.yaw - lk.cur) * Math.min(1, dt * S.lookSnap);
  const calm = idle;
  const sniff = S.sniff ? Math.pow(Math.max(0, Math.sin(t * 0.5 + S.height)), 6) * calm : 0;
  const yawH = lk.cur * calm + clamp(A.turnVel * 0.09, -0.45, 0.45) + Math.sin(ph) * S.headSway * move;
  const neckX = S.headRun * run + sniff * 0.28 + Math.sin(ph * 2 + 1) * S.headNod * move * (1 - run * 0.6) - brake * 0.2 - lean * 0.6 + (air ? vyN * 0.12 : 0) + (mirar || 0) * 0.8;
  const tilt = Math.sin(t * 0.9 + 1) * 0.05 * calm - clamp(A.turnVel * 0.03, -0.15, 0.15) - roll * S.counterRoll;
  if (B.neck) { aim(B.neck, neckX, yawH * 0.5, 0, k); aim(B.head, neckX * 0.4 + Math.sin(t * 1.1) * 0.03 * idle, yawH * 0.5, tilt, k); }
  else if (B.head) aim(B.head, neckX - pitch * 0.8, yawH + sway * S.counterRoll, tilt, k);
  if (B.snout) aim(B.snout, sniff * Math.sin(t * 12) * 0.09, sniff * Math.sin(t * 9) * 0.05, 0, k);

  // Orejas, alas y cola
  A.tic -= dt;
  if (A.tic < -0.25) A.tic = 1.2 + Math.random() * 3.5;
  const tw = A.tic < 0 ? Math.sin((-A.tic / 0.25) * PI * 2) * 0.35 : 0;
  B.ears.forEach((e, i) => aim(e, -S.earBack * run + clamp(A.vy / kTam * (0.04 + S.earFlop * 0.2), -0.6, 0.6) - Math.sin(ph * 2) * 0.05 * move - Math.sin(ph + 2.2) * S.earFlop * move, 0, i === 0 ? tw : -tw * 0.3, k * 0.55));
  B.wings.forEach((w, i) => {
    const open = air ? 1.15 + Math.sin(t * 26) * (A.vy > 0 ? 0.5 : 0.2) : run * (0.45 + Math.sin(ph * 2) * 0.2) + Math.sin(t * 1.7) * 0.03;
    aim(w, 0, 0, i === 0 ? open : -open, 1 - Math.exp(-dt * 30));
  });
  const burst = S.tailBurst ? Math.pow(Math.max(0, Math.sin(t * 0.9 + S.height * 3)), 8) : 1;
  B.tail.forEach((tb, i) => {
    const wag = Math.sin(t * S.tailFreq - i * 0.9) * (S.tailAmp * idle * burst + 0.08) * (1 - run * 0.6);
    aim(tb, (i === 0 ? S.tailRun - lean * 0.8 / Math.max(0.3, Math.abs(S.tailRun) + 0.5) * 0 : S.tailRun * 0.25) * run - (i === 0 ? lean * 0.75 : 0) - clamp(A.vy / kTam * 0.05, -0.4, 0.4) + Math.sin(ph * 2 - i) * 0.08 * move,
      wag - clamp(A.turnVel * S.tailDrag * (1 + i * 0.5), -0.7, 0.7), 0, k * (1 - i * 0.15));
  });

  // Movimiento especial
  let alto = 0, rx = 0, ry = 0;
  const ac = A.accion;
  if (ac) {
    ac.t += dt;
    const tt = ac.t, env = Math.min(1, tt * 4, (ac.dur - tt) * 4), kk = 1 - Math.exp(-dt * 20);
    const legs = (fn) => B.legs.forEach((leg, i) => { const ps = fn(leg, i); for (let j = 0; j < leg.b.length; j++) aim(leg.b[j], ps[j] || 0, 0, 0, kk); });
    const cabeza = (x, y = 0) => { if (B.neck) { aim(B.neck, x * 0.6, y, 0, kk); aim(B.head, x * 0.4, y, 0, kk); } else if (B.head) aim(B.head, x, y, 0, kk); };
    const propio = !A.fisica;   // si el juego no hace los saltos, los hace la animación
    if (ac.tipo === 'pronk') {
      // Tres brincos con las patas tiesas
      if (propio) alto = Math.abs(Math.sin((tt / ac.dur) * PI * 3)) * 0.45 * env;
      legs((leg) => [leg.front ? -0.12 : 0.12, 0, 0]);
      cabeza(-0.2 * env);
      B.tail.forEach((tb, i) => aim(tb, (i === 0 ? S.tailRun : S.tailRun * 0.25) * env, 0, 0, kk));   // la cola, tiesa como al huir
    } else if (ac.tipo === 'pounce') {
      // Se agacha y salta en arco, con las manos por delante
      const t0 = propio ? 0.3 : 0.18;
      if (tt < t0) { if (propio) alto = -0.06 * env; rx = 0.15; legs((leg) => [leg.front ? -0.3 : 0.3, 0.7, -0.45]); }
      else { const f = Math.min(1, (tt - t0) / 0.75); if (propio) alto = Math.sin(f * PI) * 0.8; rx = lerp(-0.5, 0.35, f) * env; legs((leg) => D.airPose(leg.front, 1 - f * 2)); }
      cabeza(-0.3 * env);
    } else if (ac.tipo === 'binky') {
      // Brinco con media vuelta... y otra media
      const f = Math.min(1, tt / ac.dur);
      if (propio) alto = Math.sin(f * PI) * 0.7;
      ry = f * f * (3 - 2 * f) * PI * 2;
      legs((leg) => D.airPose(leg.front, 1 - f * 2));
      B.ears.forEach((e) => aim(e, 0.5 * env, 0, 0, kk));
    } else if (ac.tipo === 'charge') {
      // Embestida: cabeza abajo, orejas atrás, la cola tiesa
      cabeza(0.45 * env);
      B.ears.forEach((e) => aim(e, -0.6 * env, 0, 0, kk));
      B.tail.forEach((tb, i) => aim(tb, (i === 0 ? 0.9 : 0.2) * env, 0, 0, kk));
      aim(B.root, 0.12 * env, 0, 0, kk);
    } else if (ac.tipo === 'root') {
      // Hoza: cabeza abajo y escarba con una pata
      cabeza(0.55 * env, Math.sin(tt * 13) * 0.1 * env);
      if (B.snout) aim(B.snout, Math.sin(tt * 12) * 0.12, Math.sin(tt * 9) * 0.06, 0, kk);
      const c = tt * 8, l0 = B.legs[0];
      if (l0) for (let j = 0; j < l0.b.length; j++) aim(l0.b[j], [-0.35 + Math.sin(c) * 0.45, 0.55 + Math.cos(c) * 0.45, -(0.55 + Math.cos(c) * 0.45) * 0.5][j] * env, 0, 0, kk);
    } else if (ac.tipo === 'stand') {
      // Se pone de pie y saluda con una mano
      aim(B.root, -1.05 * env, 0, 0, kk);
      B.legs.forEach((leg, i) => {
        const ps = leg.front ? [-0.55 + (i === 0 ? Math.sin(tt * 7) * 0.4 : 0.1), 0.5, 0] : [1.05, 0, 0];
        for (let j = 0; j < leg.b.length; j++) aim(leg.b[j], (ps[j] || 0) * env, 0, 0, kk);
      });
      cabeza(0.6 * env);
    } else if (ac.tipo === 'ball') {
      // Se hace una bola y se balancea
      B.spine.forEach((sb) => aim(sb, 0.55 * env, 0, 0, kk));
      cabeza(0.9 * env);
      legs((leg) => [(leg.front ? 0.7 : -0.7) * env, 1.1 * env, 0]);
      // Rueda según lo que avanza (como una pelota); parado, se balancea. Al acabar, termina la vuelta.
      const radio = Math.max(0.1, (ALTO[p.perfil.animal] / p.escala) * mundo * 0.42);
      if (A.rapidez > 0.4) A.rueda += (A.rapidez / radio) * dt;
      else A.rueda += Math.sin(tt * 9) * 0.6 * dt * 6;
      if (ac.dur - tt < 0.3) { const fin = Math.ceil(A.rueda / (PI * 2)) * PI * 2; A.rueda += (fin - A.rueda) * Math.min(1, dt * 12); }
      rx = A.rueda;
    } else if (ac.tipo === 'flap') {
      // Aletea y se levanta un poco del suelo
      if (propio) alto = Math.sin(Math.min(1, tt / ac.dur) * PI) * 0.35;
      B.wings.forEach((w, i) => { const o = (1 + Math.sin(tt * 24) * 0.5) * env; aim(w, 0, 0, i === 0 ? o : -o, 1 - Math.exp(-dt * 30)); });
      legs((leg) => D.airPose(leg.front, 0.2));
    } else if (ac.tipo === 'throw') {
      // Bellotazo: se echa atrás con la bellota en alto y la lanza; la bellota vuela en arco hasta donde cae el golpe
      aim(B.root, tt < 0.3 ? -0.3 * Math.min(1, tt / 0.2) : 0.25 * env, 0, 0, kk);
      cabeza(tt < 0.3 ? -0.3 : 0.1);
      if (tt >= 0.3 && !ac.bellota && p.g.parent) {
        const m = new THREE.Group(), lam2 = (c) => new THREE.MeshLambertMaterial({ color: c });
        const cuerpo = new THREE.Mesh(geoAcc().esfera, lam2('#c8864a')); cuerpo.scale.set(0.16, 0.2, 0.16);
        const gorro = new THREE.Mesh(geoAcc().cupula, lam2('#7a4e2a')); gorro.scale.set(0.18, 0.13, 0.18); gorro.position.y = 0.06;
        m.add(cuerpo, gorro); m.userData.sinEstacion = true;
        const de = _pos.clone(); de.y += 1.0 * mundo;
        const a = p.lanzaArriba ? _pos.clone().add(_v.set(0, 6, 0)) : _pos.clone().add(_v.set(0, 0, 6).applyQuaternion(p.g.getWorldQuaternion(_q2))).setY(_pos.y + 0.3);
        p.g.parent.add(m);
        ac.bellota = { m, de, a };
      }
      if (ac.bellota) {
        const b = ac.bellota, u = Math.min(1, (tt - 0.3) / 0.25);
        b.m.position.lerpVectors(b.de, b.a, u); if (!p.lanzaArriba) b.m.position.y += Math.sin(u * PI) * 1.2;
        b.m.rotation.x = tt * 18;
        if (u >= 1 && b.m.parent) b.m.parent.remove(b.m);
      }
    } else if (ac.tipo === 'nibble') {
      // Roe la bellota a toda prisa (el primer segundo); luego, a correr con la energía
      const e2 = Math.min(env, Math.max(0, (1.1 - tt) * 5));
      cabeza((0.5 + Math.sin(tt * 21) * 0.08) * e2);
      B.spine.forEach((sb) => aim(sb, 0.12 * e2, 0, 0, kk));
      B.tail.forEach((tb, i) => aim(tb, 0, Math.sin(tt * 9 - i) * 0.4 * e2, 0, kk));
    }
    if (tt >= ac.dur) { if (ac.bellota && ac.bellota.m.parent) ac.bellota.m.parent.remove(ac.bellota.m); A.accion = null; A.recarga = A.recargaTotal = (ac.recarga || 2) * REGLA.recarga; /* en verano vuelve antes */ if (ac.tipo === 'ball') A.rueda = 0; }
  }
  if (A.recarga > 0) { A.recarga = Math.max(0, A.recarga - dt); if (A.recarga === 0) A.listo = 1; }
  A.listo = Math.max(0, A.listo - dt * 4);   // un botecito al quedar listo otra vez el especial
  A.interno.position.y = alto / Math.max(0.01, mundo);
  A.pivote.rotation.set(rx, ry, 0);

  // El accesorio sigue a la cabeza
  if (A.ancla) {
    const u = A.ancla.userData;
    B.head.updateWorldMatrix(true, false);
    _m.copy(u.modelo.matrixWorld).invert().multiply(B.head.matrixWorld);
    A.ancla.matrix.multiplyMatrices(u.K, _m).multiply(u.L);
    A.ancla.matrixWorldNeedsUpdate = true;
  }
  // Aplastarse al caer (lo pide el juego)
  // …y estirarse un poco en el aire, como en el prototipo (más cuanto más deprisa sube o baja)
  const a = clamp(aplasta, 0, 1.5);
  A.estira += ((air ? 1 + Math.min(0.12, Math.abs(vyN) * 0.13) : 1) - A.estira) * Math.min(1, dt * 14);
  const e = A.estira * (1 + Math.sin(A.listo * PI) * 0.1), ancho = 1 / Math.sqrt(e);
  A.interno.scale.set(A.s * (1 + a * 0.18) * ancho, A.s * (1 - a * 0.22) * e, A.s * (1 + a * 0.18) * ancho);
}
export const _fuentes = FUENTES;
