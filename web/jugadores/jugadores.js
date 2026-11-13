// ¿Quién juega? — cada mando o móvil se une con A, elige su personaje (o crea uno) y se pone "listo".
import * as THREE from '../lib/three.min.js';
import { pad, entradas } from '../comun/pad.js';
import { suena } from '../comun/sonido.js';
import { escenario, volverAlMenu, alPulsarAtras, enTele } from '../comun/tv.js';
import { ANIMALES, COLORES_PELO, ACCESORIOS, COLORES_JUGADOR, leerPerfiles, guardarPerfil, nuevoPerfil, ultimoPerfilDe, partida } from '../comun/perfiles.js';
import { crearPersonaje, animarPersonaje, colorBase, especial, nombreEspecial } from '../comun/personajes.js';

const $ = (id) => document.getElementById(id);
escenario($('esc'));
const JUEGO = location.hash.slice(1) || 'globo';
const MAX = 4;
const COLOR_HUECO = ['#ff4d6d', '#2fb4ff', '#3dbb4c', '#ffb21a'];
const A = '<span class="boton-a">A</span>', B = '<span class="boton-a boton-b">B</span>';
const Y = '<span class="boton-a" style="background:#ffc531">Y</span>', MENU = '<span class="boton-a boton-start">Menú</span>';

alPulsarAtras(() => { volverAlMenu(); return true; });

const FILAS = [
  { id: 'nombre', t: 'Nombre' },
  { id: 'animal', t: 'Animal', ops: ANIMALES },
  { id: 'pelo', t: 'Color', ops: COLORES_PELO },
  { id: 'accesorio', t: 'Accesorio', ops: ACCESORIOS },
  { id: 'color', t: 'Tu color', ops: COLORES_JUGADOR },
  { id: 'guardar', t: '¡Guardar!' },
];
const TECLAS = [
  ['A', 'B', 'C', 'D', 'E', 'F', 'G'],
  ['H', 'I', 'J', 'K', 'L', 'M', 'N'],
  ['Ñ', 'O', 'P', 'Q', 'R', 'S', 'T'],
  ['U', 'V', 'W', 'X', 'Y', 'Z', ' '],
  ['⌫', 'OK'],
];

let perfiles = leerPerfiles();
const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const nombreAnimal = (id) => (ANIMALES.find((a) => a.id === id) || ANIMALES[0]).nombre;

// ---------- Huecos ----------
const huecos = Array.from({ length: MAX }, (_, i) => ({
  i, disp: null, fase: 'vacio', selId: 'nuevo', edit: null, perfil: null, fila: 0, tk: { r: 0, c: 0 },
  pj: null, pjKey: '', giro: Math.random() * 6, el: null, vista: null, escena: null, cam: null, plataforma: null,
}));

for (const h of huecos) {
  const el = document.createElement('div');
  el.className = 'hueco';
  el.innerHTML = `<div class="cab"><span class="num">Jugador ${h.i + 1}</span><span class="disp"></span></div>
    <div class="vista"></div><div class="nombre"></div><div class="sub"></div><div class="cuerpo"></div>`;
  $('huecos').appendChild(el);
  h.el = el;
  h.vista = el.querySelector('.vista');
  const e = new THREE.Scene();
  e.add(new THREE.HemisphereLight('#e8f6ff', '#c7b8e8', 2.0));
  const sol = new THREE.DirectionalLight('#fff0dc', 2.0); sol.position.set(-3, 6, 5); e.add(sol);
  h.plataforma = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 1.0, 0.14, 40), new THREE.MeshLambertMaterial({ color: COLOR_HUECO[h.i] }));
  h.plataforma.position.y = -0.07;
  e.add(h.plataforma);
  h.escena = e;
  h.cam = new THREE.PerspectiveCamera(30, 430 / 290, 0.1, 50);
  h.cam.position.set(0, 1.5, 5.2);
  h.cam.lookAt(0, 0.78, 0);
}

