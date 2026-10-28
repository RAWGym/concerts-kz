package kz.concerts.scanner;

import android.app.Activity;
import android.app.AlertDialog;
import android.app.PendingIntent;
import android.content.Intent;
import android.content.pm.PackageInstaller;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.TextView;
import android.widget.Toast;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;

/**
 * Автообновление оболочки. При запуске читает version.json из последнего
 * выпуска на GitHub. Если там номер больше, скачивает APK и отдаёт его
 * системе. Подпись проверяет сама система: APK с другим ключом не встанет.
 */
class Updater {

    private final Activity activity;
    private final Handler main = new Handler(Looper.getMainLooper());
    private volatile boolean busy;
    private boolean waitingPermission;
    private String pendingName;

    Updater(Activity activity) {
        this.activity = activity;
    }

    void check(final boolean manual) {
        if (busy) return;
        busy = true;
        new Thread(() -> {
            try {
                JSONObject json = new JSONObject(new String(get(BuildConfig.UPDATE_URL, 8000), "UTF-8"));
                final int code = json.getInt("versionCode");
                final String name = json.optString("versionName", String.valueOf(code));
                main.post(() -> {
                    busy = false;
                    if (code > BuildConfig.VERSION_CODE) start(name);
                    else if (manual) toast("У вас последняя версия " + BuildConfig.VERSION_NAME);
                });
            } catch (Exception e) {
                main.post(() -> {
                    busy = false;
                    if (manual) toast("Не удалось проверить обновление");
                });
            }
        }).start();
    }

    /** После возврата из настроек «Установка неизвестных приложений». */
    void onResume() {
        if (waitingPermission && canInstall()) {
            waitingPermission = false;
            download(pendingName);
        }
    }

    private boolean canInstall() {
        return Build.VERSION.SDK_INT < 26 || activity.getPackageManager().canRequestPackageInstalls();
    }

    private void start(final String name) {
        if (activity.isFinishing()) return;
        if (!canInstall()) {
            pendingName = name;
            new AlertDialog.Builder(activity)
                    .setTitle("Новая версия " + name)
                    .setMessage("Чтобы приложение обновлялось само, разрешите ему устанавливать обновления. "
                            + "Откроются настройки: включите «Разрешить из этого источника» и вернитесь назад.")
                    .setPositiveButton("Открыть настройки", (d, w) -> {
                        waitingPermission = true;
                        activity.startActivity(new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                                Uri.parse("package:" + activity.getPackageName())));
                    })
                    .setNegativeButton("Позже", null)
                    .show();
            return;
        }
        download(name);
    }

    private void download(final String name) {
        if (busy || activity.isFinishing()) return;
        busy = true;

        final ProgressBar bar = new ProgressBar(activity, null, android.R.attr.progressBarStyleHorizontal);
        bar.setMax(100);
        final TextView text = new TextView(activity);
        text.setText("Скачиваю…");
        LinearLayout box = new LinearLayout(activity);
        box.setOrientation(LinearLayout.VERTICAL);
        int pad = (int) (20 * activity.getResources().getDisplayMetrics().density);
        box.setPadding(pad, pad / 2, pad, 0);
        box.addView(bar);
        box.addView(text);
        final boolean[] cancelled = {false};
        final AlertDialog dialog = new AlertDialog.Builder(activity)
                .setTitle("Обновляю до версии " + name)
                .setView(box)
                .setCancelable(false)
                .setNegativeButton("Позже", (d, w) -> cancelled[0] = true)
                .show();

        new Thread(() -> {
            PackageInstaller.Session session = null;
            try {
                PackageInstaller installer = activity.getPackageManager().getPackageInstaller();
                PackageInstaller.SessionParams params = new PackageInstaller.SessionParams(PackageInstaller.SessionParams.MODE_FULL_INSTALL);
                params.setAppPackageName(activity.getPackageName());
                if (Build.VERSION.SDK_INT >= 31) {
                    // Если система позволит, следующие обновления встанут без вопросов.
                    params.setRequireUserAction(PackageInstaller.SessionParams.USER_ACTION_NOT_REQUIRED);
                }
                int id = installer.createSession(params);
                session = installer.openSession(id);

                HttpURLConnection c = open(BuildConfig.APK_URL, 20000);
                long total = c.getContentLengthLong();
                try (InputStream in = c.getInputStream(); OutputStream out = session.openWrite("base.apk", 0, total > 0 ? total : -1)) {
                    byte[] buf = new byte[64 * 1024];
                    long done = 0;
                    int n;
                    int lastPct = -1;
                    while ((n = in.read(buf)) > 0) {
                        if (cancelled[0]) throw new InterruptedException("cancelled");
                        out.write(buf, 0, n);
                        done += n;
                        if (total > 0) {
                            final int pct = (int) (done * 100 / total);
                            if (pct != lastPct) {
                                lastPct = pct;
                                final long d = done;
                                main.post(() -> {
                                    bar.setProgress(pct);
                                    text.setText(String.format("%d%% · %.1f из %.1f МБ", pct, d / 1048576.0, total / 1048576.0));
                                });
                            }
                        }
                    }
                    session.fsync(out);
                } finally {
                    c.disconnect();
                }

                Intent intent = new Intent(activity, InstallReceiver.class);
                int flags = PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= 31 ? PendingIntent.FLAG_MUTABLE : 0);
                PendingIntent pi = PendingIntent.getBroadcast(activity, id, intent, flags);
                session.commit(pi.getIntentSender());
                session.close();
                session = null;
                main.post(() -> {
                    busy = false;
                    if (dialog.isShowing()) dialog.dismiss();
                    toast("Устанавливаю обновление…");
                });
            } catch (final Exception e) {
                if (session != null) session.abandon();
                main.post(() -> {
                    busy = false;
                    if (dialog.isShowing()) dialog.dismiss();
                    if (!cancelled[0]) toast("Обновление не скачалось. Попробуем при следующем запуске.");
                });
            }
        }).start();
    }

    private void toast(String s) {
        if (!activity.isFinishing()) Toast.makeText(activity, s, Toast.LENGTH_LONG).show();
    }

    private static HttpURLConnection open(String url, int timeout) throws Exception {
        HttpURLConnection c = (HttpURLConnection) new URL(url).openConnection();
        c.setConnectTimeout(timeout);
        c.setReadTimeout(timeout);
        c.setInstanceFollowRedirects(true);
        c.setRequestProperty("Cache-Control", "no-cache");
        int code = c.getResponseCode();
        if (code != 200) {
            c.disconnect();
            throw new Exception("HTTP " + code);
        }
        return c;
    }

    private static byte[] get(String url, int timeout) throws Exception {
        HttpURLConnection c = open(url, timeout);
        try (InputStream in = c.getInputStream()) {
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            byte[] buf = new byte[8192];
            int n;
            while ((n = in.read(buf)) > 0 && out.size() < 64 * 1024) out.write(buf, 0, n);
            return out.toByteArray();
        } finally {
            c.disconnect();
        }
    }
}
