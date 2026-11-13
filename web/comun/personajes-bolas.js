// Personajes peludos, entre reales y de dibujo animado.
//  - Pelo en MECHONES esculpidos: cada pieza peluda es una forma sólida con mechones que salen de la superficie
//    y caen un poco, con la raíz más oscura y la punta más clara. Se lee como pelo (no como ruido) y pesa poco.
//    (El pelo de "capas" antiguo sigue aquí: ESTILO_PELO = 'capas'.)
//  - Caras de dibujo animado: ojos blancos con pupila, narizota, sonrisa, mofletes.
//  - La oveja se queda como estaba (lana de bolitas).
//
//   const p = crearPersonaje(THREE, perfil);  escena.add(p.g);
//   p.cuerpo (bota al andar) · p.cabeza (mira arriba) · p.patas (se balancean) · p.alas (búho)
//   p.aplicar(otroPerfil)  -> cambia el aspecto al vuelo (editor)
//   p.escala               -> tamaño del animal (cada uno el suyo)
import { ANIMALES } from './perfiles.js';

const ARCO = ['#ff5d73', '#ff9f43', '#ffd93d', '#6bd968', '#4cc3ff', '#7b7bff', '#c17bff'];
let G = null;           // geometrías compartidas
let TEX_PELO = null;    // textura de hebras
const CAPAS_CACHE = new Map();
const ESTILO_PELO = (typeof location !== 'undefined' && /[?&]pelo=(capas|mechones)/.test(location.search)) ? location.search.match(/[?&]pelo=(capas|mechones)/)[1] : 'liso';
const MECHONES_CACHE = new Map();

function rngM(seed) { return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

/**
 * Pieza peluda = esfera base + MECHONES CON FORMA: pocas lengüetas grandes y abombadas, pegadas al cuerpo y
 * solapadas como tejas, peinadas hacia atrás y abajo, con la punta afilada un poco levantada.
 * Raíz y bordes más oscuros para que cada mechón se distinga. Todo en UNA geometría (una llamada de dibujo).
 *   largo: cuánto se levantan y cuánto miden · densidad: cuántos (más = más pequeños) · caida: cuánto cuelgan
 */
let MAT_CONTORNO = null;
/** Contorno de dibujo animado: la misma pieza un poco hinchada, por dentro y en color oscuro. */
function materialContorno(THREE) {
  if (MAT_CONTORNO) return MAT_CONTORNO;
  const m = new THREE.MeshBasicMaterial({ color: '#3a2838', side: THREE.BackSide });
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n  transformed += normalize(normal) * 0.028;');
  };
  m.customProgramCacheKey = () => 'contorno-v1';
  MAT_CONTORNO = m;
  return m;
}

