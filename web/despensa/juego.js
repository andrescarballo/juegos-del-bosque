// La despensa — caen bellotas de los árboles y cada uno las lleva a su madriguera. Solo se pueden cargar tres a
// la vez, y si te dan con un especial se te caen todas. Gana quien más guarde. Las doradas valen tres.
// Especiales: la embestida y la bola tiran las bellotas a quien tocan; el rugido y el bellotazo, a quien pillen
// en su círculo; los que saltan, a quien tengan al lado al caer. A la oveja botando y al erizo en bola no se les caen.
import { vestir } from '../comun/estaciones.js';
import { crearArena, THREE, suena } from '../comun/arena.js';

const RADIO = 17, CARGA = 3, MAX_SUELO = 12, R_CASA = 13.2;

const A = crearArena({
  juego: 'despensa', titulo: 'La despensa', radio: RADIO, duracion: 90, duracionFiesta: 60, rivales: 3, grito: '¡A por bellotas!',
  nArboles: 7, semilla: 33, dist: 29, el: 1.1, centrar: 0.12, radioSalida: R_CASA - 2.2,
  huecos: [0, 1, 2, 3].map((k) => ({ x: Math.sin((k / 4) * Math.PI * 2) * R_CASA, z: Math.cos((k / 4) * Math.PI * 2) * R_CASA, r: 3 })),
  ganchos: { alEmpezar, paso, alPoder, alAterrizar, alChocar, bot, chip: (j) => `<b>${j.puntos}</b> 🌰 <span class="poder">${'●'.repeat(j.carga.length)}${'○'.repeat(CARGA - j.carga.length)}</span>` },
});
const { escena, jugadores, azar } = A;

// ---------- Madrigueras: un montículo con su agujero y una bandera del color de cada uno ----------
const tierra = new THREE.MeshLambertMaterial({ color: '#a8754d' }), negro = new THREE.MeshBasicMaterial({ color: '#2a1a12' });
for (const j of jugadores) {
  const a = (j.i / jugadores.length) * Math.PI * 2, x = Math.sin(a) * R_CASA, z = Math.cos(a) * R_CASA;
  const g = new THREE.Group(); g.userData.sinEstacion = true;
  const monte = new THREE.Mesh(new THREE.SphereGeometry(1, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), tierra); monte.scale.set(1.5, 0.9, 1.5);
  const boca = new THREE.Mesh(new THREE.CircleGeometry(0.55, 16), negro); boca.position.set(0, 0.42, 1.28); boca.rotation.x = -0.45;
  const palo = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.6, 6), new THREE.MeshLambertMaterial({ color: '#ffffff' })); palo.position.set(0, 1.9, 0);
  const tela = new THREE.Mesh(new THREE.ConeGeometry(0.42, 0.9, 4), new THREE.MeshBasicMaterial({ color: j.color })); tela.position.set(0.42, 2.9, 0); tela.rotation.z = -Math.PI / 2;
  const aro = new THREE.Mesh(new THREE.RingGeometry(1.9, 2.15, 32), new THREE.MeshBasicMaterial({ color: j.color, transparent: true, opacity: 0.75, side: THREE.DoubleSide })); aro.rotation.x = -Math.PI / 2; aro.position.y = 0.04;
  g.add(monte, boca, palo, tela, aro);
  g.position.set(x, 0, z); g.rotation.y = a + Math.PI;   // la boca mira al centro
  escena.add(g);
  j.casa = { x, z };
  A.claro.colisiones.push({ x, z, r: 1.1 });
}

