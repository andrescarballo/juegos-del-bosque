package com.juegosdelbosque.tv;

import android.app.Activity;
import android.os.Bundle;
import android.view.InputDevice;
import android.view.KeyEvent;
import android.view.MotionEvent;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.util.HashMap;
import java.util.Map;

/**
 * Contenedor para Android TV: una vista web a pantalla completa que carga el menú de juegos.
 *
 * - Los juegos van dentro de la APK (assets/web) y se sirven en https://appassets.androidplatform.net/,
 *   así funcionan sin internet y con los mismos módulos/localStorage que en GitHub Pages.
 * - Si assets/start_url.txt tiene una URL (p. ej. tu GitHub Pages), se carga esa; si falla, se usa la copia local.
 * - El mando NO depende de que el WebView soporte la Gamepad API: la app recoge botones y sticks
 *   y la página los lee con window.NativePad.poll().
 * - Además levanta un servidor en la wifi (ServidorMando) para usar el móvil como mando: el menú enseña un QR.
 */
public class MainActivity extends Activity {

    static final String ASSET_HOST = "appassets.androidplatform.net";
    static final String LOCAL_START = "https://" + ASSET_HOST + "/index.html";

    // Índices del "standard gamepad" de la web (los mismos que usa navigator.getGamepads()).
    static final int B_A = 0, B_B = 1, B_X = 2, B_Y = 3, B_LB = 4, B_RB = 5, B_LT = 6, B_RT = 7,
            B_SELECT = 8, B_START = 9, B_L3 = 10, B_R3 = 11,
            B_UP = 12, B_DOWN = 13, B_LEFT = 14, B_RIGHT = 15, B_HOME = 16;

    // Constantes fijas del SDK de Android.
    static final int SOURCE_GAMEPAD = 0x00000401;
    static final int SOURCE_JOYSTICK = 0x01000010;
    static final int ACTION_DOWN = 0, ACTION_UP = 1, ACTION_MOVE = 2;
    static final int KEYCODE_BACK = 4;

    WebView web;
    String startUrl = LOCAL_START;
    boolean fellBack = false;

    volatile int keyButtons = 0;   // botones que llegan como teclas
    volatile int hatButtons = 0;   // cruceta que llega como ejes (HAT)
    volatile float lx, ly, rx, ry, lt, rt;
    volatile boolean connected = false;
    volatile String padName = "";
    ServidorMando servidor;

    /** Estado de cada mando físico por separado (para partidas de varios jugadores). */
    static final class Mando {
        final int id;
        String nombre = "Mando";
        volatile int keys, hat;
        volatile float lx, ly, rx, ry, lt, rt;
        Mando(int id) { this.id = id; }
    }
    final HashMap<Integer, Mando> mandos = new HashMap<Integer, Mando>();

    Mando mando(int id) {
        synchronized (mandos) {
            Mando m = mandos.get(id);
            if (m == null) {
                m = new Mando(id);
                InputDevice d = InputDevice.getDevice(id);
                if (d != null && d.getName() != null) m.nombre = d.getName();
                mandos.put(id, m);
            }
            return m;
        }
    }

    static String limpio(String s) {
        return s == null ? "" : s.replace('|', ' ').replace(';', ' ').replace(',', ' ');
    }

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        getWindow().addFlags(0x00000080 | 0x00000400); // KEEP_SCREEN_ON | FULLSCREEN
        WebView.setWebContentsDebuggingEnabled(true);   // depurar desde chrome://inspect en el PC

        String configured = readAsset("start_url.txt");
        if (configured != null) {
            configured = configured.trim();
            if (configured.startsWith("http")) startUrl = configured;
        }

        web = new WebView(this);
        web.setBackgroundColor(0xFF7FD0FF);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setUserAgentString(s.getUserAgentString() + " JuegosTV/1");
        web.addJavascriptInterface(new Bridge(), "NativePad");
        web.setWebViewClient(new Client());
        web.setFocusable(true);
        web.setFocusableInTouchMode(true);
        setContentView(web);
        web.requestFocus();
        scanDevices();
        web.loadUrl(startUrl);

