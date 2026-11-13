package android.webkit;

public class WebView extends android.view.View {
    public WebView(android.content.Context c) { super(c); }
    public WebSettings getSettings() { return null; }
    public void loadUrl(String url) {}
    public void reload() {}
    public String getUrl() { return null; }
    public void setWebViewClient(WebViewClient c) {}
    public void setWebChromeClient(WebChromeClient c) {}
    public void addJavascriptInterface(Object o, String name) {}
    public boolean canGoBack() { return false; }
    public void goBack() {}
    public void evaluateJavascript(String script, ValueCallback<String> cb) {}
    public void onPause() {}
    public void onResume() {}
    public static void setWebContentsDebuggingEnabled(boolean enabled) {}
}
