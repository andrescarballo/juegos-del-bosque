// Estaciones: primavera, verano, otoño e invierno (sacado del prototipo "Bichos del bosque", ambiente.js).
// La estación se decide al cargar la página y ya no cambia: así teñir el bosque no cuesta nada mientras se juega.
//
//   ESTACION (0..3) · NOMBRE_ESTACION · ICONO_ESTACION
//   tenir(color, tipo)        -> tiñe un THREE.Color: 'suelo' | 'hoja' | 'conifera' | 'hierba' (lo usa naturaleza.js)
//   vestir(THREE, escena)     -> tiñe lo verde del escenario, el cielo, la niebla y las luces, y echa a caer
//                                pétalos, hojas o nieve delante de la cámara (todo en la GPU). Llamarlo cuando el
//                                escenario ya está montado; se puede repetir (lo ya teñido no se vuelve a teñir).
//
// Qué estación toca: ajuste "bosque.estacion" = 'rota' (cambia cada vez que se abre un juego desde el menú),
// 'calendario' (la de verdad) o '0'..'3' (fija). Para probar: ?estacion=3 en la dirección.
import './almacen.js';

export const ESTACIONES = ['Primavera', 'Verano', 'Otoño', 'Invierno'];
export const ICONOS = ['🌸', '☀️', '🍂', '❄️'];
const CLAVE = 'bosque.estacion', CLAVE_TURNO = 'bosque.estacion.turno';
const leer = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
const guardar = (k, v) => { try { localStorage.setItem(k, String(v)); } catch (e) { /* nada */ } };

export function modoEstacion() { return leer(CLAVE) || 'rota'; }
export function ponerModoEstacion(m) { guardar(CLAVE, m); }
function turno() { const n = parseInt(leer(CLAVE_TURNO) || '1', 10); return Number.isFinite(n) ? n : 1; }
/** El menú lo llama al abrir un juego: con el ajuste "va cambiando", pasa a la siguiente estación. */
export function siguienteEstacion() { guardar(CLAVE_TURNO, (turno() + 1) % 4); }
function deCalendario() { const m = new Date().getMonth(); return m >= 2 && m <= 4 ? 0 : m >= 5 && m <= 7 ? 1 : m >= 8 && m <= 10 ? 2 : 3; }
/** La estación que toca ahora mismo según los ajustes (ESTACION es la de cuando se cargó la página). */
export function estacionActual() {
  const q = new URLSearchParams(location.search).get('estacion');
  if (q !== null && q !== '') return ((parseInt(q, 10) || 0) % 4 + 4) % 4;
  const m = modoEstacion();
  if (m === 'calendario') return deCalendario();
  if (m === 'rota') return turno() % 4;
  return ((parseInt(m, 10) || 0) % 4 + 4) % 4;
}
export const ESTACION = estacionActual();
export const NOMBRE_ESTACION = ESTACIONES[ESTACION];
export const ICONO_ESTACION = ICONOS[ESTACION];
/** Cuánto sopla el viento (1 = lo de siempre). */
export const VIENTO = [1.1, 0.8, 1.6, 1.3][ESTACION];

// ---------- La regla de cada estación (igual para todos los jugadores) ----------
// No se anuncian en pantalla.
//   salto: multiplica el salto normal · recarga: multiplica lo que tarda en volver el especial
//   agarre: cuánto agarra el suelo al arrancar, frenar y girar (1 = normal) · viento: fuerza de las rachas (0 = no hay)
// Los juegos de moverse libremente la leen (globo, pompas, carrera, plataformas, escondite del conejo y paseo); en
// el rebaño secreto no se aplica, porque delataría a los jugadores entre las ovejas.
// En Ajustes se elige cuánto se nota: 'no' (jugar normal, la estación solo se ve), 'suave' (matices) o 'fuerte' (exagerado).
const NORMAL = { salto: 1, recarga: 1, agarre: 1, viento: 0 };
export const REGLAS = {
  no: [NORMAL, NORMAL, NORMAL, NORMAL],
  // primavera: se salta más · verano: el especial vuelve antes · otoño: rachas de viento · invierno: resbala
  suave: [{ ...NORMAL, salto: 1.07 }, { ...NORMAL, recarga: 0.7 }, { ...NORMAL, viento: 1 }, { ...NORMAL, agarre: 0.6 }],
  fuerte: [{ ...NORMAL, salto: 1.15 }, { ...NORMAL, recarga: 0.5 }, { ...NORMAL, viento: 2 }, { ...NORMAL, agarre: 0.3 }],
};
export const EFECTOS = ['suave', 'fuerte', 'no'];
export function modoEfectos() { const m = leer('bosque.efectos'); return REGLAS[m] ? m : 'suave'; }
export function ponerModoEfectos(m) { guardar('bosque.efectos', m); }
const sinReglas = /[?&]sinreglas\b/.test(location.search) || !/\/(globo|pompas|carrera|bosque|escondite|paseo|pintar|redil|despensa)\//.test(location.pathname);
export const REGLA = sinReglas ? NORMAL : REGLAS[modoEfectos()][ESTACION];
/**
 * La racha de viento de ahora mismo (otoño): { x, z, f }. Sopla unos 3 s cada 11, cada vez desde un lado, y es la
 * misma para todos. x, z = empuje en metros por segundo para un jugador (poco: 1,2 como mucho, frente a los 7 de correr).
 */
