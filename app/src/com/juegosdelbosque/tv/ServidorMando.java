package com.juegosdelbosque.tv;

import java.io.BufferedInputStream;
import java.io.ByteArrayOutputStream;
import java.io.EOFException;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.Inet4Address;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.NetworkInterface;
import java.net.ServerSocket;
import java.net.Socket;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.Enumeration;
import java.util.HashMap;
import java.util.List;

/**
 * Servidor dentro de la wifi de casa para usar el móvil como mando.
 *
 *  - GET /            -> la página de mando (assets/web/movil/index.html)
 *  - GET /ws?id=CLAVE -> WebSocket (CLAVE la guarda el móvil: si se reconecta, recupera su número): el móvil manda "p,botones,lx,ly,rx,ry" ~30 veces por segundo
 *  - La tele manda   "ok,N" (número de jugador) y "v,ms" (vibrar)
 *
 * Solo usa Java estándar (nada de Android), así se puede probar en el PC.
 */
public class ServidorMando implements Runnable {

    /** De dónde salen los ficheros (en la app: los assets de la APK). */
    public interface Fuente {
        InputStream abrir(String ruta) throws IOException;
    }

    static final String GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";
    static final long CADUCA_MS = 1500; // si un móvil deja de hablar (pantalla bloqueada), se ignora su estado

    final Fuente fuente;
    ServerSocket servidor;
    volatile int puerto = 0;
    volatile boolean vivo = false;
    final List<Movil> moviles = new ArrayList<Movil>();
    int siguiente = 1;
    /** clave del móvil -> su número, para que al reconectarse siga siendo el mismo jugador */
    final HashMap<String, Integer> numeros = new HashMap<String, Integer>();

    public ServidorMando(Fuente fuente) {
        this.fuente = fuente;
    }

    public boolean arrancar(int puertoBase) {
        for (int p = puertoBase; p < puertoBase + 10; p++) {
            try {
                ServerSocket s = new ServerSocket();
                s.setReuseAddress(true);
                s.bind(new InetSocketAddress(p));
                servidor = s;
                puerto = p;
                vivo = true;
                Thread t = new Thread(this, "servidor-mando");
                t.setDaemon(true);
                t.start();
                return true;
            } catch (IOException e) {
                // ocupado: probamos el siguiente
            }
        }
        return false;
    }

    public void parar() {
        vivo = false;
        try { if (servidor != null) servidor.close(); } catch (IOException e) { /* nada */ }
        for (Movil m : copia()) m.cerrar();
    }

    @Override
    public void run() {
        while (vivo) {
            try {
                final Socket s = servidor.accept();
                Thread t = new Thread(new Runnable() {
                    @Override
                    public void run() { atender(s); }
                }, "cliente-mando");
                t.setDaemon(true);
                t.start();
            } catch (IOException e) {
                if (!vivo) return;
            }
        }
    }

    // ---------- Estado combinado de todos los móviles ----------

    List<Movil> copia() {
        synchronized (moviles) { return new ArrayList<Movil>(moviles); }
    }

    public int conectados() {
        int n = 0;
        long ahora = System.currentTimeMillis();
        for (Movil m : copia()) if (ahora - m.ultimo < CADUCA_MS * 4) n++;
        return n;
    }

    public int mascara() {
        int r = 0;
        long ahora = System.currentTimeMillis();
        for (Movil m : copia()) if (ahora - m.ultimo < CADUCA_MS) r |= m.mask;
        return r;
    }

    /** lx, ly, rx, ry: de todos los móviles, el valor más fuerte de cada eje. */
    public float[] ejes() {
        float[] a = new float[4];
        long ahora = System.currentTimeMillis();
        for (Movil m : copia()) {
            if (ahora - m.ultimo >= CADUCA_MS) continue;
            a[0] = mayor(a[0], m.lx);
            a[1] = mayor(a[1], m.ly);
            a[2] = mayor(a[2], m.rx);
            a[3] = mayor(a[3], m.ry);
        }
        return a;
    }

    static float mayor(float a, float b) { return Math.abs(b) > Math.abs(a) ? b : a; }