function items() { return [...perfiles, { id: 'nuevo', nuevo: true }]; }
function ocupado(id, salvo) { return huecos.some((h) => h !== salvo && h.fase === 'listo' && h.perfil && h.perfil.id === id); }
function actual(h) {
  if (h.fase === 'edita' || h.fase === 'teclado') return h.edit;
  if (h.fase === 'listo') return h.perfil;
  if (h.fase === 'elige') return perfiles.find((p) => p.id === h.selId) || null;
  return null;
}
function colorLibre(h) {
  const usados = new Set(huecos.filter((x) => x !== h && actual(x)).map((x) => actual(x).color));
  return (COLORES_JUGADOR.find((c) => !usados.has(c.id)) || COLORES_JUGADOR[h.i]).id;
}

function iconoDisp(d) {
  if (!d) return '';
  if (d.tipo === 'movil') return '📱 ' + esc(d.etiqueta);
  if (d.tipo === 'teclado') return '⌨️ Teclado';
  if (d.tipo === 'tactil') return '👆 Pantalla';
  return '🎮 ' + esc(d.etiqueta);
}
const pistas = (l) => `<div class="pistas">${l.join('<br>')}</div>`;
const acc = (a, html) => `<span data-accion="${a}">${html}</span>`;

function valorFila(h, f) {
  const p = h.edit;
  if (f.id === 'nombre') return esc(p.nombre || '—');
  if (f.id === 'guardar') return '';
  const op = f.ops.find((o) => o.id === p[f.id]) || f.ops[0];
  if (f.id === 'pelo') {
    const c = op.id === 'arcoiris' ? 'linear-gradient(90deg,#ff5d73,#ffd93d,#6bd968,#4cc3ff,#c17bff)' : colorBase({ ...p, pelo: op.id });
    return `◀ <span class="muestra" style="background:${c}"></span> ${op.nombre} ▶`;
  }
  if (f.id === 'color') return `◀ <span class="muestra" style="background:${op.id}"></span> ${op.nombre} ▶`;
  return `◀ ${op.nombre} ▶`;
}

