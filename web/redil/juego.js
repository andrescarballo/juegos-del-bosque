// Al redil — cooperativo. Las ovejas huyen de quien se les acerca: hay que rodearlas entre todos y llevarlas
// al corral por la puerta antes de que se acabe el tiempo. Cada rebaño guardado da tiempo extra y trae otro más
// grande; a partir del tercero aparece un zorro travieso que las espanta (también huye de vosotros).
// Especiales: el rugido y el bellotazo las espantan de golpe; la embestida y la bola las apartan desde más lejos.
import { vestir } from '../comun/estaciones.js';
import { crearArena, THREE, suena, crearPersonaje, animarPersonaje } from '../comun/arena.js';

const RADIO = 20, CORRAL = { x: 0, z: -11.5, r: 4.4 }, PUERTA = 0.62;   // la puerta mira al centro del claro (medio ángulo, en radianes)
const MIEDO = 5.5, VEL_OVEJA = 6.1, EXTRA = 20;

const A = crearArena({
  juego: 'redil', titulo: 'Al redil', radio: RADIO, duracion: 100, cooperativo: true, grito: '¡Al redil!',
  nArboles: 5, semilla: 21, huecos: [{ x: CORRAL.x, z: CORRAL.z, r: CORRAL.r + 2.5 }, { x: 0, z: -5, r: 3 }], dist: 28, el: 1.1, centrar: 0.2, giroSalida: 0, radioSalida: 2.5,
  ganchos: { alEmpezar, paso, alPoder, limites: (j) => valla(j, j.pos, 0.5), bot, total: () => guardadas, final, nivel: () => `Rebaño ${nivel} · ${dentro()} de ${ovejas.length} dentro`, chip: (j) => `<b>${j.puntos}</b> 🐑` },
});
const { escena, jugadores, azar } = A;
A.cam.yaw = Math.PI / 2;   // el corral queda a la derecha de la pantalla (arriba lo taparía el marcador)

// ---------- El corral: una valla redonda con una puerta ----------
{
  const madera = new THREE.MeshLambertMaterial({ color: '#a8704e' }), g = new THREE.Group();
  g.userData.sinEstacion = true;
  const N = 22, poste = new THREE.CylinderGeometry(0.11, 0.13, 1.25, 6), tabla = new THREE.BoxGeometry(1, 0.1, 0.07);
  for (let k = 0; k < N; k++) {
    const a = PUERTA + (k / (N - 1)) * (Math.PI * 2 - PUERTA * 2), x = Math.sin(a) * CORRAL.r, z = Math.cos(a) * CORRAL.r;
    const p = new THREE.Mesh(poste, madera); p.position.set(x, 0.6, z); g.add(p);
    if (k < N - 1) {
      const a2 = PUERTA + ((k + 1) / (N - 1)) * (Math.PI * 2 - PUERTA * 2), x2 = Math.sin(a2) * CORRAL.r, z2 = Math.cos(a2) * CORRAL.r;
      for (const y of [0.45, 0.95]) {
        const t = new THREE.Mesh(tabla, madera);
        t.position.set((x + x2) / 2, y, (z + z2) / 2); t.scale.x = Math.hypot(x2 - x, z2 - z); t.rotation.y = Math.atan2(-(z2 - z), x2 - x);
        g.add(t);
      }
    }
  }
  // Paja en el suelo y dos banderines en la puerta
  const paja = new THREE.Mesh(new THREE.CircleGeometry(CORRAL.r - 0.2, 28), new THREE.MeshLambertMaterial({ color: '#f2d98a' }));
  paja.rotation.x = -Math.PI / 2; paja.position.y = 0.02; g.add(paja);
  for (const s of [-1, 1]) {
    const palo = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 2.4, 6), madera); palo.position.set(Math.sin(s * PUERTA) * CORRAL.r, 1.2, Math.cos(s * PUERTA) * CORRAL.r);
    const tela = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.6, 4), new THREE.MeshLambertMaterial({ color: '#ff4d6d' })); tela.position.copy(palo.position).setY(2.45);
    g.add(palo, tela);
  }
  g.position.set(CORRAL.x, 0, CORRAL.z);
  escena.add(g);
}
/** La valla: solo se entra y se sale por la puerta. `e.enCorral` recuerda de qué lado está. */
function valla(e, pos, margen) {
  const dx = pos.x - CORRAL.x, dz = pos.z - CORRAL.z, d = Math.hypot(dx, dz) || 1e-4, puerta = Math.abs(Math.atan2(dx, dz)) < PUERTA - 0.08;
  if (!e.enCorral) {
    if (d < CORRAL.r + margen) { if (puerta) { if (d < CORRAL.r - 0.1) e.enCorral = true; } else { pos.x = CORRAL.x + (dx / d) * (CORRAL.r + margen); pos.z = CORRAL.z + (dz / d) * (CORRAL.r + margen); } }
  } else if (d > CORRAL.r - margen) {
    if (puerta && !e.guardada) { if (d > CORRAL.r + 0.1) e.enCorral = false; } else { pos.x = CORRAL.x + (dx / d) * (CORRAL.r - margen); pos.z = CORRAL.z + (dz / d) * (CORRAL.r - margen); }
  }
}

