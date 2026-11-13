// Lluvia de pompas — Las pompas rebotan por la pantalla; dispara hacia arriba para partirlas en dos
// hasta que exploten. Si una pompa te toca, pierdes una vida. De 1 a 4 jugadores, cada uno con su mando.
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

const JUEGO = 'pompas';
const BOT = params.has('bot');                 // ?bot=1 juegan solos (para pruebas)
const NIVEL_INICIAL = Math.max(1, parseInt(params.get('nivel') || '1', 10) || 1);

// ---------- Reglas ----------
// La zona de juego va de lado a lado de la pantalla: de x = -ANCHO a ANCHO (unos 17 en una tele 16:9)
const ANCHO = Math.max(12, Math.min(18, 9.7 * (innerWidth / Math.max(1, innerHeight)) - 0.4));
const TECHO = 14;          // y de 0 (suelo) a 14
// Los niveles están dibujados en una rejilla de 32x18; se escalan a la zona de juego
const SX = ANCHO / 16, SY = TECHO / 18;
const G = 16;              // gravedad de las pompas
const VX = 3.0;            // velocidad lateral de las pompas
// Tamaños: radio, altura a la que bota el centro, puntos por darle
const TAM = [
  { r: 0.36, bote: 4.0, pts: 400 },
  { r: 0.62, bote: 5.7, pts: 200 },
  { r: 0.95, bote: 7.4, pts: 100 },
  { r: 1.35, bote: 9.1, pts: 50 },
  { r: 1.8, bote: 10.5, pts: 25 },
];
const TINTES = ['#ff3d8b', '#ff9a1f', '#1fb6ff', '#7a4dff', '#22c55e'];
const VEL_JUGADOR = 7;
const MEDIO_ANCHO = 0.45;   // caja de choque del jugador (igual para todos los animales)
const ALTO_JUGADOR = 1.6;
const VEL_DISPARO = 21;
const VIDAS = 3, VIDAS_MAX = 5;
const T_PODER = 20;        // segundos que duran doble y gancho
const T_GANCHO = 2.6;      // lo que se queda pegado un disparo con gancho
const T_RELOJ = 4.5;

escenario(document.getElementById('esc'));
const $ = (id) => document.getElementById(id);
const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
controlesTactiles({ camara: false, botones: [{ b: 'A', txt: 'A', color: '#3dbb4c' }], pausa: true });
if (esTactil) $('ayuda').innerHTML = '<span>Dedo a la izquierda: mover · <span class="boton-a">A</span> disparar</span>';

function rng(seed) { return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const azar = rng(11);
const clamp = THREE.MathUtils.clamp;

// ---------- Render ----------
const renderer = new THREE.WebGLRenderer({ canvas: $('lienzo'), antialias: !enTele, powerPreference: 'high-performance' });
const escena = new THREE.Scene();
const camara = new THREE.PerspectiveCamera(36, innerWidth / innerHeight, 0.5, 400);
function ajustar() {
  const objetivo = parseInt(params.get('ancho') || (enTele ? '1280' : esTactil ? '1600' : '1920'), 10);
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, objetivo / innerWidth));
  renderer.setSize(innerWidth, innerHeight, false);
  camara.aspect = innerWidth / innerHeight;
  camara.updateProjectionMatrix();
  // Que quepa entera la zona de juego (más un margen para el marcador de arriba), sea cual sea la pantalla
  const t = Math.tan(THREE.MathUtils.degToRad(camara.fov / 2));
  const abajo = 2.0, arriba = 3.4;   // margen bajo el suelo (ayuda) y sobre la rama (marcador)
  const dAlto = (TECHO + abajo + arriba) / 2 / t;
  const dAncho = (ANCHO * 2 + 0.6) / 2 / (t * camara.aspect);
  const d = Math.max(dAlto, dAncho);
  const cy = (TECHO + arriba - abajo) / 2;
  camara.position.set(0, cy, d);
  camara.lookAt(0, cy, 0);
}
addEventListener('resize', ajustar);
ajustar();

escena.fog = new THREE.Fog('#ffe4f3', 60, 140);
escena.add(new THREE.HemisphereLight('#e6f4ff', '#a6dd84', 1.9));
const sol = new THREE.DirectionalLight('#fff0dc', 2.0);
sol.position.set(-20, 40, 30);
escena.add(sol);

const mats = new Map();
function mat(color, opts = {}) {
  const k = color + JSON.stringify(opts);
  if (!mats.has(k)) mats.set(k, new THREE.MeshLambertMaterial({ color, ...opts }));
  return mats.get(k);
}
const dummy = new THREE.Object3D();