export function racha(t = performance.now() / 1000) {
  if (!REGLA.viento) return SIN_VIENTO;
  const ciclo = t / 11, f = Math.pow(Math.max(0, Math.sin((ciclo % 1) * Math.PI * 2 - 1.2) - 0.45) / 0.55, 1.5) * REGLA.viento;
  const a = Math.floor(ciclo) * 2.4 + 0.6;
  _racha.x = Math.sin(a) * f * 1.2; _racha.z = Math.cos(a) * f * 1.2; _racha.f = f;
  return _racha;
}
const SIN_VIENTO = { x: 0, z: 0, f: 0 }, _racha = { x: 0, z: 0, f: 0 };

// ---------- Colores ----------
const clamp = (v, a, b) => Math.max(a, Math.min(b, v)), lerp = (a, b, t) => a + (b - a) * t;
const hsl = { h: 0, s: 0, l: 0 };
const BLANCO = { r: 0.905, g: 0.94, b: 0.97 }, OCRE = { r: 0.485, g: 0.325, b: 0.075 };   // en lineal (como guarda THREE los colores)
const mezclar = (c, o, t) => { c.r = lerp(c.r, o.r, t); c.g = lerp(c.g, o.g, t); c.b = lerp(c.b, o.b, t); return c; };

/** ¿Es un verde de planta? */
export function esVerde(c) { c.getHSL(hsl); return hsl.h > 0.16 && hsl.h < 0.47 && hsl.s > 0.18; }

/**
 * Tiñe un color según la estación. tipo: 'suelo' | 'hoja' (caduca) | 'conifera' | 'hierba'.
 * variante (0..1) reparte los colores del otoño y decide qué árboles florecen en primavera.
 */
export function tenir(c, tipo = 'suelo', variante = 0, florece = false) {
  c.getHSL(hsl);
  if (ESTACION === 0) {
    if (tipo === 'hoja' && florece) c.set(variante < 0.5 ? '#f7b3cb' : '#fbdde8');
    else c.setHSL(lerp(hsl.h, 0.27, tipo === 'suelo' ? 0.3 : 0.5), Math.min(1, hsl.s * 1.08), Math.min(0.72, hsl.l * (tipo === 'suelo' ? 1.08 : 1.16)));
  } else if (ESTACION === 2) {
    if (tipo === 'hoja') c.setHSL([0.02, 0.065, 0.1, 0.135][Math.min(3, (variante * 4) | 0)], 0.78, clamp(hsl.l * 1.1, 0.42, 0.58));
    else if (tipo === 'hierba') c.setHSL(0.14, hsl.s * 0.75, hsl.l * 1.05);
    else if (tipo === 'suelo') mezclar(c, OCRE, 0.5);
    else c.setHSL(hsl.h, hsl.s * 0.9, hsl.l * 0.9);
  } else if (ESTACION === 3) {
    mezclar(c, BLANCO, { hoja: 0.72, conifera: 0.4, hierba: 0.8, suelo: 0.88 }[tipo] ?? 0.88);
  }
  return c;
}

// Cielo (arriba, horizonte, abajo), sol (color, fuerza) y suelo de la luz de ambiente, por estación. null = como venga.
const CIELO = [
  { arriba: '#6cc0ff', horizonte: '#ffe1f1', k: 0.5 },
  null,
  { arriba: '#7fa9d6', horizonte: '#ffd2a0', abajo: '#f3c98e', k: 0.75 },
  { arriba: '#9db6cf', horizonte: '#eef3f8', abajo: '#e3ebf2', k: 0.85 },
];
const SOL = [['#fff4e0', 0.97], null, ['#ffd9a8', 0.88], ['#eaf2ff', 0.8]];
const AMBIENTE = ['#a8d48a', null, '#c9b07a', '#dde6ee'];
const NIEBLA = [null, null, '#f1d6b4', '#e6eef5'];

// Lo que cae: cuántos, colores, velocidad de caída y tamaño
const CAE = [
  { n: 80, colores: ['#f9b8cf', '#fde4ee', '#ffffff'], cae: 0.55, tam: 0.8 },
  { n: 26, colores: ['#7fbf55', '#9bd06a'], cae: 0.7, tam: 0.9 },
  { n: 230, colores: ['#e2622b', '#f0a030', '#d9432b', '#f2c744', '#b5651d'], cae: 0.95, tam: 1.1 },
  { n: 260, colores: ['#ffffff', '#f2f7fc'], cae: 0.75, tam: 0.5 },
];