// ---------- Ovejas y zorro ----------
let ovejas = [], nivel = 1, guardadas = 0, zorro = null;
const dentro = () => ovejas.filter((o) => o.guardada).length;
const animalZorro = jugadores.some((j) => j.perfil.animal === 'zorro') ? 'jabali' : 'zorro';
function soltarRebano() {
  for (const o of ovejas) escena.remove(o.pj.g);
  ovejas = [];
  const n = Math.min(16, 4 + nivel * 2);
  for (let k = 0; k < n; k++) {
    const pj = crearPersonaje(THREE, { animal: 'oveja', pelo: 'natural', accesorio: 'nada' });
    let x, z;
    for (let i = 0; i < 40; i++) { const a = azar() * Math.PI * 2, r = 5 + azar() * (RADIO - 8); x = Math.sin(a) * r; z = Math.cos(a) * r; if (z > -4 && Math.hypot(x, z) > 5) break; }
    escena.add(pj.g);
    ovejas.push({ pj, pos: new THREE.Vector3(x, 0, z), vel: new THREE.Vector3(), ang: azar() * 6.3, paso: 0, rumbo: azar() * 6.3, t: azar() * 3, susto: 0, guardada: false, enCorral: false });
  }
  if (nivel >= 3 && !zorro) {
    const pj = crearPersonaje(THREE, { animal: animalZorro, pelo: '#5a4d63', accesorio: 'nada' });
    escena.add(pj.g);
    zorro = { pj, pos: new THREE.Vector3(RADIO - 3, 0, 6), vel: new THREE.Vector3(), ang: 0, paso: 0, huye: 0, enCorral: false };
    A.mensaje('¡Cuidado con el zorro!<small>Espanta a las ovejas. Acércate y se va</small>', 2600);
  }
}
function alEmpezar() {
  nivel = 1; guardadas = 0;
  if (zorro) { escena.remove(zorro.pj.g); zorro = null; }
  for (const j of jugadores) j.enCorral = false;
  soltarRebano();
}

const _v = new THREE.Vector3();
function mover(e, dt, vx, vz, k = 6) {
  e.vel.x += (vx - e.vel.x) * Math.min(1, dt * k); e.vel.z += (vz - e.vel.z) * Math.min(1, dt * k);
  e.pos.x += e.vel.x * dt; e.pos.z += e.vel.z * dt;
  A.claro.empujar(e.pos, 0.5);
  valla(e, e.pos, 0.55);
  const r = Math.hypot(e.vel.x, e.vel.z);
  if (r > 0.3) { let d = Math.atan2(e.vel.x, e.vel.z) - e.ang; d = Math.atan2(Math.sin(d), Math.cos(d)); e.ang += d * Math.min(1, dt * 10); }
  if (r > 0.5) e.paso += dt * 15; else e.paso *= Math.exp(-dt * 10);
  e.pj.g.position.copy(e.pos); e.pj.g.rotation.y = e.ang;
  animarPersonaje(e.pj, { paso: e.paso, suelo: true, aplasta: 0, dt });
}

