// Pintabosque — cada animal va dejando su color por donde pasa mientras le queda pintura; se rellena en las
// fuentes. Cuando se acaba el tiempo gana quien más suelo tenga de su color. Se puede pintar encima de los demás.
// Especiales: la embestida y la bola pintan una franja ancha; el rugido y el bellotazo salpican un círculo;
// los que saltan no pintan en el aire, pero salpican al caer.
import { vestir } from '../comun/estaciones.js';
import { crearArena, THREE, suena } from '../comun/arena.js';

const RADIO = 17, N = 128, PX = 512;
const BROCHA = 0.85, GASTO = 0.14, RELLENO = 0.75;   // radio de la brocha, pintura por segundo andando, relleno por segundo
const FUENTES = [0, 1, 2].map((k) => { const a = Math.PI / 2 + (k * Math.PI * 2) / 3; return { x: Math.cos(a) * 9.5, z: Math.sin(a) * 9.5 }; });

const A = crearArena({
  juego: 'pintar', titulo: 'Pintabosque', radio: RADIO, duracion: 90, duracionFiesta: 60, rivales: 3, unidad: '%', grito: '¡A pintar!',
  nArboles: 4, semilla: 12, huecos: FUENTES.map((f) => ({ ...f, r: 3 })), dist: 27, el: 1.08, centrar: 0.25,
  ganchos: { alEmpezar, paso, alPoder, alAterrizar, bot, chip: (j) => `<b>${pct(j)}%</b> <span class="barra"><u style="width:${Math.round(j.pintura * 100)}%"></u></span>`, valor: pct },
});
const { escena, jugadores, camara } = A;

// ---------- El suelo pintado: una rejilla (quién es el dueño de cada casilla) y un lienzo encima de la hierba ----------
const dueno = new Uint8Array(N * N), cuenta = new Int32Array(8);
const dentro = new Uint8Array(N * N);
let casillas = 0;
for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
  const x = ((i + 0.5) / N * 2 - 1) * RADIO, z = ((j + 0.5) / N * 2 - 1) * RADIO;
  if (Math.hypot(x, z) < RADIO - 1.2) { dentro[j * N + i] = 1; casillas++; }
}
const lienzo = document.createElement('canvas'); lienzo.width = lienzo.height = PX;
const ctx = lienzo.getContext('2d');
ctx.beginPath(); ctx.arc(PX / 2, PX / 2, (RADIO - 1.2) / RADIO * PX / 2, 0, Math.PI * 2); ctx.clip();
const textura = new THREE.CanvasTexture(lienzo); textura.colorSpace = THREE.SRGBColorSpace;
const manto = new THREE.Mesh(new THREE.PlaneGeometry(RADIO * 2, RADIO * 2), new THREE.MeshBasicMaterial({ map: textura, transparent: true, depthWrite: false, opacity: 0.92 }));
manto.rotation.x = -Math.PI / 2; manto.position.y = 0.035; manto.renderOrder = 1; manto.userData.sinEstacion = true;
escena.add(manto);
let sucio = false;
function pct(j) { return Math.round((cuenta[j.i + 1] / casillas) * 100); }
/** Pinta un círculo del color de j. Devuelve cuántas casillas nuevas ha ganado. */
function pintar(j, x, z, r) {
  const k = j.i + 1, c = N / (RADIO * 2);
  const i0 = Math.max(0, Math.floor((x - r + RADIO) * c)), i1 = Math.min(N - 1, Math.ceil((x + r + RADIO) * c));
  const j0 = Math.max(0, Math.floor((z - r + RADIO) * c)), j1 = Math.min(N - 1, Math.ceil((z + r + RADIO) * c));
  let nuevas = 0;
  for (let b = j0; b <= j1; b++) for (let a = i0; a <= i1; a++) {
    const cx = ((a + 0.5) / N * 2 - 1) * RADIO - x, cz = ((b + 0.5) / N * 2 - 1) * RADIO - z, q = b * N + a;
    if (cx * cx + cz * cz > r * r || !dentro[q] || dueno[q] === k) continue;
    cuenta[dueno[q]]--; dueno[q] = k; cuenta[k]++; nuevas++;
  }
  if (nuevas) {
    ctx.fillStyle = j.color; ctx.beginPath();
    ctx.arc((x + RADIO) / (RADIO * 2) * PX, (z + RADIO) / (RADIO * 2) * PX, r / (RADIO * 2) * PX, 0, Math.PI * 2); ctx.fill();
    sucio = true;
  }
  return nuevas;
}
function salpicar(j, x, z, r) {
  if (pintar(j, x, z, r)) { A.lanzar(x, 0.4, z, 14, j.color, 1.1); suena('pompa', 2); }
}

// ---------- Fuentes: un pilón de piedra con agua. Al lado se rellena el bote ----------
const piedra = new THREE.MeshLambertMaterial({ color: '#b9b4c9' }), agua = new THREE.MeshLambertMaterial({ color: '#59c8ff', emissive: '#2a8fd0', emissiveIntensity: 0.4 });
const aguas = [];
for (const f of FUENTES) {
  const g = new THREE.Group(); g.userData.sinEstacion = true;
  const pilon = new THREE.Mesh(new THREE.CylinderGeometry(1.25, 1.4, 0.7, 14), piedra); pilon.position.y = 0.35;
  const a = new THREE.Mesh(new THREE.CylinderGeometry(1.05, 1.05, 0.1, 14), agua); a.position.y = 0.68;
  const cano = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.22, 1.5, 8), piedra); cano.position.y = 0.95;
  const chorro = new THREE.Mesh(new THREE.SphereGeometry(0.3, 10, 8), agua); chorro.position.y = 1.8;
  g.add(pilon, a, cano, chorro); g.position.set(f.x, 0, f.z);
  escena.add(g); aguas.push(chorro);
  A.claro.colisiones.push({ x: f.x, z: f.z, r: 1.35 });
}

