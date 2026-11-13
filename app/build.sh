#!/usr/bin/env bash
# Construye la APK de "Juegos del bosque" sin Android Studio ni SDK.
# Solo necesita Java (JDK 17 o superior) e internet la primera vez (baja las herramientas de GitHub).
#
#   ./build.sh                                   -> juegos dentro de la APK (funciona sin internet)
#   ./build.sh https://TU_USUARIO.github.io/juegos-del-bosque/
#                                                -> abre tu web; si no hay red, usa la copia de dentro
#
# Resultado: build/JuegosDelBosque.apk
#
# Para una versión de casa con otro nombre: app/local.conf (no se sube al repositorio) puede definir NOMBRE_APP,
# PAQUETE (el identificador de la app instalada) y NOMBRE_APK, y lo que haya en app/local/res/ sustituye a res/.
set -euo pipefail

cd "$(dirname "$0")"
APP_DIR="$(pwd)"
WEB_DIR="$APP_DIR/../web"
OUT="$APP_DIR/build"
CACHE="${JUEGOS_TOOLS:-$APP_DIR/.herramientas}"
START_URL="${1:-}"
VERSION_CODE="${VERSION_CODE:-$(date +%s | cut -c1-9)}"
VERSION_NAME="${VERSION_NAME:-0.1}"
NOMBRE_APP="Juegos del bosque"; PAQUETE=""; NOMBRE_APK="JuegosDelBosque"
[ -f "$APP_DIR/local.conf" ] && . "$APP_DIR/local.conf"

APKTOOL_URL="https://github.com/iBotPeaches/Apktool/releases/download/v2.12.1/apktool_2.12.1.jar"
DEX2JAR_URL="https://github.com/pxb1988/dex2jar/releases/download/v2.4/dex-tools-v2.4.zip"
SIGNER_URL="https://github.com/patrickfav/uber-apk-signer/releases/download/v1.3.0/uber-apk-signer-1.3.0.jar"

case "$(uname -s)" in
  Linux*)  AAPT2_IN="prebuilt/linux/aapt2_64" ;;
  Darwin*) AAPT2_IN="prebuilt/macosx/aapt2_64" ;;
  *) echo "Usa Linux, macOS o WSL en Windows."; exit 1 ;;
esac

# ---- Herramientas (se bajan una vez) ----
mkdir -p "$CACHE"
fetch() { [ -f "$CACHE/$2" ] || { echo "Bajando $2..."; curl -fsSL -o "$CACHE/$2" "$1"; }; }
fetch "$APKTOOL_URL" apktool.jar
fetch "$DEX2JAR_URL" dex-tools.zip
fetch "$SIGNER_URL" uber-apk-signer.jar
if [ ! -x "$CACHE/aapt2" ]; then
  unzip -o -q -j "$CACHE/apktool.jar" "$AAPT2_IN" -d "$CACHE/tmp" && mv "$CACHE/tmp/$(basename "$AAPT2_IN")" "$CACHE/aapt2"
  unzip -o -q -j "$CACHE/apktool.jar" prebuilt/android-framework.jar -d "$CACHE"
  unzip -o -q -j "$CACHE/dex-tools.zip" '*/lib/dx-*.jar' -d "$CACHE/tmp" && mv "$CACHE"/tmp/dx-*.jar "$CACHE/dx.jar"
  unzip -o -q -j "$CACHE/uber-apk-signer.jar" lib/apksigner_33_0_2.jar -d "$CACHE/tmp"
  mv "$CACHE/tmp/apksigner_33_0_2.jar" "$CACHE/apksigner.jar"
  chmod +x "$CACHE/aapt2"; rm -rf "$CACHE/tmp"
fi

# ---- Firma (guárdala: con otra firma no se puede actualizar la app instalada) ----
KEYSTORE="$APP_DIR/firma.keystore"
# La contraseña de la firma no va en este archivo: se lee de la variable FIRMA_CLAVE o de app/firma.clave
# (que, como la firma, no se sube al repositorio). Si no hay ninguna, se inventa una y se guarda ahí.
CLAVE_FICHERO="$APP_DIR/firma.clave"
if [ -z "${FIRMA_CLAVE:-}" ]; then
  if [ ! -f "$CLAVE_FICHERO" ]; then
    if [ -f "$KEYSTORE" ]; then echo "Falta la contraseña de $KEYSTORE: ponla en FIRMA_CLAVE o en app/firma.clave"; exit 1; fi
    (umask 077; head -c 18 /dev/urandom | base64 | tr -d '/+=' > "$CLAVE_FICHERO")
  fi
  FIRMA_CLAVE="$(cat "$CLAVE_FICHERO")"