// ---------- Bellotas ----------
const geoB = new THREE.SphereGeometry(1, 10, 8), geoG = new THREE.SphereGeometry(1, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2);
const matB = new THREE.MeshLambertMaterial({ color: '#c8864a' }), matG = new THREE.MeshLambertMaterial({ color: '#7a4e2a' });
const geoHalo = new THREE.CircleGeometry(0.62, 16), matHalo = new THREE.MeshBasicMaterial({ color: '#fff8d0', transparent: true, opacity: 0.6, depthWrite: false });
const matOro = new THREE.MeshLambertMaterial({ color: '#ffcf3a', emissive: '#d98a00', emissiveIntensity: 0.55 });
function crearBellota() {
  const g = new THREE.Group(); g.userData.sinEstacion = true;
  const c = new THREE.Mesh(geoB, matB); c.scale.set(0.36, 0.44, 0.36);
  const s = new THREE.Mesh(geoG, matG); s.scale.set(0.4, 0.3, 0.4); s.position.y = 0.13;
  // un halo claro debajo, para que se vean sobre la hierba (y sobre las hojas en otoño)
  const halo = new THREE.Mesh(geoHalo, matHalo); halo.rotation.x = -Math.PI / 2; halo.position.y = -0.26;
  g.add(c, s, halo); g.userData.halo = halo; g.visible = false; escena.add(g);
  return { g, c, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, estado: 'libre', oro: false, t: 0 };   // libre | cae | suelo | llevada
}
const bellotas = Array.from({ length: MAX_SUELO + jugadores.length * CARGA + 4 }, crearBellota);
let proxima = 0;
function soltar(x, z, y, vx = 0, vz = 0, vy = 0, oro = azar() < 0.1) {
  const b = bellotas.find((q) => q.estado === 'libre');
  if (!b) return null;
  Object.assign(b, { x, y, z, vx, vy, vz, estado: 'cae', oro, t: 0 });
  b.c.material = oro ? matOro : matB; b.g.scale.setScalar(oro ? 1.25 : 1); b.g.visible = true;
  return b;
}
function enSuelo() { return bellotas.filter((b) => b.estado === 'suelo' || b.estado === 'cae').length; }
/** Se le caen todas: salen rodando alrededor. Devuelve true si llevaba alguna. */
function tirar(j, quien) {
  if (!j.carga.length) return false;
  for (const b of j.carga) {
    const a = azar() * Math.PI * 2, v = 3 + azar() * 2.5;
    Object.assign(b, { x: j.pos.x, y: 1.4, z: j.pos.z, vx: Math.sin(a) * v, vz: Math.cos(a) * v, vy: 5, estado: 'cae', t: 0 });
  }
  j.carga = [];
  A.flotante('¡Se le caen!', j.pos.x, 2.4, j.pos.z, quien ? quien.color : null);
  return true;
}
/** Le dan a j (si no es invulnerable): se queda un momento aturdido y suelta lo que lleva. */
function golpear(j, quien) { if (j !== quien && A.aturdir(j, 0.7)) tirar(j, quien); }

function alEmpezar() {
  for (const b of bellotas) { b.estado = 'libre'; b.g.visible = false; }
  for (const j of jugadores) { j.carga = []; j.meta = null; }
  proxima = 0.3;
  for (let k = 0; k < 6; k++) caeUna();
}
function caeUna() {
  for (let n = 0; n < 30; n++) {
    const a = azar() * Math.PI * 2, r = Math.sqrt(azar()) * (RADIO - 5), x = Math.sin(a) * r, z = Math.cos(a) * r;
    if (jugadores.some((j) => Math.hypot(j.casa.x - x, j.casa.z - z) < 4)) continue;
    soltar(x, z, 7 + azar() * 3);
    return;
  }
}

