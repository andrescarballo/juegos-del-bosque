// El tablero de fiesta lanza los minijuegos con ?fiesta=1. Aquí está lo que comparten:
//   FIESTA                         -> true si este minijuego se juega dentro de una fiesta
//   resultadoFiesta(juego, filas)   -> guarda quién ha quedado cómo. filas: [{ id: perfilId, valor }], más valor = mejor
//   volverAlTablero()               -> vuelve a la página del tablero
//   OPCIONES_FIESTA                 -> botones del panel final de un minijuego
// El estado del tablero vive en sessionStorage, así sobrevive al ir y volver de los minijuegos.
import './almacen.js';

const CLAVE = 'bosque.fiesta';
export const FIESTA = new URLSearchParams(location.search).has('fiesta');

function almacen() { try { return window.sessionStorage; } catch (e) { return null; } }
export function leerFiesta() { try { return JSON.parse(almacen().getItem(CLAVE)) || null; } catch (e) { return null; } }
export function guardarFiesta(f) { try { almacen().setItem(CLAVE, JSON.stringify(f)); } catch (e) { /* sin almacenamiento */ } }
export function borrarFiesta() { try { almacen().removeItem(CLAVE); } catch (e) { /* nada */ } }

/** Puestos con empates: el mismo valor, el mismo puesto. Devuelve [{ id, valor, puesto }] ordenado. */
export function puestosDe(filas) {
  const orden = [...filas].sort((a, b) => b.valor - a.valor);
  let puesto = 0, anterior = null;
  return orden.map((f, k) => {
    if (anterior === null || f.valor !== anterior) { puesto = k + 1; anterior = f.valor; }
    return { ...f, puesto };
  });
}

export function resultadoFiesta(juego, filas) {
  const f = leerFiesta();
  if (!f || f.fase !== 'minijuego' || f.minijuego !== juego) return;
  f.resultado = puestosDe(filas.filter((x) => x.id));
  f.fase = 'premios';
  guardarFiesta(f);
}

export function volverAlTablero() {
  location.replace(new URL('../fiesta/index.html', import.meta.url).href);
}

export const OPCIONES_FIESTA = '<div class="opciones"><span data-tap="A"><span class="boton-a">A</span> Volver al tablero</span></div>';