/** Tubo que sigue una curva, con un grosor distinto en cada punto (colas, crestas). Cerrado por los dos extremos. */
function geoTubo(THREE, puntos, radios, { segs = 28, lados = 14 } = {}) {
  const curva = new THREE.CatmullRomCurve3(puntos.map((p) => new THREE.Vector3(...p)));
  const marcos = curva.computeFrenetFrames(segs, false);
  const radio = (t) => { const x = t * (radios.length - 1), i = Math.min(radios.length - 2, Math.floor(x)), f = x - i; const s = f * f * (3 - 2 * f); return radios[i] * (1 - s) + radios[i + 1] * s; };
  const P = [], I = [];
  for (let i = 0; i <= segs; i++) {
    const t = i / segs, c = curva.getPointAt(t), n = marcos.normals[i], b = marcos.binormals[i];
    const r = Math.max(0.001, radio(t));
    for (let k = 0; k < lados; k++) {
      const a = (k / lados) * Math.PI * 2;
      P.push(c.x + (n.x * Math.cos(a) + b.x * Math.sin(a)) * r, c.y + (n.y * Math.cos(a) + b.y * Math.sin(a)) * r, c.z + (n.z * Math.cos(a) + b.z * Math.sin(a)) * r);
    }
  }
  for (let i = 0; i < segs; i++) for (let k = 0; k < lados; k++) {
    const a = i * lados + k, b = i * lados + (k + 1) % lados, c = a + lados, d = b + lados;
    I.push(a, b, c, b, d, c);
  }
  // Tapas
  for (const [i, t] of [[0, 0], [segs, 1]]) {
    const c = curva.getPointAt(t), centro = P.length / 3;
    P.push(c.x, c.y, c.z);
    for (let k = 0; k < lados; k++) {
      const a = i * lados + k, b = i * lados + (k + 1) % lados;
      if (t === 0) I.push(centro, b, a); else I.push(centro, a, b);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setIndex(I);
  g.computeVertexNormals();
  return g;
}

let RAMPA_TOON = null;
/** Sombreado de dibujo animado: tres tonos (sombra, medio, luz) en vez de un degradado. */
export function materialToon(THREE, color) {
  if (!RAMPA_TOON) {
    const d = new Uint8Array([110, 110, 110, 255, 190, 190, 190, 255, 255, 255, 255, 255]);
    RAMPA_TOON = new THREE.DataTexture(d, 3, 1, THREE.RGBAFormat);
    RAMPA_TOON.minFilter = RAMPA_TOON.magFilter = THREE.NearestFilter;
    RAMPA_TOON.needsUpdate = true;
  }
  return new THREE.MeshToonMaterial({ color, gradientMap: RAMPA_TOON });
}

function geoMechones(THREE, { largo = 0.15, densidad = 1, caida = 0.35, raiz = 0.55, puntas = 1.12 } = {}) {
  const clave = [largo, densidad, caida, raiz, puntas].map((n) => (+n).toFixed(3)).join('|');
  if (MECHONES_CACHE.has(clave)) return MECHONES_CACHE.get(clave);
  const P = [], N = [], C = [], I = [];
  const fRaiz = 0.55 + 0.3 * raiz, fPunta = Math.max(fRaiz + 0.22, puntas);
  // Base lisa
  const base = new THREE.SphereGeometry(0.985, 22, 16);
  { const bp = base.attributes.position.array, bn = base.attributes.normal.array, bi = base.index.array;
    for (let i = 0; i < bp.length; i++) { P.push(bp[i]); N.push(bn[i]); }
    for (let i = 0; i < bp.length / 3; i++) C.push(fRaiz * 0.95, fRaiz * 0.95, fRaiz * 0.95);
    for (const k of bi) I.push(k); }
  base.dispose();

  const K = Math.max(16, Math.round(30 * densidad));
  const sep = Math.sqrt(4 * Math.PI / K);
  const azar = rngM(K * 733 + Math.round(largo * 1e4));
  const peinado = new THREE.Vector3(0, -1, -0.5).normalize();
  const NU = 7, NV = 5;                         // segmentos a lo largo y a lo ancho de cada mechón
  const c = new THREE.Vector3(), t = new THREE.Vector3(), b = new THREE.Vector3(), q = new THREE.Vector3();
  for (let m = 0; m < K; m++) {
    const y = 1 - 2 * (m + 0.5) / K, r = Math.sqrt(1 - y * y), ph = m * 2.39996323 + (azar() - 0.5) * 0.6;
    c.set(Math.cos(ph) * r, y, Math.sin(ph) * r);
    // Dirección del mechón: el peinado proyectado sobre la superficie (con un poco de variación)
    t.copy(peinado).addScaledVector(c, -peinado.dot(c));
    if (t.lengthSq() < 1e-3) t.set(1, 0, 0).addScaledVector(c, -c.x);
    t.normalize().applyAxisAngle(c, (azar() - 0.5) * 0.7);
    b.crossVectors(c, t).normalize();
    const L = sep * (1.55 + azar() * 0.5) * (1 + caida * 0.4);   // largo sobre la superficie (radianes aprox.)
    const W = sep * (0.62 + azar() * 0.18);                         // medio ancho
    const alto = Math.max(0.05, largo * (1.0 + azar() * 0.6));      // cuánto se levanta la punta
    const grosor = Math.max(0.035, largo * 0.5 + 0.03);              // abombado del mechón
    const h0 = 0.004 + azar() * 0.02;                                // para que no se pisen al solaparse
    const tono = 0.93 + azar() * 0.14;
    const inicio = P.length / 3;
    for (let i = 0; i <= NU; i++) {
      const u = i / NU;
      // Silueta de hoja: raíz redondeada, más ancha hacia un tercio y punta afilada
      const w = W * (u < 0.3 ? 0.55 + 0.45 * Math.sin((u / 0.3) * Math.PI / 2) : Math.pow((1 - u) / 0.7, 0.85));
      for (let j = 0; j <= NV; j++) {
        const v = (j / NV) * 2 - 1;
        const s = u * L;
        // Avanza sobre la esfera en la dirección del mechón y se separa hacia la punta
        q.copy(c).multiplyScalar(Math.cos(s)).addScaledVector(t, Math.sin(s)).addScaledVector(b, v * w);
        q.normalize();
        const sube = 0.985 + h0 + grosor * (1 - v * v) * Math.sin(Math.min(1, u * 1.2) * Math.PI) * 0.5 + alto * u * u;
        q.multiplyScalar(sube);
        P.push(q.x, q.y - caida * alto * u * u * 0.6, q.z);
        N.push(0, 0, 0);
        // Color: raíz y bordes oscuros, punta clara
        const f = (fRaiz + (fPunta - fRaiz) * Math.pow(u, 0.8)) * (1 - 0.32 * v * v) * tono;
        C.push(f, f, f);
      }
    }
    for (let i = 0; i < NU; i++) for (let j = 0; j < NV; j++) {
      const a = inicio + i * (NV + 1) + j, b2 = a + NV + 1;
      I.push(a, b2, a + 1, a + 1, b2, b2 + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
  g.setIndex(I);
  // Normales: las de la base se conservan; las de los mechones se calculan de su propia superficie
  const nb = 23 * 17;
  const bn = g.attributes.normal.array.slice(0, nb * 3);
  g.computeVertexNormals();
  g.attributes.normal.array.set(bn, 0);
  // Que las normales de los mechones miren hacia fuera (las caras pueden haber quedado al revés)
  const pa = g.attributes.position.array, na = g.attributes.normal.array;
  for (let i = nb; i < pa.length / 3; i++) {
    if (pa[i * 3] * na[i * 3] + pa[i * 3 + 1] * na[i * 3 + 1] + pa[i * 3 + 2] * na[i * 3 + 2] < 0) { na[i * 3] *= -1; na[i * 3 + 1] *= -1; na[i * 3 + 2] *= -1; }
  }
  g.computeBoundingSphere();
  MECHONES_CACHE.set(clave, g);
  return g;
}

// En la tele (gráfica justita) menos capas de pelo
const FACTOR_CAPAS = typeof navigator !== 'undefined' && /JuegosTV\//.test(navigator.userAgent) ? 0.6 : 1;

function geometrias(THREE) {
  if (G) return G;
  const pata = new THREE.CylinderGeometry(1, 0.9, 1, 12);
  pata.translate(0, -0.5, 0);
  const sonrisa = new THREE.TorusGeometry(1, 0.22, 6, 14, Math.PI);
  sonrisa.rotateZ(Math.PI);
  G = {
    peluda: new THREE.SphereGeometry(1, 26, 18),   // base de las piezas con pelo
    esfera: new THREE.SphereGeometry(1, 24, 18),
    bola: new THREE.IcosahedronGeometry(1, 1),     // lana de la oveja
    cono: new THREE.ConeGeometry(1, 1, 12),
    cono5: new THREE.ConeGeometry(1, 1, 6),
    cil: new THREE.CylinderGeometry(1, 1, 1, 16),
    caja: new THREE.BoxGeometry(1, 1, 1),
    anillo: new THREE.CylinderGeometry(1, 1, 1, 16, 1, true),
    cupula: new THREE.SphereGeometry(1, 18, 9, 0, Math.PI * 2, 0, Math.PI / 2),
    toro: new THREE.TorusGeometry(1, 0.2, 8, 24),
    sonrisa,
    pata,
  };
  // Textura de hebras: R = altura de cada pelo, G = tono
  const N = 128, d = new Uint8Array(N * N * 4);
  let s = 12345;
  const azar = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  for (let i = 0; i < N * N; i++) {
    d[i * 4] = Math.floor(Math.pow(azar(), 0.6) * 255);
    d[i * 4 + 1] = Math.floor(azar() * 255);
    d[i * 4 + 2] = 0; d[i * 4 + 3] = 255;
  }
  TEX_PELO = new THREE.DataTexture(d, N, N, THREE.RGBAFormat);
  TEX_PELO.wrapS = TEX_PELO.wrapT = THREE.RepeatWrapping;
  TEX_PELO.magFilter = THREE.NearestFilter;
  TEX_PELO.minFilter = THREE.NearestFilter;
  TEX_PELO.needsUpdate = true;
  return G;
}

/** n+1 copias de la geometría con un atributo "capa" (0 = piel, 1 = punta del pelo). */
function conCapas(THREE, base, n) {
  const clave = base.uuid + ':' + n;
  if (CAPAS_CACHE.has(clave)) return CAPAS_CACHE.get(clave);
  const pos = base.attributes.position.array, nor = base.attributes.normal.array, uv = base.attributes.uv.array;
  const idx = base.index ? base.index.array : null;
  const nv = pos.length / 3, total = n + 1;
  const P = new Float32Array(pos.length * total), Nn = new Float32Array(nor.length * total), U = new Float32Array(uv.length * total), C = new Float32Array(nv * total);
  const I = idx ? new Uint32Array(idx.length * total) : null;
  for (let c = 0; c < total; c++) {
    P.set(pos, c * pos.length); Nn.set(nor, c * nor.length); U.set(uv, c * uv.length);
    C.fill(c / n, c * nv, (c + 1) * nv);
    if (I) for (let i = 0; i < idx.length; i++) I[c * idx.length + i] = idx[i] + c * nv;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(P, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(Nn, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(U, 2));
  g.setAttribute('capa', new THREE.BufferAttribute(C, 1));
  if (I) g.setIndex(new THREE.BufferAttribute(I, 1));
  CAPAS_CACHE.set(clave, g);
  return g;
}

/** Lambert normal + pelo: las capas salen por la normal, cuelgan un poco y se recortan por hebras. */
function materialPelo(THREE, color, largo, { rep = [26, 13], raiz = 0.55, puntas = 1.12, caida = 0.35 } = {}) {
  const m = new THREE.MeshLambertMaterial({ color });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uLargo = { value: largo };
    sh.uniforms.uCaida = { value: caida };
    sh.uniforms.uRep = { value: new THREE.Vector2(rep[0], rep[1]) };
    sh.uniforms.uPelo = { value: TEX_PELO };
    sh.uniforms.uRaiz = { value: raiz };
    sh.uniforms.uPuntas = { value: puntas };
    sh.vertexShader = 'attribute float capa;\nuniform float uLargo;\nuniform float uCaida;\nuniform vec2 uRep;\nvarying float vCapa;\nvarying vec2 vPeloUv;\n'
      + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
        transformed += objectNormal * capa * uLargo;
        transformed.y -= capa * capa * uLargo * uCaida;
        vCapa = capa;
        vPeloUv = uv * uRep;`);
    sh.fragmentShader = 'uniform sampler2D uPelo;\nuniform float uRaiz;\nuniform float uPuntas;\nvarying float vCapa;\nvarying vec2 vPeloUv;\n'
      + sh.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
        vec4 hebra = texture2D(uPelo, vPeloUv);
        if (vCapa > 0.0 && hebra.r < vCapa) discard;
        diffuseColor.rgb *= mix(uRaiz, uPuntas, vCapa) * (0.9 + 0.2 * hebra.g);`);
  };
  m.customProgramCacheKey = () => 'pelo-v1';
  return m;
}

export function datosAnimal(id) { return ANIMALES.find((x) => x.id === id) || ANIMALES[0]; }

export function colorBase(perfil) {
  const a = datosAnimal(perfil.animal);
  return !perfil.pelo || perfil.pelo === 'natural' || perfil.pelo === 'arcoiris' ? a.color : perfil.pelo;
}

/** opciones.pelo: multiplica las capas de pelo (p. ej. 0.4 para personajes secundarios: pesan menos en la tele). */
export function crearPersonaje(THREE, perfil = {}, opciones = {}) {
  const factorPelo = FACTOR_CAPAS * (opciones.pelo ?? 1);
  const geo = geometrias(THREE);
  const g = new THREE.Group();
  const res = { g, cuerpo: null, cabeza: null, patas: [], alas: [], escala: 1, aplicar };
  const mats = [];

  function aplicar(p) {
    p = { animal: 'oveja', pelo: 'natural', accesorio: 'nada', color: '#ff4d6d', ...p };
    for (const c of [...g.children]) g.remove(c);
    for (const m of mats) m.dispose();
    mats.length = 0;
    const cuerpo = new THREE.Group();
    const cabeza = new THREE.Group();
    g.add(cuerpo);
    cuerpo.add(cabeza);
    res.cuerpo = cuerpo; res.cabeza = cabeza; res.patas = []; res.alas = [];
    res.escala = datosAnimal(p.animal).escala || 1;
    g.scale.setScalar(res.escala);

    const lam = (c, flat = false) => { const m = new THREE.MeshLambertMaterial({ color: c, flatShading: flat }); mats.push(m); return m; };
    const bas = (c) => { const m = new THREE.MeshBasicMaterial({ color: c }); mats.push(m); return m; };
    const tono = (c, l, s = 0) => '#' + new THREE.Color(c).offsetHSL(0, s, l).getHexString();
    const arco = p.pelo === 'arcoiris';
    let k = 0;
    const base = colorBase(p);
    const colorP = () => (arco ? ARCO[k++ % ARCO.length] : base);
    const conContorno = ESTILO_PELO === 'liso' && opciones.contorno !== false;
    const malla = (geom, mat, padre, x, y, z, sx, sy = sx, sz = sx, rx = 0, ry = 0, rz = 0) => {
      const o = new THREE.Mesh(geom, mat);
      o.position.set(x, y, z); o.scale.set(sx, sy, sz); o.rotation.set(rx, ry, rz);
      padre.add(o);
      // Contorno de dibujo animado (no en ojos, brillos ni mofletes, que son de color plano)
      if (conContorno && !mat.isMeshBasicMaterial) o.add(new THREE.Mesh(geom, materialContorno(THREE)));
      return o;
    };
    /** Tubo de un color (cola, cresta…), con contorno. */
    const tubo = (color, padre, puntos, radios, opts) => malla(geoTubo(THREE, puntos, radios, opts), materialToon(THREE, color), padre, 0, 0, 0, 1);
    const E = (mat, padre, ...a) => malla(geo.esfera, mat, padre, ...a);
    const C5 = (mat, padre, ...a) => malla(geo.cono5, mat, padre, ...a);
    /** Pieza peluda. largo = largo del pelo en metros (antes de escalar el personaje). */
    const matMechon = new Map();
    const F = (color, padre, x, y, z, sx, sy, sz, { largo = 0.045, capas = 9, rep, raiz, puntas, caida, rx = 0, ry = 0, rz = 0 } = {}) => {
      const media = (sx + sy + sz) / 3;
      if (ESTILO_PELO === 'liso') {
        // Sin pelo: formas lisas con sombreado de dibujo animado
        if (!matMechon.has(color)) { const mm = materialToon(THREE, color); mats.push(mm); matMechon.set(color, mm); }
        return malla(geo.esfera, matMechon.get(color), padre, x, y, z, sx, sy, sz, rx, ry, rz);
      }
      if (ESTILO_PELO === 'mechones') {
        if (!matMechon.has(color)) { const mm = new THREE.MeshLambertMaterial({ color, vertexColors: true, side: THREE.DoubleSide }); mats.push(mm); matMechon.set(color, mm); }
        const densidad = Math.max(0.5, Math.min(1.6, ((rep && rep[0]) || 22) / 20));
        const geom = geoMechones(THREE, { largo: Math.min(0.55, (largo / media) * 1.25), densidad, caida: caida ?? 0.35, raiz: raiz ?? 0.55, puntas: puntas ?? 1.12 });
        return malla(geom, matMechon.get(color), padre, x, y, z, sx, sy, sz, rx, ry, rz);
      }
      const m = materialPelo(THREE, color, largo / media, { rep, raiz, puntas, caida });
      mats.push(m);
      const o = malla(conCapas(THREE, geo.peluda, Math.max(3, Math.round(capas * factorPelo))), m, padre, x, y, z, sx, sy, sz, rx, ry, rz);
      o.frustumCulled = false;
      return o;
    };

    // Pata con pivote arriba (para balancearla) y pie redondo
    const pata = (x, top, z, r, mat, pie = true) => {
      const grp = new THREE.Group(); grp.position.set(x, top, z); g.add(grp);
      malla(geo.pata, mat, grp, 0, 0, 0, r, top, r);
      if (pie) E(mat, grp, 0, -top + r * 0.6, r * 0.35, r * 1.25, r * 0.85, r * 1.5);
      res.patas.push(grp);
      return grp;
    };
    const negro = bas('#1d1524'), blanco = bas('#ffffff'), rosa = bas('#ffa3c8');
    const brillo = bas('#ffffff');
    // Ojos de dibujo animado
    const ojos = (y, z, sep, r, { parpado = null, pestanas = false, pupila = 0.56 } = {}) => {
      for (const s of [-1, 1]) {
        const o = new THREE.Group(); o.position.set(s * sep, y, z); cabeza.add(o);
        E(blanco, o, 0, 0, 0, r, r * 1.18, r * 0.72);
        E(negro, o, -s * r * 0.12, -r * 0.05, r * 0.5, r * pupila, r * pupila * 1.1, r * 0.3);
        E(brillo, o, -s * r * 0.12 - r * 0.18, r * 0.2, r * 0.7, r * 0.17);
        if (parpado) malla(geo.cupula, parpado, o, 0, r * 0.05, 0, r * 1.08, r * 0.95, r * 0.82, -0.25);
        if (pestanas) for (const a of [-0.5, 0, 0.5]) C5(negro, o, s * (r * 0.55 + a * r * 0.2), r * 1.05, r * 0.15, r * 0.06, r * 0.32, r * 0.06, 0, 0, -s * (0.6 + a * 0.4));
      }
    };
    const boca = (y, z, ancho) => malla(geo.sonrisa, negro, cabeza, 0, y, z, ancho, ancho * 0.75, ancho * 0.6);
    const dientes = (y, z) => { const d = lam('#ffffff'); for (const s of [-1, 1]) malla(geo.caja, d, cabeza, s * 0.025, y, z, 0.045, 0.06, 0.02); };
    const mofletes = (y, z, sep, r = 0.06) => { for (const s of [-1, 1]) E(rosa, cabeza, s * sep, y, z, r, r * 0.65, r * 0.4); };
    const CREMA = '#ffecd6';
    const crema = lam(CREMA);
    let top = 0.3, frente = 0.3;

    switch (p.animal) {
      case 'zorro': {
        const oscuro = lam('#4a2c22');
        F(colorP(), cuerpo, 0, 0.55, -0.05, 0.34, 0.32, 0.42, { largo: 0.05 });
        F(CREMA, cuerpo, 0, 0.58, 0.22, 0.22, 0.25, 0.16, { largo: 0.04 });
        if (ESTILO_PELO === 'liso') {
          // Cola gorda que sale hacia atrás y se levanta, con la punta blanca
          const colaP = [[0, 0.58, -0.36], [0.06, 0.62, -0.62], [0.16, 0.8, -0.82], [0.22, 1.04, -0.86]];
          tubo(colorP(), cuerpo, colaP.slice(0, 4), [0.06, 0.15, 0.19, 0.16, 0.11]);
          tubo(CREMA, cuerpo, [[0.2, 0.98, -0.87], [0.23, 1.1, -0.84], [0.24, 1.2, -0.78]], [0.13, 0.11, 0.02]);
        } else {
          const cola = new THREE.Group(); cola.position.set(0, 0.64, -0.4); cola.rotation.set(-1.0, 0, 0.35); cuerpo.add(cola);
          F(colorP(), cola, 0, 0, -0.26, 0.17, 0.17, 0.3, { largo: 0.09, capas: 12, caida: 0.2 });
          F(CREMA, cola, 0, 0, -0.56, 0.12, 0.12, 0.15, { largo: 0.08, capas: 12 });
        }
        cabeza.position.set(0, 0.98, 0.26);
        const cab = colorP();
        F(cab, cabeza, 0, 0, 0, 0.36, 0.31, 0.32, { largo: 0.04 });
        for (const s of [-1, 1]) {
          F(CREMA, cabeza, s * 0.16, -0.1, 0.15, 0.16, 0.12, 0.13, { largo: 0.05, caida: 0.6 });
          C5(lam(cab), cabeza, s * 0.2, 0.28, -0.06, 0.14, 0.27, 0.09, 0, 0, -s * 0.25);
          C5(oscuro, cabeza, s * 0.2, 0.26, -0.025, 0.08, 0.18, 0.03, 0, 0, -s * 0.25);
        }
        E(crema, cabeza, 0, -0.08, 0.28, 0.13, 0.1, 0.14);
        E(negro, cabeza, 0, -0.03, 0.42, 0.055, 0.045, 0.045);
        ojos(0.08, 0.31, 0.115, 0.078);
        boca(-0.13, 0.34, 0.05);
        mofletes(-0.05, 0.29, 0.23);
        for (const [x, z] of [[0.16, 0.18], [-0.16, 0.18], [0.16, -0.22], [-0.16, -0.22]]) pata(x, 0.3, z, 0.08, oscuro);
        top = 0.34; frente = 0.34;
        break;
      }
      case 'conejo': {
        F(colorP(), cuerpo, 0, 0.48, -0.04, 0.34, 0.34, 0.38, { largo: 0.05, rep: [34, 17] });
        F(CREMA, cuerpo, 0, 0.45, 0.17, 0.22, 0.25, 0.17, { largo: 0.04, rep: [34, 17] });
        F('#ffffff', cuerpo, 0, 0.55, -0.42, 0.11, 0.11, 0.11, { largo: 0.07, capas: 12, rep: [20, 10] });
        const anca = colorP();
        for (const s of [-1, 1]) {
          F(anca, cuerpo, s * 0.2, 0.32, -0.12, 0.14, 0.17, 0.18, { largo: 0.04 });
          E(lam(anca), g, s * 0.18, 0.07, 0.04, 0.11, 0.07, 0.2);
        }
        cabeza.position.set(0, 0.96, 0.2);
        const cab = colorP();
        F(cab, cabeza, 0, 0, 0, 0.35, 0.31, 0.32, { largo: 0.04, rep: [34, 17] });
        F(CREMA, cabeza, 0, -0.12, 0.24, 0.14, 0.1, 0.11, { largo: 0.03 });
        E(lam('#ff7fae'), cabeza, 0, -0.05, 0.36, 0.045, 0.035, 0.035);
        const interior = lam('#ffb8d2');
        for (const s of [-1, 1]) {
          const o = new THREE.Group(); o.position.set(s * 0.12, 0.26, -0.06); o.rotation.set(-0.2, 0, -s * 0.16); cabeza.add(o);
          F(cab, o, 0, 0.3, 0, 0.09, 0.31, 0.06, { largo: 0.025, capas: 6 });
          E(interior, o, 0, 0.3, 0.05, 0.05, 0.24, 0.02);
        }
        ojos(0.07, 0.28, 0.12, 0.078);
        boca(-0.16, 0.35, 0.045);
        dientes(-0.2, 0.34);
        mofletes(-0.08, 0.28, 0.21);
        const pm = lam(colorP());
        pata(0.12, 0.27, 0.16, 0.07, pm); pata(-0.12, 0.27, 0.16, 0.07, pm);
        pata(0.17, 0.22, -0.1, 0.07, pm, false); pata(-0.17, 0.22, -0.1, 0.07, pm, false);
        top = 0.33; frente = 0.34;
        break;
      }
      case 'cervatillo': {
        F(colorP(), cuerpo, 0, 0.62, -0.04, 0.31, 0.29, 0.41, { largo: 0.025, rep: [40, 20] });
        F(CREMA, cuerpo, 0, 0.55, 0.06, 0.23, 0.2, 0.29, { largo: 0.025 });
        const motas = lam('#fff8ee');
        [[0.16, 0.83, 0.1], [-0.16, 0.83, 0.1], [0, 0.92, -0.06], [0.18, 0.8, -0.2], [-0.18, 0.8, -0.2], [0, 0.91, 0.16], [0.09, 0.88, -0.3], [-0.08, 0.88, -0.32]]
          .forEach(([x, y, z]) => E(motas, cuerpo, x, y, z, 0.055, 0.025, 0.055));
        F('#fff8ee', cuerpo, 0, 0.78, -0.44, 0.07, 0.1, 0.06, { largo: 0.05 });
        F(colorP(), cuerpo, 0, 0.86, 0.24, 0.14, 0.2, 0.14, { largo: 0.025 });
        cabeza.position.set(0, 1.1, 0.3);
        const cab = colorP();
        F(cab, cabeza, 0, 0, 0, 0.33, 0.3, 0.31, { largo: 0.025, rep: [40, 20] });
        E(crema, cabeza, 0, -0.12, 0.22, 0.15, 0.11, 0.14);
        E(negro, cabeza, 0, -0.07, 0.36, 0.05, 0.04, 0.04);
        const interior = lam('#ffb8d2');
        for (const s of [-1, 1]) {
          F(cab, cabeza, s * 0.31, 0.1, -0.05, 0.19, 0.08, 0.05, { largo: 0.02, capas: 6, rz: s * 0.35 });
          E(interior, cabeza, s * 0.31, 0.1, -0.005, 0.12, 0.05, 0.02, 0, 0, s * 0.35);
        }
        ojos(0.06, 0.27, 0.12, 0.082, { pestanas: true });
        boca(-0.16, 0.32, 0.04);
        mofletes(-0.08, 0.27, 0.2);
        const pm = lam(colorP()), pezuna = lam('#4a3328');
        for (const [x, z] of [[0.13, 0.2], [-0.13, 0.2], [0.13, -0.24], [-0.13, -0.24]]) {
          const pt = pata(x, 0.45, z, 0.065, pm, false);
          E(pezuna, pt, 0, -0.43, 0.01, 0.075, 0.06, 0.085);
        }
        top = 0.31; frente = 0.34;
        break;
      }
      case 'jabali': {
        // El más greñudo: pelo largo y despeinado, puntas canosas y una crin enorme
        const oscuro = lam('#3d2a22');
        const pelo = colorP();
        F(pelo, cuerpo, 0, 0.56, -0.04, 0.4, 0.36, 0.48, { largo: 0.11, capas: 14, rep: [16, 9], raiz: 0.45, puntas: 1.35, caida: 0.55 });
        if (ESTILO_PELO === 'liso') {
          // Cresta de picos a lo largo del lomo, de dibujo animado
          const cresta = lam('#3a2a22');
          [[0.36, 0.86, 0.1, -0.5], [0.16, 0.93, 0.13, -0.6], [-0.06, 0.94, 0.14, -0.7], [-0.27, 0.9, 0.12, -0.8], [-0.44, 0.8, 0.09, -0.95]]
            .forEach(([z, y, h, r]) => C5(cresta, cuerpo, 0, y + h * 0.9, z, 0.09, h * 2.6, 0.13, r + 0.5));
        } else {
          F('#3a2a22', cuerpo, 0, 0.9, -0.06, 0.11, 0.17, 0.46, { largo: 0.2, capas: 14, rep: [8, 14], raiz: 0.6, puntas: 1.7, caida: -0.15 });
        }
        cabeza.position.set(0, 0.84, 0.42);
        F(pelo, cabeza, 0, 0, 0, 0.33, 0.3, 0.31, { largo: 0.08, capas: 12, rep: [16, 9], raiz: 0.45, puntas: 1.35, caida: 0.5 });
        F('#3a2a22', cabeza, 0, 0.27, -0.06, 0.07, 0.07, 0.14, { largo: 0.1, capas: 12, rep: [8, 8], puntas: 1.6 });
        E(lam(tono(base, 0.06)), cabeza, 0, -0.08, 0.34, 0.15, 0.12, 0.14);
        E(lam('#d69a8a'), cabeza, 0, -0.08, 0.47, 0.12, 0.09, 0.04);
        const colmillo = lam('#fffaf0');
        for (const s of [-1, 1]) {
          E(negro, cabeza, s * 0.045, -0.08, 0.5, 0.024, 0.03, 0.01);
          C5(colmillo, cabeza, s * 0.13, -0.04, 0.4, 0.032, 0.11, 0.032, -0.3, 0, s * 0.3);
          F(pelo, cabeza, s * 0.23, 0.23, -0.06, 0.08, 0.13, 0.05, { largo: 0.05, capas: 8, rz: -s * 0.6, puntas: 1.3 });
          malla(geo.esfera, oscuro, cabeza, s * 0.115, 0.19, 0.37, 0.085, 0.03, 0.03, 0, 0, s * 0.18);
        }
        ojos(0.09, 0.36, 0.115, 0.07);
        mofletes(-0.04, 0.36, 0.24);
        for (const [x, z] of [[0.2, 0.24], [-0.2, 0.24], [0.2, -0.26], [-0.2, -0.26]]) pata(x, 0.3, z, 0.09, oscuro);
        malla(geo.cil, oscuro, cuerpo, 0, 0.62, -0.58, 0.02, 0.18, 0.02, -0.6);
        top = 0.38; frente = 0.42;
        break;
      }
      case 'ardilla': {
        F(colorP(), cuerpo, 0, 0.46, -0.02, 0.28, 0.34, 0.3, { largo: 0.045 });
        F(CREMA, cuerpo, 0, 0.45, 0.15, 0.2, 0.26, 0.15, { largo: 0.035 });
        const cm = colorP(), punta = tono(base, 0.12);
        // Cola enorme y esponjosa
        if (ESTILO_PELO === 'liso') {
          // Penacho: sube por detrás, se abomba y se curva hacia delante por encima de la cabeza
          tubo(cm, cuerpo, [[0, 0.38, -0.28], [0, 0.62, -0.52], [0, 0.98, -0.6], [0, 1.28, -0.46], [0, 1.42, -0.2], [0, 1.38, 0.02]], [0.08, 0.17, 0.24, 0.24, 0.19, 0.12, 0.03], { segs: 36 });
        } else {
          [[0, 0.5, -0.34, 0.17], [0, 0.82, -0.5, 0.22], [0, 1.13, -0.44, 0.21], [0, 1.34, -0.24, 0.16]]
            .forEach(([x, y, z, r], i) => F(i === 3 ? punta : cm, cuerpo, x, y, z, r, r, r, { largo: 0.12, capas: 14, rep: [14, 8], caida: 0.25, puntas: 1.25 }));
        }
        const anca = colorP();
        for (const s of [-1, 1]) {
          F(anca, cuerpo, s * 0.18, 0.28, -0.06, 0.12, 0.15, 0.15, { largo: 0.035 });
          E(lam(anca), g, s * 0.17, 0.05, 0.05, 0.09, 0.055, 0.15);
          E(lam(anca), cuerpo, s * 0.1, 0.62, 0.27, 0.05, 0.09, 0.05, 0.6);
        }
        E(lam('#c98b4a'), cuerpo, 0, 0.6, 0.33, 0.07, 0.085, 0.07);
        E(lam('#7a4a2a'), cuerpo, 0, 0.67, 0.33, 0.078, 0.04, 0.078);
        cabeza.position.set(0, 0.94, 0.1);
        const cab = colorP();
        F(cab, cabeza, 0, 0, 0, 0.34, 0.31, 0.31, { largo: 0.04 });
        for (const s of [-1, 1]) {
          F(CREMA, cabeza, s * 0.15, -0.1, 0.18, 0.13, 0.11, 0.11, { largo: 0.035 });
          C5(lam(cab), cabeza, s * 0.17, 0.3, -0.04, 0.09, 0.19, 0.07, 0, 0, -s * 0.15);
          F(punta, cabeza, s * 0.18, 0.42, -0.04, 0.03, 0.05, 0.03, { largo: 0.06, capas: 10, rep: [6, 6], caida: 0 });
        }
        E(crema, cabeza, 0, -0.1, 0.26, 0.11, 0.08, 0.09);
        E(lam('#6a3030'), cabeza, 0, -0.05, 0.35, 0.035, 0.03, 0.03);
        ojos(0.07, 0.28, 0.115, 0.078);
        boca(-0.13, 0.34, 0.038);
        dientes(-0.17, 0.33);
        mofletes(-0.06, 0.29, 0.22);
        const pm = lam(colorP());
        pata(0.11, 0.26, 0.13, 0.06, pm); pata(-0.11, 0.26, 0.13, 0.06, pm);
        pata(0.16, 0.2, -0.06, 0.06, pm, false); pata(-0.16, 0.2, -0.06, 0.06, pm, false);
        top = 0.34; frente = 0.34;
        break;
      }
      case 'erizo': {
        const CARA = '#f3d9b8', cara = lam(CARA);
        E(lam(base), cuerpo, 0, 0.48, -0.06, 0.45, 0.41, 0.49);
        F(CARA, cuerpo, 0, 0.42, 0.2, 0.31, 0.29, 0.25, { largo: 0.03 });
        const pincho = lam(tono(base, -0.1)), puntaP = lam(tono(base, 0.25));
        const arriba = new THREE.Vector3(0, 1, 0), dir = new THREE.Vector3();
        for (let i = 0; i < 90; i++) {
          const t = (i + 0.5) / 90, y = 1 - t * 1.25, r = Math.sqrt(Math.max(0, 1 - y * y)), a = i * 2.39996;
          dir.set(Math.cos(a) * r, y, Math.sin(a) * r);
          if (dir.z > 0.3 || dir.y < -0.2) continue;
          const o = new THREE.Mesh(geo.cono5, i % 3 ? pincho : puntaP);
          o.position.set(dir.x * 0.44, 0.48 + dir.y * 0.4, -0.06 + dir.z * 0.48);
          o.scale.set(0.06, 0.24, 0.06);
          o.quaternion.setFromUnitVectors(arriba, dir.normalize());
          cuerpo.add(o);
        }
        cabeza.position.set(0, 0.6, 0.34);
        F(CARA, cabeza, 0, 0, 0, 0.27, 0.25, 0.27, { largo: 0.03 });
        E(cara, cabeza, 0, -0.06, 0.24, 0.09, 0.08, 0.14);
        E(negro, cabeza, 0, -0.04, 0.38, 0.05, 0.045, 0.045);
        for (const s of [-1, 1]) E(cara, cabeza, s * 0.19, 0.17, -0.04, 0.075, 0.075, 0.04);
        ojos(0.07, 0.24, 0.1, 0.07);
        boca(-0.12, 0.3, 0.035);
        mofletes(-0.05, 0.24, 0.18, 0.05);
        for (const [x, z] of [[0.18, 0.2], [-0.18, 0.2], [0.18, -0.2], [-0.18, -0.2]]) pata(x, 0.2, z, 0.075, cara);
        top = 0.27; frente = 0.3;
        break;
      }
      case 'buho': {
        const PECHO = '#efdcc4', pico = lam('#ff9a1f');
        F(colorP(), cuerpo, 0, 0.6, 0, 0.41, 0.47, 0.39, { largo: 0.04, rep: [22, 12], puntas: 1.2 });
        F(PECHO, cuerpo, 0, 0.55, 0.2, 0.28, 0.34, 0.2, { largo: 0.035, rep: [22, 12] });
        const ala = tono(base, -0.08);
        for (const s of [-1, 1]) {
          const al = new THREE.Group(); al.position.set(s * 0.4, 0.76, -0.02); cuerpo.add(al);
          F(arco ? colorP() : ala, al, s * 0.02, -0.14, 0, 0.1, 0.3, 0.27, { largo: 0.03, capas: 6, rz: s * 0.15 });
          res.alas.push(al);
        }
        cabeza.position.set(0, 1.06, 0.04);
        const cab = colorP();
        F(cab, cabeza, 0, 0, 0, 0.39, 0.34, 0.35, { largo: 0.04, rep: [22, 12], puntas: 1.2 });
        for (const s of [-1, 1]) {
          F(PECHO, cabeza, s * 0.14, -0.01, 0.25, 0.16, 0.16, 0.07, { largo: 0.025, capas: 6 });
          F(cab, cabeza, s * 0.24, 0.3, -0.03, 0.06, 0.12, 0.05, { largo: 0.07, capas: 10, rep: [6, 6], caida: -0.3, rz: -s * 0.35 });
        }
        ojos(0.0, 0.33, 0.14, 0.1, { parpado: lam(cab), pupila: 0.5 });
        C5(pico, cabeza, 0, -0.11, 0.34, 0.05, 0.11, 0.05, 2.5);
        mofletes(-0.1, 0.31, 0.24);
        pata(0.13, 0.18, 0.06, 0.045, pico); pata(-0.13, 0.18, 0.06, 0.045, pico);
        top = 0.36; frente = 0.37;
        break;
      }
      case 'oso': {
        F(colorP(), cuerpo, 0, 0.58, -0.04, 0.44, 0.42, 0.5, { largo: 0.07, capas: 11, rep: [22, 12], caida: 0.45 });
        F(CREMA, cuerpo, 0, 0.6, 0.25, 0.27, 0.25, 0.18, { largo: 0.05 });
        F(colorP(), cuerpo, 0, 0.64, -0.52, 0.07, 0.07, 0.07, { largo: 0.05 });
        cabeza.position.set(0, 1.0, 0.3);
        const cab = colorP();
        F(cab, cabeza, 0, 0, 0, 0.38, 0.33, 0.33, { largo: 0.06, capas: 10, rep: [22, 12] });
        for (const s of [-1, 1]) {
          F(cab, cabeza, s * 0.27, 0.27, -0.04, 0.1, 0.1, 0.07, { largo: 0.04, capas: 8 });
          E(crema, cabeza, s * 0.27, 0.27, 0.02, 0.06, 0.06, 0.03);
        }
        F(CREMA, cabeza, 0, -0.11, 0.3, 0.17, 0.12, 0.14, { largo: 0.03 });
        E(lam('#2a1d1a'), cabeza, 0, -0.04, 0.45, 0.075, 0.055, 0.05);
        ojos(0.08, 0.35, 0.13, 0.074);
        boca(-0.17, 0.45, 0.05);
        mofletes(-0.06, 0.35, 0.26);
        const pm = lam(tono(base, -0.06));
        for (const [x, z] of [[0.2, 0.24], [-0.2, 0.24], [0.2, -0.26], [-0.2, -0.26]]) pata(x, 0.3, z, 0.11, pm);
        top = 0.4; frente = 0.42;
        break;
      }
      default: { // oveja (la original, tal cual)
        const lana = () => lam(colorP(), true);
        [[0, 0.76, 0, 0.44], [0.3, 0.8, 0.14, 0.34], [-0.3, 0.8, 0.14, 0.34], [0.28, 0.78, -0.24, 0.34], [-0.28, 0.78, -0.24, 0.34],
          [0, 1.02, -0.04, 0.34], [0, 0.74, -0.42, 0.32], [0, 0.88, 0.26, 0.32], [0, 0.84, -0.56, 0.14]]
          .forEach(([x, y, z, r]) => malla(geo.bola, lana(), cuerpo, x, y, z, r));
        cabeza.position.set(0, 0.98, 0.5);
        const cara = lam(p.pelo === '#5a4d63' ? '#f3dcc4' : '#4b3b52');
        E(cara, cabeza, 0, 0, 0, 0.27, 0.3, 0.27);
        malla(geo.bola, lana(), cabeza, 0, 0.22, -0.04, 0.17);
        malla(geo.bola, lana(), cabeza, 0.12, 0.17, -0.02, 0.12);
        malla(geo.bola, lana(), cabeza, -0.12, 0.17, -0.02, 0.12);
        for (const s of [-1, 1]) E(cara, cabeza, s * 0.3, 0.06, -0.02, 0.17, 0.06, 0.09, 0, 0, s * 0.45);
        for (const s of [-1, 1]) {
          E(blanco, cabeza, s * 0.11, 0.05, 0.2, 0.085);
          E(negro, cabeza, s * 0.115, 0.05, 0.27, 0.048);
        }
        mofletes(-0.1, 0.19, 0.16, 0.05);
        for (const [x, z] of [[0.2, 0.22], [-0.2, 0.22], [0.2, -0.22], [-0.2, -0.22]]) pata(x, 0.5, z, 0.075, cara, false);
        top = 0.33; frente = 0.27;
      }
    }

    // ---------- Accesorio ----------
    const cj = lam(p.color);
    const acc = new THREE.Group();
    switch (p.accesorio) {
      case 'corona': {
        acc.position.set(0, top + 0.03, -0.02);
        const oro = new THREE.MeshLambertMaterial({ color: '#ffcc33', side: THREE.DoubleSide }); mats.push(oro);
        malla(geo.anillo, oro, acc, 0, 0, 0, 0.15, 0.1, 0.15);
        for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2; C5(oro, acc, Math.sin(a) * 0.15, 0.09, Math.cos(a) * 0.15, 0.035, 0.09, 0.035); }
        E(cj, acc, 0, 0, 0.155, 0.03);
        break;
      }
      case 'lazo': {
        acc.position.set(0.16, top - 0.03, 0.02); acc.rotation.z = -0.35;
        malla(geo.cono, cj, acc, -0.07, 0, 0, 0.08, 0.14, 0.06, 0, 0, -Math.PI / 2);
        malla(geo.cono, cj, acc, 0.07, 0, 0, 0.08, 0.14, 0.06, 0, 0, Math.PI / 2);
        E(cj, acc, 0, 0, 0, 0.04);
        break;
      }
      case 'gorro': {
        acc.position.set(0, top - 0.08, -0.01);
        malla(geo.cupula, cj, acc, 0, 0, 0, 0.25);
        malla(geo.toro, crema, acc, 0, 0.01, 0, 0.245, 0.245, 0.245, Math.PI / 2);
        E(crema, acc, 0, 0.28, 0, 0.075);
        break;
      }
      case 'gafas': {
        acc.position.set(0, 0.07, frente + 0.04);
        const vidrio = new THREE.MeshPhongMaterial({ color: '#221a2a', shininess: 90, specular: '#888888' }); mats.push(vidrio);
        for (const s of [-1, 1]) malla(geo.cil, vidrio, acc, s * 0.12, 0, 0, 0.085, 0.025, 0.085, Math.PI / 2);
        malla(geo.cil, cj, acc, 0, 0.01, 0, 0.014, 0.08, 0.014, 0, 0, Math.PI / 2);
        break;
      }
      case 'flor': {
        acc.position.set(-0.19, top - 0.05, 0.08); acc.rotation.set(0.3, 0, 0.4);
        for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2; E(cj, acc, Math.cos(a) * 0.06, Math.sin(a) * 0.06, 0, 0.055, 0.055, 0.025); }
        E(lam('#ffd93d'), acc, 0, 0, 0.01, 0.038);
        break;
      }
      case 'copa': {
        acc.position.set(0, top + 0.1, -0.03);
        const tela = lam('#2b2233');
        malla(geo.cil, tela, acc, 0, 0, 0, 0.13, 0.26, 0.13);
        malla(geo.cil, tela, acc, 0, -0.12, 0, 0.22, 0.02, 0.22);
        malla(geo.cil, cj, acc, 0, -0.08, 0, 0.135, 0.05, 0.135);
        break;
      }
      case 'bufanda': {
        const cuello = cabeza.position.clone().add(new THREE.Vector3(0, -0.26, -0.06));
        malla(geo.toro, cj, cuerpo, cuello.x, cuello.y, cuello.z, 0.29, 0.29, 0.31, Math.PI / 2);
        malla(geo.cil, cj, cuerpo, 0.15, cuello.y - 0.14, cuello.z + 0.18, 0.05, 0.24, 0.02, 0.2, 0, 0.15);
        break;
      }
      default: break;
    }
    cabeza.add(acc);
    res.perfil = p;
  }

  aplicar(perfil);
  if (opciones.fusionar !== false) fusionarPiezas(THREE, res);
  return res;
}

/**
 * Junta en una sola malla las piezas que comparten material y se mueven juntas (ojos, nariz, mofletes…).
 * Cada animal pasa de ~30 llamadas de dibujo a la mitad o menos: la tele lo nota mucho con pantalla partida.
 * Las partes que se animan por separado (cuerpo, cabeza, cada pata y ala) siguen siendo grupos aparte.
 */
function fusionarPiezas(THREE, res) {
  const anclas = [res.g, res.cuerpo, res.cabeza, ...res.patas, ...res.alas].filter(Boolean);
  const esAncla = new Set(anclas);
  res.g.updateMatrixWorld(true);
  const porAncla = new Map(anclas.map((a) => [a, new Map()]));
  res.g.traverse((o) => {
    if (!o.isMesh || !o.frustumCulled) return;   // el pelo (frustumCulled = false) lleva material propio: se queda
    let a = o.parent;
    while (a && !esAncla.has(a)) a = a.parent;
    if (!a) return;
    const grupos = porAncla.get(a);
    if (!grupos.has(o.material)) grupos.set(o.material, []);
    grupos.get(o.material).push(o);
  });
  const inv = new THREE.Matrix4(), rel = new THREE.Matrix4();
  for (const [ancla, grupos] of porAncla) {
    inv.copy(ancla.matrixWorld).invert();
    for (const [material, mallas] of grupos) {
      if (mallas.length < 2) continue;
      const geos = mallas.map((m) => {
        const g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
        rel.multiplyMatrices(inv, m.matrixWorld);
        g.applyMatrix4(rel);
        return g;
      });
      const nombres = Object.keys(geos[0].attributes);
      if (!geos.every((g) => Object.keys(g.attributes).length === nombres.length && nombres.every((n) => g.attributes[n]))) continue;
      const junta = new THREE.BufferGeometry();
      for (const n of nombres) {
        const tam = geos[0].attributes[n].itemSize;
        const total = geos.reduce((s, g) => s + g.attributes[n].array.length, 0);
        const arr = new Float32Array(total);
        let off = 0;
        for (const g of geos) { arr.set(g.attributes[n].array, off); off += g.attributes[n].array.length; }
        junta.setAttribute(n, new THREE.BufferAttribute(arr, tam));
      }
      junta.computeBoundingSphere();
      for (const g of geos) g.dispose();
      for (const m of mallas) m.parent.remove(m);
      const nueva = new THREE.Mesh(junta, material);
      ancla.add(nueva);
    }
  }
}

/** Anima un personaje: saltitos al andar, patas, aplastarse al caer, aletear en el aire. */
export function animarPersonaje(p, { paso = 0, suelo = true, aplasta = 0, mirar = null, dt = 0.016 }) {
  if (p._bolasSalto) { p._bolasSalto = Math.max(0, p._bolasSalto - dt * 1.5); p.cuerpo.rotation.y = (1 - p._bolasSalto) * Math.PI * 2 * (p._bolasSalto > 0 ? 1 : 0); }
  p.cuerpo.position.y = suelo ? Math.abs(Math.sin(paso)) * 0.16 : 0;
  p.cuerpo.scale.set(1 + aplasta * 0.18, 1 - aplasta * 0.22, 1 + aplasta * 0.18);
  p.patas.forEach((pt, i) => { pt.rotation.x = suelo ? Math.sin(paso + (i % 2 ? Math.PI : 0)) * 0.6 : (i < 2 ? -0.7 : 0.7); });
  p.alas.forEach((a, i) => { a.rotation.z = suelo ? 0 : Math.sin(performance.now() / 60) * 0.6 * (i ? 1 : -1); });
  if (mirar !== null) p.cabeza.rotation.x += (mirar - p.cabeza.rotation.x) * Math.min(1, dt * 6);
}
