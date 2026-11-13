// Piezas del mundo, compartidas por los juegos que pasan en el bosque (y por el mundo para pasear).
//   crearCielo(THREE, escena)                    -> cielo degradado que sigue a la cámara
//   crearClaro(THREE, escena, { radio, semilla }) -> claro del bosque con árboles, rocas, flores y nubes
//   new Escondite(THREE, escena, tipo, x, z)     -> arbusto | tronco | hojas | madriguera (se agita, asoman orejas)
// Todo lo repetido va en InstancedMesh: pocas llamadas de dibujo para que el Chromecast vaya fluido.
// Con el pack de naturaleza (comun/naturaleza.js) los árboles, rocas y arbustos son los modelos del pack.
import { vestir } from './estaciones.js';
import { hayNaturaleza, PACK, materialDe, plantar, unoDe, adornar, RECETA_PRADO, ARBOLES, ABETOS, PEDRUSCOS } from './naturaleza.js';
// Dentro de los claros, árboles estrechos: los anchos taparían a los jugadores desde la cámara
const ESBELTOS = ['Tree_Birch_medium_green', 'Tree_Birch_small_green', 'Tree_Simple_medium', 'Tree_Simple_small', 'Tree_Park_medium_green'];

function rng(seed) { return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
export { rng };

const cacheMat = new Map();
export function mat(THREE, color, opts = {}) {
  const k = color + JSON.stringify(opts);
  if (!cacheMat.has(k)) cacheMat.set(k, new THREE.MeshLambertMaterial({ color, ...opts }));
  return cacheMat.get(k);
}

export function crearCielo(THREE, escena, { arriba = '#58b8ff', horizonte = '#ffd9f0', abajo = '#8fdcff' } = {}) {
  const cielo = new THREE.Mesh(
    new THREE.SphereGeometry(500, 24, 12),
    new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: { arriba: { value: new THREE.Color(arriba) }, horizonte: { value: new THREE.Color(horizonte) }, abajo: { value: new THREE.Color(abajo) } },
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
  return cielo;
}

/**
 * Un claro redondo rodeado de bosque. Devuelve { colisiones: [{x, z, r}], radio, libre(x, z, margen) }.
 * `huecos` son sitios donde no poner árboles ni rocas (p. ej. los escondites).
 */
export function crearClaro(THREE, escena, { radio = 22, semilla = 3, nArboles = 26, huecos = [] } = {}) {
  const azar = rng(semilla);
  const dummy = new THREE.Object3D();
  const colisiones = [];
  const ocupado = (x, z, m) => huecos.some((h) => Math.hypot(h.x - x, h.z - z) < (h.r || 1.5) + m) || colisiones.some((c) => Math.hypot(c.x - x, c.z - z) < c.r + m);

  const suelo = new THREE.Mesh(new THREE.CylinderGeometry(radio + 1.5, radio + 1, 2, 64), mat(THREE, '#86d860'));
  suelo.position.y = -1;
  escena.add(suelo);
  const fuera = new THREE.Mesh(new THREE.PlaneGeometry(600, 600), mat(THREE, '#5fae45'));
  fuera.rotation.x = -Math.PI / 2; fuera.position.y = -0.05;
  escena.add(fuera);

  // Bosque: un anillo espeso fuera del claro y algunos árboles sueltos dentro
  const arboles = [];
  for (let k = 0; k < 70; k++) {
    const a = (k / 70) * Math.PI * 2 + azar() * 0.08, r = radio + 2 + azar() * 7;
    arboles.push({ x: Math.cos(a) * r, z: Math.sin(a) * r, h: 2.6 + azar() * 1.8, s: 1.6 + azar() * 0.9, dentro: false });
  }
  for (let n = 0; n < 400 && arboles.filter((t) => t.dentro).length < nArboles; n++) {
    const a = azar() * Math.PI * 2, r = 4 + azar() * (radio - 6);
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (ocupado(x, z, 2.2)) continue;
    arboles.push({ x, z, h: 2 + azar() * 1.4, s: 1.2 + azar() * 0.6, dentro: true });
    colisiones.push({ x, z, r: 0.5 });
  }
  if (hayNaturaleza) {
    // Cada árbol, un modelo del pack: abetos y árboles grandes en el anillo, árboles de parque dentro
    const grupos = {};
    for (const t of arboles) {
      const n = t.dentro ? unoDe(ESBELTOS, azar()) : unoDe(azar() < 0.45 ? ABETOS : ARBOLES, azar());
      (grupos[n] = grupos[n] || []).push({ x: t.x, z: t.z, alto: t.dentro ? t.h + 1.3 : (t.h + t.s * 1.6) * 1.25, giro: azar() * 6.3 });
    }
    for (const n in grupos) escena.add(plantar(n, grupos[n]));
  } else {
  const COPAS = ['#5cc56a', '#4cb85e', '#7fd66a', '#3fae5b', '#9be06e'];
  const troncos = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.22, 0.36, 1, 7), mat(THREE, '#9b6a43'), arboles.length);
  const copas = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), mat(THREE, '#ffffff', { flatShading: true }), arboles.length * 2);
  arboles.forEach((t, i) => {
    dummy.position.set(t.x, t.h / 2, t.z); dummy.scale.set(1, t.h, 1); dummy.rotation.set(0, 0, 0); dummy.updateMatrix();
    troncos.setMatrixAt(i, dummy.matrix);
    const col = new THREE.Color(COPAS[i % COPAS.length]);
    for (let k = 0; k < 2; k++) {
      dummy.position.set(t.x + (k ? 0.45 : -0.3), t.h + 0.5 + k * 0.75, t.z + (k ? -0.3 : 0.2));
      dummy.scale.setScalar(t.s * (k ? 0.8 : 1.1)); dummy.rotation.set(azar(), azar(), azar()); dummy.updateMatrix();
      copas.setMatrixAt(i * 2 + k, dummy.matrix);
      copas.setColorAt(i * 2 + k, k ? col.clone().offsetHSL(0, 0, 0.06) : col);
    }
  });
  escena.add(troncos, copas);
  }

  // Rocas y flores
  const nRocas = 10;
  const rocasPack = {};
  const rocas = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(0.6, 0), mat(THREE, '#b3abcf', { flatShading: true }), nRocas);
  for (let i = 0, n = 0; i < nRocas && n < 300; n++) {
    const a = azar() * Math.PI * 2, r = 3 + azar() * (radio - 4), s = 0.5 + azar() * 0.6;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (ocupado(x, z, 1.4)) continue;
    dummy.position.set(x, s * 0.25, z); dummy.scale.set(s * 1.3, s * 0.8, s); dummy.rotation.set(0, azar() * 3, 0); dummy.updateMatrix();
    if (hayNaturaleza) { const n = unoDe(PEDRUSCOS, azar()); (rocasPack[n] = rocasPack[n] || []).push({ x, y: -0.05, z, s: (s * 0.85) / PACK[n].radio, giro: azar() * 6 }); }
    else rocas.setMatrixAt(i, dummy.matrix);
    colisiones.push({ x, z, r: s * 0.75 });
    i++;
  }
  if (hayNaturaleza) {
    for (const n in rocasPack) escena.add(plantar(n, rocasPack[n]));
    // Mucho adorno: hierba, matorrales, flores, setas, piedrecitas, tocones (sin colisión)
    adornar(escena, azar, (r) => {
      const a = r() * Math.PI * 2, d = 1.5 + Math.sqrt(r()) * (radio + 6), x = Math.cos(a) * d, z = Math.sin(a) * d;
      return ocupado(x, z, 0.9) ? null : { x, y: 0, z };
    }, RECETA_PRADO, 1.2);
  } else escena.add(rocas);
  const nFlores = 140;
  const flores = new THREE.InstancedMesh(new THREE.SphereGeometry(0.13, 6, 4), mat(THREE, '#ffffff'), nFlores);
  const FLOR = ['#ff6fb1', '#ffffff', '#ffd23f', '#b48cff', '#ff8a5c'];
  for (let i = 0; i < nFlores; i++) {
    const a = azar() * Math.PI * 2, r = 1 + azar() * radio;
    dummy.position.set(Math.cos(a) * r, 0.08, Math.sin(a) * r); dummy.scale.set(1, 0.6, 1); dummy.rotation.set(0, 0, 0); dummy.updateMatrix();
    flores.setMatrixAt(i, dummy.matrix);
    flores.setColorAt(i, new THREE.Color(FLOR[i % FLOR.length]));
  }
  escena.add(flores);
  // Nubes
  const nNubes = 10, porNube = 5;
  const bolas = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 12, 8), new THREE.MeshLambertMaterial({ color: '#ffffff', emissive: '#ffffff', emissiveIntensity: 0.45 }), nNubes * porNube);
  for (let n = 0; n < nNubes; n++) {
    const a = (n / nNubes) * Math.PI * 2 + azar() * 0.4, r = 60 + azar() * 40, y = 20 + azar() * 14;
    for (let k = 0; k < porNube; k++) {
      const s = 2.2 + azar() * 2.5;
      dummy.position.set(Math.cos(a) * r + (k - 2) * 2.6, y + azar() * 1.5, Math.sin(a) * r + azar() * 2);
      dummy.scale.set(s * 1.2, s * 0.8, s); dummy.rotation.set(0, 0, 0); dummy.updateMatrix();
      bolas.setMatrixAt(n * porNube + k, dummy.matrix);
    }
  }
  escena.add(bolas);
  vestir(THREE, escena, { lejos: 16 });

  return {
    colisiones, radio,
    /** Empuja un punto fuera de árboles y rocas y lo deja dentro del claro. */
    empujar(p, margen = 0.45) {
      for (const c of colisiones) {
        const ex = p.x - c.x, ez = p.z - c.z, d = Math.hypot(ex, ez), min = c.r + margen;
        if (d < min && d > 1e-4) { p.x = c.x + (ex / d) * min; p.z = c.z + (ez / d) * min; }
      }
      const r = Math.hypot(p.x, p.z), max = radio - 0.8;
      if (r > max) { p.x *= max / r; p.z *= max / r; }
    },
  };
}

