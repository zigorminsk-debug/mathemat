package by.mathemat.predel;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.os.Bundle;
import android.net.Uri;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import java.io.IOException;
import java.io.InputStream;
import java.util.Locale;

/** Hosts only bundled resources on a secure, local origin; the app needs no network permission. */
public final class MainActivity extends Activity {
    private static final String HOST = "appassets.androidplatform.net";
    private static final String ROOT = "https://" + HOST + "/assets/";
    private WebView webView;

    @SuppressLint("SetJavaScriptEnabled")
    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        webView = new WebView(this);
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setAllowFileAccessFromFileURLs(false);
        settings.setAllowUniversalAccessFromFileURLs(false);
        settings.setSupportZoom(false);
        settings.setDefaultTextEncodingName("UTF-8");
        webView.setBackgroundColor(0xfff8f7f2);
        webView.setWebViewClient(new LocalClient());
        setContentView(webView);
        if (state == null || webView.restoreState(state) == null) {
            webView.loadUrl(ROOT + "index.html");
        }
    }

    @Override protected void onSaveInstanceState(Bundle outState) {
        super.onSaveInstanceState(outState);
        webView.saveState(outState);
    }

    @Override public void onBackPressed() {
        // JavaScript handles in-app history first; Android closes the app only at the root.
        webView.evaluateJavascript("window.Predel ? window.Predel.back() : false", result -> {
            if (!"true".equals(result)) MainActivity.super.onBackPressed();
        });
    }

    @Override protected void onDestroy() {
        webView.destroy();
        super.onDestroy();
    }

    private final class LocalClient extends WebViewClient {
        @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
            Uri uri = request.getUrl();
            return !"https".equals(uri.getScheme()) || !HOST.equals(uri.getHost());
        }

        @Override public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
            Uri uri = request.getUrl();
            String path = uri.getPath();
            if (!"https".equals(uri.getScheme()) || !HOST.equals(uri.getHost()) || path == null
                    || !path.startsWith("/assets/") || path.contains("..")) {
                return forbidden();
            }
            String assetPath = path.substring("/assets/".length());
            try {
                InputStream input = getAssets().open(assetPath);
                String type = mimeType(assetPath);
                String encoding = type.startsWith("text/") || type.equals("application/javascript")
                        || type.equals("application/json") ? "UTF-8" : null;
                return new WebResourceResponse(type, encoding, input);
            } catch (IOException error) {
                return new WebResourceResponse("text/plain", "UTF-8", 404, "Not Found", null,
                        new java.io.ByteArrayInputStream(new byte[0]));
            }
        }

        private WebResourceResponse forbidden() {
            return new WebResourceResponse("text/plain", "UTF-8", 403, "Forbidden", null,
                    new java.io.ByteArrayInputStream(new byte[0]));
        }

        private String mimeType(String path) {
            String lower = path.toLowerCase(Locale.ROOT);
            if (lower.endsWith(".html")) return "text/html";
            if (lower.endsWith(".css")) return "text/css";
            if (lower.endsWith(".js")) return "application/javascript";
            if (lower.endsWith(".json")) return "application/json";
            if (lower.endsWith(".woff2")) return "font/woff2";
            if (lower.endsWith(".woff")) return "font/woff";
            if (lower.endsWith(".ttf")) return "font/ttf";
            if (lower.endsWith(".svg")) return "image/svg+xml";
            return "application/octet-stream";
        }
    }
}