    /** Cada móvil por separado: "m<id>|Móvil N|botones|lx|ly|rx|ry|0|0;" */
    public String lista() {
        StringBuilder sb = new StringBuilder();
        long ahora = System.currentTimeMillis();
        for (Movil m : copia()) {
            if (ahora - m.ultimo >= CADUCA_MS * 4) continue;
            boolean fresco = ahora - m.ultimo < CADUCA_MS;
            sb.append('m').append(m.id).append('|').append(m.nombre.replace('|', ' ').replace(';', ' ')).append('|')
              .append(fresco ? m.mask : 0).append('|').append(fresco ? m.lx : 0f).append('|').append(fresco ? m.ly : 0f)
              .append('|').append(fresco ? m.rx : 0f).append('|').append(fresco ? m.ry : 0f).append("|0|0;");
        }
        return sb.toString();
    }

    /** Vibra solo el móvil con ese número. */
    public void vibrarA(int id, int ms) {
        for (Movil m : copia()) if (m.id == id) m.enviar("v," + ms);
    }

    public void vibrar(int ms) {
        for (Movil m : copia()) m.enviar("v," + ms);
    }

    /** http://IP:puerto/ para el QR, o "" si no hay wifi. */
    public String url() {
        String ip = ipLocal();
        return ip == null || puerto == 0 ? "" : "http://" + ip + ":" + puerto + "/";
    }

    static String ipLocal() {
        String otra = null;
        try {
            Enumeration<NetworkInterface> ifs = NetworkInterface.getNetworkInterfaces();
            while (ifs != null && ifs.hasMoreElements()) {
                NetworkInterface ni = ifs.nextElement();
                if (!ni.isUp() || ni.isLoopback()) continue;
                Enumeration<InetAddress> ds = ni.getInetAddresses();
                while (ds.hasMoreElements()) {
                    InetAddress d = ds.nextElement();
                    if (!(d instanceof Inet4Address) || d.isLoopbackAddress()) continue;
                    if (d.isSiteLocalAddress()) return d.getHostAddress();
                    if (otra == null) otra = d.getHostAddress();
                }
            }
        } catch (Exception e) { /* sin red */ }
        return otra;
    }

    // ---------- HTTP ----------

    void atender(Socket s) {
        try {
            s.setTcpNoDelay(true);
            s.setSoTimeout(10000);
            InputStream in = new BufferedInputStream(s.getInputStream());
            OutputStream out = s.getOutputStream();
            String cab = leerCabecera(in);
            if (cab == null) { s.close(); return; }
            String[] lineas = cab.split("\r\n");
            String[] primera = lineas[0].split(" ");
            String ruta = primera.length > 1 ? primera[1] : "/";
            String clave = null;
            boolean ws = false;
            for (int i = 1; i < lineas.length; i++) {
                int dp = lineas[i].indexOf(':');
                if (dp < 0) continue;
                String k = lineas[i].substring(0, dp).trim().toLowerCase();
                String v = lineas[i].substring(dp + 1).trim();
                if (k.equals("sec-websocket-key")) clave = v;
                if (k.equals("upgrade") && v.toLowerCase().indexOf("websocket") >= 0) ws = true;
            }
            if (ws && clave != null) {
                websocket(s, in, out, clave, claveMovil(ruta));
            } else {
                servirFichero(out, ruta);
            }
        } catch (Exception e) {
            // el móvil se fue: nada que hacer
        }
        try { s.close(); } catch (IOException e) { /* nada */ }
    }

    static String leerCabecera(InputStream in) throws IOException {
        ByteArrayOutputStream b = new ByteArrayOutputStream();
        int c, estado = 0;
        while ((c = in.read()) >= 0) {
            b.write(c);
            if (b.size() > 16384) return null;
            if (c == '\r' && (estado == 0 || estado == 2)) estado++;
            else if (c == '\n' && (estado == 1 || estado == 3)) estado++;
            else estado = 0;
            if (estado == 4) return new String(b.toByteArray(), "ISO-8859-1");
        }
        return null;
    }