// ---------- El bote de cada uno: una barrita sobre la cabeza ----------
const geoBarra = new THREE.PlaneGeometry(1, 0.16);
for (const j of jugadores) {
  const g = new THREE.Group(); g.userData.sinEstacion = true;
  const fondo = new THREE.Mesh(geoBarra, new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.85, depthTest: false }));
  const lleno = new THREE.Mesh(geoBarra, new THREE.MeshBasicMaterial({ color: j.color, depthTest: false }));
  fondo.scale.set(1.1, 1.5, 1); lleno.position.z = 0.01; fondo.renderOrder = 8; lleno.renderOrder = 9;
  g.add(fondo, lleno); escena.add(g);
  j.barra = g; j.lleno = lleno; j.pintura = 1; j.meta = null; j.piensa = 0;
}

function alEmpezar() {
  dueno.fill(0); cuenta.fill(0);
  ctx.clearRect(0, 0, PX, PX); sucio = true;
  for (const j of jugadores) { j.pintura = 1; j.meta = null; j.piensa = 0; }
}

function paso(dt, jugando) {
  const t = performance.now() / 1000;
  aguas.forEach((a, k) => { a.position.y = 1.8 + Math.sin(t * 3 + k) * 0.08; a.scale.setScalar(1 + Math.sin(t * 5 + k) * 0.08); });
  for (const j of jugadores) {
    if (jugando) {
      const rapidez = Math.hypot(j.vel.x, j.vel.z);
      // Rellenar junto a una fuente
      const cerca = FUENTES.some((f) => Math.hypot(f.x - j.pos.x, f.z - j.pos.z) < 2.6);
      if (cerca && j.pintura < 1) {
        j.pintura = Math.min(1, j.pintura + RELLENO * dt);
        if (Math.random() < dt * 12) A.lanzar(j.pos.x, 1, j.pos.z, 1, ['#59c8ff', j.color], 0.5);
        if (j.pintura === 1 && !j.cpu) suena('objeto');
      }
      // Pintar al pasar (en el aire no)
      if (j.pintura > 0 && rapidez > 0.6 && j.y < 0.3 && j.aturdido <= 0) {
        const ancho = j.pw.empuja ? 1.9 : 1;
        pintar(j, j.pos.x, j.pos.z, BROCHA * ancho);
        j.pintura = Math.max(0, j.pintura - GASTO * ancho * dt * Math.min(1.3, rapidez / A.VEL));
        if (j.pintura === 0 && !j.cpu) { suena('no'); A.flotante('¡Sin pintura!', j.pos.x, 2.2, j.pos.z, j.color); }
      }
    }
    j.barra.position.set(j.pos.x, j.y + 1.6 * j.pj.escala + (A.VARIOS ? 0.2 : 0.5), j.pos.z);
    j.barra.quaternion.copy(camara.quaternion);
    j.lleno.scale.x = Math.max(0.001, j.pintura); j.lleno.position.x = -(1 - j.pintura) / 2;
  }
  if (sucio) { textura.needsUpdate = true; sucio = false; }
}

/** Los especiales: el rugido y el bellotazo salpican un círculo (aunque no quede pintura). */
function alPoder(j, pw) {
  if (pw.rugido) salpicar(j, j.pos.x + Math.sin(j.angulo) * pw.lejos, j.pos.z + Math.cos(j.angulo) * pw.lejos, pw.lejos ? 2.6 : 3.4);
}
/** Los que saltan salpican al caer. */
function alAterrizar(j) { if (j.pw.activo) salpicar(j, j.pos.x, j.pos.z, 2.1); }

/** Rivales: van a por suelo que no sea suyo; cuando se quedan secos, a la fuente más cercana. */
function bot(j) {
  j.piensa -= 1 / 60;
  const seco = j.pintura < 0.06;
  if (!j.meta || j.piensa <= 0 || Math.hypot(j.meta.x - j.pos.x, j.meta.z - j.pos.z) < 1 || (seco && !j.meta.fuente)) {
    j.piensa = 1.2 + Math.random();
    if (seco) { const f = [...FUENTES].sort((a, b) => Math.hypot(a.x - j.pos.x, a.z - j.pos.z) - Math.hypot(b.x - j.pos.x, b.z - j.pos.z))[0]; j.meta = { x: f.x, z: f.z, fuente: true }; }
    else {
      let mejor = null, mv = -1e9;
      for (let k = 0; k < 14; k++) {
        const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * (RADIO - 2.5), x = Math.cos(a) * r, z = Math.sin(a) * r;
        const q = Math.floor((z + RADIO) / (RADIO * 2) * N) * N + Math.floor((x + RADIO) / (RADIO * 2) * N);
        const d = Math.hypot(x - j.pos.x, z - j.pos.z);
        const v = (dueno[q] === j.i + 1 ? -20 : dueno[q] ? 4 : 6) - d * 0.55;   // mejor lo sin pintar y lo de otros, y que no esté lejos
        if (v > mv) { mv = v; mejor = { x, z }; }
      }
      j.meta = mejor;
    }
  }
  if (j.meta.fuente && j.pintura >= 0.98) j.meta = null;
  if (!j.meta) return { x: 0, z: 0 };
  const dx = j.meta.x - j.pos.x, dz = j.meta.z - j.pos.z, d = Math.hypot(dx, dz) || 1;
  // junto a la fuente se queda quieto mientras rellena
  if (j.meta.fuente && d < 2.3) return { x: 0, z: 0 };
  return { x: dx / d, z: dz / d, especial: Math.random() < 0.004 };
}

A.empezar();
vestir(THREE, escena, { lejos: 22 });
