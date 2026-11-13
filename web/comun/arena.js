// Base para juegos que pasan en un claro del bosque visto desde arriba (Pintabosque, Al redil, La despensa).
// Pone el escenario, los jugadores (con su movimiento, su especial y las reglas de la estación), los rivales de la
// máquina, la cámara, el marcador, la cuenta atrás, la pausa y el final. Cada juego solo añade lo suyo:
//
//   const A = crearArena({ juego: 'pintar', radio: 17, duracion: 90, rivales: 3, ... , ganchos });
//   ... crear sus cosas en A.escena ...
//   A.empezar();
//
// Ganchos (todos opcionales): alEmpezar() · paso(dt, jugando) · alPoder(j, pw) (cada fotograma, con el especial
// del animal) · alAterrizar(j) · bot(j) -> { x, z, especial } (hacia dónde va un rival de la máquina) ·
// chip(j) -> html del marcador · valor(j) -> número (para ordenar, la fiesta y el récord) ·
// final() -> { titulo, extra } · nivel() -> texto de arriba
import { REGLA, racha } from './estaciones.js';
import * as THREE from '../lib/three.min.js';
import { pad, entradas } from './pad.js';
import { suena } from './sonido.js';
import { enTele, params, records, volverAlMenu, alPulsarAtras, escenario, vibrar } from './tv.js';
import { controlesTactiles, esTactil } from './tactil.js';
import { partida, perfilPorId, recordDe, ponerRecord, recordEquipo, ponerRecordEquipo, ANIMALES, COLORES_JUGADOR } from './perfiles.js';
import { especialConY, especial, poder } from './especial.js';
import { crearPersonaje, animarPersonaje } from './personajes.js';
import { crearCielo, crearClaro, rng } from './mundo.js';
import { FIESTA, resultadoFiesta, volverAlTablero, OPCIONES_FIESTA } from './fiesta.js';

export { THREE, suena, vibrar, especial, FIESTA, crearPersonaje, animarPersonaje };
const NOMBRES_CPU = ['Trufo', 'Saltarina', 'Bruno', 'Canela', 'Pipa', 'Musgo'];
const ARCO = ['#ff5d73', '#ff9f43', '#ffd93d', '#6bd968', '#4cc3ff', '#7b7bff', '#c17bff'];