function paso(dt, jugando) {
  // Centro del rebaño suelto (el zorro va hacia allí)
  let cx = 0, cz = 0, sueltas = 0;
  for (const o of ovejas) if (!o.guardada) { cx += o.pos.x; cz += o.pos.z; sueltas++; }
  if (sueltas) { cx /= sueltas; cz /= sueltas; }

  if (zorro) {
    zorro.huye = Math.max(0, zorro.huye - dt);
    let vx = 0, vz = 0, cerca = null, md = 4.5;
    for (const j of jugadores) { const d = Math.hypot(j.pos.x - zorro.pos.x, j.pos.z - zorro.pos.z); if (d < md) { md = d; cerca = j; } }
    if (cerca || zorro.huye > 0) {
      const de = cerca || zorro.de, dx = zorro.pos.x - de.pos.x, dz = zorro.pos.z - de.pos.z, d = Math.hypot(dx, dz) || 1;
      zorro.de = de; if (cerca && zorro.huye <= 0) zorro.huye = 1.6;
      vx = (dx / d) * 6.4; vz = (dz / d) * 6.4;
    } else if (sueltas && jugando) {
      const dx = cx - zorro.pos.x, dz = cz - zorro.pos.z, d = Math.hypot(dx, dz) || 1;
      if (d > 2) { vx = (dx / d) * 2.6; vz = (dz / d) * 2.6; }
    }
    mover(zorro, dt, vx, vz, 5);
  }

  for (const o of ovejas) {
    let vx = 0, vz = 0;
    o.t -= dt; o.susto = Math.max(0, o.susto - dt);
    if (o.guardada) {
      // Dentro del corral: pasea tranquila
      if (o.t <= 0) { o.t = 1.5 + azar() * 3; o.rumbo = azar() * 6.3; o.quieta = azar() < 0.5; }
      if (!o.quieta) { vx = Math.sin(o.rumbo) * 0.9; vz = Math.cos(o.rumbo) * 0.9; }
    } else {
      // Huye de los jugadores (y del zorro); si nadie la asusta, pace por ahí
      let fx = 0, fz = 0;
      const huir = (p, radio, fuerza) => { const dx = o.pos.x - p.x, dz = o.pos.z - p.z, d = Math.hypot(dx, dz) || 1e-3; if (d < radio) { const f = (1 - d / radio) * fuerza; fx += (dx / d) * f; fz += (dz / d) * f; } };
      if (jugando) for (const j of jugadores) huir(j.pos, j.pw.empuja ? MIEDO * 1.6 : MIEDO, 1.6);
      if (zorro) huir(zorro.pos, 6.5, 2);
      const f = Math.hypot(fx, fz);
      if (f > 0.02 || o.susto > 0) {
        if (f > 0.02) { o.fx = fx / f; o.fz = fz / f; o.susto = Math.max(o.susto, 0.35); }
        const v = VEL_OVEJA * Math.min(1, 0.45 + f);
        vx = (o.fx || 0) * v; vz = (o.fz || 0) * v;
        // un poco de querencia por el rebaño: asustadas, se juntan
        if (sueltas > 1) { vx += (cx - o.pos.x) * 0.12; vz += (cz - o.pos.z) * 0.12; }
      } else {
        if (o.t <= 0) { o.t = 1.5 + azar() * 3; o.rumbo = azar() * 6.3; o.quieta = azar() < 0.55; }
        if (!o.quieta) { vx = Math.sin(o.rumbo) * 0.8; vz = Math.cos(o.rumbo) * 0.8; }
      }
    }
    // Que no se amontonen
    for (const p of ovejas) {
      if (p === o) continue;
      const dx = o.pos.x - p.pos.x, dz = o.pos.z - p.pos.z, d = Math.hypot(dx, dz);
      if (d < 1.15 && d > 1e-3) { vx += (dx / d) * (1.15 - d) * 5; vz += (dz / d) * (1.15 - d) * 5; }
    }
    mover(o, dt, vx, vz, o.susto > 0 ? 7 : 4);
    if (!o.guardada && o.enCorral && jugando) {
      o.guardada = true; guardadas++;
      // se la apunta quien estaba más cerca
      let quien = jugadores[0], md = 1e9;
      for (const j of jugadores) { const d = Math.hypot(j.pos.x - o.pos.x, j.pos.z - o.pos.z); if (d < md) { md = d; quien = j; } }
      quien.puntos++;
      suena('bellota'); A.lanzar(o.pos.x, 1.2, o.pos.z, 10, ['#ffffff', '#ffd93d', quien.color], 0.9);
      A.flotante('+1 🐑', o.pos.x, 2, o.pos.z, A.VARIOS ? quien.color : null);
    }
  }
  if (jugando && ovejas.length && dentro() === ovejas.length) {
    nivel++;
    A.tiempo += EXTRA;
    suena('fanfarria');
    A.mensaje(`¡Todas dentro!<small>+${EXTRA} segundos · rebaño ${nivel}</small>`, 2200);
    soltarRebano();
  }
}

