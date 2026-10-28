package kz.concerts.scanner;

import android.Manifest;
import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.SystemClock;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.view.View;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.PermissionRequest;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

/**
 * Оболочка сканера билетов. Сами экраны живут на concerts.kz/scanner,
 * поэтому любые правки сайта приходят без переустановки. При каждом
 * запуске приложение проверяет, нет ли новой версии самой оболочки.
 */
public class MainActivity extends Activity {

    private static final int CAMERA_REQUEST = 41;
    private static final long UPDATE_CHECK_INTERVAL_MS = 30 * 60 * 1000L;

    private WebView web;
    private PermissionRequest pendingPermission;
    private Updater updater;
    private long lastUpdateCheck;
    private boolean showingError;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        getWindow().setStatusBarColor(Color.parseColor("#0D0D0D"));
        getWindow().setNavigationBarColor(Color.parseColor("#0D0D0D"));

        web = new WebView(this);
        web.setBackgroundColor(Color.parseColor("#0D0D0D"));
        web.setOverScrollMode(View.OVER_SCROLL_NEVER);
        setContentView(web);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);
        s.setSupportZoom(false);
        s.setBuiltInZoomControls(false);
        s.setCacheMode(WebSettings.LOAD_DEFAULT);
        s.setUserAgentString(s.getUserAgentString() + " ConcertsScanner/" + BuildConfig.VERSION_NAME);

        // Свежая версия экранов при каждом запуске: старые файлы сайта не держим.
        web.clearCache(true);

        web.addJavascriptInterface(new Bridge(), "ConcertsApp");
        web.setWebViewClient(new Client());
        web.setWebChromeClient(new Chrome());

        updater = new Updater(this);

        if (savedInstanceState != null) web.restoreState(savedInstanceState);
        else web.loadUrl(BuildConfig.START_URL);
    }

    @Override
    protected void onResume() {
        super.onResume();
        web.onResume();
        long now = SystemClock.elapsedRealtime();
        if (lastUpdateCheck == 0 || now - lastUpdateCheck > UPDATE_CHECK_INTERVAL_MS) {
            lastUpdateCheck = now;
            updater.check(false);
        }
        updater.onResume();
    }

    @Override
    protected void onPause() {
        web.onPause();
        super.onPause();
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        super.onSaveInstanceState(outState);
        web.saveState(outState);
    }

    @Override
    protected void onDestroy() {
        web.destroy();
        super.onDestroy();
    }

    @Override
    @SuppressWarnings("deprecation")
    public void onBackPressed() {
        if (web.canGoBack() && !showingError) web.goBack();
        else super.onBackPressed();
    }

    static boolean isOwnHost(Uri uri) {
        if (uri == null || !"https".equals(uri.getScheme())) return false;
        String host = uri.getHost();
        return host != null && (host.equals("concerts.kz") || host.endsWith(".concerts.kz"));
    }

    private void showOffline(String reason) {
        showingError = true;
        String html = "<!doctype html><html><head><meta name=viewport content='width=device-width,initial-scale=1'>"
                + "<style>body{margin:0;height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;"
                + "background:#0d0d0d;color:#f7f7f7;font-family:sans-serif;text-align:center;padding:0 32px;box-sizing:border-box}"
                + "h1{font-size:22px;text-transform:uppercase;margin:0 0 12px}p{color:#b4b4b4;font-size:15px;line-height:1.5;margin:0 0 28px}"
                + "a{display:inline-block;background:#ff4d4d;color:#fff;text-decoration:none;font-weight:700;padding:16px 36px;border-radius:999px;"
                + "text-transform:uppercase;font-size:14px;letter-spacing:.04em}</style></head><body>"
                + "<h1>Нет связи</h1><p>Сканер работает только с интернетом: так один билет нельзя пройти дважды. "
                + "Проверьте Wi-Fi или мобильный интернет.</p><a href='#' onclick='ConcertsApp.retry();return false'>Повторить</a>"
                + "<p style='margin-top:28px;font-size:12px;color:#666'>" + escape(reason) + "</p></body></html>";
        web.loadDataWithBaseURL(null, html, "text/html", "utf-8", null);
    }

    private static String escape(String s) {
        return s == null ? "" : s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;");
    }

    private void retry() {
        showingError = false;
        web.clearHistory();
        web.loadUrl(BuildConfig.START_URL);
    }

    /* ---------- камера для страницы ---------- */

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode != CAMERA_REQUEST || pendingPermission == null) return;
        boolean ok = grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_GRANTED;
        if (ok) pendingPermission.grant(new String[]{PermissionRequest.RESOURCE_VIDEO_CAPTURE});
        else pendingPermission.deny();
        pendingPermission = null;
    }

    private class Chrome extends WebChromeClient {
        @Override
        public void onPermissionRequest(final PermissionRequest request) {
            runOnUiThread(() -> {
                boolean wantsCamera = false;
                for (String r : request.getResources()) {
                    if (PermissionRequest.RESOURCE_VIDEO_CAPTURE.equals(r)) wantsCamera = true;
                }
                // Камеру даём только своему сайту.
                if (!wantsCamera || !isOwnHost(request.getOrigin())) {
                    request.deny();
                    return;
                }
                if (checkSelfPermission(Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) {
                    request.grant(new String[]{PermissionRequest.RESOURCE_VIDEO_CAPTURE});
                } else {
                    if (pendingPermission != null) pendingPermission.deny();
                    pendingPermission = request;
                    requestPermissions(new String[]{Manifest.permission.CAMERA}, CAMERA_REQUEST);
                }
            });
        }
    }

    private class Client extends WebViewClient {
        @Override
        public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
            Uri uri = request.getUrl();
            if (isOwnHost(uri)) return false;
            // Остальные ссылки (почта, телефон, чужие сайты) открываем снаружи.
            try {
                startActivity(new Intent(Intent.ACTION_VIEW, uri));
            } catch (Exception ignored) {
            }
            return true;
        }

        @Override
        public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
            if (request.isForMainFrame()) showOffline(String.valueOf(error.getDescription()));
        }
    }

    /* ---------- мост для страницы: window.ConcertsApp ---------- */

    private class Bridge {
        @JavascriptInterface
        public String version() {
            return BuildConfig.VERSION_NAME;
        }

        @JavascriptInterface
        public void vibrate(int ms) {
            Vibrator v = (Vibrator) getSystemService(VIBRATOR_SERVICE);
            if (v == null) return;
            int d = Math.max(20, Math.min(ms, 1500));
            if (Build.VERSION.SDK_INT >= 26) v.vibrate(VibrationEffect.createOneShot(d, VibrationEffect.DEFAULT_AMPLITUDE));
            else v.vibrate(d);
        }

        @JavascriptInterface
        public void checkUpdate() {
            runOnUiThread(() -> updater.check(true));
        }

        @JavascriptInterface
        public void retry() {
            runOnUiThread(MainActivity.this::retry);
        }
    }
}