export function crearArena(op) {
  const JUEGO = op.juego, RADIO = op.radio || 18, VEL = op.vel || 7, G = 24;
  const BOT = params.has('bot');
  const DURACION = FIESTA && op.duracionFiesta ? op.duracionFiesta : op.duracion || 90;
  const H = op.ganchos || {};
  escenario(document.getElementById('esc'));
  const $ = (id) => document.getElementById(id);
  const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const clamp = THREE.MathUtils.clamp;
  controlesTactiles({ camara: true, botones: [{ b: 'Y', txt: 'Y', color: '#ffc531' }], pausa: true });
  const azar = rng(Date.now() & 0xffff);

  // ---------- Render y escenario ----------
  const renderer = new THREE.WebGLRenderer({ canvas: $('lienzo'), antialias: !enTele, powerPreference: 'high-performance' });
  const escena = new THREE.Scene();
  const camara = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 600);
  function ajustar() {
    const objetivo = parseInt(params.get('ancho') || (enTele ? '1280' : esTactil ? '1600' : '1920'), 10);
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, objetivo / innerWidth));
    renderer.setSize(innerWidth, innerHeight, false);
    camara.aspect = innerWidth / innerHeight;
    camara.fov = camara.aspect < 1 ? 78 : 50;
    camara.updateProjectionMatrix();
  }
  addEventListener('resize', ajustar);
  ajustar();
  escena.fog = new THREE.Fog('#dff3ff', 60, 160);
  escena.add(new THREE.HemisphereLight('#e6f4ff', '#8fcf6a', 1.9));
  const sol = new THREE.DirectionalLight('#fff0dc', 2.1);
  sol.position.set(-30, 60, 25);
  escena.add(sol);
  const cielo = crearCielo(THREE, escena);
  const claro = crearClaro(THREE, escena, { radio: RADIO, semilla: op.semilla || 4, nArboles: op.nArboles ?? 6, huecos: [{ x: 0, z: 0, r: 4 }, ...(op.huecos || [])] });

  // ---------- Confeti y salpicaduras (una llamada de dibujo) ----------
  const N_PIEZAS = 200;
  const piezas = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.2, 0.13), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }), N_PIEZAS);
  piezas.frustumCulled = false; piezas.userData.sinEstacion = true;
  const lista = Array.from({ length: N_PIEZAS }, (_, i) => { piezas.setColorAt(i, new THREE.Color('#fff')); return { p: new THREE.Vector3(), v: new THREE.Vector3(), r: new THREE.Euler(), w: new THREE.Vector3(), vida: 0 }; });
  escena.add(piezas);
  const dummy = new THREE.Object3D(), tmp = new THREE.Vector3(), _c = new THREE.Color();
  let sig = 0;
  function lanzar(x, y, z, n, colores, fuerza = 1) {
    if (typeof colores === 'string') colores = [colores];
    for (let k = 0; k < n; k++) {
      const q = lista[sig];
      piezas.setColorAt(sig, _c.set(colores[k % colores.length]));
      sig = (sig + 1) % N_PIEZAS;
      q.p.set(x, y, z);
      q.v.set(Math.random() - 0.5, Math.random() * 0.8 + 0.4, Math.random() - 0.5).normalize().multiplyScalar((2 + Math.random() * 3) * fuerza);
      q.w.set(Math.random() * 8, Math.random() * 8, Math.random() * 8);
      q.vida = 0.9 + Math.random() * 0.6;
    }
    piezas.instanceColor.needsUpdate = true;
  }
  function actualizarPiezas(dt) {
    for (let i = 0; i < N_PIEZAS; i++) {
      const q = lista[i];
      if (q.vida > 0) {
        q.vida -= dt;
        q.v.y -= 7 * dt; q.v.multiplyScalar(Math.exp(-1.2 * dt));
        q.p.addScaledVector(q.v, dt);
        if (q.p.y < 0.05) { q.p.y = 0.05; q.v.set(0, 0, 0); }
        q.r.x += q.w.x * dt; q.r.y += q.w.y * dt; q.r.z += q.w.z * dt;
        dummy.position.copy(q.p); dummy.rotation.copy(q.r); dummy.scale.setScalar(Math.min(1, q.vida * 2));
      } else dummy.scale.setScalar(0);
      dummy.updateMatrix();
      piezas.setMatrixAt(i, dummy.matrix);
    }
    piezas.instanceMatrix.needsUpdate = true;
  }

  // ---------- Jugadores (y rivales de la máquina si hacen falta) ----------
  const datosPartida = partida.leer();
  let defs = [];
  if (datosPartida && datosPartida.juego === JUEGO && Array.isArray(datosPartida.jugadores)) {
    defs = datosPartida.jugadores.map((j) => ({ perfil: perfilPorId(j.perfil), dispositivo: j.dispositivo })).filter((j) => j.perfil);
  }
  const LIBRE = defs.length === 0;
  if (LIBRE) defs = [{ perfil: { id: null, nombre: 'Tú', animal: 'zorro', pelo: 'natural', accesorio: 'nada', color: '#ff4d6d' }, dispositivo: null }];
  const N_HUMANOS = defs.length;
  if (!FIESTA) {
    // Rivales: hasta completar `rivales` participantes, con animales y colores que no estén ya
    const libres = ANIMALES.map((a) => a.id).filter((a) => !defs.some((d) => d.perfil.animal === a)).sort(() => azar() - 0.5);
    const colores = COLORES_JUGADOR.map((c) => c.id).filter((c) => !defs.some((d) => d.perfil.color === c));
    for (let k = 0; defs.length < (op.rivales || 0); k++) {
      defs.push({ cpu: true, perfil: { id: null, nombre: NOMBRES_CPU[k % NOMBRES_CPU.length], animal: libres[k % libres.length], pelo: 'natural', accesorio: 'nada', color: colores[k % colores.length] }, dispositivo: null });
    }
  }
  const VARIOS = defs.length > 1;

  class Jugador {
    constructor(def, i) {
      this.perfil = def.perfil; this.dispositivo = def.dispositivo; this.i = i; this.cpu = !!def.cpu || BOT;
      this.color = def.perfil.color || '#ff4d6d';
      this.pj = crearPersonaje(THREE, def.perfil);
      escena.add(this.pj.g);
      this.pos = new THREE.Vector3(); this.vel = new THREE.Vector3();
      this.y = 0; this.vy = 0; this.angulo = Math.PI; this.paso = 0; this.aplasta = 0; this.factor = 1; this.aturdido = 0;
      this.puntos = 0; this.pw = poder(this.pj);
      this.etiqueta = null;
      if (VARIOS) {
        const e = document.createElement('div');
        e.className = 'etiqueta'; e.textContent = def.perfil.nombre; e.style.setProperty('--c', this.color);
        $('flotantes').appendChild(e); this.etiqueta = e;
      }
    }
    colocar(n) {
      const a = (this.i / n) * Math.PI * 2 + (op.giroSalida || 0), r = op.radioSalida ?? Math.max(1.6, n * 0.6);
      this.pos.set(Math.sin(a) * r, 0, Math.cos(a) * r); this.vel.set(0, 0, 0); this.y = 0; this.vy = 0; this.aturdido = 0; this.factor = 1;
      this.angulo = Math.atan2(this.pos.x, this.pos.z);
    }
    /** Hacia dónde quiere ir, ya en el mundo: [x, z] (módulo 0..1). */
    entrada() {
      if (this.cpu) {
        const b = (H.bot && H.bot(this)) || { x: 0, z: 0 };
        if (b.especial) especial(this.pj);
        const m = Math.hypot(b.x, b.z);
        return m > 1 ? [b.x / m, b.z / m] : [b.x, b.z];
      }
      const d = this.dispositivo ? entradas.get(this.dispositivo) : pad;
      if (!d) return [0, 0];
      const cy = Math.cos(cam.yaw), sy = Math.sin(cam.yaw);
      return [d.lx * cy + d.ly * sy, -d.lx * sy + d.ly * cy];
    }
    actualizar(dt, activo) {
      const [dx, dz] = activo && this.aturdido <= 0 ? this.entrada() : [0, 0];
      this.aturdido = Math.max(0, this.aturdido - dt);
      const k = Math.min(1, dt * 10 * REGLA.agarre);   // invierno: resbala
      const pw = this.pw = poder(this.pj);             // el especial del animal
      const w = racha();                               // otoño: rachas de viento
      const v = VEL * pw.vel * this.factor;
      this.vel.x += (dx * v + w.x - this.vel.x) * k;
      this.vel.z += (dz * v + w.z - this.vel.z) * k;
      if (pw.avance) { this.vel.x += Math.sin(this.angulo) * VEL * pw.avance; this.vel.z += Math.cos(this.angulo) * VEL * pw.avance; }
      if (pw.salto) this.vy = 9 * pw.salto;
      if (H.alPoder && activo) H.alPoder(this, pw);
      this.vy -= G * dt * (this.vy < 0 ? pw.grav : 1);
      const antes = this.y;
      this.y = Math.max(0, this.y + this.vy * dt);
      if (this.y === 0) { if (antes > 0.25) { this.aplasta = 1; if (H.alAterrizar && activo) H.alAterrizar(this); } this.vy = Math.max(0, this.vy); }
      this.pos.x += this.vel.x * dt; this.pos.z += this.vel.z * dt;
      claro.empujar(this.pos);
      if (H.limites) H.limites(this);
      const rapidez = Math.hypot(this.vel.x, this.vel.z);
      if (rapidez > 0.3) {
        let d = Math.atan2(this.vel.x, this.vel.z) - this.angulo;
        d = Math.atan2(Math.sin(d), Math.cos(d));
        this.angulo += d * Math.min(1, dt * 12);
      }
      if (rapidez > 0.6) this.paso += dt * 15; else this.paso *= Math.exp(-dt * 10);
      this.aplasta = Math.max(0, this.aplasta - dt * 5);
      this.pj.g.position.set(this.pos.x, this.y, this.pos.z);
      this.pj.g.rotation.y = this.angulo + (this.aturdido > 0 ? Math.sin(this.aturdido * 30) * 0.5 : 0);
      animarPersonaje(this.pj, { paso: this.paso, suelo: this.y < 0.05, aplasta: this.aplasta, dt });
    }
    pintarEtiqueta() {
      if (!this.etiqueta) return;
      tmp.set(this.pos.x, this.y + 1.6 * this.pj.escala + 0.45, this.pos.z).project(camara);
      const ver = tmp.z < 1;
      this.etiqueta.style.display = ver ? 'block' : 'none';
      if (!ver) return;
      this.etiqueta.style.left = ((tmp.x + 1) / 2 * innerWidth) + 'px';
      this.etiqueta.style.top = ((1 - tmp.y) / 2 * innerHeight) + 'px';
    }
  }
  const jugadores = defs.map((d, i) => new Jugador(d, i));
  const humanos = jugadores.filter((j) => !j.cpu || BOT).slice(0, N_HUMANOS);

  // ---------- Cámara (encuadra a los jugadores de verdad; el stick derecho la gira) ----------
  const cam = { yaw: 0, el: op.el ?? 0.95, dist: op.dist ?? 24, mira: new THREE.Vector3(0, 1, 0) };
  function actualizarCamara(dt) {
    let cx = 0, cz = 0;
    for (const j of humanos) { cx += j.pos.x; cz += j.pos.z; }
    cx /= humanos.length; cz /= humanos.length;
    let lejos = 0;
    for (const j of humanos) lejos = Math.max(lejos, Math.hypot(j.pos.x - cx, j.pos.z - cz));
    // con varios en pantalla (o rivales), se ve casi todo el claro; con uno solo, más cerca
    const base = op.dist ?? 24, dist = clamp(base + lejos * 0.9, base, base + 16);
    cam.dist += (dist - cam.dist) * Math.min(1, dt * 2);
    const arr = pad.arrastre();
    cam.yaw -= pad.rx * 2.2 * dt + arr.x;
    cam.el = clamp(cam.el + pad.ry * 1.2 * dt + arr.y, 0.5, 1.35);
    const f = op.centrar ?? 0.5;   // cuánto sigue a los jugadores (0 = fija en el centro del claro)
    tmp.set(cx * f, 1, cz * f);
    cam.mira.lerp(tmp, 1 - Math.exp(-5 * dt));
    const c = Math.cos(cam.el);
    camara.position.set(cam.mira.x + Math.sin(cam.yaw) * c * cam.dist, cam.mira.y + Math.sin(cam.el) * cam.dist, cam.mira.z + Math.cos(cam.yaw) * c * cam.dist);
    camara.lookAt(cam.mira.x, cam.mira.y + 0.4, cam.mira.z);
    cielo.position.copy(camara.position);
  }

  // ---------- Partida ----------
  let estado = 'cuenta', estadoAntesPausa = 'jugando', tAntesPausa = 0, tEstado = 0, tiempo = DURACION, nuevoRecord = false, tJugado = 0;
  const ids = defs.map((d) => d.perfil.id).filter(Boolean);
  const EQUIPO = !!op.cooperativo && ids.length > 1;
  function leerRecord() { return !ids.length ? records.leer(JUEGO) : EQUIPO ? recordEquipo(JUEGO, ids) : Math.max(0, ...ids.map((id) => recordDe(id, JUEGO))); }
  function guardarRecord(v) {
    if (!ids.length) records.guardar(JUEGO, v);
    else if (EQUIPO) ponerRecordEquipo(JUEGO, ids, v);
    else for (const j of humanos) if (j.perfil.id && valor(j) > recordDe(j.perfil.id, JUEGO)) ponerRecord(j.perfil.id, JUEGO, valor(j));
  }
  let record = leerRecord();
  const valor = (j) => (H.valor ? H.valor(j) : j.puntos);
  const valorRecord = () => (op.cooperativo ? (H.total ? H.total() : jugadores.reduce((s, j) => s + valor(j), 0)) : Math.max(0, ...humanos.map(valor)));

  function pintarArriba() {
    $('record').firstChild.textContent = `${EQUIPO ? 'Récord juntos' : 'Récord'} ${record}${op.unidad || ''}`;
    $('total').textContent = op.cooperativo || !VARIOS ? `${valorRecord()}${op.unidad || ''}` : '';
    $('nivel').textContent = H.nivel ? H.nivel() : op.titulo || '';
  }
  let marcadorHtml = '';
  function pintarMarcador() {
    const html = jugadores.map((j) => `<span class="chip" style="--c:${j.color}"><i></i>${esc(j.perfil.nombre)} ${H.chip ? H.chip(j) : `<b>${valor(j)}</b>`}</span>`).join('');
    if (html !== marcadorHtml) { $('marcador').innerHTML = html; marcadorHtml = html; }
  }
  function mensaje(html, ms = 1200) {
    const m = $('mensaje'); m.innerHTML = html; m.classList.add('ver');
    clearTimeout(mensaje.t); if (ms) mensaje.t = setTimeout(() => m.classList.remove('ver'), ms);
  }
  function panel(html) { const p = $('panel'); if (html) { p.innerHTML = html; p.classList.add('ver'); } else p.classList.remove('ver'); }
  function cambiar(e) { estado = e; tEstado = 0; }
  function flotante(txt, x, y, z, color) {
    tmp.set(x, y, z).project(camara);
    const d = document.createElement('div');
    d.className = 'mas1 txt'; d.textContent = txt;
    if (color) d.style.setProperty('--morado', color);
    d.style.left = ((tmp.x + 1) / 2 * innerWidth) + 'px'; d.style.top = ((1 - tmp.y) / 2 * innerHeight) + 'px';
    $('flotantes').appendChild(d); setTimeout(() => d.remove(), 900);
  }

  function empezar() {
    for (const j of jugadores) { j.puntos = 0; j.colocar(jugadores.length); }
    tiempo = DURACION; nuevoRecord = false;
    panel(null);
    if (H.alEmpezar) H.alEmpezar();
    pintarMarcador(); pintarArriba();
    cambiar('cuenta');
  }
  function terminar() {
    if (estado === 'fin') return;
    cambiar('fin');
    const v = valorRecord();
    if (v > record) { record = v; nuevoRecord = true; guardarRecord(v); setTimeout(() => suena('record'), 700); }
    else guardarRecord(v);
    pintarArriba(); pintarMarcador();
    if (FIESTA) resultadoFiesta(JUEGO, humanos.map((j) => ({ id: j.perfil.id, valor: valor(j) })));
    const F = (H.final && H.final()) || {};
    let titulo = F.titulo, tabla = '';
    if (!op.cooperativo && VARIOS) {
      const orden = [...jugadores].sort((a, b) => valor(b) - valor(a)), max = valor(orden[0]);
      const ganan = orden.filter((j) => valor(j) === max);
      titulo = titulo || (ganan.length === 1 ? `¡Gana ${esc(ganan[0].perfil.nombre)}!` : '¡Empate!');
      tabla = `<div class="tabla">${orden.map((j) => `<span class="chip grande" style="--c:${j.color}"><i></i>${esc(j.perfil.nombre)} <b>${valor(j)}${op.unidad || ''}</b></span>`).join('')}</div>`;
      for (const j of ganan) especial(j.pj);
      lanzar(ganan[0].pos.x, 2, ganan[0].pos.z, 60, ARCO, 1.6);
    } else { for (const j of jugadores) especial(j.pj); lanzar(0, 2, 0, 60, ARCO, 1.6); }
    suena('fanfarria');
    const lineaRecord = nuevoRecord ? `<p class="nuevo">¡NUEVO RÉCORD${EQUIPO ? ' JUNTOS' : ''}!</p>` : `<p>${EQUIPO ? 'Récord juntos' : 'Récord'}: ${record}${op.unidad || ''}</p>`;
    panel(`<h2>${titulo || '¡Se acabó!'}</h2>${F.extra || ''}${tabla}${lineaRecord}` + (FIESTA ? OPCIONES_FIESTA : `<div class="opciones"><span data-tap="A"><span class="boton-a">A</span> Otra vez</span>`
      + `<span data-tap="Y"><span class="boton-a" style="background:#ffc531">Y</span> Jugadores</span><span data-tap="B"><span class="boton-a boton-b">B</span> Menú</span></div>`));
  }
  function pausar(si) {
    if (si) {
      estadoAntesPausa = estado; tAntesPausa = tEstado; cambiar('pausa');
      panel(`<h2>Pausa</h2><div class="opciones"><span data-tap="A"><span class="boton-a">A</span> Seguir</span><span data-tap="B"><span class="boton-a boton-b">B</span> ${FIESTA ? 'Volver al tablero' : 'Salir al menú'}</span></div>`);
    } else { panel(null); estado = estadoAntesPausa; tEstado = tAntesPausa; }
  }
  const irAJugadores = () => { location.href = new URL(`../jugadores/index.html#${JUEGO}`, location.href).href; };
  alPulsarAtras(() => { if (estado === 'pausa' || estado === 'fin') volverAlMenu(); else pausar(true); return true; });

  // ---------- Bucle ----------
  let antes = performance.now(), fpsN = 0, fpsT = 0, verFps = params.has('fps'), ultimoSeg = -1;
  function bucle(now) {
    const dt = Math.max(0, Math.min(0.05, (now - antes) / 1000));
    antes = now; tEstado += dt;
    pad.update(); entradas.update();
    if (estado === 'jugando') especialConY(humanos.filter((j) => !j.cpu && j.aturdido <= 0));
    if (pad.pressed('SELECT')) verFps = !verFps;

    if (estado === 'pausa') {
      if (pad.pressed('A') || pad.pressed('START')) pausar(false);
      else if (pad.pressed('B')) volverAlMenu();
    } else if (estado === 'fin') {
      if (tEstado > 1) {
        if (FIESTA) { if (pad.pressed('A') || (BOT && tEstado > 3)) volverAlTablero(); }
        else if (pad.pressed('A') || (BOT && tEstado > 3)) empezar();
        else if (pad.pressed('Y')) irAJugadores();
        else if (pad.pressed('B')) volverAlMenu();
      }
    } else if (pad.pressed('START')) pausar(true);

    if (estado === 'cuenta') {
      const n = 3 - Math.floor(tEstado);
      if (n !== ultimoSeg && n > 0) { ultimoSeg = n; mensaje(String(n), 700); suena('tictac'); }
      if (tEstado > 3) { ultimoSeg = -1; cambiar('jugando'); mensaje(op.grito || '¡Ya!', 800); suena('elegir'); }
    }
    if (estado !== 'pausa') {
      const jugando = estado === 'jugando';
      for (const j of jugadores) j.actualizar(dt, jugando);
      // Que no se pisen
      for (let a = 0; a < jugadores.length; a++) for (let b = a + 1; b < jugadores.length; b++) {
        const p = jugadores[a].pos, q = jugadores[b].pos, dx = q.x - p.x, dz = q.z - p.z, d = Math.hypot(dx, dz);
        if (d < 0.95 && d > 1e-4 && jugadores[a].y < 1 && jugadores[b].y < 1) {
          const m = (0.95 - d) / 2 / d; p.x -= dx * m; p.z -= dz * m; q.x += dx * m; q.z += dz * m;
          if (jugando && H.alChocar) H.alChocar(jugadores[a], jugadores[b]);
        }
      }
      if (H.paso) H.paso(dt, jugando);
      if (jugando) {
        tJugado += dt;
        if (!op.sinReloj) {
          tiempo -= dt;
          const s = Math.max(0, Math.ceil(tiempo));
          $('tiempo').textContent = String(s);
          $('tiempo').classList.toggle('prisa', s <= 10);
          if (s <= 5 && s !== ultimoSeg && s > 0) { ultimoSeg = s; suena('tictac'); }
          if (tiempo <= 0) terminar();
        }
        pintarMarcador(); pintarArriba();
      }
      actualizarCamara(dt);
    }
    $('ayuda').style.opacity = tJugado < 12 ? 1 : 0;
    for (const j of jugadores) j.pintarEtiqueta();
    actualizarPiezas(dt);
    renderer.render(escena, camara);

    fpsN++; fpsT += dt;
    if (fpsT >= 0.5) {
      const f = $('fps'); f.style.display = verFps ? 'block' : 'none';
      if (verFps) f.textContent = `${Math.round(fpsN / fpsT)} fps · ${renderer.domElement.width}×${renderer.domElement.height} · ${renderer.info.render.calls} dibujos`;
      fpsN = 0; fpsT = 0;
    }
    requestAnimationFrame(bucle);
  }

  const A = {
    THREE, escena, camara, claro, RADIO, VEL, jugadores, humanos, azar, VARIOS, LIBRE, cam, dummy, tmp, esc, clamp, DURACION,
    get estado() { return estado; }, get tiempo() { return tiempo; }, set tiempo(v) { tiempo = v; },
    mensaje, panel, flotante, lanzar, pintarMarcador, pintarArriba, terminar,
    /** Deja a un jugador sin poder moverse un momento (le han dado). */
    aturdir(j, s = 0.9) { if (j.aturdido > 0 || (j.pw && j.pw.invulnerable)) return false; j.aturdido = s; j.aplasta = 1; suena('golpe'); if (!j.cpu) vibrar(200, j.dispositivo || undefined); return true; },
    empezar() { empezar(); requestAnimationFrame(bucle); },
  };
  window.__juego = { get estado() { return estado; }, get tiempo() { return +tiempo.toFixed(1); }, get jugadores() { return jugadores.map((j) => ({ n: j.perfil.nombre, cpu: j.cpu, v: valor(j), x: +j.pos.x.toFixed(1), z: +j.pos.z.toFixed(1) })); }, terminar };
  return A;
}
