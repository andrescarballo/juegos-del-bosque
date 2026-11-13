// La naturaleza del juego, con dos packs CC0 (dominio público: se pueden redistribuir):
//  - KayKit Forest Nature Pack (Kay Lousberg): árboles, rocas, arbustos y hierba, en modelos/kaykit/. Llevan el
//    color en los vértices (sin texturas), así que se tiñen por estación al cargarlos y no cuestan casi nada.
//  - Stylized Nature MegaKit (Quaternius): flores, setas, helecho y trébol, en modelos/natura/ (con textura).
// Se preparan con herramientas/empaquetar_natura.py. Todas las copias de un modelo van en una llamada de dibujo
// (InstancedMesh), que es lo que la tele agradece.
//
//   import { hayNaturaleza, PACK, plantar, ARBOLES } from '../comun/naturaleza.js';
//   const m = plantar('Tree_1_B', [{ x, y, z, alto: 4, giro }]);  escena.add(m);
//
// Si no se pueden cargar (o con ?bolas), hayNaturaleza = false y cada juego usa sus árboles de bolas.
import * as THREE from '../lib/three.min.js';
import { ESTACION, VIENTO, tenir } from './estaciones.js';

// Tree_1: copa redonda · Tree_2: copa de cubos · Tree_3: copa ancha · Tree_4: pino · Tree_Bare: sin hojas
const PELADOS = ESTACION === 3 ? ['Tree_Bare_1_C', 'Tree_Bare_2_B'] : [];   // en invierno, algunos árboles han perdido la hoja
export const ARBOLES = ['Tree_1_B', 'Tree_2_C', 'Tree_3_B', 'Tree_1_A', 'Tree_2_B', 'Tree_3_A', 'Tree_2_D', ...PELADOS];
export const ABETOS = ['Tree_4_B', 'Tree_4_A', 'Tree_4_C', 'Tree_4_B'];
export const ROCAS = ['Rock_1_A', 'Rock_3_A', 'Rock_2_B', 'Rock_1_D', 'Rock_3_E', 'Rock_2_C'];
export const PEDRUSCOS = ['Rock_3_G', 'Rock_1_G', 'Rock_2_D', 'Rock_3_K'];
export const ARBUSTOS = ['Bush_1_C', 'Bush_2_C', 'Bush_3_B', 'Bush_4_C', 'Bush_1_D', 'Fern_1'];
export const HIERBAS = ['Grass_1_B', 'Grass_2_B', 'Grass_1_A'];
export const SETAS = ['Mushroom_Common'];
export const FLORES = ['Flower_3_Group', 'Flower_4_Group', 'Flower_3_Single'];
export const SETITAS = ['Mushroom_Common', 'Clover_1', 'Plant_7_Big'];
const OTROS = ['Tree_1_C', 'Tree_2_A', 'Tree_Bare_1_A', 'Bush_1_F', 'Bush_3_A', 'Grass_1_C'];
const DEL_MEGAKIT = new Set(['Fern_1', 'Plant_7_Big', 'Clover_1', 'Mushroom_Common', 'Flower_3_Group', 'Flower_3_Single', 'Flower_4_Group']);
const TODOS = [...new Set([...ARBOLES, ...ABETOS, ...ROCAS, ...PEDRUSCOS, ...ARBUSTOS, ...HIERBAS, ...SETAS, ...FLORES, ...SETITAS, ...OTROS])];
// Nombres del primer pack que aún usan algunos juegos -> el modelo que hace ahora ese papel
const ALIAS = {
  Tree_Oak_medium_green: 'Tree_1_B', Tree_Oak_small_green: 'Tree_1_A', Tree_Oak_large_green: 'Tree_1_C', Tree_Park_medium_green: 'Tree_3_A',
  Tree_Park_large_green: 'Tree_3_B', Tree_Elm_green: 'Tree_2_C', Tree_Maple_red: 'Tree_2_B', Tree_Simple_medium: 'Tree_1_A',
  Tree_Simple_small: 'Tree_2_A', Tree_Birch_medium_green: 'Tree_2_B', Tree_Birch_small_green: 'Tree_2_A',
  Tree_Spruce_small: 'Tree_4_A', Tree_Spruce_medium: 'Tree_4_B', Tree_Spruce_large: 'Tree_4_C', Tree_Cypress_small: 'Tree_4_A', Tree_Cypress_medium: 'Tree_4_B', Tree_Cypress_large: 'Tree_4_C',
  Boulder_01: 'Rock_3_G', Boulder_02: 'Rock_1_G', Boulder_03: 'Rock_2_D',
  Bush_Clumps_large: 'Bush_1_F', Bush_Clumps_medium: 'Bush_1_D', Grass_large: 'Grass_1_C', Mushroom_Red_large: 'Mushroom_Common',
  Tree_Stump: 'Tree_Bare_1_A', Fallen_Log: 'Bush_3_A',
};