/** Para cielos hechos a mano (dos THREE.Color: arriba y horizonte): los acerca a los de la estación. */
export function tenirCielo(arriba, horizonte) {
  const C = CIELO[ESTACION];
  if (!C) return;
  const t = arriba.clone();
  arriba.lerp(t.set(C.arriba), C.k); horizonte.lerp(t.set(C.horizonte), C.k);
}

const hechos = new WeakSet();
let reloj = null;

/**
 * Viste un escenario de la estación. Opciones:
 *   lejos: a qué distancia de la cámara está lo que se mira (para que las hojas caigan ahí y se vean del tamaño justo)
 *   particulas: false para no echar nada · cantidad: multiplica cuántas caen
 */
export function vestir(THREE, escena, { lejos = 14, particulas = true, cantidad = 1 } = {}) {
  const tmp = new THREE.Color();
  const pinta = (m) => {
    if (!m || hechos.has(m)) return;
    hechos.add(m);
    const u = m.uniforms;
    if (u && u.arriba && u.horizonte) {   // el cielo degradado de mundo.js y compañía
      const C = CIELO[ESTACION];
      if (C) for (const k of ['arriba', 'horizonte', 'abajo']) if (u[k] && C[k]) u[k].value.lerp(tmp.set(C[k]), C.k);
      return;
    }
    if (m.vertexColors || !m.color || !m.isMeshLambertMaterial || m.map) return;
    if (m.emissive && m.emissiveIntensity > 0 && (m.emissive.r + m.emissive.g + m.emissive.b) > 0.01) return;
    if (esVerde(m.color)) tenir(m.color, 'suelo');
  };
  const visita = (o) => {
    if (o.userData && o.userData.sinEstacion) return;
    if (o.isHemisphereLight && !hechos.has(o)) { hechos.add(o); if (AMBIENTE[ESTACION]) o.groundColor.set(AMBIENTE[ESTACION]); }
    else if (o.isDirectionalLight && !hechos.has(o)) { hechos.add(o); const S = SOL[ESTACION]; if (S) { o.color.set(S[0]); o.intensity *= S[1]; } }
    else if (o.isMesh) {
      if (Array.isArray(o.material)) o.material.forEach(pinta); else pinta(o.material);
      // Copias con color propio (copas de los árboles de bolas…)
      if (o.isInstancedMesh && o.instanceColor && !hechos.has(o.instanceColor) && o.material && !o.material.vertexColors) {
        hechos.add(o.instanceColor);
        for (let i = 0; i < o.count; i++) { o.getColorAt(i, tmp); if (esVerde(tmp)) { tenir(tmp, 'hoja', (i * 0.381) % 1); o.setColorAt(i, tmp); } }
        o.instanceColor.needsUpdate = true;
      }
    }
    for (const h of o.children) visita(h);
  };
  visita(escena);
  const N = NIEBLA[ESTACION];
  if (N && escena.fog && !hechos.has(escena.fog)) { hechos.add(escena.fog); escena.fog.color.lerp(tmp.set(N), 0.7); }
  if (N && escena.background && escena.background.isColor && !hechos.has(escena.background)) { hechos.add(escena.background); escena.background.lerp(tmp.set(CIELO[ESTACION].horizonte), 0.7); }
  if (/[?&]sinhojas\b/.test(location.search)) particulas = false;   // para medir en la tele cuánto cuestan
  if (particulas && !escena.userData.caen) escena.userData.caen = crearCaida(THREE, escena, lejos, cantidad);
  return escena.userData.caen || null;
}

/**
 * La silueta de lo que cae, en triángulos (x, y, z): pétalo redondeado, hoja con punta y rabito (algo doblada por
 * el nervio, para que se vea de lado) o copo de seis puntas.
 */
function formaQueCae() {
  const borde = [], tri = [];
  let pliegue = 0;
  if (ESTACION === 3) {
    for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2, r = i % 2 ? 0.02 : 0.055; borde.push([Math.sin(a) * r, Math.cos(a) * r]); }
  } else if (ESTACION === 0) {
    borde.push([0, 0.065], [0.03, 0.045], [0.042, 0.01], [0.03, -0.035], [0, -0.06], [-0.03, -0.035], [-0.042, 0.01], [-0.03, 0.045]);
    pliegue = 0.45;
  } else {
    borde.push([0, 0.09], [0.028, 0.055], [0.046, 0.01], [0.034, -0.035], [0.008, -0.065], [0.006, -0.105], [-0.006, -0.105], [-0.008, -0.065], [-0.034, -0.035], [-0.046, 0.01], [-0.028, 0.055]);
    pliegue = 0.5;
  }
  const z = (p) => Math.abs(p[0]) * pliegue;
  for (let i = 0; i < borde.length; i++) { const a = borde[i], b = borde[(i + 1) % borde.length]; tri.push(0, 0, 0, a[0], a[1], z(a), b[0], b[1], z(b)); }
  return tri;
}