fi
if [ ! -f "$KEYSTORE" ]; then
  keytool -genkeypair -keystore "$KEYSTORE" -storepass "$FIRMA_CLAVE" -keypass "$FIRMA_CLAVE" -alias juegos \
    -keyalg RSA -keysize 2048 -validity 10000 -dname "CN=$NOMBRE_APP" >/dev/null 2>&1
fi

rm -rf "$OUT"; mkdir -p "$OUT"/{stubs,classes,assets,res}

# ---- Java -> dex ----
# javac si está; si no, el compilador que ya trae dentro un JDK aunque no tenga la orden javac
if command -v javac >/dev/null; then JAVAC=(javac --release 8)
elif java --list-modules 2>/dev/null | grep -q '^jdk.compiler'; then JAVAC=(java -m jdk.compiler/com.sun.tools.javac.Main -source 8 -target 8 -Xlint:-options)
else JAVAC=(); fi
if [ ${#JAVAC[@]} -gt 0 ]; then
  "${JAVAC[@]}" -nowarn -d "$OUT/stubs" $(find stubs -name '*.java') 2>&1 | grep -v "warning" || true
  "${JAVAC[@]}" -nowarn -cp "$OUT/stubs" -d "$OUT/classes" $(find src -name '*.java') 2>&1 | grep -v "warning" || true
  [ -f "$OUT/classes/com/juegosdelbosque/tv/MainActivity.class" ] || { echo "Error compilando Java"; exit 1; }
  java -cp "$CACHE/dx.jar" com.android.dx.command.Main --dex --min-sdk-version=24 --output="$OUT/classes.dex" "$OUT/classes"
elif [ -n "${DEX_DE:-}" ]; then
  # Sin compilador: reutiliza el código Java ya compilado de otra APK (solo vale si no has tocado src/)
  unzip -p "$DEX_DE" classes.dex > "$OUT/classes.dex"
  echo "Aviso: sin javac; uso el classes.dex de $DEX_DE"
else
  echo "Falta un JDK con compilador (sudo apt install openjdk-17-jdk-headless)"
  echo "o, si no has cambiado nada en src/, reutiliza una APK anterior: DEX_DE=build/$NOMBRE_APK.apk ./build.sh"
  exit 1
fi

# ---- Juegos dentro de la APK ----
cp -R "$WEB_DIR" "$OUT/assets/web"
if [ "$NOMBRE_APP" != "Juegos del bosque" ]; then   # versión de casa: su nombre también en el menú
  sed -i "s/Juegos del bosque/$NOMBRE_APP/g" "$OUT/assets/web/index.html" "$OUT/assets/web/manifest.webmanifest" "$OUT/assets/web/movil/index.html"
fi
printf '%s\n' "$START_URL" > "$OUT/assets/start_url.txt"

# ---- Recursos + manifiesto -> APK ----
cp -R res "$OUT/res-src"
[ -d local/res ] && cp -R local/res/. "$OUT/res-src/"
printf '<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <string name="app_name">%s</string>\n</resources>\n' "$NOMBRE_APP" > "$OUT/res-src/values/strings.xml"
"$CACHE/aapt2" compile --dir "$OUT/res-src" -o "$OUT/res/res.zip"
"$CACHE/aapt2" link -o "$OUT/base.apk" -I "$CACHE/android-framework.jar" \
  --manifest AndroidManifest.xml -A "$OUT/assets" "$OUT/res/res.zip" \
  --min-sdk-version 24 --target-sdk-version 34 \
  --version-code "$VERSION_CODE" --version-name "$VERSION_NAME" ${PAQUETE:+--rename-manifest-package "$PAQUETE"} \
  -0 .glb -0 .png -0 .woff2 -0 .mp3 -0 .ogg
(cd "$OUT" && zip -q -0 base.apk classes.dex 2>/dev/null || python3 -c "import zipfile;z=zipfile.ZipFile('base.apk','a');z.write('classes.dex');z.close()")
python3 zipalign.py "$OUT/base.apk" "$OUT/aligned.apk"
java -jar "$CACHE/apksigner.jar" sign --ks "$KEYSTORE" --ks-pass "pass:$FIRMA_CLAVE" --ks-key-alias juegos \
  --out "$OUT/$NOMBRE_APK.apk" "$OUT/aligned.apk"
java -jar "$CACHE/apksigner.jar" verify "$OUT/$NOMBRE_APK.apk"
rm -f "$OUT/base.apk" "$OUT/aligned.apk" "$OUT"/*.idsig
echo "Listo: $OUT/$NOMBRE_APK.apk  (inicio: ${START_URL:-juegos de dentro de la APK})"
