// Perfiles de jugador (nombre, personaje, colores, accesorio) y la partida en curso.
// Se guardan en el navegador de la tele (localStorage), así valen para todos los juegos.
import './almacen.js';

const CLAVE = 'bosque.perfiles';
const CLAVE_ULTIMOS = 'bosque.ultimos';   // qué perfil usó cada mando la última vez
const CLAVE_PARTIDA = 'bosque.partida';   // quién juega ahora (sessionStorage)

export const ANIMALES = [
  // escala = tamaño visual. El alcance en los juegos es el mismo para todos.
  { id: 'oveja', nombre: 'Oveja', color: '#fffaf2', escala: 1 },
  { id: 'zorro', nombre: 'Zorro', color: '#ff8a3d', escala: 0.95 },
  { id: 'conejo', nombre: 'Conejo', color: '#f3ede6', escala: 0.85 },
  { id: 'cervatillo', nombre: 'Cervatillo', color: '#d08b55', escala: 1 },
  { id: 'jabali', nombre: 'Jabalí', color: '#8a6047', escala: 1 },
  { id: 'ardilla', nombre: 'Ardilla', color: '#d4773a', escala: 0.82 },
  { id: 'erizo', nombre: 'Erizo', color: '#8b6a55', escala: 0.8 },
  { id: 'buho', nombre: 'Búho', color: '#9b7a5e', escala: 0.88 },
  { id: 'oso', nombre: 'Oso', color: '#8b5a3c', escala: 1.15 },
];

// "natural" = el color típico de cada animal
export const COLORES_PELO = [
  { id: 'natural', nombre: 'Natural' },
  { id: '#ffc2dd', nombre: 'Rosa' },
  { id: '#d9c6ff', nombre: 'Lila' },
  { id: '#b9f2d6', nombre: 'Menta' },
  { id: '#fff0a0', nombre: 'Amarillo' },
  { id: '#bfe6ff', nombre: 'Celeste' },
  { id: '#ffd2b0', nombre: 'Melocotón' },
  { id: '#c9c4d4', nombre: 'Gris' },
  { id: '#5a4d63', nombre: 'Oscuro' },
  { id: 'arcoiris', nombre: 'Arcoíris' },
];

export const ACCESORIOS = [
  { id: 'nada', nombre: 'Nada' },
  { id: 'corona', nombre: 'Corona' },
  { id: 'lazo', nombre: 'Lazo' },
  { id: 'gorro', nombre: 'Gorro de lana' },
  { id: 'gafas', nombre: 'Gafas de sol' },
  { id: 'flor', nombre: 'Flor' },
  { id: 'copa', nombre: 'Sombrero de copa' },
  { id: 'bufanda', nombre: 'Bufanda' },
];

// Color de cada jugador: nombre en pantalla, accesorio, marcador
export const COLORES_JUGADOR = [
  { id: '#ff4d6d', nombre: 'Rojo' },
  { id: '#2fb4ff', nombre: 'Azul' },
  { id: '#3dbb4c', nombre: 'Verde' },
  { id: '#ffb21a', nombre: 'Naranja' },
  { id: '#7b5cff', nombre: 'Morado' },
  { id: '#ff5fb4', nombre: 'Rosa' },
  { id: '#1fc8b0', nombre: 'Turquesa' },
  { id: '#e6c200', nombre: 'Amarillo' },
];

// En algunos visores el simple acceso a localStorage lanza error: siempre con red de seguridad.
const L = 'local', S = 'session';
function almacen(t) { try { return t === L ? window.localStorage : window.sessionStorage; } catch (e) { return null; } }
function leerJSON(t, clave, def) {
  try { const v = JSON.parse(almacen(t).getItem(clave)); return v == null ? def : v; } catch (e) { return def; }
}
function guardarJSON(t, clave, v) {
  try { almacen(t).setItem(clave, JSON.stringify(v)); } catch (e) { /* sin almacenamiento */ }
}

export function leerPerfiles() { return leerJSON(L, CLAVE, []); }
export function perfilPorId(id) { return leerPerfiles().find((p) => p.id === id) || null; }

export function guardarPerfil(perfil) {
  const lista = leerPerfiles();
  const i = lista.findIndex((p) => p.id === perfil.id);
  if (i >= 0) lista[i] = perfil; else lista.push(perfil);
  guardarJSON(L, CLAVE, lista);
  return lista;
}

export function nuevoPerfil(n = 0) {
  return {
    id: 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    nombre: '',
    animal: ANIMALES[n % ANIMALES.length].id,
    pelo: 'natural',
    accesorio: 'nada',
    color: COLORES_JUGADOR[n % COLORES_JUGADOR.length].id,
    records: {},
  };
}

export function recordDe(perfilId, juego) {
  const p = perfilPorId(perfilId);
  return (p && p.records && p.records[juego]) || 0;
}
export function ponerRecord(perfilId, juego, valor) {
  const p = perfilPorId(perfilId);
  if (!p) return;
  p.records = p.records || {};
  p.records[juego] = valor;
  guardarPerfil(p);
}

/** Récord de un grupo concreto de jugadores ("juntos"). */
export function recordEquipo(juego, ids) {
  return leerJSON(L, `bosque.${juego}.equipo.${[...ids].sort().join('+')}`, 0);
}
export function ponerRecordEquipo(juego, ids, valor) {
  guardarJSON(L, `bosque.${juego}.equipo.${[...ids].sort().join('+')}`, valor);
}

export function ultimoPerfilDe(dispositivoId) { return leerJSON(L, CLAVE_ULTIMOS, {})[dispositivoId] || null; }

/** jugadores: [{ perfil: id, dispositivo: id }] */
export const partida = {
  guardar(juego, jugadores) {
    guardarJSON(S, CLAVE_PARTIDA, { juego, jugadores });
    const ult = leerJSON(L, CLAVE_ULTIMOS, {});
    for (const j of jugadores) ult[j.dispositivo] = j.perfil;
    guardarJSON(L, CLAVE_ULTIMOS, ult);
  },
  leer() { return leerJSON(S, CLAVE_PARTIDA, null); },
};
