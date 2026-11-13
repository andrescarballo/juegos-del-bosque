// Lo que el juego guarda en el navegador (perfiles, récords, ajustes) lleva el prefijo "bosque.".
// Las versiones anteriores usaban otro prefijo: la primera vez se pasa todo al nuevo, para no perder nada.
// Este módulo no exporta nada; lo importan los que leen el almacén nada más cargarse, y así se ejecuta antes.
for (const nombre of ['localStorage', 'sessionStorage']) {
  try {
    const a = window[nombre];
    if (a.getItem('bosque.migrado')) continue;
    const viejas = [];
    for (let i = 0; i < a.length; i++) { const k = a.key(i); if (/^juegos[a-z]+\./.test(k)) viejas.push(k); }
    for (const k of viejas) {
      const nueva = 'bosque.' + k.slice(k.indexOf('.') + 1);
      if (a.getItem(nueva) === null) a.setItem(nueva, a.getItem(k));
      a.removeItem(k);
    }
    a.setItem('bosque.migrado', '1');
  } catch (e) { /* sin almacén (modo privado, visor…): nada que migrar */ }
}