    void servirFichero(OutputStream out, String ruta) throws IOException {
        int q = ruta.indexOf('?');
        if (q >= 0) ruta = ruta.substring(0, q);
        if (ruta.length() == 0 || ruta.equals("/")) ruta = "/movil/index.html";
        if (ruta.endsWith("/")) ruta = ruta + "index.html";
        byte[] datos = null;
        if (ruta.indexOf("..") < 0) {
            try {
                InputStream f = fuente.abrir("web" + ruta);
                datos = leerTodo(f);
            } catch (IOException e) { /* no existe */ }
        }
        String estado = "200 OK", tipo = mime(ruta);
        if (datos == null) { estado = "404 Not Found"; tipo = "text/plain"; datos = "No encontrado".getBytes("UTF-8"); }
        if (tipo.startsWith("text/") || tipo.endsWith("json")) tipo = tipo + "; charset=utf-8";
        String h = "HTTP/1.1 " + estado + "\r\nContent-Type: " + tipo + "\r\nContent-Length: " + datos.length
                + "\r\nCache-Control: no-cache\r\nConnection: close\r\n\r\n";
        out.write(h.getBytes("ISO-8859-1"));
        out.write(datos);
        out.flush();
    }

    static byte[] leerTodo(InputStream in) throws IOException {
        ByteArrayOutputStream o = new ByteArrayOutputStream();
        byte[] buf = new byte[8192];
        int n;
        while ((n = in.read(buf)) > 0) o.write(buf, 0, n);
        in.close();
        return o.toByteArray();
    }

    // ---------- WebSocket ----------

    /** "/ws?id=abc123" -> "abc123" (solo letras y números), o null. */
    static String claveMovil(String ruta) {
        int i = ruta.indexOf("id=");
        if (i < 0) return null;
        StringBuilder sb = new StringBuilder();
        for (int j = i + 3; j < ruta.length() && sb.length() < 40; j++) {
            char c = ruta.charAt(j);
            if (Character.isLetterOrDigit(c)) sb.append(c); else break;
        }
        return sb.length() == 0 ? null : sb.toString();
    }

    void websocket(Socket s, InputStream in, OutputStream out, String clave, String claveMovil) throws Exception {
        MessageDigest sha1 = MessageDigest.getInstance("SHA-1");
        String acepta = base64(sha1.digest((clave + GUID).getBytes("ISO-8859-1")));
        out.write(("HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: "
                + acepta + "\r\n\r\n").getBytes("ISO-8859-1"));
        out.flush();

        Movil m;
        List<Movil> viejos = new ArrayList<Movil>();
        synchronized (moviles) {
            Integer n = claveMovil == null ? null : numeros.get(claveMovil);
            if (n == null) {
                n = siguiente++;
                if (claveMovil != null) numeros.put(claveMovil, n);
            }
            // si el mismo móvil tenía una conexión colgada, la quitamos: ahora manda esta
            for (Movil o : moviles) if (o.id == n) viejos.add(o);
            moviles.removeAll(viejos);
            m = new Movil(n, s, out);
            moviles.add(m);
        }
        for (Movil o : viejos) o.cerrar();
        m.enviar("ok," + m.id);
        try {
            byte[] mascara = new byte[4];
            while (vivo) {
                int b0 = uno(in), b1 = uno(in);
                int op = b0 & 0x0F;
                long len = b1 & 0x7F;
                if (len == 126) len = (uno(in) << 8) | uno(in);
                else if (len == 127) { len = 0; for (int i = 0; i < 8; i++) len = (len << 8) | uno(in); }
                if (len > 65536) break;
                boolean conMascara = (b1 & 0x80) != 0;
                if (conMascara) exacto(in, mascara);
                byte[] p = new byte[(int) len];
                exacto(in, p);
                if (conMascara) for (int i = 0; i < p.length; i++) p[i] ^= mascara[i & 3];
                if (op == 0x8) break;                          // cierre
                if (op == 0x9) { m.frame(0xA, p); continue; }  // ping -> pong
                if (op == 0x1) m.mensaje(new String(p, "UTF-8"));
            }
        } finally {
            synchronized (moviles) { moviles.remove(m); }
            m.cerrar();
        }
    }

