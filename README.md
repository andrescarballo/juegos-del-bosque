# Juegos del bosque

Consolita de minijuegos para la tele (Chromecast con Google TV) que se juegan con el mando de Xbox.

- `web/`: el menú y los juegos en HTML + Three.js. Funcionan igual en la tele, en el PC y en GitHub Pages.
- `app/`: la app Android contenedora, una vista web a pantalla completa con puente para el mando.

## Instalar en el Chromecast

1. **Activa las opciones de desarrollador**: Ajustes → Sistema → Información → pulsa 7 veces en "Compilación del SO de Android TV".
2. Elige una de estas dos vías:
   - **Sin cables:** instala la app *Downloader* desde Google Play. Dale permiso para instalar apps desconocidas (Ajustes → Apps → Seguridad y restricciones → Fuentes desconocidas) y abre con ella un enlace a `JuegosDelBosque.apk`. Sirve un enlace de GitHub Releases o de Drive.
   - **Con adb desde el PC:** activa la depuración de red y ejecuta `adb connect IP_DEL_CHROMECAST:5555` y después `adb install -r JuegosDelBosque.apk`.
3. La app aparece en "Tus apps" con el banner del arcoíris.

El mando de Xbox tiene que estar emparejado con el Chromecast (Ajustes → Mandos y accesorios). Lo primero que conviene abrir es **"Probar el mando"**: ahí se ve si llegan todos los botones y los sticks.

## Usar el móvil como mando

La app de la tele levanta un pequeño servidor en tu wifi, en el puerto 8765.

1. Abre la app en la tele. Abajo a la izquierda del menú sale un **QR** con la dirección, del tipo `192.168.1.50:8765`.
2. Escanéalo con la cámara del móvil. El móvil tiene que estar en la misma wifi.
3. Se abre un mando con un stick a la izquierda, un stick de cámara deslizando a la derecha, los botones A, B, X e Y y el botón Menú. El móvil vibra al dar un toque al globo.

Puedes tener a la vez el mando de Xbox y uno o varios móviles: se suman. Si un móvil se bloquea, se ignora en segundo y medio para que no se quede un botón "pulsado".

Limitaciones: la página va por `http://` en la red local, así que el navegador no deja mantener la pantalla encendida. En iPhone no vibra. Cualquiera que esté en tu wifi puede abrir el mando.

## Controles

| Mando | Menú | Globo arriba |
|---|---|---|
| Cruceta / stick izquierdo | elegir juego | mover la oveja |
| A | entrar | saltar (cabezazo al globo) |
| Stick derecho | – | girar la cámara |
| Menú (≡) | – | pausa |
| B | – | en pausa: salir al menú |
| Vista (⧉) | – | ver fps (para medir el rendimiento en la tele) |
| Atrás del mando de la tele | salir de la app | pausa y, si ya está en pausa, menú |

En el PC: WASD o flechas para moverte, Espacio para saltar, IJKL para la cámara, P para pausa y Esc para volver.

## Animales y escenarios

- `web/modelos/animales/*.glb`: los nueve animales (con esqueleto, sin clips). `web/comun/personajes.js` los carga y los anima por código sobre los huesos (andar, correr, saltar, cola, orejas…). Los accesorios se cuelgan de la cabeza según la tabla `CABEZA` y el color del pelo tiñe la textura. Para ajustar un accesorio: `web/_prueba/solo.html?a=zorro&acc=corona`.
- `web/modelos/kaykit/*.glb`: árboles, rocas, arbustos y hierba del *KayKit Forest Nature Pack* (Kay Lousberg). `web/modelos/natura/`: flores, setas, helecho y trébol del *Stylized Nature MegaKit* (Quaternius). Los dos son **CC0** (dominio público), así que `web/` se puede publicar tal cual en GitHub Pages. Se preparan con `python3 herramientas/empaquetar_natura.py CARPETA_KAYKIT CARPETA_MEGAKIT`.
- `web/comun/naturaleza.js` junta cada modelo en una sola malla y los dibuja con `InstancedMesh`. Los de KayKit llevan el color en los vértices (sin texturas) y se tiñen por estación al cargarlos; en invierno, parte de los árboles salen sin hojas.
- `web/comun/ambiente.js`: pájaros, grillos, hojarasca y viento de fondo según la estación (WebAudio, sin ficheros).
- Con `?bolas` en la dirección se usan los animales y árboles de bolas de antes (también si los GLB no cargan).
- `herramientas/`: scripts de Python para inspeccionar los GLB y reducir sus texturas.

## Música y estaciones

- `web/musica/*.mp3`: las canciones. **No van en el repositorio** (ver «Licencia»): pon ahí las tuyas con los nombres de la tabla `CANCIONES`; si no hay, el juego suena igual pero sin música. `web/comun/musica.js` elige cuál suena según la página (tabla `CANCIONES`: menú, carrera y una lista por estación) y sigue por donde iba al cambiar de página. La importa `sonido.js`, así que no hay que hacer nada en cada juego.
- `web/comun/estaciones.js`: primavera, verano, otoño e invierno. Tiñe el bosque del pack al cargarlo, y `vestir(THREE, escena, { lejos })` tiñe el suelo, el cielo, la niebla y las luces de un juego y echa a caer pétalos, hojas o nieve (en la GPU). Cada juego lo llama una vez, al final.
- Cada estación puede cambiar además algo del juego, igual para todos y sin anunciarlo (`REGLAS` en `estaciones.js`): en primavera se salta más, en verano el especial vuelve antes, en otoño hay rachas de viento y en invierno el suelo resbala. En **Ajustes → Efectos de estación** se elige *suaves* (matices, lo normal), *exagerados* (se nota mucho; el viento mueve hasta las pompas) o *ninguno* (jugar normal: la estación solo se ve). No se aplica en El rebaño secreto ni en el tablero.
- La estación cambia cada vez que se abre un juego desde el menú. En **Ajustes** se puede dejar fija, poner la del calendario o quitar la música. Para probar una: `?estacion=0` (primavera) … `?estacion=3` (invierno).
- `web/_prueba/foto.html?juego=bosque&animales=buho&estacion=1&teclado`: abre un juego con el animal que quieras manejado con el teclado (para probar su especial). Con `&sinhojas` no caen hojas (para medir fps).
- `web/_prueba/fila.html`: los nueve animales en fila con su tamaño de juego (Espacio: especial, C: correr y frenar, S: saltar).

