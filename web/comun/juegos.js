// Los juegos: nombre, colores y la frase del menú. Las carátulas son capturas de verdad (web/caratulas/<id>.jpg),
// hechas con _prueba/foto.html?juego=<id> (abre el juego sin letreros).
export const JUEGOS = [
  { id: 'globo', titulo: 'Globo arriba', c: '#3fb6f5', oscuro: '#1b6fa8', desc: 'Dale toques con la cabeza: ¡que no toque el suelo!' },
  { id: 'pompas', titulo: 'Lluvia de pompas', c: '#ff6fae', oscuro: '#b02d6c', desc: 'Dispara hacia arriba y revienta todas las pompas' },
  { id: 'carrera', titulo: 'La gran carrera', c: '#3f6fe8', oscuro: '#1d3a8f', desc: 'Tres vueltas por el bosque: salta los troncos y usa los objetos' },
  { id: 'bosque', titulo: 'Saltabosques', c: '#21a99a', oscuro: '#0f625a', desc: 'Corre, salta y recoge bellotas hasta llegar a la bandera' },
  { id: 'escondite', titulo: '¿Dónde está el conejo?', c: '#52c97a', oscuro: '#227a45', desc: 'El conejo se esconde: búscalo en arbustos, troncos y madrigueras' },
  { id: 'escondidos', titulo: 'El rebaño secreto', c: '#8f6bff', oscuro: '#4f2fb0', desc: 'Todos sois ovejas iguales: descubre a los demás sin que te pillen', jugadores: '2 a 4 jugadores' },
  { id: 'pintar', titulo: 'Pintabosque', c: '#ff7a45', oscuro: '#a8431a', desc: 'Pinta el claro de tu color y rellena en las fuentes: gana quien más suelo tenga' },
  { id: 'despensa', titulo: 'La despensa', c: '#c8864a', oscuro: '#7a4e2a', desc: 'Lleva bellotas a tu madriguera, de tres en tres, sin que te las tiren' },
  { id: 'redil', titulo: 'Al redil', c: '#4cb8a8', oscuro: '#1f7468', desc: 'Entre todos: rodead a las ovejas y metedlas en el corral' },
  { id: 'paseo', titulo: 'De paseo', c: '#6bbf3a', oscuro: '#3a7a17', desc: 'Un bosque sin fin para explorar a tu aire: manzanas, mariposas y amigos' },
];
export const FIESTA = { id: 'fiesta', titulo: 'La fiesta del bosque', c: '#ff9f1c', oscuro: '#b35f00', desc: 'Un poco de todo: tira el dado, avanza por el tablero y juega a los minijuegos' };
export const nombreJuego = (id) => (id === 'fiesta' ? FIESTA : JUEGOS.find((j) => j.id === id) || { titulo: id }).titulo;