    static int uno(InputStream in) throws IOException {
        int c = in.read();
        if (c < 0) throw new EOFException();
        return c;
    }

    static void exacto(InputStream in, byte[] b) throws IOException {
        int n = 0;
        while (n < b.length) {
            int r = in.read(b, n, b.length - n);
            if (r < 0) throw new EOFException();
            n += r;
        }
    }

    static final String B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

    static String base64(byte[] d) {
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < d.length; i += 3) {
            int b = (d[i] & 0xFF) << 16
                    | (i + 1 < d.length ? (d[i + 1] & 0xFF) << 8 : 0)
                    | (i + 2 < d.length ? d[i + 2] & 0xFF : 0);
            sb.append(B64.charAt((b >> 18) & 63)).append(B64.charAt((b >> 12) & 63));
            sb.append(i + 1 < d.length ? B64.charAt((b >> 6) & 63) : '=');
            sb.append(i + 2 < d.length ? B64.charAt(b & 63) : '=');
        }
        return sb.toString();
    }

    static final class Movil {
        final int id;
        final Socket s;
        final OutputStream out;
        volatile int mask;
        volatile float lx, ly, rx, ry;
        volatile long ultimo = System.currentTimeMillis();
        volatile String nombre;

        Movil(int id, Socket s, OutputStream out) { this.id = id; this.s = s; this.out = out; this.nombre = "Móvil " + id; }

        void mensaje(String t) {
            ultimo = System.currentTimeMillis();
            if (t.startsWith("n,") && t.length() > 2) { nombre = t.substring(2, Math.min(t.length(), 26)).replace(',', ' '); return; }
            if (!t.startsWith("p,")) return;
            String[] v = t.split(",");
            if (v.length < 6) return;
            try {
                mask = Integer.parseInt(v[1]);
                lx = num(v[2]); ly = num(v[3]); rx = num(v[4]); ry = num(v[5]);
            } catch (NumberFormatException e) { /* mensaje raro: lo ignoramos */ }
        }

        static float num(String s) {
            float f = Float.parseFloat(s);
            return f > 1f ? 1f : (f < -1f ? -1f : f);
        }

        synchronized void frame(int op, byte[] p) throws IOException {
            out.write(0x80 | op);
            if (p.length < 126) out.write(p.length);
            else { out.write(126); out.write((p.length >> 8) & 0xFF); out.write(p.length & 0xFF); }
            out.write(p);
            out.flush();
        }

        void enviar(String t) {
            try { frame(0x1, t.getBytes("UTF-8")); } catch (IOException e) { cerrar(); }
        }

        void cerrar() {
            try { s.close(); } catch (IOException e) { /* nada */ }
        }
    }

    static String mime(String p) {
        String l = p.toLowerCase();
        if (l.endsWith(".html") || l.endsWith(".htm")) return "text/html";
        if (l.endsWith(".js") || l.endsWith(".mjs")) return "text/javascript";
        if (l.endsWith(".css")) return "text/css";
        if (l.endsWith(".json") || l.endsWith(".webmanifest")) return "application/json";
        if (l.endsWith(".png")) return "image/png";
        if (l.endsWith(".jpg") || l.endsWith(".jpeg")) return "image/jpeg";
        if (l.endsWith(".webp")) return "image/webp";
        if (l.endsWith(".svg")) return "image/svg+xml";
        if (l.endsWith(".woff2")) return "font/woff2";
        if (l.endsWith(".woff")) return "font/woff";
        if (l.endsWith(".glb")) return "model/gltf-binary";
        if (l.endsWith(".gltf")) return "model/gltf+json";
        if (l.endsWith(".mp3")) return "audio/mpeg";
        if (l.endsWith(".ogg")) return "audio/ogg";
        if (l.endsWith(".wav")) return "audio/wav";
        if (l.endsWith(".wasm")) return "application/wasm";
        if (l.endsWith(".txt")) return "text/plain";
        return "application/octet-stream";
    }
}
