// Controles táctiles para jugar en el móvil o la tablet:
//  - un dedo en la mitad izquierda = stick (aparece donde tocas)
//  - un dedo en la mitad derecha = girar la cámara arrastrando
//  - botones redondos (A, etc.) y botón de pausa
// En la tele y en el PC no se muestra nada hasta que alguien toca la pantalla.
import { pad, BTN } from './pad.js';
import { enTele } from './tv.js';

export const esTactil = !enTele && (navigator.maxTouchPoints || 0) > 0;

const CSS = `
.tactil { position: fixed; inset: 0; z-index: 5; touch-action: none; -webkit-user-select: none; user-select: none; }
.tactil .base { position: absolute; width: 26vmin; height: 26vmin; margin: -13vmin 0 0 -13vmin; border-radius: 50%;
  background: rgba(255,255,255,.22); border: .6vmin solid rgba(255,255,255,.75); pointer-events: none; transition: opacity .2s; }
.tactil .base.reposo { opacity: .55; }
.tactil .bola { position: absolute; left: 50%; top: 50%; width: 12vmin; height: 12vmin; margin: -6vmin 0 0 -6vmin; border-radius: 50%;
  background: rgba(255,255,255,.92); box-shadow: 0 .6vmin 0 rgba(90,40,140,.18); }
.tactil .boton { position: absolute; width: 20vmin; height: 20vmin; border-radius: 50%; display: grid; place-items: center;
  color: #fff; font: 700 9vmin 'Fredoka', system-ui, sans-serif; touch-action: none;
  box-shadow: inset 0 -1.3vmin 0 rgba(0,0,0,.2), 0 .8vmin 1.6vmin rgba(60,20,90,.2); transition: transform .06s; }
.tactil .boton.on { transform: scale(.88); filter: brightness(1.15); }
.tactil .pausa { position: absolute; top: 3vmin; right: 3vmin; width: 11vmin; height: 11vmin; border-radius: 50%;
  background: rgba(255,255,255,.88); display: grid; place-items: center; box-shadow: 0 .6vmin 0 rgba(90,40,140,.15); }
.tactil .pausa::before, .tactil .pausa::after { content: ''; position: absolute; width: 1.6vmin; height: 4.6vmin; border-radius: .5vmin; background: #7b3fe4; }
.tactil .pausa::before { transform: translateX(-1.4vmin); } .tactil .pausa::after { transform: translateX(1.4vmin); }
.gira { position: fixed; inset: 0; z-index: 50; display: none; place-items: center; text-align: center;
  background: linear-gradient(rgba(127,208,255,.96), rgba(255,211,241,.96)); color: #7b3fe4; font: 700 7vw 'Fredoka', system-ui, sans-serif; }
.gira span { display: block; font-size: 22vw; animation: girar 1.6s ease-in-out infinite; }
.gira small { display: block; margin-top: 6vw; font-size: 5vw; color: #5a4a7a; }
@keyframes girar { 50% { transform: rotate(-90deg); } }
@media (orientation: portrait) { .gira.activo { display: grid; } }
`;

let montado = false;

/**
 * botones: [{ b: 'A', txt: 'A', color: '#3dbb4c', x: 6, y: 8 }]  (x/y = distancia en vmin desde abajo-derecha)
 */
export function controlesTactiles({ camara = true, botones = [{ b: 'A', txt: 'A', color: '#3dbb4c' }], pausa = true, girar = true } = {}) {
  const montar = () => {
    if (montado) return;
    montado = true;
    pad.tactilUsado = true;
    const st = document.createElement('style');
    st.textContent = CSS;
    document.head.appendChild(st);

    const capa = document.createElement('div');
    capa.className = 'tactil';
    const base = document.createElement('div');
    base.className = 'base reposo';
    base.innerHTML = '<div class="bola"></div>';
    const bola = base.firstChild;
    capa.appendChild(base);
    const reposo = () => {
      base.classList.add('reposo');
      base.style.left = '20vmin'; base.style.top = 'calc(100% - 20vmin)';
      bola.style.transform = '';
    };
    reposo();

    let stickId = null, ox = 0, oy = 0, camId = null, cx = 0, cy = 0;
    capa.addEventListener('pointerdown', (e) => {
      if (e.target !== capa) return;
      if (stickId === null && e.clientX < innerWidth * 0.5) {
        stickId = e.pointerId; ox = e.clientX; oy = e.clientY;
        base.classList.remove('reposo');
        base.style.left = ox + 'px'; base.style.top = oy + 'px';
      } else if (camara && camId === null) {
        camId = e.pointerId; cx = e.clientX; cy = e.clientY;
      } else return;
      capa.setPointerCapture(e.pointerId);
      e.preventDefault();
    });
    capa.addEventListener('pointermove', (e) => {
      if (e.pointerId === stickId) {
        const R = Math.min(innerWidth, innerHeight) * 0.13;
        let dx = (e.clientX - ox) / R, dy = (e.clientY - oy) / R;
        const m = Math.hypot(dx, dy);
        if (m > 1) { dx /= m; dy /= m; }
        pad.v.lx = dx; pad.v.ly = dy;
        bola.style.transform = `translate(${dx * R * 0.75}px, ${dy * R * 0.75}px)`;
      } else if (e.pointerId === camId) {
        pad.arrastrar(((e.clientX - cx) / innerWidth) * 5, ((e.clientY - cy) / innerHeight) * 2.2);
        cx = e.clientX; cy = e.clientY;
      }
    });
    const soltar = (e) => {
      if (e.pointerId === stickId) { stickId = null; pad.v.lx = 0; pad.v.ly = 0; reposo(); }
      if (e.pointerId === camId) camId = null;
    };
    capa.addEventListener('pointerup', soltar);
    capa.addEventListener('pointercancel', soltar);

    botones.forEach((d, i) => {
      const el = document.createElement('div');
      el.className = 'boton';
      el.textContent = d.txt || d.b;
      el.style.background = d.color || '#3dbb4c';
      el.style.right = (d.x ?? 6 + i * 23) + 'vmin';
      el.style.bottom = (d.y ?? 8) + 'vmin';
      const bit = 1 << BTN[d.b];
      const on = (e) => { e.preventDefault(); e.stopPropagation(); el.setPointerCapture(e.pointerId); el.classList.add('on'); pad.v.mask |= bit; pad.tap(d.b); };
      const off = () => { el.classList.remove('on'); pad.v.mask &= ~bit; };
      el.addEventListener('pointerdown', on);
      el.addEventListener('pointerup', off);
      el.addEventListener('pointercancel', off);
      capa.appendChild(el);
    });

    if (pausa) {
      const p = document.createElement('div');
      p.className = 'pausa';
      p.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); pad.tap('START'); });
      capa.appendChild(p);
    }
    document.body.appendChild(capa);

    if (girar) {
      const g = document.createElement('div');
      g.className = 'gira activo';
      g.innerHTML = '<div><span>📱</span>Mejor con el móvil<br>en horizontal<small>o toca aquí para jugar así</small></div>';
      g.addEventListener('pointerdown', (e) => { e.preventDefault(); g.classList.remove('activo'); });
      document.body.appendChild(g);
    }
  };

  if (esTactil) montar();
  else addEventListener('pointerdown', (e) => { if (e.pointerType === 'touch') montar(); }, { once: false, passive: true });
}

// Cualquier elemento con data-tap="A" (o B, START...) pulsa ese botón al tocarlo: útil en paneles y menús.
addEventListener('pointerdown', (e) => {
  const t = e.target.closest && e.target.closest('[data-tap]');
  if (t) { e.preventDefault(); pad.tap(t.dataset.tap); }
});