function paso(dt, jugando) {
  if (jugando) {
    proxima -= dt;
    if (proxima <= 0) { proxima = 0.9 + azar() * 0.8; if (enSuelo() < MAX_SUELO) caeUna(); }
  }
  const t = performance.now() / 1000;
  for (const b of bellotas) {
    if (b.estado === 'cae') {
      b.vy -= 22 * dt; b.x += b.vx * dt; b.z += b.vz * dt; b.y += b.vy * dt;
      const r = Math.hypot(b.x, b.z); if (r > RADIO - 2) { b.x *= (RADIO - 2) / r; b.z *= (RADIO - 2) / r; }
      if (b.y <= 0.3) { b.y = 0.3; b.estado = 'suelo'; b.t = 0; if (Math.abs(b.vy) > 6) suena('bloque'); }
      b.g.position.set(b.x, b.y, b.z); b.g.rotation.set(t * 6, 0, t * 4); b.g.userData.halo.visible = false;
    } else if (b.estado === 'suelo') {
      b.t += dt;
      b.g.position.set(b.x, 0.3, b.z); b.g.rotation.set(0, t * 1.5 + b.z, 0); b.g.userData.halo.visible = true;
      // Cogerla (un momento después de caer, para que dé tiempo a verla)
      if (jugando && b.t > 0.15) for (const j of jugadores) {
        if (j.carga.length >= CARGA || j.aturdido > 0 || j.y > 0.8 || Math.hypot(j.pos.x - b.x, j.pos.z - b.z) > 0.95) continue;
        b.estado = 'llevada'; j.carga.push(b);
        if (!j.cpu) suena('bellota');
        break;
      }
    }
  }
  for (const j of jugadores) {
    // Las que lleva, apiladas sobre la cabeza
    j.carga.forEach((b, k) => { b.g.position.set(j.pos.x, j.y + 1.5 * j.pj.escala + 0.8 + k * 0.6, j.pos.z); b.g.rotation.set(0, t * 2 + k, 0.2); b.g.userData.halo.visible = false; });
    // En casa: a la despensa
    if (jugando && j.carga.length && Math.hypot(j.pos.x - j.casa.x, j.pos.z - j.casa.z) < 2.3) {
      let pts = 0;
      for (const b of j.carga) { pts += b.oro ? 3 : 1; b.estado = 'libre'; b.g.visible = false; }
      j.carga = []; j.puntos += pts;
      suena('objeto'); A.lanzar(j.casa.x, 1.2, j.casa.z, 12, [j.color, '#c8864a', '#ffd93d'], 1);
      A.flotante(`+${pts} 🌰`, j.casa.x, 2.6, j.casa.z, j.color);
    }
  }
}

function alPoder(j, pw) {
  if (!pw.rugido) return;
  const x = j.pos.x + Math.sin(j.angulo) * pw.lejos, z = j.pos.z + Math.cos(j.angulo) * pw.lejos;
  for (const o of jugadores) if (o !== j && Math.hypot(o.pos.x - x, o.pos.z - z) < pw.rugido) golpear(o, j);
}
function alAterrizar(j) { if (j.pw.activo) for (const o of jugadores) if (o !== j && o.y < 0.5 && Math.hypot(o.pos.x - j.pos.x, o.pos.z - j.pos.z) < 1.9) golpear(o, j); }
function alChocar(a, b) { if (a.pw.empuja) golpear(b, a); if (b.pw.empuja) golpear(a, b); }

/** Rivales: van a por la bellota más cercana y vuelven a casa cuando van cargados (o cuando queda poco). */
function bot(j) {
  const lleva = j.carga.length;
  let b = null, md = 1e9;
  if (lleva < CARGA) for (const q of bellotas) if (q.estado === 'suelo') { const d = Math.hypot(q.x - j.pos.x, q.z - j.pos.z) - (q.oro ? 4 : 0); if (d < md) { md = d; b = q; } }
  const aCasa = lleva >= CARGA || (lleva > 0 && (!b || md > 7 || A.tiempo < 7));
  const tx = aCasa ? j.casa.x : b ? b.x : 0, tz = aCasa ? j.casa.z : b ? b.z : 0;
  if (!aCasa && !b) return { x: -j.pos.x * 0.1, z: -j.pos.z * 0.1 };
  const dx = tx - j.pos.x, dz = tz - j.pos.z, d = Math.hypot(dx, dz) || 1;
  // usa el especial si tiene cerca a uno cargado, o de vez en cuando
  const cerca = jugadores.some((o) => o !== j && o.carga.length >= 2 && Math.hypot(o.pos.x - j.pos.x, o.pos.z - j.pos.z) < 3.5);
  return { x: dx / d, z: dz / d, especial: (cerca && Math.random() < 0.05) || Math.random() < 0.002 };
}

A.empezar();
vestir(THREE, escena, { lejos: 22 });