// Cielo
const cielo = new THREE.Mesh(
  new THREE.PlaneGeometry(400, 200),
  new THREE.ShaderMaterial({
    depthWrite: false, fog: false,
    uniforms: { arriba: { value: new THREE.Color('#6cc4ff') }, abajo: { value: new THREE.Color('#ffe4f3') } },
    vertexShader: 'varying vec2 vU; void main(){ vU = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform vec3 arriba; uniform vec3 abajo; varying vec2 vU;
      void main(){ gl_FragColor = vec4(mix(abajo, arriba, smoothstep(0.42, 0.75, vU.y)), 1.0);
      #include <colorspace_fragment>
      }`,
  }),
);
cielo.position.set(0, 20, -90);
cielo.renderOrder = -1;
escena.add(cielo);

// Arcoíris y colinas al fondo
['#ff5d73', '#ff9f43', '#ffd93d', '#6bd968', '#4cc3ff', '#7b7bff', '#c17bff'].forEach((c, i) => {
  const a = new THREE.Mesh(new THREE.TorusGeometry(46 - i * 1.5, 0.8, 6, 64, Math.PI), new THREE.MeshBasicMaterial({ color: c, fog: false }));
  a.position.set(6, -4, -80);
  escena.add(a);
});
const colinas = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 20, 10), mat('#8fdc6a'), 7);
[[-50, -30, 30, 14], [-18, -36, 26, 10], [14, -32, 30, 12], [46, -30, 28, 15], [-34, -22, 18, 7], [30, -20, 16, 6], [0, -24, 20, 6]].forEach(([x, z, s, h], i) => {
  dummy.position.set(x, -2, z); dummy.scale.set(s, h, s * 0.5); dummy.rotation.set(0, 0, 0); dummy.updateMatrix();
  colinas.setMatrixAt(i, dummy.matrix);
  colinas.setColorAt(i, new THREE.Color(i % 2 ? '#7fd65a' : '#9fe27a'));
});
escena.add(colinas);

// Nubes
const nubes = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 12, 8), new THREE.MeshLambertMaterial({ color: '#ffffff', emissive: '#ffffff', emissiveIntensity: 0.5 }), 30);
for (let n = 0; n < 6; n++) {
  const x = -60 + n * 24 + azar() * 8, y = 24 + azar() * 10, z = -60 - azar() * 15;
  for (let k = 0; k < 5; k++) {
    const s = 2.5 + azar() * 2.5;
    dummy.position.set(x + (k - 2) * 2.8, y + azar() * 1.5, z); dummy.scale.set(s * 1.3, s * 0.8, s); dummy.updateMatrix();
    nubes.setMatrixAt(n * 5 + k, dummy.matrix);
  }
}
escena.add(nubes);

// Suelo: césped con borde de tierra
const suelo = new THREE.Mesh(new THREE.BoxGeometry(140, 3, 30), mat('#7fd65a'));
suelo.position.set(0, -1.5, -8);
escena.add(suelo);
const borde = new THREE.Mesh(new THREE.BoxGeometry(140, 2.2, 0.6), mat('#b7835a'));
borde.position.set(0, -1.9, 6.8);
escena.add(borde);
const flores = new THREE.InstancedMesh(new THREE.SphereGeometry(0.16, 6, 4), mat('#ffffff'), 70);
const FLOR = ['#ff6fb1', '#ffffff', '#ffd23f', '#b48cff', '#ff8a5c'];
for (let i = 0; i < 70; i++) {
  dummy.position.set(-40 + azar() * 80, 0.08, -8 + azar() * 12); dummy.scale.set(1, 0.6, 1); dummy.updateMatrix();
  flores.setMatrixAt(i, dummy.matrix);
  flores.setColorAt(i, new THREE.Color(FLOR[i % FLOR.length]));
}
escena.add(flores);
if (hayNaturaleza) {
  adornar(escena, azar, (r) => ({ x: -48 + r() * 96, y: 0, z: -21 + r() * 19 }), [[HIERBAS, 260, 0.35, 0.7], [ARBUSTOS, 45, 0.9, 1.8], [FLORES, 36, 0.45, 0.8], [SETITAS, 24, 0.3, 0.55], [ROCAS, 16, 0.3, 0.7], [['Tree_Stump'], 4, 0.6, 0.9]]);
  adornar(escena, azar, (r) => ({ x: -40 + r() * 80, y: 0, z: 1.6 + r() * 4.6 }), [[HIERBAS, 90, 0.2, 0.35], [SETITAS, 8, 0.18, 0.3]]);
  // Unos árboles al fondo
  adornar(escena, azar, (r) => ({ x: -60 + r() * 120, y: 0, z: -17 - r() * 5.5 }), [[ARBOLES, 22, 4, 7], [ABETOS, 10, 4.5, 7.5]], 1 / 0.7);
}

// (Aquí había un marco de troncos alrededor de la zona de juego: ahora se juega de lado a lado de la pantalla.)

// Sombra redonda
const geoSombra = new THREE.CircleGeometry(1, 24);
function sombra(radio, opacidad = 0.25) {
  const m = new THREE.Mesh(geoSombra, new THREE.MeshBasicMaterial({ color: '#3a2050', transparent: true, opacity: opacidad, depthWrite: false }));
  m.rotation.x = -Math.PI / 2;
  m.scale.set(radio, radio * 0.5, 1);
  m.renderOrder = 1;
  escena.add(m);
  return m;
}

// ---------- Pompas ----------
// Jabón: transparente en el centro, irisada en el borde y con un brillo. Un material por color.
const uTiempo = { value: 0 };
const uCongelado = { value: 0 };
const matPompa = TINTES.map((c) => new THREE.ShaderMaterial({
  transparent: true, depthWrite: false,
  uniforms: { uTinte: { value: new THREE.Color(c) }, uTiempo, uCongelado },
  vertexShader: `varying vec3 vN; varying vec3 vV; varying vec3 vP;
    void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = -mv.xyz; vP = position;
    gl_Position = projectionMatrix * mv; }`,
  fragmentShader: `uniform vec3 uTinte; uniform float uTiempo; uniform float uCongelado;
    varying vec3 vN; varying vec3 vV; varying vec3 vP;
    vec3 arco(float t){ return 0.5 + 0.5 * cos(6.2831 * (t + vec3(0.0, 0.33, 0.67))); }
    void main(){
      vec3 n = normalize(vN), v = normalize(vV);
      float f = 1.0 - max(dot(n, v), 0.0);
      float b = f * f;
      vec3 iris = arco(f * 1.4 + vP.y * 0.25 + uTiempo * 0.12);
      vec3 c = mix(uTinte, iris, 0.35 * b);
      c = mix(c, vec3(0.75, 0.9, 1.0), uCongelado * 0.6);
      vec3 h = normalize(normalize(vec3(-0.45, 0.7, 0.55)) + v);
      float brillo = pow(max(dot(n, h), 0.0), 70.0) * 1.2;
      float brillo2 = pow(max(dot(n, normalize(vec3(0.5, -0.45, 0.75))), 0.0), 14.0) * 0.25;
      float a = 0.55 + 0.4 * b + brillo;
      gl_FragColor = vec4(c * (0.95 + 0.3 * b) + vec3(brillo + brillo2), clamp(a, 0.0, 1.0));
      #include <colorspace_fragment>
    }`,
}));
const geoPompa = new THREE.SphereGeometry(1, 28, 18);

const pompas = [];
class Pompa {
  constructor(tam, x, y, vx, vy) {
    this.tam = tam;
    this.r = TAM[tam].r;
    this.x = x; this.y = y; this.vx = vx; this.vy = vy;
    this.m = new THREE.Mesh(geoPompa, matPompa[tam]);
    this.m.renderOrder = 3;
    this.aplasta = 0;
    this.t = Math.random() * 10;
    this.sombra = sombra(this.r * 0.9, 0.18);
    escena.add(this.m);
    this.pintar();
  }
  /** Velocidad hacia arriba al botar en el suelo: siempre sube hasta su altura. */
  get impulso() { return Math.sqrt(2 * G * Math.max(0.5, TAM[this.tam].bote - this.r)); }
  paso(dt, vel) {
    const r = this.r;
    this.vy -= G * vel * vel * dt;
    this.x += (this.vx * vel + (REGLA.viento > 1 ? racha().x * 0.6 : 0)) * dt;   // solo con los efectos exagerados el viento se lleva las pompas
    this.y += this.vy * vel * dt;
    if (this.y - r < 0) { this.y = r; this.vy = this.impulso; this.aplasta = 1; }
    if (this.y + r > TECHO) { this.y = TECHO - r; this.vy = -Math.abs(this.vy); }
    if (this.x - r < -ANCHO) { this.x = -ANCHO + r; this.vx = Math.abs(this.vx); }
    if (this.x + r > ANCHO) { this.x = ANCHO - r; this.vx = -Math.abs(this.vx); }
    for (const p of plataformas) {
      const cx = clamp(this.x, p.x0, p.x1), cy = clamp(this.y, p.y0, p.y1);
      const dx = this.x - cx, dy = this.y - cy, d2 = dx * dx + dy * dy;
      if (d2 >= r * r) continue;
      const d = Math.sqrt(d2) || 1e-4;
      if (Math.abs(dy) >= Math.abs(dx)) {
        if (dy > 0) { this.y = p.y1 + r; this.vy = Math.max(Math.abs(this.vy), this.impulso * 0.75); this.aplasta = 1; }
        else { this.y = p.y0 - r; this.vy = -Math.abs(this.vy); }
      } else {
        this.x = cx + (dx / d) * r;
        this.vx = dx > 0 ? Math.abs(this.vx) : -Math.abs(this.vx);
      }
    }
  }
  pintar(dt = 0) {
    this.t += dt;
    this.aplasta = Math.max(0, this.aplasta - dt * 5);
    const e = Math.sin(this.aplasta * Math.PI) * 0.14;
    const w = Math.sin(this.t * 5) * 0.025;
    this.m.position.set(this.x, this.y, 0);
    this.m.scale.set(this.r * (1 + e + w), this.r * (1 - e - w), this.r * (1 + e));
    const h = clamp(this.y / 12, 0, 1);
    this.sombra.position.set(this.x, 0.03, 0.2);
    this.sombra.scale.set(this.r * (1 - h * 0.5), this.r * 0.5 * (1 - h * 0.5), 1);
    this.sombra.material.opacity = 0.22 * (1 - h * 0.7);
  }
  quitar() { escena.remove(this.m, this.sombra); this.sombra.material.dispose(); }
}

// ---------- Plataformas ----------
let plataformas = [];
const geoCaja = new THREE.BoxGeometry(1, 1, 1.6);
const matCristal = new THREE.MeshPhongMaterial({ color: '#d9f4ff', transparent: true, opacity: 0.7, shininess: 90, specular: '#ffffff', emissive: '#9fdcff', emissiveIntensity: 0.55 });
const matBordeCristal = new THREE.LineBasicMaterial({ color: '#ffffff' });
const geoBordeCaja = new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1.6));
function ponerPlataformas(lista) {
  for (const p of plataformas) escena.remove(p.m);
  plataformas = lista.map(({ x, y, w, h, cristal }) => {
    x *= SX; y *= SY; w = w * SX; if (h > 1.5) h *= SY;
    const m = new THREE.Mesh(geoCaja, cristal ? matCristal : mat('#c48a5c'));
    m.position.set(x, y, 0);
    m.scale.set(w, h, 1);
    m.renderOrder = cristal ? 4 : 0;
    if (cristal) m.add(new THREE.LineSegments(geoBordeCaja, matBordeCristal));
    escena.add(m);
    return { x0: x - w / 2, x1: x + w / 2, y0: y - h / 2, y1: y + h / 2, cristal: !!cristal, m };
  });
}
function romper(p) {
  escena.remove(p.m);
  plataformas = plataformas.filter((q) => q !== p);
  suena('cristal');
  gotas(new THREE.Vector3((p.x0 + p.x1) / 2, (p.y0 + p.y1) / 2, 0), 24, '#bfeaff');
}

// ---------- Niveles ----------
// pompas: [tamaño, x, y, dirección]; plataformas: { x, y, w, h, cristal }
const NIVELES = [
  { pompas: [[2, -8, 10, 1]] },
  { pompas: [[3, -6, 11, 1]] },
  { pompas: [[2, -10, 10, 1], [2, 10, 10, -1]] },
  { pompas: [[3, 0, 12, 1]], plat: [{ x: 0, y: 6.5, w: 9, h: 0.7 }] },
  { pompas: [[4, -6, 12, 1]] },
  { pompas: [[1, -12, 8, 1], [1, -6, 10, 1], [1, 0, 8, -1], [1, 6, 10, -1], [1, 12, 8, -1], [0, -3, 12, 1], [0, 3, 12, -1]] },
  { pompas: [[3, -9, 12, 1], [3, 9, 12, -1]], plat: [{ x: -8, y: 6, w: 6, h: 0.7, cristal: true }, { x: 8, y: 6, w: 6, h: 0.7, cristal: true }] },
  { pompas: [[4, 0, 13, 1]], plat: [{ x: -10.5, y: 9, w: 5, h: 0.7 }, { x: 10.5, y: 9, w: 5, h: 0.7 }] },
  { pompas: [[2, -12, 9, 1], [3, 0, 12, 1], [2, 12, 9, -1]], plat: [{ x: 0, y: 13, w: 0.8, h: 10 }] },
  { pompas: [[4, -7, 13, 1], [4, 7, 13, -1]] },
  { pompas: [[3, -11, 13, 1], [3, 11, 13, -1]], plat: [{ x: -6, y: 7.5, w: 4, h: 0.7, cristal: true }, { x: 0, y: 7.5, w: 4, h: 0.7 }, { x: 6, y: 7.5, w: 4, h: 0.7, cristal: true }] },
  { pompas: [[4, -8, 13, 1], [3, 8, 12, -1], [2, 0, 9, 1], [1, -13, 7, 1], [1, 13, 7, -1]], plat: [{ x: -4, y: 11, w: 0.8, h: 7 }, { x: 4, y: 11, w: 0.8, h: 7 }] },
];
/** A partir del 13: niveles generados (siempre iguales para el mismo número), cada vez más llenos. */
function nivelGenerado(n) {
  const a = rng(1000 + n);
  const grandes = Math.min(5, 2 + Math.floor((n - 12) / 3));
  const pomp = [];
  for (let i = 0; i < grandes; i++) {
    const x = -12 + (24 / Math.max(1, grandes - 1)) * i + (a() - 0.5) * 2;
    pomp.push([a() < 0.55 ? 4 : 3, grandes === 1 ? 0 : x, 11 + a() * 3, i % 2 ? -1 : 1]);
  }
  const plat = [];
  const nPlat = Math.floor(a() * 4);
  for (let i = 0; i < nPlat; i++) {
    plat.push({ x: -12 + a() * 24, y: 6 + a() * 6, w: 3 + a() * 4, h: 0.7, cristal: a() < 0.4 });
  }
  return { pompas: pomp, plat };
}
function datosNivel(n) { return n <= NIVELES.length ? NIVELES[n - 1] : nivelGenerado(n); }
/** Las pompas van más rápidas en cada nivel (hasta un tope). */
function velNivel(n) { return Math.min(1.35, 1 + (n - 1) * 0.022); }
function tiempoNivel(d) {
  // Lo que cuesta limpiar el nivel: cada pompa de tamaño t son 2^(t+1)-1 disparos
  let disparos = 0;
  for (const [t] of d.pompas) disparos += Math.pow(2, t + 1) - 1;
  return Math.round(clamp(25 + disparos * 2.2, 35, 120) / 5) * 5;
}

// ---------- Gotas al explotar (una sola llamada de dibujo) ----------
const N_GOTAS = 220;
const gotasMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(0.09, 6, 4), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.85 }), N_GOTAS);
gotasMesh.frustumCulled = false;
const listaGotas = Array.from({ length: N_GOTAS }, () => ({ p: new THREE.Vector3(), v: new THREE.Vector3(), vida: 0 }));
for (let i = 0; i < N_GOTAS; i++) gotasMesh.setColorAt(i, new THREE.Color('#ffffff'));
escena.add(gotasMesh);
let sigGota = 0;
function gotas(pos, n, color, radio = 0.5) {
  const c = new THREE.Color(color);
  for (let k = 0; k < n; k++) {
    const q = listaGotas[sigGota];
    gotasMesh.setColorAt(sigGota, k % 3 ? c : new THREE.Color('#ffffff'));
    sigGota = (sigGota + 1) % N_GOTAS;
    const a = Math.random() * Math.PI * 2;
    q.p.set(pos.x + Math.cos(a) * radio, pos.y + Math.sin(a) * radio, (Math.random() - 0.5) * radio);
    q.v.set(Math.cos(a), Math.sin(a) + 0.4, (Math.random() - 0.5) * 0.6).multiplyScalar(3 + Math.random() * 5);
    q.vida = 0.5 + Math.random() * 0.4;
  }
  gotasMesh.instanceColor.needsUpdate = true;
}
function actualizarGotas(dt) {
  for (let i = 0; i < N_GOTAS; i++) {
    const q = listaGotas[i];
    if (q.vida > 0) {
      q.vida -= dt;
      q.v.y -= 14 * dt;
      q.p.addScaledVector(q.v, dt);
      dummy.position.copy(q.p); dummy.rotation.set(0, 0, 0); dummy.scale.setScalar(Math.min(1, q.vida * 3));
    } else dummy.scale.setScalar(0);
    dummy.updateMatrix();
    gotasMesh.setMatrixAt(i, dummy.matrix);
  }
  gotasMesh.instanceMatrix.needsUpdate = true;
}

// ---------- Objetos que sueltan las pompas ----------
const PODERES = [
  { id: 'doble', peso: 30, icono: '×2', color: '#ff9f1c' },
  { id: 'gancho', peso: 25, icono: '⚓', color: '#4cc3ff' },
  { id: 'reloj', peso: 18, icono: '⏱', color: '#8f6bff' },
  { id: 'escudo', peso: 20, icono: '🛡', color: '#3dbb4c' },
  { id: 'vida', peso: 7, icono: '❤', color: '#ff4d6d' },
];
const PROB_OBJETO = 0.13;
const texturas = new Map();
function texturaPoder(p) {
  if (texturas.has(p.id)) return texturas.get(p.id);
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const x = c.getContext('2d');
  x.fillStyle = '#ffffff'; x.beginPath(); x.arc(64, 64, 60, 0, Math.PI * 2); x.fill();
  x.fillStyle = p.color; x.beginPath(); x.arc(64, 64, 50, 0, Math.PI * 2); x.fill();
  x.fillStyle = '#ffffff';
  x.font = `bold ${p.id === 'doble' ? 54 : 62}px Fredoka, system-ui, sans-serif`;
  x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillText(p.icono, 64, 70);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  texturas.set(p.id, t);
  return t;
}
let objetos = [];
function soltarObjeto(x, y) {
  if (Math.random() > PROB_OBJETO) return;
  const total = PODERES.reduce((s, p) => s + p.peso, 0);
  let r = Math.random() * total, poder = PODERES[0];
  for (const p of PODERES) { r -= p.peso; if (r <= 0) { poder = p; break; } }
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: texturaPoder(poder), transparent: true }));
  s.scale.setScalar(1.1);
  s.renderOrder = 5;
  escena.add(s);
  objetos.push({ poder, x, y, vy: 0, quieto: 0, s });
}
function actualizarObjetos(dt) {
  for (const o of objetos) {
    if (o.y > 0.65) {
      o.vy -= 20 * dt;
      o.vy = Math.max(o.vy, -7);
      let ny = o.y + o.vy * dt;
      for (const p of plataformas) {
        if (o.x > p.x0 && o.x < p.x1 && o.y - 0.65 >= p.y1 - 0.01 && ny - 0.65 < p.y1) { ny = p.y1 + 0.65; o.vy = 0; }
      }
      o.y = Math.max(0.65, ny);
    } else o.quieto += dt;
    if (o.vy === 0 && o.y > 0.66) o.quieto += dt;
    o.s.position.set(o.x, o.y + Math.sin(performance.now() / 250) * 0.06, 0.4);
    o.s.visible = o.quieto < 6 || Math.floor(o.quieto * 8) % 2 === 0;
  }
  objetos = objetos.filter((o) => { if (o.quieto > 8) { escena.remove(o.s); o.s.material.dispose(); return false; } return true; });
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

const geoDisparo = new THREE.CylinderGeometry(0.07, 0.07, 1, 6);
geoDisparo.translate(0, 0.5, 0);
const geoPunta = new THREE.SphereGeometry(0.2, 10, 8);
const geoEscudo = new THREE.SphereGeometry(1, 20, 14);
const tmp = new THREE.Vector3();

class Jugador {
  constructor(def, i) {
    this.perfil = def.perfil;
    this.dispositivo = def.dispositivo;
    this.i = i;
    this.color = def.perfil.color || '#ff4d6d';
    this.pj = crearPersonaje(THREE, def.perfil);
    this.pj.g.scale.multiplyScalar(1.35);
    escena.add(this.pj.g);
    this.sombra = sombra(0.75 * this.pj.escala);
    this.matDisparo = new THREE.MeshBasicMaterial({ color: this.color });
    this.matPunta = new THREE.MeshBasicMaterial({ color: new THREE.Color(this.color).lerp(new THREE.Color('#ffffff'), 0.5) });
    this.escudoM = new THREE.Mesh(geoEscudo, new THREE.MeshBasicMaterial({ color: '#7dffa8', transparent: true, opacity: 0.22, depthWrite: false }));
    this.escudoM.renderOrder = 6;
    this.escudoM.visible = false;
    escena.add(this.escudoM);
    this.etiqueta = null;
    if (VARIOS) {
      const e = document.createElement('div');
      e.className = 'etiqueta';
      e.textContent = def.perfil.nombre;
      e.style.setProperty('--c', this.color);
      $('flotantes').appendChild(e);
      this.etiqueta = e;
    }
    this.puntos = 0;
    this.vidas = VIDAS;
    this.reiniciarPartida();
  }

  reiniciarPartida() { this.puntos = 0; this.vidas = VIDAS; this.fuera = false; this.poder = null; this.tPoder = 0; this.escudo = false; }

  colocar(n) {
    this.x = (this.i - (n - 1) / 2) * 3;
    this.vx = 0;
    this.giro = 0; this.paso = 0; this.mira = 0; this.aplasta = 0;
    this.invencible = 0;
    this.quitarDisparos();
    this.pj.g.visible = !this.fuera;
  }

  quitarDisparos() {
    for (const d of this.disparos || []) escena.remove(d.m, d.punta);
    this.disparos = [];
  }

  entrada() {
    if (BOT) return entradaBot(this);
    if (!this.dispositivo) return [pad.lx, pad.pressed('A') || pad.pressed('X') || pad.pressed('RT')];
    const d = entradas.get(this.dispositivo);
    return d ? [d.lx, d.pressed('A') || d.pressed('X') || d.pressed('RT')] : [0, false];
  }

  get maxDisparos() { return this.poder === 'doble' ? 2 : 1; }

  disparar() {
    if (this.disparos.length >= this.maxDisparos) return;
    const m = new THREE.Mesh(geoDisparo, this.matDisparo);
    const punta = new THREE.Mesh(geoPunta, this.matPunta);
    m.position.set(this.x, 0, 0.1);
    escena.add(m, punta);
    this.disparos.push({ x: this.x, arriba: 1.2, pegado: null, m, punta });
    this.mira = 0.3;
    suena('disparo');
  }

  actualizar(dt, lx, fuego, activo) {
    if (this.fuera) return;
    const pw = this.pw = poder(this.pj);   // el especial del animal
    const objetivo = activo ? lx * VEL_JUGADOR * pw.vel : 0;
    this.vx += (objetivo - this.vx) * Math.min(1, dt * 14 * REGLA.agarre);   // invierno: resbala
    if (pw.avance) this.vx = (this.giro >= 0 ? 1 : -1) * VEL_JUGADOR * (1 + pw.avance);
    this.x = clamp(this.x + this.vx * dt, -ANCHO + MEDIO_ANCHO, ANCHO - MEDIO_ANCHO);
    // Saltar (solo con el especial): sirve para esquivar pompas pequeñas
    this.y = this.y || 0; this.vy = this.vy || 0;
    if (pw.salto && this.y <= 0.01) this.vy = 9 * pw.salto;
    this.vy -= 24 * dt * (this.vy < 0 ? pw.grav : 1);
    this.y = Math.max(0, this.y + this.vy * dt);
    if (this.y === 0) this.vy = 0;
    this.pj.lanzaArriba = true;   // aquí la ardilla lanza la bellota hacia arriba, que es donde están las pompas
    if (pw.rugido && activo) for (const p of [...pompas]) if (Math.hypot(p.x - this.x, p.y - 1.5 - pw.lejos) < pw.rugido + p.r) darPompa(p, this);
    if (activo && fuego) this.disparar();

    // Disparos: suben hasta el techo o una plataforma
    for (const d of this.disparos) {
      if (d.pegado !== null) { d.pegado -= dt; if (d.pegado <= 0) d.fin = true; continue; }
      let tope = TECHO, choca = null;
      for (const p of plataformas) if (d.x > p.x0 && d.x < p.x1 && p.y0 >= 0.5 && p.y0 < tope && p.y0 >= d.arriba - 0.01) { tope = p.y0; choca = p; }
      d.arriba += VEL_DISPARO * dt;
      if (d.arriba >= tope) {
        d.arriba = tope;
        if (choca && choca.cristal) { romper(choca); d.fin = true; this.puntos += 50; }
        else if (this.poder === 'gancho') d.pegado = T_GANCHO;
        else d.fin = true;
      }
    }
    this.limpiarDisparos();
    for (const d of this.disparos) {
      d.m.position.x = d.x;
      d.m.scale.y = d.arriba;
      d.punta.position.set(d.x, d.arriba, 0.1);
      const parpadea = d.pegado !== null && d.pegado < 0.7 && Math.floor(d.pegado * 12) % 2 === 0;
      d.m.visible = d.punta.visible = !parpadea;
    }

    // Poderes con tiempo
    if (this.poder) { this.tPoder -= dt; if (this.tPoder <= 0) this.poder = null; }
    this.invencible = Math.max(0, this.invencible - dt);

    // Animación: de cara al moverse, de frente y mirando arriba al disparar
    const rapidez = Math.abs(this.vx);
    const giroObj = this.mira > 0 ? 0 : rapidez > 0.4 ? Math.sign(this.vx) * 1.25 : 0;
    this.giro += (giroObj - this.giro) * Math.min(1, dt * 14);
    this.mira = Math.max(0, this.mira - dt);
    if (rapidez > 0.6) this.paso += dt * 15; else this.paso *= Math.exp(-dt * 10);
    this.aplasta = Math.max(0, this.aplasta - dt * 5);
    this.pj.g.position.set(this.x, this.y, 0);
    this.pj.g.rotation.y = this.giro;
    animarPersonaje(this.pj, { paso: this.paso, suelo: this.y < 0.02, aplasta: this.aplasta, mirar: this.mira > 0 ? -0.75 : -0.15, dt });
    this.pj.g.visible = this.invencible <= 0 || Math.floor(this.invencible * 10) % 2 === 0;
    this.sombra.position.set(this.x, 0.02, 0);
    this.escudoM.visible = this.escudo;
    if (this.escudo) {
      const s = 1.2 + Math.sin(performance.now() / 180) * 0.04;
      this.escudoM.position.set(this.x, 0.9, 0);
      this.escudoM.scale.set(s, s * 1.05, s);
    }
  }

  limpiarDisparos() {
    this.disparos = this.disparos.filter((d) => { if (d.fin) { escena.remove(d.m, d.punta); return false; } return true; });
  }

  /** ¿La pompa toca al jugador? Caja igual para todos, un pelín más pequeña que el dibujo para que sea justo. */
  toca(p) {
    if (this.fuera) return false;
    const y0 = this.y || 0, cx = clamp(p.x, this.x - MEDIO_ANCHO, this.x + MEDIO_ANCHO), cy = clamp(p.y, y0, y0 + ALTO_JUGADOR);
    const dx = p.x - cx, dy = p.y - cy;
    return dx * dx + dy * dy < (p.r * 0.92) * (p.r * 0.92);
  }

  pintarEtiqueta() {
    if (!this.etiqueta) return;
    this.etiqueta.style.display = this.fuera ? 'none' : 'block';
    if (this.fuera) return;
    tmp.set(this.x, 2.6 * this.pj.escala + 0.2, 0).project(camara);
    this.etiqueta.style.left = ((tmp.x + 1) / 2 * innerWidth) + 'px';
    this.etiqueta.style.top = ((1 - tmp.y) / 2 * innerHeight) + 'px';
  }
}

const jugadores = defs.map((d, i) => new Jugador(d, i));
const vivos = () => jugadores.filter((j) => !j.fuera);

// ---------- Partida ----------
let estado = 'intro';     // intro | jugando | pausa | superado | fin
let estadoAntesPausa = 'jugando', tAntesPausa = 0;
let tEstado = 0;
let nivel = NIVEL_INICIAL;
let tiempo = 60;
let congelado = 0;
let nuevoRecord = false;
let ultimoSegundo = -1;
const ids = defs.map((d) => d.perfil.id).filter(Boolean);
function leerRecord() { return LIBRE ? records.leer(JUEGO) : VARIOS ? recordEquipo(JUEGO, ids) : recordDe(ids[0], JUEGO); }
function guardarRecord(v) { if (LIBRE) records.guardar(JUEGO, v); else if (VARIOS) ponerRecordEquipo(JUEGO, ids, v); else ponerRecord(ids[0], JUEGO, v); }
let record = leerRecord();
const total = () => jugadores.reduce((s, j) => s + j.puntos, 0);

function pintarArriba() {
  $('record').firstChild.textContent = VARIOS ? `Récord juntos ${record}` : `Récord ${record}`;
  $('total').textContent = String(total());
  $('nivel').textContent = `Nivel ${nivel}`;
}
function pintarTiempo() {
  const s = Math.max(0, Math.ceil(tiempo));
  const t = $('tiempo');
  t.textContent = String(s);
  t.classList.toggle('prisa', s <= 10 && estado === 'jugando');
}
function pintarMarcador() {
  $('marcador').innerHTML = jugadores.map((j) => {
    const poder = j.poder ? PODERES.find((p) => p.id === j.poder).icono : '';
    const corazones = j.fuera ? 'fuera' : '❤'.repeat(j.vidas);
    return `<span class="chip${j.fuera ? ' fuera' : ''}" style="--c:${j.color}"><i></i>${esc(j.perfil.nombre || 'Puntos')} <b>${j.puntos}</b>`
      + `<span class="vidas">${corazones}</span>${j.escudo ? '<span class="poder">🛡</span>' : ''}${poder ? `<span class="poder">${poder}</span>` : ''}</span>`;
  }).join('');
}
let marcadorSucio = true;

function mensaje(html, ms = 1200) {
  const m = $('mensaje');
  m.innerHTML = html;
  m.classList.add('ver');
  clearTimeout(mensaje.t);
  if (ms) mensaje.t = setTimeout(() => m.classList.remove('ver'), ms);
}
function panel(html) {
  const p = $('panel');
  if (html) { p.innerHTML = html; p.classList.add('ver'); } else p.classList.remove('ver');
}
function cambiar(e) { estado = e; tEstado = 0; }

function quitarPompas() { for (const p of pompas) p.quitar(); pompas.length = 0; }
function quitarObjetos() { for (const o of objetos) { escena.remove(o.s); o.s.material.dispose(); } objetos = []; }

function cargarNivel(n, { repetir = false } = {}) {
  nivel = n;
  const d = datosNivel(n);
  quitarPompas();
  quitarObjetos();
  ponerPlataformas(d.plat || []);
  for (const [t, x, y, dir] of d.pompas) pompas.push(new Pompa(t, x * SX, Math.min(y * SY, TECHO - TAM[t].r - 0.2), dir * VX, 0));
  tiempo = tiempoNivel(d);
  congelado = 0;
  ultimoSegundo = -1;
  jugadores.forEach((j) => j.colocar(jugadores.length));
  pintarArriba(); pintarTiempo(); marcadorSucio = true;
  cambiar('intro');
  mensaje(repetir ? `¡Otra vez!<small>Nivel ${n}</small>` : `Nivel ${n}`, 1500);
}

function empezar() {
  jugadores.forEach((j) => j.reiniciarPartida());
  nuevoRecord = false;
  panel(null);
  cargarNivel(NIVEL_INICIAL);
}

const OPCIONES_FIN = `<div class="opciones"><span data-tap="A"><span class="boton-a">A</span> Otra vez</span>`
  + `<span data-tap="Y"><span class="boton-a" style="background:#ffc531">Y</span> Jugadores</span>`
  + `<span data-tap="B"><span class="boton-a boton-b">B</span> Menú</span></div>`;

function pausar(si) {
  if (si) {
    estadoAntesPausa = estado; tAntesPausa = tEstado;
    cambiar('pausa');
    panel(`<h2>Pausa</h2><div class="opciones"><span data-tap="A"><span class="boton-a">A</span> Seguir</span><span data-tap="B"><span class="boton-a boton-b">B</span> ${FIESTA ? 'Volver al tablero' : 'Salir al menú'}</span></div>`);
  } else {
    panel(null);
    estado = estadoAntesPausa; tEstado = tAntesPausa;
  }
}

function flotante(txt, x, y, color) {
  tmp.set(x, y, 0).project(camara);
  const d = document.createElement('div');
  d.className = 'mas1 txt';
  d.textContent = txt;
  if (color) d.style.setProperty('--morado', color);
  d.style.left = ((tmp.x + 1) / 2 * innerWidth) + 'px';
  d.style.top = ((1 - tmp.y) / 2 * innerHeight) + 'px';
  $('flotantes').appendChild(d);
  setTimeout(() => d.remove(), 900);
}

/** Un disparo le da a una pompa: se parte en dos (o explota si es la más pequeña). */
function darPompa(p, j) {
  const i = pompas.indexOf(p);
  if (i < 0) return;
  pompas.splice(i, 1);
  p.quitar();
  const pts = TAM[p.tam].pts;
  j.puntos += pts;
  marcadorSucio = true;
  suena('pompa', p.tam);
  vibrar(25, j.dispositivo || undefined);
  gotas(new THREE.Vector3(p.x, p.y, 0), 8 + p.tam * 5, TINTES[p.tam], p.r);
  flotante(`+${pts}`, p.x, p.y + p.r, VARIOS ? j.color : null);
  if (p.tam > 0) {
    const t = p.tam - 1;
    const sube = Math.max(6, Math.min(Math.abs(p.vy) * 0.5 + 5, 9));
    const y = Math.max(TAM[t].r + 0.1, Math.min(p.y, TECHO - TAM[t].r - 0.1));
    pompas.push(new Pompa(t, p.x - 0.1, y, -VX, sube), new Pompa(t, p.x + 0.1, y, VX, sube));
  }
  soltarObjeto(p.x, p.y);
  if (pompas.length === 0) nivelSuperado();
}

function coger(o, j) {
  escena.remove(o.s); o.s.material.dispose();
  objetos = objetos.filter((q) => q !== o);
  suena('objeto');
  const id = o.poder.id;
  if (id === 'doble' || id === 'gancho') { j.poder = id; j.tPoder = T_PODER; }
  else if (id === 'escudo') j.escudo = true;
  else if (id === 'vida') j.vidas = Math.min(VIDAS_MAX, j.vidas + 1);
  else if (id === 'reloj') { congelado = T_RELOJ; mensaje('¡Pompas congeladas!', 1000); }
  flotante(o.poder.icono, j.x, 3, o.poder.color);
  marcadorSucio = true;
}

function golpe(j) {
  if (j.invencible > 0 || (j.pw && j.pw.invulnerable)) return;   // la bola del erizo no se pincha
  if (j.escudo) {
    j.escudo = false;
    j.invencible = 1.5;
    suena('cristal');
    gotas(new THREE.Vector3(j.x, 1, 0), 20, '#7dffa8', 1);
    marcadorSucio = true;
    return;
  }
  j.vidas--;
  j.invencible = 2.5;
  j.aplasta = 1;
  j.poder = null;
  suena('golpe');
  vibrar(350, j.dispositivo || undefined);
  if (j.vidas <= 0) {
    j.fuera = true;
    j.pj.g.visible = false;
    j.quitarDisparos();
    gotas(new THREE.Vector3(j.x, 1, 0), 30, j.color, 0.8);
    if (VARIOS && vivos().length) mensaje(`¡${esc(j.perfil.nombre)} está fuera!`, 1300);
  }
  marcadorSucio = true;
  if (!vivos().length) terminar();
}

function nivelSuperado() {
  cambiar('superado');
  const extra = Math.ceil(tiempo) * 10;
  for (const j of vivos()) { j.puntos += extra; j.quitarDisparos(); especial(j.pj); }
  marcadorSucio = true;
  pintarArriba();
  suena('fanfarria');
  mensaje(`¡Nivel ${nivel} superado!<small>+${extra} por el tiempo${VARIOS ? ' cada uno' : ''}</small>`, 2200);
}

function seAcaboElTiempo() {
  cambiar('tiempo');
  suena('golpe');
  mensaje('¡Se acabó el tiempo!', 1800);
  for (const j of vivos()) {
    j.vidas--;
    j.poder = null;
    if (j.vidas <= 0) { j.fuera = true; j.pj.g.visible = false; }
    j.quitarDisparos();
  }
  marcadorSucio = true;
}

function terminar() {
  cambiar('fin');
  suena('cae');
  vibrar(300);
  const pts = total();
  if (pts > record) {
    record = pts; nuevoRecord = true;
    guardarRecord(record);
    setTimeout(() => { suena('record'); gotas(new THREE.Vector3(0, TECHO / 2, 0), 120, '#ffd93d', 3); }, 800);
  }
  pintarArriba();
  let tabla = '';
  if (FIESTA) resultadoFiesta('pompas', jugadores.map((j) => ({ id: j.perfil.id, valor: j.puntos })));
  if (VARIOS) {
    const max = Math.max(...jugadores.map((j) => j.puntos));
    const unico = jugadores.filter((j) => j.puntos === max).length === 1;
    tabla = `<div class="tabla">${jugadores.map((j) => `<span class="chip grande" style="--c:${j.color}"><i></i>${esc(j.perfil.nombre)} <b>${j.puntos}</b>${unico && j.puntos === max ? ' 👑' : ''}</span>`).join('')}</div>`;
  }
  const lineaRecord = nuevoRecord ? `<p class="nuevo">¡NUEVO RÉCORD${VARIOS ? ' JUNTOS' : ''}!</p>` : `<p>${VARIOS ? 'Récord juntos' : 'Récord'}: ${record}</p>`;
  setTimeout(() => {
    if (estado !== 'fin') return;
    panel(`<h2>¡Llegaste al nivel ${nivel}!</h2><p>${VARIOS ? 'Entre todos' : 'Puntos'}: ${pts}</p>${tabla}${lineaRecord}${FIESTA ? OPCIONES_FIESTA : OPCIONES_FIN}`);
  }, 700);
}

// Piloto automático para pruebas (?bot=1): se pone debajo de la pompa más baja y dispara; huye si una baja encima
function entradaBot(j) {
  let peligro = null, objetivo = null;
  for (const p of pompas) {
    const dx = p.x - j.x;
    if (Math.abs(dx) < p.r + 1.6 && p.y - p.r < 4.5 && p.vy < 2) peligro = p;
    if (!objetivo || p.y - p.r < objetivo.y - objetivo.r) objetivo = p;
  }
  if (peligro) return [peligro.x > j.x ? -1 : 1, false];
  if (!objetivo) return [0, false];
  const dx = objetivo.x - j.x;
  return [clamp(dx * 0.8, -1, 1), Math.abs(dx) < objetivo.r * 0.8 && Math.random() < 0.3];
}

alPulsarAtras(() => {
  if (estado === 'pausa') volverAlMenu();
  else if (estado !== 'fin') pausar(true);
  else volverAlMenu();
  return true;
});
const irAJugadores = () => { location.href = new URL('../jugadores/index.html#pompas', location.href).href; };

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
  if (estado !== 'fin' && estado !== 'pausa') especialConY(jugadores.filter((j) => !j.fuera));
  if (pad.pressed('SELECT')) verFps = !verFps;

  if (estado === 'pausa') {
    if (pad.pressed('A') || pad.pressed('START')) pausar(false);
    else if (pad.pressed('B')) volverAlMenu();
  } else if (estado === 'fin') {
    if (tEstado > 1.2) {
      if (FIESTA) { if (pad.pressed('A') || (BOT && tEstado > 3)) volverAlTablero(); }
      else if (pad.pressed('A') || (BOT && tEstado > 3)) empezar();
      else if (pad.pressed('Y')) irAJugadores();
      else if (pad.pressed('B')) volverAlMenu();
    }
  } else if (pad.pressed('START')) pausar(true);

  if (estado === 'intro' && tEstado > 1.6) { cambiar('jugando'); mensaje('¡Ya!', 600); }
  if (estado === 'superado' && tEstado > 2.6) { if (FIESTA && nivel >= 2) terminar(); else cargarNivel(nivel + 1); }
  if (estado === 'tiempo' && tEstado > 2.2) { if (vivos().length) cargarNivel(nivel, { repetir: true }); else terminar(); }

  const jugando = estado === 'jugando';
  if (estado !== 'pausa') {
    uTiempo.value += dt;
    // Pompas
    if (jugando) {
      if (congelado > 0) congelado -= dt;
      else {
        const vel = velNivel(nivel);
        for (const p of pompas) p.paso(dt, vel);
      }
      tiempo -= dt;
      const s = Math.ceil(tiempo);
      if (s !== ultimoSegundo) { ultimoSegundo = s; pintarTiempo(); if (s <= 10 && s > 0) suena('tictac'); }
      if (tiempo <= 0) seAcaboElTiempo();
      tJugado += dt;
    }
    uCongelado.value = congelado > 0 ? (congelado > 1 || Math.floor(congelado * 8) % 2 ? 1 : 0) : 0;
    for (const p of pompas) p.pintar(jugando && congelado <= 0 ? dt : 0);

    // Jugadores y disparos
    for (const j of jugadores) {
      const [lx, fuego] = jugando ? j.entrada() : [0, false];
      j.actualizar(dt, lx, fuego, jugando);
    }
    if (estado === 'jugando') {
      // Disparo contra pompa
      for (const j of jugadores) {
        for (const d of j.disparos) {
          if (d.fin) continue;
          for (const p of pompas) {
            if (Math.abs(p.x - d.x) < p.r + 0.08 && p.y - p.r < d.arriba) { d.fin = true; darPompa(p, j); break; }
          }
        }
        j.limpiarDisparos();
      }
      // Pompa contra jugador
      if (estado === 'jugando') {
        for (const j of jugadores) for (const p of pompas) if (j.toca(p)) { golpe(j); break; }
      }
      // Objetos
      for (const o of [...objetos]) {
        for (const j of vivos()) if (Math.abs(o.x - j.x) < 0.95 && o.y < ALTO_JUGADOR + 0.5) { coger(o, j); break; }
      }
    }
    actualizarObjetos(jugando ? dt : 0);
  }
  ayuda.style.opacity = tJugado < 10 ? 1 : 0;
  if (marcadorSucio) { pintarMarcador(); pintarArriba(); marcadorSucio = false; }
  for (const j of jugadores) j.pintarEtiqueta();
  actualizarGotas(dt);
  renderer.render(escena, camara);

  fpsN++; fpsT += dt;
  if (fpsT >= 0.5) {
    const f = $('fps');
    f.style.display = verFps ? 'block' : 'none';
    if (verFps) f.textContent = `${Math.round(fpsN / fpsT)} fps · ${renderer.domElement.width}×${renderer.domElement.height} · ${renderer.info.render.calls} dibujos`;
    fpsN = 0; fpsT = 0;
    // El tiempo de los poderes se ve en el marcador cuando se acaba
    if (jugadores.some((j) => j.poder && j.tPoder < 0.6)) marcadorSucio = true;
  }
  requestAnimationFrame(bucle);
}

window.__juego = {
  get estado() { return estado; }, get nivel() { return nivel; }, get pompas() { return pompas.length; },
  get puntos() { return total(); }, get record() { return record; }, get tiempo() { return +tiempo.toFixed(1); },
  get jugadores() { return jugadores.map((j) => ({ nombre: j.perfil.nombre, puntos: j.puntos, vidas: j.vidas, fuera: j.fuera, x: +j.x.toFixed(2), poder: j.poder })); },
  saltarNivel() { quitarPompas(); nivelSuperado(); },
};
empezar();
vestir(THREE, escena, { lejos: 30 });
requestAnimationFrame(bucle);