function pintar(h) {
  const el = h.el, d = h.disp ? entradas.get(h.disp) : null, p = actual(h);
  el.style.setProperty('--c', p ? p.color : COLOR_HUECO[h.i]);
  el.classList.toggle('activo', h.fase !== 'vacio');
  el.classList.toggle('listo', h.fase === 'listo');
  el.classList.toggle('editando', h.fase === 'edita' || h.fase === 'teclado');
  el.querySelector('.disp').innerHTML = iconoDisp(d);
  const nombre = el.querySelector('.nombre'), sub = el.querySelector('.sub'), cuerpo = el.querySelector('.cuerpo');
  h.vista.innerHTML = '';
  if (h.fase === 'vacio') {
    h.vista.innerHTML = '<div class="vacio-ico">+</div>';
    nombre.textContent = ''; sub.textContent = '';
    cuerpo.innerHTML = `<div class="pulsa">Pulsa ${A}<br>para unirte</div>`;
  } else if (h.fase === 'elige') {
    if (h.selId === 'nuevo') {
      h.vista.innerHTML = '<div class="vacio-ico">+</div>';
      nombre.innerHTML = '<span class="flecha" data-accion="izq">◀</span>Nuevo<span class="flecha" data-accion="der">▶</span>';
      sub.textContent = 'Crea tu personaje';
      cuerpo.innerHTML = pistas([acc('elegir', `${A} Crear`), acc('salir', `${B} Salir`)]);
    } else {
      const tomado = ocupado(h.selId, h);
      nombre.innerHTML = `<span class="flecha" data-accion="izq">◀</span>${esc(p.nombre)}<span class="flecha" data-accion="der">▶</span>`;
      sub.innerHTML = tomado ? '<span class="ocupado">Ya está jugando</span>' : `${nombreAnimal(p.animal)} · <small>${nombreEspecial(p.animal)}</small>`;
      cuerpo.innerHTML = pistas([acc('elegir', `${A} ¡Este soy yo!`), acc('editar', `${Y} Cambiar el personaje`), acc('salir', `${B} Salir`)]);
    }
  } else if (h.fase === 'edita') {
    nombre.textContent = h.edit.nombre || 'Sin nombre';
    sub.innerHTML = `${nombreAnimal(h.edit.animal)} · <small>${nombreEspecial(h.edit.animal)}</small>`;
    cuerpo.innerHTML = `<div class="filas">${FILAS.map((f, i) =>
      `<div class="fila ${i === h.fila ? 'sel' : ''} ${f.id === 'guardar' ? 'guardar' : ''}" data-i="${i}">${f.id === 'guardar' ? `<b>${f.t}</b>` : `<span>${f.t}</span><b>${valorFila(h, f)}</b>`}</div>`).join('')}</div>`
      + pistas([acc('cancelar', `${B} Cancelar`)]);
  } else if (h.fase === 'teclado') {
    nombre.textContent = ''; sub.textContent = '¿Cómo te llamas?';
    const tecla = (t, r, c, cls = '') => {
      const sel = h.tk.r === r && h.tk.c === c ? 'sel' : '';
      const txt = t === ' ' ? '<span class="espacio"></span>' : t === '⌫' ? 'Borrar' : t === 'OK' ? '¡Hecho!' : t;
      return `<div class="tecla ${cls} ${sel}" data-r="${r}" data-c="${c}">${txt}</div>`;
    };
    let teclas = '';
    TECLAS.forEach((fila, r) => fila.forEach((t, c) => { teclas += tecla(t, r, c, r === 4 ? (c === 0 ? 'ancha3' : 'ancha4') : ''); }));
    cuerpo.innerHTML = `<div class="campo">${esc(h.edit.nombre)}<i></i></div><div class="teclado">${teclas}</div>`
      + pistas([`${A} letra · ${acc('borrar', `${B} borrar`)} · ${acc('hecho', `${MENU} hecho`)}`]);
  } else if (h.fase === 'listo') {
    nombre.textContent = p.nombre;
    sub.textContent = nombreAnimal(p.animal);
    cuerpo.innerHTML = `<div class="listo-badge" data-accion="jugar">¡Listo!</div>` + pistas([acc('cambiar', `${B} Cambiar`)]);
  }
}
const pintarTodos = () => huecos.forEach(pintar);

// ---------- Acciones ----------
function unir(d) {
  const h = huecos.find((x) => x.fase === 'vacio');
  if (!h) { suena('no'); return; }
  h.disp = d.id;
  const ult = ultimoPerfilDe(d.id);
  if (ult && perfiles.some((p) => p.id === ult) && !ocupado(ult)) h.selId = ult;
  else h.selId = (perfiles.find((p) => !ocupado(p.id)) || { id: 'nuevo' }).id;
  h.fase = 'elige';
  suena('elegir');
  pintarTodos();
}

function unirDisp(id) {
  if (huecos.some((x) => x.disp === id)) return;
  unir(entradas.get(id) || { id });
}

function salir(h) { h.disp = null; h.fase = 'vacio'; h.edit = null; h.perfil = null; suena('no'); pintarTodos(); }

function moverSeleccion(h, delta) {
  const l = items();
  const i = Math.max(0, l.findIndex((x) => x.id === h.selId));
  h.selId = l[(i + delta + l.length) % l.length].id;
  suena('mover');
  pintar(h);
}

function crear(h) {
  h.edit = nuevoPerfil(perfiles.length + h.i);
  h.edit.color = colorLibre(h);
  h.fase = 'teclado';
  h.tk = { r: 0, c: 0 };
  h.fila = 1;
  suena('elegir');
  pintar(h);
}