/** nombre -> { geo, mat, alto, radio, copaY, copaR } (medidas del modelo tal cual viene) */
export const PACK = {};

// ---------- Materiales ----------
// Viento: árboles y plantas se mecen un poco (en la GPU, no cuesta nada). Las rocas no se mueven.
const viento = { value: 0 };
if (typeof requestAnimationFrame === 'function') { const tic = (t) => { viento.value = t / 1000; requestAnimationFrame(tic); }; requestAnimationFrame(tic); }
const lin = (hex) => { const c = new THREE.Color(hex); return `vec3(${c.r.toFixed(4)}, ${c.g.toFixed(4)}, ${c.b.toFixed(4)})`; };
/** amp: cuánto se mece con el viento (0 = nada) · mezcla: [color, cuánto], para nevar o amarillear lo que lleva textura */
function conViento(m, nombre, amp, mezcla = null) {
  m.onBeforeCompile = (sh) => {
    if (amp) {
      sh.uniforms.uViento = viento;
      sh.vertexShader = 'uniform float uViento;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      #ifdef USE_INSTANCING
        vec2 base = instanceMatrix[3].xz;
      #else
        vec2 base = modelMatrix[3].xz;
      #endif
      float fase = uViento * 1.6 + base.x * 0.35 + base.y * 0.27;
      float h = max(transformed.y, 0.0);
      transformed.x += (sin(fase) * 0.7 + sin(fase * 2.3 + 1.0) * 0.3) * ${(amp * VIENTO).toFixed(4)} * h;
      transformed.z += cos(fase * 0.8) * ${(amp * 0.6 * VIENTO).toFixed(4)} * h;`);
    }
    if (mezcla) sh.fragmentShader = sh.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>\n  diffuseColor.rgb = mix(diffuseColor.rgb, ${lin(mezcla[0])}, ${mezcla[1].toFixed(3)});`);
  };
  m.customProgramCacheKey = () => 'natura-' + nombre;
  return m;
}
// KayKit: el color va en los vértices, tres materiales para todo
export const MATERIAL = conViento(new THREE.MeshLambertMaterial({ vertexColors: true }), 'arbol', 0.022);          // árboles
export const MATERIAL_BLANDO = conViento(new THREE.MeshLambertMaterial({ vertexColors: true }), 'blando', 0.1);    // hierba y matorrales
export const MATERIAL_QUIETO = new THREE.MeshLambertMaterial({ vertexColors: true });                              // rocas
// MegaKit: un material por textura
const NIEVE = '#eef3f8', PAJA = '#c2a548';
const CON_TEXTURA = {};   // nombre del material en el modelo -> THREE.Material
async function crearMateriales() {
  const cargador = new THREE.TextureLoader();
  const tex = async (archivo) => { const t = await cargador.loadAsync(new URL(`../modelos/natura/tex/${archivo}`, import.meta.url).href); t.colorSpace = THREE.SRGBColorSpace; t.flipY = false; return t; };
  const [plantas, flores, setas] = await Promise.all([tex('Leaves.png'), tex('Flowers.png'), tex('Mushrooms.jpg')]);
  const E = ESTACION, recorte = { side: THREE.DoubleSide, alphaTest: 0.4 };
  CON_TEXTURA.Leaves = conViento(new THREE.MeshLambertMaterial({ map: plantas, ...recorte }), 'plantas', 0.09, E === 3 ? [NIEVE, 0.6] : E === 2 ? [PAJA, 0.35] : null);
  CON_TEXTURA.Flowers = conViento(new THREE.MeshLambertMaterial({ map: flores, ...recorte }), 'flores', 0.09);
  CON_TEXTURA.Mushrooms = new THREE.MeshLambertMaterial({ map: setas });
}
/** El material (o la lista de materiales, uno por grupo de la geometría) de un modelo. */
export function materialDe(n) { return PACK[n].mat; }

