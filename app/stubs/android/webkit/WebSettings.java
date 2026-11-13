package android.webkit;

public abstract class WebSettings {
    public void setJavaScriptEnabled(boolean f) {}
    public void setDomStorageEnabled(boolean f) {}
    public void setDatabaseEnabled(boolean f) {}
    public void setMediaPlaybackRequiresUserGesture(boolean f) {}
    public void setUserAgentString(String ua) {}
    public String getUserAgentString() { return null; }
    public void setCacheMode(int mode) {}
}
