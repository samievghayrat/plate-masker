package com.samievghayrat.platemasker;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Context;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;
import android.view.Gravity;
import android.view.ViewGroup;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.ProgressBar;
import android.widget.Toast;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.OutputStream;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

public final class MainActivity extends Activity {
    private static final String APP_URL = "https://plate-masker.vercel.app/";
    private WebView webView;
    private ProgressBar progressBar;
    private android.window.OnBackInvokedCallback backCallback;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().setStatusBarColor(Color.rgb(245, 248, 252));
        getWindow().setNavigationBarColor(Color.WHITE);

        FrameLayout root = new FrameLayout(this);
        webView = new WebView(this);
        webView.setLayoutParams(new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
        ));

        progressBar = new ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal);
        progressBar.setMax(100);
        FrameLayout.LayoutParams progressLayout = new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                dp(3)
        );
        progressLayout.gravity = Gravity.TOP;
        progressBar.setLayoutParams(progressLayout);

        root.addView(webView);
        root.addView(progressBar);
        setContentView(root);
        configureWebView();
        configureBackNavigation();

        if (savedInstanceState == null) webView.loadUrl(APP_URL);
        else webView.restoreState(savedInstanceState);
    }

    @SuppressLint("SetJavaScriptEnabled")
    private void configureWebView() {
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setBuiltInZoomControls(false);
        settings.setDisplayZoomControls(false);
        settings.setUserAgentString(settings.getUserAgentString() + " PlateMaskerAndroid/1.0");

        CookieManager.getInstance().setAcceptCookie(true);
        webView.addJavascriptInterface(new DownloadBridge(this), "PlateMaskerAndroid");
        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onProgressChanged(WebView view, int progress) {
                progressBar.setProgress(progress);
                progressBar.setVisibility(progress >= 100 ? ProgressBar.GONE : ProgressBar.VISIBLE);
            }
        });
        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                if ("https".equalsIgnoreCase(uri.getScheme())
                        && "plate-masker.vercel.app".equalsIgnoreCase(uri.getHost())) {
                    return false;
                }
                try {
                    startActivity(new Intent(Intent.ACTION_VIEW, uri));
                } catch (Exception error) {
                    Toast.makeText(MainActivity.this, "Не удалось открыть ссылку", Toast.LENGTH_SHORT).show();
                }
                return true;
            }
        });
    }

    private void configureBackNavigation() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            backCallback = this::handleBack;
            getOnBackInvokedDispatcher().registerOnBackInvokedCallback(
                    android.window.OnBackInvokedDispatcher.PRIORITY_DEFAULT,
                    backCallback
            );
        }
    }

    private void handleBack() {
        if (webView.canGoBack()) webView.goBack();
        else finish();
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        webView.saveState(outState);
        super.onSaveInstanceState(outState);
    }

    @SuppressLint("GestureBackNavigation")
    @Override
    public void onBackPressed() {
        handleBack();
    }

    @Override
    protected void onDestroy() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU && backCallback != null) {
            getOnBackInvokedDispatcher().unregisterOnBackInvokedCallback(backCallback);
        }
        if (webView != null) {
            webView.removeJavascriptInterface("PlateMaskerAndroid");
            webView.destroy();
        }
        super.onDestroy();
    }

    public static final class DownloadBridge {
        private final Context context;
        private final Map<String, PendingDownload> downloads = new ConcurrentHashMap<>();

        DownloadBridge(Context context) {
            this.context = context.getApplicationContext();
        }

        @JavascriptInterface
        public String startDownload(String filename, String mimeType) {
            String id = UUID.randomUUID().toString();
            downloads.put(id, new PendingDownload(cleanFilename(filename), cleanMimeType(mimeType)));
            return id;
        }

        @JavascriptInterface
        public void appendDownloadChunk(String id, String base64Chunk) {
            PendingDownload pending = downloads.get(id);
            if (pending == null) return;
            byte[] bytes = Base64.decode(base64Chunk, Base64.DEFAULT);
            synchronized (pending) {
                pending.data.write(bytes, 0, bytes.length);
            }
        }

        @JavascriptInterface
        public void finishDownload(String id) {
            PendingDownload pending = downloads.remove(id);
            if (pending == null) return;
            try {
                saveToMediaStore(pending);
                showToast(pending.mimeType.startsWith("image/")
                        ? "Сохранено в Pictures/Plate Masker"
                        : "Сохранено в Downloads/Plate Masker");
            } catch (Exception error) {
                showToast("Не удалось сохранить файл: " + error.getMessage());
            }
        }

        private void saveToMediaStore(PendingDownload pending) throws IOException {
            boolean image = pending.mimeType.startsWith("image/");
            Uri collection = image
                    ? MediaStore.Images.Media.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY)
                    : MediaStore.Downloads.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY);
            String folder = (image ? Environment.DIRECTORY_PICTURES : Environment.DIRECTORY_DOWNLOADS)
                    + "/Plate Masker";

            ContentValues values = new ContentValues();
            values.put(MediaStore.MediaColumns.DISPLAY_NAME, pending.filename);
            values.put(MediaStore.MediaColumns.MIME_TYPE, pending.mimeType);
            values.put(MediaStore.MediaColumns.RELATIVE_PATH, folder);
            values.put(MediaStore.MediaColumns.IS_PENDING, 1);

            ContentResolver resolver = context.getContentResolver();
            Uri uri = resolver.insert(collection, values);
            if (uri == null) throw new IOException("хранилище Android недоступно");
            try {
                try (OutputStream output = resolver.openOutputStream(uri)) {
                    if (output == null) throw new IOException("не удалось открыть хранилище Android");
                    synchronized (pending) {
                        pending.data.writeTo(output);
                    }
                }
                values.clear();
                values.put(MediaStore.MediaColumns.IS_PENDING, 0);
                resolver.update(uri, values, null, null);
            } catch (Exception error) {
                resolver.delete(uri, null, null);
                if (error instanceof IOException) throw (IOException) error;
                throw new IOException(error.getMessage(), error);
            }
        }

        private void showToast(String message) {
            new android.os.Handler(context.getMainLooper()).post(
                    () -> Toast.makeText(context, message, Toast.LENGTH_LONG).show()
            );
        }

        private static String cleanFilename(String filename) {
            String cleaned = filename == null ? "plate-masker-file" : filename
                    .replaceAll("[\\\\/:*?\"<>|]", "-")
                    .replaceAll("^\\.+", "")
                    .trim();
            return cleaned.isEmpty() ? "plate-masker-file" : cleaned;
        }

        private static String cleanMimeType(String mimeType) {
            if (mimeType == null || !mimeType.matches("^[a-zA-Z0-9.+-]+/[a-zA-Z0-9.+-]+$")) {
                return "application/octet-stream";
            }
            return mimeType;
        }
    }

    private static final class PendingDownload {
        final String filename;
        final String mimeType;
        final ByteArrayOutputStream data = new ByteArrayOutputStream();

        PendingDownload(String filename, String mimeType) {
            this.filename = filename;
            this.mimeType = mimeType;
        }
    }
}
