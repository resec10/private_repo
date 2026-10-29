package app.expirytracker;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.ClipData;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.MediaStore;
import android.provider.Settings;
import android.util.Base64;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import java.io.ByteArrayInputStream;
import java.io.File;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.Collections;

/**
 * Hosts the Expiry Tracker web app (bundled in assets/www) in a WebView and gives it what a
 * WebView lacks: notifications, a background daily check, camera/gallery pickers and file saving.
 */
public class MainActivity extends Activity {
    // A https origin (served from the APK, never the network) so storage and crypto work as on the web.
    private static final String HOST = "appassets.androidplatform.net";
    private static final String START_URL = "https://" + HOST + "/index.html";
    private static final int REQ_FILE = 1;
    private static final int REQ_CAMERA = 2;
    private static final int REQ_SAVE = 3;
    private static final int REQ_NOTIFY = 4;

    private WebView web;
    private ValueCallback<Uri[]> fileCallback;
    private Uri cameraUri;
    private byte[] pendingSave;

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        web = new WebView(this);
        setContentView(web);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(true); // photos picked from the gallery or taken with the camera
        web.addJavascriptInterface(new Bridge(), "ExpiryNative");
        web.setWebViewClient(new AssetClient());
        web.setWebChromeClient(new Chrome());
        if (state != null) cameraUri = state.getParcelable("cameraUri");
        if (state == null || web.restoreState(state) == null) web.loadUrl(START_URL);
        Notifier.ensureChannel(this);
        DailyCheck.schedule(this);
    }

    @Override
    protected void onResume() {
        super.onResume();
        web.onResume();
    }

    @Override
    protected void onPause() {
        web.onPause();
        super.onPause();
    }

    @Override
    protected void onSaveInstanceState(Bundle out) {
        super.onSaveInstanceState(out);
        web.saveState(out);
        out.putParcelable("cameraUri", cameraUri);
    }

    @Override
    @SuppressWarnings("deprecation")
    public void onBackPressed() {
        // let the page close an open sheet first
        web.evaluateJavascript("window.__handleBack ? window.__handleBack() : false", new ValueCallback<String>() {
            @Override
            public void onReceiveValue(String handled) {
                if (!"true".equals(handled)) MainActivity.super.onBackPressed();
            }
        });
    }

    // ------------------------------------------------------------------ pickers & saving

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == REQ_SAVE) {
            finishSave(resultCode == RESULT_OK && data != null ? data.getData() : null);
            return;
        }
        if (fileCallback == null) return;
        Uri[] result = null;
        if (resultCode == RESULT_OK) {
            if (requestCode == REQ_CAMERA) {
                File f = PhotoProvider.fileFor(this, cameraUri);
                if (f != null && f.length() > 0) result = new Uri[] {cameraUri};
            } else if (data != null && data.getData() != null) {
                result = new Uri[] {data.getData()};
            }
        }
        fileCallback.onReceiveValue(result);
        fileCallback = null;
    }

    private boolean launchChooser(WebChromeClient.FileChooserParams params) {
        boolean image = false;
        for (String type : params.getAcceptTypes()) {
            if (type != null && type.startsWith("image/")) image = true;
        }
        Intent intent;
        int request;
        if (image && params.isCaptureEnabled()) {
            cameraUri = PhotoProvider.newPhotoUri(this);
            intent = new Intent(MediaStore.ACTION_IMAGE_CAPTURE)
                    .putExtra(MediaStore.EXTRA_OUTPUT, cameraUri)
                    .addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION | Intent.FLAG_GRANT_READ_URI_PERMISSION);
            intent.setClipData(ClipData.newRawUri("", cameraUri));
            request = REQ_CAMERA;
        } else {
            intent = new Intent(Intent.ACTION_GET_CONTENT)
                    .addCategory(Intent.CATEGORY_OPENABLE)
                    .setType(image ? "image/*" : "*/*");
            request = REQ_FILE;
        }
        try {
            startActivityForResult(intent, request);
            return true;
        } catch (ActivityNotFoundException e) {
            toast(image ? "noCamera" : "noPicker");
            return false;
        }
    }

    private void startSave(String name, String mime, byte[] data) {
        pendingSave = data;
        Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT)
                .addCategory(Intent.CATEGORY_OPENABLE)
                .setType(mime)
                .putExtra(Intent.EXTRA_TITLE, name);
        try {
            startActivityForResult(intent, REQ_SAVE);
        } catch (ActivityNotFoundException e) {
            pendingSave = null;
            toast("saveFailed");
        }
    }

    private void finishSave(Uri target) {
        byte[] data = pendingSave;
        pendingSave = null;
        if (target == null || data == null) return;
        OutputStream out = null;
        try {
            out = getContentResolver().openOutputStream(target);
            if (out == null) throw new IOException("no output stream");
            out.write(data);
            toast("saved");
        } catch (IOException e) {
            toast("saveFailed");
        } finally {
            if (out != null) {
                try {
                    out.close();
                } catch (IOException ignored) {
                    // already reported if the write failed
                }
            }
        }
    }

    // ------------------------------------------------------------------ notification permission

    private String permissionState() {
        if (DailyCheck.notificationsAllowed(this)) return "granted";
        if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(DailyCheck.PERMISSION) != PackageManager.PERMISSION_GRANTED) {
            boolean asked = DailyCheck.prefs(this).getBoolean("askedPermission", false);
            if (!asked || shouldShowRequestPermissionRationale(DailyCheck.PERMISSION)) return "default";
        }
        return "denied";
    }

    private void askPermission() {
        if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(DailyCheck.PERMISSION) != PackageManager.PERMISSION_GRANTED
                && "default".equals(permissionState())) {
            DailyCheck.prefs(this).edit().putBoolean("askedPermission", true).apply();
            requestPermissions(new String[] {DailyCheck.PERMISSION}, REQ_NOTIFY);
        } else {
            reportPermission();
        }
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] results) {
        if (requestCode == REQ_NOTIFY) reportPermission();
    }

    private void reportPermission() {
        web.evaluateJavascript("window.__nativePermissionResult && window.__nativePermissionResult('"
                + permissionState() + "')", null);
    }

    private void openNotificationSettings() {
        Intent intent;
        if (Build.VERSION.SDK_INT >= 26) {
            intent = new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, getPackageName());
        } else {
            intent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + getPackageName()));
        }
        try {
            startActivity(intent);
        } catch (ActivityNotFoundException ignored) {
            // no settings screen on this device
        }
    }

    // ------------------------------------------------------------------ WebView plumbing

    /** Called by app.js as window.ExpiryNative.*; runs on a background thread. */
    private final class Bridge {
        @JavascriptInterface
        public String permission() {
            return permissionState();
        }

        @JavascriptInterface
        public void requestPermission() {
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    askPermission();
                }
            });
        }

        @JavascriptInterface
        public void openSettings() {
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    openNotificationSettings();
                }
            });
        }

        @JavascriptInterface
        public void syncProducts(String json) {
            DailyCheck.saveProducts(MainActivity.this, json);
        }

        @JavascriptInterface
        public void setLanguage(String lang) {
            DailyCheck.saveLanguage(MainActivity.this, lang);
        }

        @JavascriptInterface
        public boolean checkNow(boolean force) {
            return DailyCheck.run(MainActivity.this, force, false);
        }

        @JavascriptInterface
        public boolean sendAlertNow() {
            if (DailyCheck.run(MainActivity.this, true, false)) return true;
            if (!DailyCheck.notificationsAllowed(MainActivity.this)) return false;
            String lang = DailyCheck.language(MainActivity.this);
            Notifier.show(MainActivity.this, Texts.t(lang, "testTitle"),
                    Texts.t(lang, "summaryNone", "days", Texts.plural(lang, "days", AlertLogic.ALERT_DAYS)) + ".");
            return true;
        }

        @JavascriptInterface
        public void saveFile(final String name, final String mime, String base64) {
            final byte[] data = Base64.decode(base64, Base64.DEFAULT);
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    startSave(name, mime, data);
                }
            });
        }
    }

    private final class AssetClient extends WebViewClient {
        @Override
        public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
            Uri url = request.getUrl();
            if (!"https".equals(url.getScheme()) || !HOST.equals(url.getHost())) return null;
            String path = url.getPath();
            if (path == null || path.isEmpty() || "/".equals(path)) path = "/index.html";
            if (!path.contains("..")) {
                try {
                    InputStream in = getAssets().open("www" + path);
                    String mime = mimeType(path);
                    return new WebResourceResponse(mime, mime.startsWith("image/") ? null : "utf-8", in);
                } catch (IOException ignored) {
                    // fall through to 404
                }
            }
            return new WebResourceResponse("text/plain", "utf-8", 404, "Not Found",
                    Collections.<String, String>emptyMap(), new ByteArrayInputStream(new byte[0]));
        }

        @Override
        public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
            Uri url = request.getUrl();
            if (HOST.equals(url.getHost())) return false;
            try {
                startActivity(new Intent(Intent.ACTION_VIEW, url)); // any outside link opens in the browser
            } catch (ActivityNotFoundException ignored) {
                // nothing can open it
            }
            return true;
        }
    }

    private final class Chrome extends WebChromeClient {
        @Override
        public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
            if (fileCallback != null) fileCallback.onReceiveValue(null);
            fileCallback = callback;
            if (!launchChooser(params)) {
                fileCallback = null;
                return false; // WebView cancels the chooser itself
            }
            return true;
        }
    }

    private void toast(String key) {
        Toast.makeText(this, Texts.t(DailyCheck.language(this), key), Toast.LENGTH_LONG).show();
    }

    static String mimeType(String path) {
        String p = path.toLowerCase(java.util.Locale.ROOT);
        if (p.endsWith(".html")) return "text/html";
        if (p.endsWith(".js") || p.endsWith(".mjs")) return "text/javascript";
        if (p.endsWith(".css")) return "text/css";
        if (p.endsWith(".png")) return "image/png";
        if (p.endsWith(".svg")) return "image/svg+xml";
        if (p.endsWith(".webmanifest")) return "application/manifest+json";
        if (p.endsWith(".json")) return "application/json";
        return "application/octet-stream";
    }
}
