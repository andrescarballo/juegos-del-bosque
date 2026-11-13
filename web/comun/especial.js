// Botón Y = el movimiento especial de cada animal (salto de caza, pirueta, rebote, brincos, embestida, bola, vuelo, roer, rugido).
// Cada uno sirve para una cosa (ver PODER en personajes.js) y tarda un poco en recargarse; los juegos también lo lanzan
// solos para celebrar. Cada especial tiene su sonido.
//   especialConY([{ dispositivo, pj }, ...])   -> llamar una vez por fotograma mientras se juega
import { pad, entradas } from './pad.js';
import { especial, nombreEspecial, poder, textoPoder, tipoEspecial } from './personajes.js';
import { suena } from './sonido.js';

export { especial, nombreEspecial, poder, textoPoder };

export function especialConY(lista) {
  for (const j of lista) {
    if (!j || !j.pj) continue;
    const d = j.dispositivo ? entradas.get(j.dispositivo) : pad;
    if (d && d.pressed('Y') && especial(j.pj)) suena('esp_' + tipoEspecial(j.pj.perfil && j.pj.perfil.animal));
  }
}

/** Texto para la ayuda de cada juego. */
export const AYUDA_Y = '<span class="boton-a" style="background:#ffc531">Y</span> especial';