## Menú, nombres y carátulas

- `web/comun/juegos.js`: la lista de juegos con su nombre, colores y la frase del menú. El menú (`web/index.html`) pinta el cartel de la fiesta arriba y, debajo, el estante con los demás juegos.
- `web/caratulas/<id>.jpg`: las carátulas, que son capturas del propio juego. `web/_prueba/foto.html?juego=carrera&animales=zorro,oso&estacion=2` monta una partida de mentira y abre el juego sin letreros (`?foto`) para capturarlo.
- `web/_prueba/icono.html` (y `?banner`): el icono de la app y el cartel de la tele, con los animales de verdad. Se capturan y se guardan en `web/comun/icono.png`, `app/res/drawable-xxxhdpi/icon.png` (192 px) y `app/res/drawable-xhdpi/banner.png` (320×180).

## Juegos sobre la base común (`comun/arena.js`)

Pintabosque (`pintar/`), La despensa (`despensa/`) y Al redil (`redil/`) comparten `web/comun/arena.js` y `arena.css`: el claro, los jugadores con su especial y las reglas de la estación, los rivales de la máquina, la cámara, el marcador, la cuenta atrás, la pausa y el final. Cada juego solo aporta sus «ganchos» (`paso`, `alPoder`, `alAterrizar`, `alChocar`, `bot`, `chip`, `valor`, `final`…). Para un juego nuevo de este tipo, copia `despensa/` (unas 150 líneas). Con `?bot` juegan solos (para pruebas).

## Añadir un juego nuevo

1. Crea `web/mi-juego/index.html`. Copia `globo/` como plantilla.
2. Usa `import { pad } from '../comun/pad.js'`. En cada fotograma llama a `pad.update()` y luego lee `pad.lx`, `pad.ly`, `pad.rx`, `pad.ry`, `pad.pressed('A')`, `pad.down('B')`…
3. Para sonidos usa `suena('toque')` y el resto de `comun/sonido.js`. Para récords, `records.leer/guardar` de `comun/tv.js`.
4. Añade el juego a `JUEGOS` en `web/comun/juegos.js` y su carátula en `web/caratulas/` y, para que tenga estaciones, llama a `vestir(THREE, escena)` de `comun/estaciones.js` cuando el escenario esté montado (y añade la carpeta a la lista de juegos de `comun/musica.js`).
5. Para que salga en el **tablero de fiesta**: en el juego, usa `FIESTA`, `resultadoFiesta(juego, [{ id: perfilId, valor }])` y `volverAlTablero()` de `comun/fiesta.js` (copia cómo lo hace `carrera/`), y añádelo a `MINIJUEGOS` en `web/fiesta/juego.js`. Tiene que ser competitivo y durar poco.

## Publicar en GitHub Pages (para no reinstalar la APK)

1. Sube el **contenido** de `web/` a un repo (por ejemplo `juegos-del-bosque`) y activa Pages.
2. Reconstruye la app para que abra esa web: `cd app && ./build.sh https://TU_USUARIO.github.io/juegos-del-bosque/`
3. A partir de ahí, cada cambio que subas a GitHub aparece en la tele al abrir la app. Si no hay internet, la app usa la copia de los juegos que lleva dentro.

## Publicar con otro nombre en casa

`app/local.conf` (no se sube) puede definir `NOMBRE_APP`, `PAQUETE` y `NOMBRE_APK`, y lo que haya en `app/local/res/` sustituye a `app/res/` (por ejemplo, el cartel con el nombre). Así la app instalada en casa puede llamarse de otra forma y conservar su identificador, y lo publicado sigue siendo «Juegos del bosque». Para hacer un cartel con otro nombre: `web/_prueba/icono.html?banner&nombre=…`.

## Reconstruir la APK

Solo hace falta Java 17 o superior. La primera vez se bajan de GitHub apktool, dx y apksigner.

```bash
cd app
./build.sh                 # los juegos van dentro de la APK
./build.sh https://...     # abre tu web y usa la copia de dentro si no hay red
```

**Guarda `app/firma.keystore` y `app/firma.clave`** (la firma y su contraseña; ninguna de las dos se sube al repositorio). Las actualizaciones tienen que ir firmadas con la misma clave. Si la pierdes, tendrás que desinstalar la app antes de instalar la nueva.

## Depurar en la tele

Con adb conectado, abre `chrome://inspect` en el Chrome del PC. Verás la página que corre en el Chromecast, con su consola y su rendimiento.

## Licencia

- El código y todo lo que es propio del proyecto (los nueve animales, el icono, las carátulas y los fondos) están bajo la licencia **MIT** (`LICENSE`).
- Lo que viene de otros (three.js, PeerJS, el generador de QR, la fuente Fredoka y los modelos de naturaleza de KayKit y Quaternius, estos últimos CC0) conserva su licencia: ver `CREDITOS.md`.
- La música no forma parte del repositorio.