// ---------- Escondites ----------
const geos = {};
function geo(THREE, nombre, crear) { return geos[nombre] || (geos[nombre] = crear()); }

export const TIPOS_ESCONDITE = ['arbusto', 'tronco', 'hojas', 'madriguera'];

export class Escondite {
  constructor(THREE, escena, tipo, x, z, giro = 0) {
    this.THREE = THREE;
    this.tipo = tipo; this.x = x; this.z = z;
    this.g = new THREE.Group();
    this.cuerpo = new THREE.Group();
    this.g.add(this.cuerpo);
    this.g.position.set(x, 0, z);
    this.g.rotation.y = giro;
    const ico = geo(THREE, 'ico', () => new THREE.IcosahedronGeometry(1, 1));
    if (hayNaturaleza && tipo === 'arbusto') {   // el tronco, el de siempre: el pack nuevo no trae troncos caídos
      const n = tipo === 'arbusto' ? 'Bush_Clumps_large' : 'Fallen_Log', P = PACK[n];
      const m = new THREE.Mesh(P.geo, materialDe(n));
      m.scale.setScalar((tipo === 'arbusto' ? 1.35 : 1.45) / P.radio);
      this.cuerpo.add(m);
      this.radio = 1.3; this.alto = tipo === 'arbusto' ? Math.max(1.2, P.alto * m.scale.y) : Math.max(0.9, P.alto * m.scale.y);
    } else if (tipo === 'arbusto') {
      [[0, 0.7, 0, 0.95], [0.75, 0.55, 0.15, 0.75], [-0.7, 0.55, -0.1, 0.75], [0.1, 1.15, -0.2, 0.65]].forEach(([px, py, pz, s], k) => {
        const m = new THREE.Mesh(ico, mat(THREE, k % 2 ? '#3fae5b' : '#4cbf63', { flatShading: true }));
        m.position.set(px, py, pz); m.scale.setScalar(s); m.rotation.set(k, k * 2, 0);
        this.cuerpo.add(m);
      });
      this.radio = 1.3; this.alto = 1.6;
    } else if (tipo === 'tronco') {
      const t = new THREE.Mesh(geo(THREE, 'tronco', () => new THREE.CylinderGeometry(0.6, 0.65, 2.6, 14, 1, true)), mat(THREE, '#8f5f3c', { side: THREE.DoubleSide }));
      t.rotation.z = Math.PI / 2; t.position.y = 0.6;
      const hueco = new THREE.MeshBasicMaterial({ color: '#2a1a12' });
      const anillo = mat(THREE, '#d9a877');
      for (const s of [-1, 1]) {
        const h = new THREE.Mesh(geo(THREE, 'hueco', () => new THREE.CircleGeometry(0.5, 16)), hueco);
        h.position.set(s * 1.29, 0.6, 0); h.rotation.y = s * Math.PI / 2;
        const a = new THREE.Mesh(geo(THREE, 'anillo', () => new THREE.RingGeometry(0.5, 0.64, 16)), anillo);
        a.position.set(s * 1.3, 0.6, 0); a.rotation.y = s * Math.PI / 2;
        this.cuerpo.add(h, a);
      }
      const musgo = new THREE.Mesh(ico, mat(THREE, '#6fd04f', { flatShading: true }));
      musgo.scale.set(0.7, 0.18, 0.4); musgo.position.set(0.3, 1.18, 0);
      this.cuerpo.add(t, musgo);
      this.radio = 1.3; this.alto = 1.3;
    } else if (tipo === 'hojas') {
      const C = ['#ff9f43', '#ff7a45', '#ffc93d', '#e0663a'];
      for (let k = 0; k < 9; k++) {
        const a = (k / 9) * Math.PI * 2, r = k === 8 ? 0 : 0.55 + (k % 3) * 0.12;
        const m = new THREE.Mesh(ico, mat(THREE, C[k % C.length], { flatShading: true }));
        m.position.set(Math.cos(a) * r, k === 8 ? 0.65 : 0.32, Math.sin(a) * r);
        m.scale.set(0.62, k === 8 ? 0.45 : 0.36, 0.62); m.rotation.set(k, k * 1.3, 0);
        this.cuerpo.add(m);
      }
      this.radio = 1.2; this.alto = 1.0;
    } else {
      const monte = new THREE.Mesh(geo(THREE, 'monte', () => new THREE.SphereGeometry(1, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2)), mat(THREE, '#a8754d'));
      monte.scale.set(1.15, 0.7, 1.15);
      const boca = new THREE.Mesh(geo(THREE, 'boca', () => new THREE.CircleGeometry(0.42, 16)), new THREE.MeshBasicMaterial({ color: '#2a1a12' }));
      boca.position.set(0, 0.3, 1.02); boca.rotation.x = -0.35; boca.scale.y = 0.8;
      const hierba = new THREE.Mesh(ico, mat(THREE, '#6fd04f', { flatShading: true }));
      hierba.scale.set(0.35, 0.25, 0.35); hierba.position.set(-0.5, 0.75, -0.3);
      this.cuerpo.add(monte, boca, hierba);
      this.radio = 1.25; this.alto = 0.9;
    }
    // Orejas del conejo (escondidas hasta que asoman)
    this.orejas = new THREE.Group();
    const blanco = mat(THREE, '#fffaf5'), rosa = mat(THREE, '#ffa3c8');
    const esf = geo(THREE, 'esf', () => new THREE.SphereGeometry(1, 10, 8));
    for (const s of [-1, 1]) {
      const o = new THREE.Mesh(esf, blanco); o.scale.set(0.09, 0.32, 0.06); o.position.set(s * 0.11, 0.3, 0); o.rotation.z = -s * 0.15;
      const i = new THREE.Mesh(esf, rosa); i.scale.set(0.045, 0.24, 0.03); i.position.set(s * 0.11, 0.3, 0.04); i.rotation.z = -s * 0.15;
      this.orejas.add(o, i);
    }
    this.orejas.position.set(0.15, this.alto - 0.55, 0.2);
    this.orejas.visible = false;
    this.g.add(this.orejas);
    this.agita = 0; this.asoma = 0; this.t = Math.random() * 10;
    escena.add(this.g);
  }
  agitar(fuerza = 1) { this.agita = Math.max(this.agita, fuerza); }
  asomar(segundos = 1.2) { this.asoma = segundos; this.asomaT = segundos; }
  paso(dt) {
    this.t += dt;
    this.agita = Math.max(0, this.agita - dt * 1.6);
    const a = this.agita;
    this.cuerpo.rotation.z = Math.sin(this.t * 38) * 0.07 * a;
    this.cuerpo.rotation.x = Math.cos(this.t * 31) * 0.05 * a;
    this.cuerpo.scale.set(1 + a * 0.05, 1 - a * 0.05 + Math.sin(this.t * 25) * 0.03 * a, 1 + a * 0.05);
    if (this.asoma > 0) {
      this.asoma -= dt;
      // Suben, se quedan un momento y vuelven a bajar
      const f = Math.max(0, Math.min(1, (this.asomaT - this.asoma) * 5, this.asoma * 5));
      this.orejas.visible = true;
      this.orejas.position.y = this.alto - 0.55 + f * 0.5;
      this.orejas.rotation.z = Math.sin(this.t * 6) * 0.15;
    } else this.orejas.visible = false;
  }
  quitar(escena) { escena.remove(this.g); }
}