function elegir(h) {
  if (h.selId === 'nuevo') { crear(h); return; }
  if (ocupado(h.selId, h)) { suena('no'); return; }
  h.perfil = perfiles.find((p) => p.id === h.selId);
  h.fase = 'listo';
  if (h.pj) especial(h.pj);   // ¡listo! y lo celebra con su movimiento especial
  suena('elegir');
  pintarTodos();
}

function editar(h) {
  if (h.selId === 'nuevo') { crear(h); return; }
  h.edit = JSON.parse(JSON.stringify(perfiles.find((p) => p.id === h.selId)));
  h.fase = 'edita';
  h.fila = 1;
  suena('elegir');
  pintar(h);
}

function cambiarOpcion(h, delta) {
  const f = FILAS[h.fila];
  if (!f.ops) return;
  const i = Math.max(0, f.ops.findIndex((o) => o.id === h.edit[f.id]));
  h.edit[f.id] = f.ops[(i + delta + f.ops.length) % f.ops.length].id;
  suena('mover');
  pintar(h);
}

function guardar(h) {
  if (!h.edit.nombre.trim()) { h.fase = 'teclado'; suena('no'); pintar(h); return; }
  h.edit.nombre = h.edit.nombre.trim();
  perfiles = guardarPerfil(h.edit);
  h.selId = h.edit.id;
  h.perfil = perfiles.find((p) => p.id === h.edit.id);
  h.edit = null;
  h.fase = ocupado(h.perfil.id, h) ? 'elige' : 'listo';
  suena(h.fase === 'listo' ? 'fanfarria' : 'no');
  pintarTodos();
}

// Teclado en pantalla
function añadir(h, ch) {
  const n = h.edit.nombre;
  if (n.length >= 12) { suena('no'); return; }
  if (ch === ' ') { if (!n || n.endsWith(' ')) return; h.edit.nombre = n + ' '; }
  else h.edit.nombre = n + (!n || n.endsWith(' ') ? ch.toUpperCase() : ch.toLowerCase());
  suena('mover');
}
function borrar(h) {
  if (!h.edit.nombre) { h.fase = 'edita'; h.fila = 0; pintar(h); return; }
  h.edit.nombre = h.edit.nombre.slice(0, -1);
  suena('mover');
}
function terminarNombre(h) {
  h.edit.nombre = h.edit.nombre.trim();
  if (!h.edit.nombre) { suena('no'); return; }
  h.fase = 'edita';
  suena('elegir');
  pintar(h);
}
function pulsarTecla(h) {
  const t = TECLAS[h.tk.r][h.tk.c];
  if (t === '⌫') borrar(h);
  else if (t === 'OK') { terminarNombre(h); return; }
  else añadir(h, t);
  pintar(h);
}
function moverTecla(h, dir) {
  let { r, c } = h.tk;
  if (dir === 'left' || dir === 'right') {
    if (r === 4) c = c === 0 ? 1 : 0;
    else c = (c + (dir === 'left' ? 6 : 1)) % 7;
  } else if (dir === 'down') {
    if (r === 3) { r = 4; c = c < 3 ? 0 : 1; } else if (r === 4) { r = 0; c = c === 0 ? 1 : 5; } else r++;
  } else if (dir === 'up') {
    if (r === 0) { r = 4; c = c < 3 ? 0 : 1; } else if (r === 4) { r = 3; c = c === 0 ? 1 : 5; } else r--;
  }
  h.tk = { r, c };
}

// Con el teclado del PC se escribe directamente
pad.capturaTexto = (e) => {
  const h = huecos.find((x) => x.fase === 'teclado' && x.disp === 'teclado');
  if (!h) return false;
  if (e.key && e.key.length === 1 && /[a-zñáéíóúü ]/i.test(e.key)) { añadir(h, e.key); pintar(h); return true; }
  if (e.key === 'Backspace') { borrar(h); pintar(h); return true; }
  if (e.key === 'Enter') { terminarNombre(h); return true; }
  return false;
};

function todosListos() {
  const unidos = huecos.filter((h) => h.fase !== 'vacio');
  return unidos.length > 0 && unidos.every((h) => h.fase === 'listo');
}