        servidor = new ServidorMando(new ServidorMando.Fuente() {
            @Override
            public InputStream abrir(String ruta) throws IOException { return getAssets().open(ruta); }
        });
        servidor.arrancar(8765);
    }

    @Override
    protected void onDestroy() {
        if (servidor != null) servidor.parar();
        super.onDestroy();
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (web != null) web.onResume();
        scanDevices();
    }

    @Override
    protected void onPause() {
        keyButtons = 0;
        hatButtons = 0;
        lx = ly = rx = ry = lt = rt = 0f;
        synchronized (mandos) {
            for (Mando m : mandos.values()) { m.keys = 0; m.hat = 0; m.lx = m.ly = m.rx = m.ry = m.lt = m.rt = 0f; }
        }
        if (web != null) web.onPause();
        super.onPause();
    }

    // ---------- Mando ----------

    @Override
    public boolean dispatchKeyEvent(KeyEvent e) {
        int code = e.getKeyCode();
        int src = e.getSource();
        boolean fromPad = (src & SOURCE_GAMEPAD) == SOURCE_GAMEPAD || (src & SOURCE_JOYSTICK) == SOURCE_JOYSTICK;
        int idx = -1;
        if (fromPad || KeyEvent.isGamepadButton(code)) {
            idx = buttonIndex(code);
            if (idx < 0 && code == KEYCODE_BACK) idx = B_B; // algunos mandos mandan la B como "atrás"
        }
        if (idx >= 0) {
            connected = true;
            int bit = 1 << idx;
            Mando m = mando(e.getDeviceId());
            if (e.getAction() == ACTION_DOWN) { keyButtons = keyButtons | bit; m.keys = m.keys | bit; }
            else if (e.getAction() == ACTION_UP) { keyButtons = keyButtons & ~bit; m.keys = m.keys & ~bit; }
            return true; // consumido: que Android no lo convierta en "atrás"
        }
        if (code == KEYCODE_BACK) { // botón atrás del mando de la tele
            if (e.getAction() == ACTION_UP) handleBack();
            return true;
        }
        return super.dispatchKeyEvent(e); // flechas y OK del mando de la tele -> teclado normal en la web
    }

    @Override
    public boolean dispatchGenericMotionEvent(MotionEvent e) {
        int src = e.getSource();
        if ((src & SOURCE_JOYSTICK) == SOURCE_JOYSTICK && e.getAction() == ACTION_MOVE) {
            connected = true;
            lx = e.getAxisValue(0);   // AXIS_X
            ly = e.getAxisValue(1);   // AXIS_Y
            float z = e.getAxisValue(11), rzv = e.getAxisValue(14);   // AXIS_Z, AXIS_RZ (Xbox)
            float rxa = e.getAxisValue(12), rya = e.getAxisValue(13); // AXIS_RX, AXIS_RY (otros mandos)
            rx = Math.abs(z) >= Math.abs(rxa) ? z : rxa;
            ry = Math.abs(rzv) >= Math.abs(rya) ? rzv : rya;
            lt = Math.max(e.getAxisValue(17), e.getAxisValue(23)); // LTRIGGER / BRAKE
            rt = Math.max(e.getAxisValue(18), e.getAxisValue(22)); // RTRIGGER / GAS
            float hx = e.getAxisValue(15), hy = e.getAxisValue(16); // HAT = cruceta
            int h = 0;
            if (hy < -0.5f) h |= 1 << B_UP;
            if (hy > 0.5f) h |= 1 << B_DOWN;
            if (hx < -0.5f) h |= 1 << B_LEFT;
            if (hx > 0.5f) h |= 1 << B_RIGHT;
            hatButtons = h;
            Mando m = mando(e.getDeviceId());
            m.lx = lx; m.ly = ly; m.rx = rx; m.ry = ry; m.lt = lt; m.rt = rt; m.hat = h;
            return true;
        }
        return super.dispatchGenericMotionEvent(e);
    }

    static int buttonIndex(int code) {
        switch (code) {
            case 96: return B_A;        // BUTTON_A
            case 97: return B_B;        // BUTTON_B
            case 99: return B_X;        // BUTTON_X
            case 100: return B_Y;       // BUTTON_Y
            case 102: return B_LB;      // BUTTON_L1
            case 103: return B_RB;      // BUTTON_R1
            case 104: return B_LT;      // BUTTON_L2
            case 105: return B_RT;      // BUTTON_R2
            case 106: return B_L3;      // BUTTON_THUMBL
            case 107: return B_R3;      // BUTTON_THUMBR
            case 108: return B_START;   // BUTTON_START (Menú en Xbox)
            case 109: return B_SELECT;  // BUTTON_SELECT (Vista en Xbox)
            case 110: return B_HOME;    // BUTTON_MODE
            case 19: return B_UP;       // DPAD_* cuando vienen del mando
            case 20: return B_DOWN;
            case 21: return B_LEFT;
            case 22: return B_RIGHT;
            case 23: return B_A;        // DPAD_CENTER
            default: return -1;
        }
    }

    /**
     * Mira qué mandos hay de verdad ahora mismo: "conectado" solo si queda alguno, y se olvidan los que se han
     * apagado o desemparejado (si no, la tele seguiría diciendo "Mando conectado" para siempre).
     */
    void scanDevices() {
        int[] ids = InputDevice.getDeviceIds();
        if (ids == null) return;
        boolean hay = false;
        java.util.HashSet<Integer> presentes = new java.util.HashSet<Integer>();
        for (int i = 0; i < ids.length; i++) {
            InputDevice d = InputDevice.getDevice(ids[i]);
            if (d == null) continue;
            int s = d.getSources();
            if ((s & SOURCE_GAMEPAD) == SOURCE_GAMEPAD || (s & SOURCE_JOYSTICK) == SOURCE_JOYSTICK) {
                hay = true;
                presentes.add(ids[i]);
                String n = d.getName();
                padName = n == null ? "Mando" : n;
            }
        }
        connected = hay;
        synchronized (mandos) { mandos.keySet().retainAll(presentes); }
        if (!hay) { keyButtons = 0; hatButtons = 0; lx = ly = rx = ry = lt = rt = 0; }
    }

    long ultimoScan = 0;
    /** Como mucho una vez por segundo: lo llama la página al leer el mando. */
    void revisarMandos() {
        long ahora = System.currentTimeMillis();
        if (ahora - ultimoScan < 1000) return;
        ultimoScan = ahora;
        scanDevices();
    }

    void handleBack() {
        // Primero le preguntamos a la página (window.onTvBack); si no lo gestiona, atrás normal o salir.
        web.evaluateJavascript("(window.onTvBack&&window.onTvBack())?'1':'0'", new ValueCallback<String>() {
            @Override
            public void onReceiveValue(String v) {
                if (v != null && v.indexOf('1') >= 0) return;
                if (web.canGoBack()) web.goBack();
                else finish();
            }
        });
    }

    /** Lo que ve la página como window.NativePad */
    public class Bridge {
        @JavascriptInterface
        public String poll() {
            revisarMandos();
            int mask = keyButtons | hatButtons;
            float alx = lx, aly = ly, arx = rx, ary = ry;
            boolean con = connected;
            if (servidor != null && servidor.conectados() > 0) {
                con = true;
                mask |= servidor.mascara();
                float[] e = servidor.ejes();
                alx = ServidorMando.mayor(alx, e[0]); aly = ServidorMando.mayor(aly, e[1]);
                arx = ServidorMando.mayor(arx, e[2]); ary = ServidorMando.mayor(ary, e[3]);
            }
            StringBuilder sb = new StringBuilder(80);
            sb.append(con ? 1 : 0).append(',').append(mask)
              .append(',').append(alx).append(',').append(aly)
              .append(',').append(arx).append(',').append(ary)
              .append(',').append(lt).append(',').append(rt);
            return sb.toString();
        }

        /**
         * Cada mando y cada móvil por separado: "id|nombre|botones|lx|ly|rx|ry|lt|rt;" (g... = mando, m... = móvil).
         * Sirve para que cada uno sea un jugador distinto.
         */
        @JavascriptInterface
        public String dispositivos() {
            revisarMandos();
            StringBuilder sb = new StringBuilder(160);
            synchronized (mandos) {
                for (Mando m : mandos.values()) {
                    sb.append('g').append(m.id).append('|').append(limpio(m.nombre)).append('|').append(m.keys | m.hat)
                      .append('|').append(m.lx).append('|').append(m.ly).append('|').append(m.rx).append('|').append(m.ry)
                      .append('|').append(m.lt).append('|').append(m.rt).append(';');
                }
            }
            if (servidor != null) sb.append(servidor.lista());
            return sb.toString();
        }

        /** Dirección para el QR del móvil ("" si no hay wifi). */
        @JavascriptInterface
        public String movilUrl() { return servidor == null ? "" : servidor.url(); }

        /** Cuántos móviles hay conectados como mando. */
        @JavascriptInterface
        public int moviles() { return servidor == null ? 0 : servidor.conectados(); }

        /** Vibra solo el móvil de un jugador ("m3" = móvil 3). */
        @JavascriptInterface
        public void vibrarDisp(final String disp, final int ms) {
            if (servidor == null || disp == null || !disp.startsWith("m")) return;
            final int id;
            try { id = Integer.parseInt(disp.substring(1)); } catch (NumberFormatException e) { return; }
            new Thread(new Runnable() {
                @Override
                public void run() { servidor.vibrarA(id, ms); }
            }).start();
        }

        /** Hace vibrar los móviles conectados (p. ej. al dar un toque al globo). */
        @JavascriptInterface
        public void vibrar(final int ms) {
            if (servidor == null) return;
            new Thread(new Runnable() {
                @Override
                public void run() { servidor.vibrar(ms); }
            }).start();
        }

        @JavascriptInterface
        public String name() { return padName; }

        @JavascriptInterface
        public String version() { return "1"; }

        @JavascriptInterface
        public void exit() {
            runOnUiThread(new Runnable() {
                @Override
                public void run() { finish(); }
            });
        }
    }

    // ---------- Servir los juegos que van dentro de la APK ----------

    class Client extends WebViewClient {
        @Override
        public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest req) {
            android.net.Uri u = req.getUrl();
            if (u == null || !ASSET_HOST.equals(u.getHost())) return null;
            String path = u.getPath();
            if (path == null || path.length() == 0) path = "/";
            if (path.endsWith("/")) path = path + "index.html";
            Map<String, String> headers = new HashMap<String, String>();
            headers.put("Access-Control-Allow-Origin", "*");
            headers.put("Cache-Control", "no-cache");
            try {
                InputStream in = getAssets().open("web" + path);
                String mime = mime(path);
                String enc = mime.startsWith("text/") || mime.endsWith("json") || mime.endsWith("svg+xml") ? "utf-8" : null;
                return new WebResourceResponse(mime, enc, 200, "OK", headers, in);
            } catch (IOException e) {
                return new WebResourceResponse("text/plain", "utf-8", 404, "Not Found", headers,
                        new ByteArrayInputStream(new byte[0]));
            }
        }

        @Override
        public void onReceivedError(WebView view, WebResourceRequest req, WebResourceError err) {
            // Sin internet o URL mal puesta: tiramos de la copia que va dentro de la APK.
            if (req != null && req.isForMainFrame() && !fellBack && !LOCAL_START.equals(startUrl)) {
                fellBack = true;
                view.loadUrl(LOCAL_START);
            }
        }
    }

    static String mime(String p) { return ServidorMando.mime(p); }

    String readAsset(String name) {
        try {
            InputStream in = getAssets().open(name);
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            byte[] buf = new byte[4096];
            int n;
            while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
            in.close();
            return new String(out.toByteArray(), "UTF-8");
        } catch (IOException e) {
            return null;
        }
    }
}