// Estaciones: lo verde de cada modelo de KayKit cambia de color; se hace una vez, al cargar, vértice a vértice.
const _c = new THREE.Color(), _hsl = { h: 0, s: 0, l: 0 }, BLANCO = new THREE.Color('#e8eef4');
const variante = (s) => { let h = 7; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return (h % 1000) / 1000; };
function tenirGeometria(geo, n) {
  const col = geo.attributes.color;
  if (!col || ESTACION === 1) return;
  const tipo = /^Grass/.test(n) ? 'hierba' : /^Tree_4/.test(n) ? 'conifera' : 'hoja', v = variante(n), florece = /^Tree_3/.test(n);
  for (let i = 0; i < col.count; i++) {
    _c.fromBufferAttribute(col, i).getHSL(_hsl);
    const verde = _hsl.h > 0.16 && _hsl.h < 0.47 && _hsl.s > 0.18;
    if (verde) tenir(_c, tipo, v, florece);
    else if (ESTACION === 3 && /^Rock/.test(n)) _c.lerp(BLANCO, 0.3);   // rocas con algo de nieve
    else continue;
    col.setXYZ(i, _c.r, _c.g, _c.b);
  }
}
/** Las flores solo salen en primavera y verano. */
const fueraDeTemporada = (n) => ESTACION >= 2 && /^Flower_/.test(n);

async function cargar() {
  const [{ GLTFLoader }, { mergeGeometries }] = await Promise.all([import('../lib/addons/GLTFLoader.js'), import('../lib/addons/BufferGeometryUtils.js')]);
  await crearMateriales();
  const loader = new GLTFLoader();
  await Promise.all(TODOS.map(async (n) => {
    const mega = DEL_MEGAKIT.has(n);
    const gltf = await loader.loadAsync(new URL(`../modelos/${mega ? 'natura' : 'kaykit'}/${n}.glb`, import.meta.url).href);
    gltf.scene.updateMatrixWorld(true);
    const partes = [], mats = [];
    gltf.scene.traverse((o) => {
      if (!o.isMesh) return;
      const g = o.geometry.clone();
      g.applyMatrix4(o.matrixWorld);
      const quedan = mega ? ['position', 'normal', 'uv'] : ['position', 'normal', 'color'];
      for (const k of Object.keys(g.attributes)) if (!quedan.includes(k)) g.deleteAttribute(k);
      if (!g.attributes.normal) g.computeVertexNormals();
      partes.push(g);
      mats.push(mega ? CON_TEXTURA[o.material.name] || CON_TEXTURA.Leaves : /^Rock/.test(n) ? MATERIAL_QUIETO : /^(Grass|Bush)/.test(n) ? MATERIAL_BLANDO : MATERIAL);
    });
    const unMaterial = mats.every((m) => m === mats[0]);
    const geo = partes.length === 1 ? partes[0] : mergeGeometries(partes, !unMaterial);
    if (partes.length > 1) for (const p of partes) p.dispose();
    geo.computeBoundingBox();
    const b = geo.boundingBox;
    // Que el modelo se apoye en el suelo (y = 0) y esté centrado
    geo.translate(-(b.min.x + b.max.x) / 2, -b.min.y, -(b.min.z + b.max.z) / 2);
    geo.computeBoundingBox(); geo.computeBoundingSphere();
    tenirGeometria(geo, n);
    const t = geo.boundingBox.getSize(new THREE.Vector3());
    PACK[n] = { geo, mat: unMaterial ? mats[0] : mats, alto: t.y, radio: Math.max(t.x, t.z) / 2, copaY: t.y * 0.66, copaR: Math.max(t.x, t.z) * 0.45 };
  }));
  for (const viejo in ALIAS) PACK[viejo] = PACK[ALIAS[viejo]];
}

