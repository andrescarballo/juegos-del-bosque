// Utilidades comunes: escenario 1920x1080 escalado, volver al menú, récords y caché sin internet.
import './almacen.js';

export const enTele = /JuegosTV\//.test(navigator.userAgent) || !!window.NativePad;
export const params = new URLSearchParams(location.search);
// ?foto: solo el juego, sin marcadores ni letreros (para hacer las carátulas del menú con capturas de verdad)
if (params.has('foto')) { const st = document.createElement('style'); st.textContent = 'body > *:not(canvas) { visibility: hidden !important; }'; document.head.appendChild(st); }

/** Escala un div de 1920x1080 para que encaje en cualquier pantalla (tele, PC, móvil). */
export function escenario(el) {
  const ajustar = () => {
    const s = Math.min(innerWidth / 1920, innerHeight / 1080);
    el.style.transform = `translate(-50%, -50%) scale(${s})`;
  };
  addEventListener('resize', ajustar);
  ajustar();
}

/** Vuelve al menú sin ir acumulando historial. */
export function volverAlMenu() {
  // Dentro de una fiesta, "salir" de un minijuego es volver al tablero
  if (params.has('fiesta')) { location.replace(new URL('../fiesta/index.html', import.meta.url).href); return; }
  const menu = new URL('../index.html', import.meta.url).href;
  if (history.length > 1 && document.referrer.startsWith(new URL('../', import.meta.url).href)) history.back();
  else location.replace(menu);
}

/** El botón "atrás" del mando de la tele llama a esto. Devuelve true si la página lo gestiona. */
export function alPulsarAtras(fn) {
  window.onTvBack = () => { try { return !!fn(); } catch (e) { return false; } };
}

/** Vibra los móviles que se usan como mando. Con `dispositivo`, solo ese (p. ej. "m2"). */
export function vibrar(ms, dispositivo) {
  try {
    const np = window.NativePad || window.MandoWeb;
    if (!np) return;
    if (dispositivo) { if (np.vibrarDisp && dispositivo[0] === 'm') np.vibrarDisp(dispositivo, ms); return; }
    if (np.vibrar) np.vibrar(ms);
  } catch (e) { /* nada */ }
}

export const records = {
  leer(juego) { try { return parseInt(localStorage.getItem(`bosque.${juego}.record`) || '0', 10) || 0; } catch (e) { return 0; } },
  guardar(juego, v) { try { localStorage.setItem(`bosque.${juego}.record`, String(v)); } catch (e) { /* nada */ } },
};

// Sin internet: en GitHub Pages guardamos todo en caché con un service worker.
// Dentro de la app no hace falta (los juegos ya van dentro de la APK).
try {
  if ('serviceWorker' in navigator && location.protocol === 'https:' && location.hostname.endsWith('github.io')) {
    navigator.serviceWorker.register(new URL('../sw.js', import.meta.url)).catch(() => {});
  }
} catch (e) { /* sin caché, sin drama */ }
