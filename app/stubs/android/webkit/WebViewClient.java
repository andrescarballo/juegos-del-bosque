package android.webkit;

public class WebViewClient {
    public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) { return null; }
    public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {}
}