let hay = !/[?&]bolas\b/.test(location.search);
if (hay) { try { await cargar(); } catch (e) { console.warn('No se pudo cargar el pack de naturaleza; uso los árboles de bolas.', e); hay = false; } }
export const hayNaturaleza = hay;

const dummy = new THREE.Object3D();
/**
 * Una InstancedMesh con todas las copias de un modelo.
 * lista: [{ x, y, z, alto (o escala s), giro }] — alto = la altura que tendrá en el mundo.
 */
export function plantar(nombre, lista, { capacidad = lista.length } = {}) {
  const P = PACK[nombre];
  const m = new THREE.InstancedMesh(P.geo, P.mat, Math.max(1, capacidad));
  m.count = lista.length;
  lista.forEach((o, k) => {
    const s = o.s ?? (o.alto ? o.alto / P.alto : 1);
    dummy.position.set(o.x, o.y || 0, o.z); dummy.rotation.set(0, o.giro || 0, 0); dummy.scale.setScalar(s); dummy.updateMatrix();
    m.setMatrixAt(k, dummy.matrix);
  });
  m.instanceMatrix.needsUpdate = true;
  m.computeBoundingSphere();
  return m;
}

/** Elige un modelo de una lista con un número aleatorio (0..1). */
export const unoDe = (lista, r) => lista[Math.min(lista.length - 1, Math.floor(r * lista.length))];

/** En la tele, algo menos de adorno (la GPU del Chromecast es modesta). */
export const DENSIDAD = new URLSearchParams(location.search).has('adorno') ? parseFloat(new URLSearchParams(location.search).get('adorno')) : (/JuegosTV\//.test(navigator.userAgent) || window.NativePad ? 0.7 : 1);
// Recetas de adorno: [modelos, cuántos, alto mínimo, alto máximo]
export const RECETA_PRADO = [
  [HIERBAS, 260, 0.3, 0.6], [ARBUSTOS, 40, 0.7, 1.3], [FLORES, 26, 0.4, 0.7], [SETITAS, 30, 0.25, 0.5],
  [ROCAS, 26, 0.25, 0.6], [['Fern_1', 'Bush_3_A'], 8, 0.5, 0.9],
];
/**
 * Llena una zona de plantitas, flores, setas y piedrecitas (sin colisión).
 * sitio(azar) devuelve { x, y, z } o null si ese punto no vale. Devuelve las mallas (ya añadidas a la escena).
 */
export function adornar(escena, azar, sitio, receta = RECETA_PRADO, factor = 1) {
  const g = {};
  for (const [nombres, n, a0, a1] of receta) {
    const cuantos = Math.round(n * factor * DENSIDAD);
    for (let k = 0, i = 0; k < cuantos && i < cuantos * 5; i++) {
      const p = sitio(azar);
      if (!p) continue;
      const nom = unoDe(nombres, azar());
      if (fueraDeTemporada(nom)) { k++; continue; }
      (g[nom] = g[nom] || []).push({ x: p.x, y: (p.y || 0) - 0.03, z: p.z, alto: a0 + azar() * (a1 - a0), giro: azar() * 6.3 });
      k++;
    }
  }
  const mallas = [];
  for (const nom in g) { const m = plantar(nom, g[nom]); escena.add(m); mallas.push(m); }
  return mallas;
}
