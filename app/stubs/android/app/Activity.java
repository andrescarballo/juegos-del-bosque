package android.app;

// Stub solo para compilar: en el Chromecast se usa la clase real de Android.
public class Activity extends android.content.Context {
    protected void onCreate(android.os.Bundle b) {}
    protected void onResume() {}
    protected void onPause() {}
    protected void onDestroy() {}
    public void setContentView(android.view.View v) {}
    public android.view.Window getWindow() { return null; }
    public void finish() {}
    public void runOnUiThread(Runnable r) {}
    public boolean dispatchKeyEvent(android.view.KeyEvent e) { return false; }
    public boolean dispatchGenericMotionEvent(android.view.MotionEvent e) { return false; }
}