/** Pétalos, hojas o copos que caen dando vueltas alrededor de lo que mira la cámara. Todo en el shader. */
function crearCaida(THREE, escena, lejos, cantidad) {
  const F = CAE[ESTACION], f = lejos / 12;
  const enTele = /JuegosTV\//.test(navigator.userAgent) || !!window.NativePad;
  const n = Math.max(1, Math.round(F.n * cantidad * (enTele ? 0.7 : 1)));
  const geo = new THREE.InstancedBufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(formaQueCae()), 3));
  const semilla = new Float32Array(n * 4), color = new Float32Array(n * 3), c = new THREE.Color();
  for (let i = 0; i < n; i++) {
    semilla.set([Math.random(), Math.random(), Math.random(), Math.random()], i * 4);
    c.set(F.colores[i % F.colores.length]);
    color.set([c.r, c.g, c.b], i * 3);
  }
  geo.setAttribute('aSemilla', new THREE.InstancedBufferAttribute(semilla, 4));
  geo.setAttribute('aColor', new THREE.InstancedBufferAttribute(color, 3));
  geo.instanceCount = n;
  const uT = { value: 0 };
  const mat = new THREE.ShaderMaterial({
    side: THREE.DoubleSide, transparent: true, depthWrite: false,
    uniforms: { uT, uCaja: { value: new THREE.Vector3(26 * f, 12 * f, 22 * f) }, uLejos: { value: lejos }, uCae: { value: F.cae * f }, uTam: { value: F.tam * f }, uViento: { value: 0.4 * VIENTO * f } },
    vertexShader: `
      attribute vec4 aSemilla; attribute vec3 aColor;
      uniform float uT; uniform vec3 uCaja; uniform float uLejos; uniform float uCae; uniform float uTam; uniform float uViento;
      varying vec3 vColor; varying float vLuz; varying float vCerca;
      void main() {
        float ph = aSemilla.w * 6.2832, sp = 0.6 + aSemilla.w * 0.8;
        // hacia dónde mira la cámara (en el mundo): las hojas caen alrededor de ese punto
        vec3 mira = -vec3(viewMatrix[0][2], viewMatrix[1][2], viewMatrix[2][2]);
        vec3 foco = cameraPosition + mira * uLejos;
        foco.y += uCaja.y * 0.2;
        vec3 p = aSemilla.xyz * uCaja;
        p.y -= uCae * sp * uT;
        p.x += uViento * 2.2 * uT + sin(uT * 1.3 + ph) * 0.5;
        p.z += uViento * 0.6 * uT + cos(uT * 1.1 + ph) * 0.4;
        p = mod(p - foco, uCaja) - uCaja * 0.5 + foco;
        // el cuadradito da vueltas sobre sí mismo
        float a = uT * (1.5 + sp * 2.0) + ph, b = uT * (1.0 + sp) + ph * 2.0;
        vec3 q = position * uTam;
        q = vec3(q.x, q.y * cos(a) - q.z * sin(a), q.y * sin(a) + q.z * cos(a));
        q = vec3(q.x * cos(b) - q.y * sin(b), q.x * sin(b) + q.y * cos(b), q.z);
        q = vec3(q.x * cos(ph) + q.z * sin(ph), q.y, -q.x * sin(ph) + q.z * cos(ph));
        vColor = aColor; vLuz = 0.82 + 0.18 * sin(a * 2.0);
        // las que quedan pegadas a la cámara se desvanecen (se verían enormes)
        vec4 mv = viewMatrix * vec4(p + q, 1.0);
        vCerca = smoothstep(uLejos * 0.12, uLejos * 0.3, -mv.z);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      varying vec3 vColor; varying float vLuz; varying float vCerca;
      void main() {
        gl_FragColor = vec4(vColor * vLuz, 0.95 * vCerca);
        #include <colorspace_fragment>
      }`,
  });
  const malla = new THREE.Mesh(geo, mat);
  malla.frustumCulled = false; malla.renderOrder = 5; malla.userData.sinEstacion = true;
  escena.add(malla);
  const t0 = performance.now();
  if (!reloj) reloj = [];
  reloj.push(uT);
  if (reloj.length === 1 && typeof requestAnimationFrame === 'function') {
    const tic = (t) => { for (const u of reloj) u.value = (t - t0) / 1000; requestAnimationFrame(tic); };
    requestAnimationFrame(tic);
  }
  return malla;
}