/** El rugido y el bellotazo espantan de golpe a las ovejas de alrededor (y al zorro). */
function alPoder(j, pw) {
  if (!pw.rugido) return;
  const x = j.pos.x + Math.sin(j.angulo) * pw.lejos, z = j.pos.z + Math.cos(j.angulo) * pw.lejos, radio = pw.rugido + 2;
  for (const o of ovejas) {
    if (o.guardada) continue;
    const dx = o.pos.x - x, dz = o.pos.z - z, d = Math.hypot(dx, dz) || 1e-3;
    if (d < radio) { o.fx = dx / d; o.fz = dz / d; o.susto = 1.3; o.vel.x += o.fx * 6; o.vel.z += o.fz * 6; }
  }
  if (zorro && Math.hypot(zorro.pos.x - x, zorro.pos.z - z) < radio + 2) { zorro.huye = 4; zorro.de = j; }
}

function final() {
  return { titulo: guardadas ? `¡${guardadas} ${guardadas === 1 ? 'oveja' : 'ovejas'} a salvo!` : '¡Se han escapado todas!', extra: `<p>Habéis llegado al rebaño ${nivel}</p>`.replace('Habéis llegado', A.VARIOS ? 'Habéis llegado' : 'Has llegado') };
}

/** Piloto de pruebas (?bot): se pone detrás de la oveja suelta más cercana, al otro lado de la puerta. */
function bot(j) {
  let o = null, md = 1e9;
  for (const p of ovejas) if (!p.guardada) { const d = Math.hypot(p.pos.x - j.pos.x, p.pos.z - j.pos.z) + (ovejas.indexOf(p) % jugadores.length === j.i ? 0 : 6); if (d < md) { md = d; o = p; } }
  if (!o) return { x: 0, z: 0 };
  const px = CORRAL.x, pz = CORRAL.z + CORRAL.r + 1.5;   // delante de la puerta
  const dx = o.pos.x - px, dz = o.pos.z - pz, d = Math.hypot(dx, dz) || 1;
  const tx = o.pos.x + (dx / d) * 3, tz = o.pos.z + (dz / d) * 3;
  const ex = tx - j.pos.x, ez = tz - j.pos.z, e = Math.hypot(ex, ez) || 1;
  return e < 0.6 ? { x: -dx / d * 0.5, z: -dz / d * 0.5 } : { x: ex / e, z: ez / e };
}

A.empezar();
vestir(THREE, escena, { lejos: 24 });