let empezando = false;
function empezar() {
  if (empezando) return;
  empezando = true;
  const jugadores = huecos.filter((h) => h.fase === 'listo').map((h) => ({ perfil: h.perfil.id, dispositivo: h.disp }));
  partida.guardar(JUEGO, jugadores);
  suena('fanfarria');
  setTimeout(() => { location.href = `../${JUEGO}/index.html`; }, 450);
}

function procesar(h, d, now) {
  const dir = d.nav(now);
  switch (h.fase) {
    case 'elige':
      if (dir === 'left' || dir === 'right') moverSeleccion(h, dir === 'left' ? -1 : 1);
      else if (d.pressed('A')) elegir(h);
      else if (d.pressed('Y') || d.pressed('X')) editar(h);
      else if (d.pressed('B')) salir(h);
      break;
    case 'edita':
      if (dir === 'up' || dir === 'down') { h.fila = (h.fila + (dir === 'up' ? FILAS.length - 1 : 1)) % FILAS.length; suena('mover'); pintar(h); }
      else if (dir === 'left' || dir === 'right') cambiarOpcion(h, dir === 'left' ? -1 : 1);
      else if (d.pressed('A')) {
        const f = FILAS[h.fila].id;
        if (f === 'nombre') { h.fase = 'teclado'; h.tk = { r: 0, c: 0 }; suena('elegir'); pintar(h); }
        else if (f === 'guardar') guardar(h);
        else cambiarOpcion(h, 1);
      } else if (d.pressed('START')) guardar(h);
      else if (d.pressed('B')) { h.fase = 'elige'; h.edit = null; suena('no'); pintar(h); }
      break;
    case 'teclado':
      if (dir) { moverTecla(h, dir); suena('mover'); pintar(h); }
      else if (d.pressed('A')) pulsarTecla(h);
      else if (d.pressed('B')) { borrar(h); pintar(h); }
      else if (d.pressed('START') || d.pressed('X')) terminarNombre(h);
      break;
    case 'listo':
      if (d.pressed('B')) { h.fase = 'elige'; suena('mover'); pintarTodos(); }
      else if (d.pressed('A') || d.pressed('START')) { if (todosListos()) empezar(); else suena('no'); }
      break;
    default: break;
  }
}

function actualizarPie() {
  const pie = $('pie');
  const unidos = huecos.filter((h) => h.fase !== 'vacio').length;
  const listos = todosListos();
  pie.classList.toggle('todos', listos);
  pie.innerHTML = listos
    ? `¡Todos listos! Pulsa ${A} para jugar`
    : unidos ? 'Cuando estéis todos listos, a jugar' : `Pulsa ${A} en tu mando o en el móvil para unirte`;
}

// ---------- 3D ----------
const renderer = new THREE.WebGLRenderer({ canvas: $('vistas'), antialias: !enTele, alpha: true });
renderer.setClearColor(0x000000, 0);
renderer.autoClear = false;
function ajustar() {
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, enTele ? 1 : 1.5));
  renderer.setSize(innerWidth, innerHeight, false);
}
addEventListener('resize', ajustar);
ajustar();

function render3D(dt, now) {
  renderer.setScissorTest(false);
  renderer.clear();
  renderer.setScissorTest(true);
  for (const h of huecos) {
    const p = actual(h);
    if (!p || h.fase === 'vacio') continue;
    const key = JSON.stringify([p.animal, p.pelo, p.accesorio, p.color]);
    if (!h.pj) { h.pj = crearPersonaje(THREE, p); h.escena.add(h.pj.g); }
    else if (key !== h.pjKey) { h.pj.aplicar(p); h.pj.cabeza.rotation.x = 0; }
    h.pjKey = key;
    h.giro += dt * (h.fase === 'listo' ? 2.4 : 0.8);
    const listo = h.fase === 'listo';
    h.pj.g.rotation.y = listo ? h.giro : 0.35 + Math.sin(h.giro) * 0.7;
    h.pj.g.position.y = listo ? Math.abs(Math.sin(now / 220)) * 0.22 : 0;
    animarPersonaje(h.pj, { paso: listo ? now / 90 : 0, suelo: true, aplasta: 0, dt });
    h.plataforma.material.color.set(p.color);
    const r = h.vista.getBoundingClientRect();
    if (r.width < 2) continue;
    const x = r.left, y = innerHeight - r.bottom;
    renderer.setViewport(x, y, r.width, r.height);
    renderer.setScissor(x, y, r.width, r.height);
    h.cam.aspect = r.width / r.height;
    h.cam.updateProjectionMatrix();
    renderer.render(h.escena, h.cam);
  }
}

// ---------- Bucle ----------
let antes = performance.now();
function bucle(now) {
  const dt = Math.max(0, Math.min(0.05, (now - antes) / 1000));   // el primer fotograma puede llegar con tiempo negativo
  antes = now;
  pad.update();
  entradas.update();
  for (const d of entradas.lista()) {
    const h = huecos.find((x) => x.disp === d.id);
    if (h) procesar(h, d, now);
    else if (d.pressed('A') || d.pressed('START')) unir(d);
    else if (d.pressed('B') && huecos.every((x) => x.fase === 'vacio')) volverAlMenu();
  }
  actualizarPie();
  render3D(dt, now);
  requestAnimationFrame(bucle);
}
// ---------- Con el dedo (móvil/tablet) o el ratón: todo se puede tocar ----------
$('huecos').addEventListener('pointerdown', (e) => {
  const el = e.target.closest('.hueco');
  if (!el) return;
  const h = huecos.find((x) => x.el === el);
  e.preventDefault();
  if (e.pointerType === 'touch') pad.tactilUsado = true;
  const t = e.target;
  if (h.fase === 'vacio') {
    // Con el dedo juega la pantalla táctil; con el ratón, el teclado del PC
    if (e.pointerType !== 'touch') pad.tecladoUsado = true;
    unirDisp(e.pointerType === 'touch' ? 'tactil' : 'teclado');
    return;
  }
  const tecla = t.closest('.tecla');
  if (tecla && h.fase === 'teclado') { h.tk = { r: +tecla.dataset.r, c: +tecla.dataset.c }; pulsarTecla(h); return; }
  const fila = t.closest('.fila');
  if (fila && h.fase === 'edita') {
    h.fila = +fila.dataset.i;
    const f = FILAS[h.fila];
    if (f.id === 'nombre') { h.fase = 'teclado'; h.tk = { r: 0, c: 0 }; pintar(h); }
    else if (f.id === 'guardar') guardar(h);
    else { const r = fila.getBoundingClientRect(); cambiarOpcion(h, e.clientX < r.left + r.width * 0.7 ? -1 : 1); }
    return;
  }
  const a = t.closest('[data-accion]');
  const accion = a ? a.dataset.accion : (h.fase === 'elige' && t.closest('.vista') ? 'elegir' : null);
  switch (accion) {
    case 'izq': moverSeleccion(h, -1); break;
    case 'der': moverSeleccion(h, 1); break;
    case 'elegir': elegir(h); break;
    case 'editar': editar(h); break;
    case 'salir': salir(h); break;
    case 'cancelar': h.fase = 'elige'; h.edit = null; suena('no'); pintar(h); break;
    case 'borrar': borrar(h); pintar(h); break;
    case 'hecho': terminarNombre(h); break;
    case 'cambiar': h.fase = 'elige'; suena('mover'); pintarTodos(); break;
    case 'jugar': if (todosListos()) empezar(); else suena('no'); break;
    default: break;
  }
});
$('pie').addEventListener('pointerdown', () => { if (todosListos()) empezar(); });

pintarTodos();
requestAnimationFrame(bucle);
window.__jugadores = { huecos, get perfiles() { return perfiles; } };
