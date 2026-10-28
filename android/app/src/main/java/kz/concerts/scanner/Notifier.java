package kz.concerts.scanner;

import android.app.AlarmManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.graphics.Color;
import android.os.Build;

/** Системные уведомления: сразу и по времени (напоминание перед входом). */
final class Notifier {

    static final String CHANNEL = "scanner";

    private Notifier() {
    }

    private static void ensureChannel(Context ctx) {
        if (Build.VERSION.SDK_INT < 26) return;
        NotificationManager nm = ctx.getSystemService(NotificationManager.class);
        if (nm == null || nm.getNotificationChannel(CHANNEL) != null) return;
        NotificationChannel ch = new NotificationChannel(CHANNEL, "Назначения и напоминания", NotificationManager.IMPORTANCE_HIGH);
        ch.setDescription("Назначения на концерты и напоминания перед открытием входа");
        ch.enableVibration(true);
        ch.setLightColor(Color.parseColor("#FF4D4D"));
        nm.createNotificationChannel(ch);
    }

    @SuppressWarnings("deprecation")
    static void show(Context ctx, int id, String title, String body) {
        ensureChannel(ctx);
        NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) return;
        Intent open = new Intent(ctx, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent pi = PendingIntent.getActivity(ctx, id, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        Notification.Builder b = Build.VERSION.SDK_INT >= 26 ? new Notification.Builder(ctx, CHANNEL) : new Notification.Builder(ctx);
        b.setSmallIcon(R.drawable.ic_stat)
                .setColor(Color.parseColor("#FF4D4D"))
                .setContentTitle(title)
                .setContentText(body)
                .setStyle(new Notification.BigTextStyle().bigText(body))
                .setContentIntent(pi)
                .setAutoCancel(true)
                .setWhen(System.currentTimeMillis())
                .setShowWhen(true);
        if (Build.VERSION.SDK_INT < 26) b.setPriority(Notification.PRIORITY_HIGH).setDefaults(Notification.DEFAULT_ALL);
        try {
            nm.notify(id, b.build());
        } catch (SecurityException ignored) {
            // Уведомления запрещены: показать нечего.
        }
    }

    private static PendingIntent alarmIntent(Context ctx, int id, String title, String body, boolean create) {
        Intent i = new Intent(ctx, ReminderReceiver.class)
                .setAction("kz.concerts.scanner.REMIND." + id)
                .putExtra("id", id)
                .putExtra("title", title)
                .putExtra("body", body);
        int flags = PendingIntent.FLAG_IMMUTABLE | (create ? PendingIntent.FLAG_UPDATE_CURRENT : PendingIntent.FLAG_NO_CREATE);
        return PendingIntent.getBroadcast(ctx, id, i, flags);
    }

    static void schedule(Context ctx, int id, long atMs, String title, String body) {
        AlarmManager am = (AlarmManager) ctx.getSystemService(Context.ALARM_SERVICE);
        if (am == null) return;
        PendingIntent pi = alarmIntent(ctx, id, title, body, true);
        // Неточный будильник: разрешение на точные не нужно, сдвиг в пару минут не важен.
        if (Build.VERSION.SDK_INT >= 23) am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, atMs, pi);
        else am.set(AlarmManager.RTC_WAKEUP, atMs, pi);
    }

    static void cancel(Context ctx, int id) {
        AlarmManager am = (AlarmManager) ctx.getSystemService(Context.ALARM_SERVICE);
        PendingIntent pi = alarmIntent(ctx, id, "", "", false);
        if (am != null && pi != null) {
            am.cancel(pi);
            pi.cancel();
        }
    }
}
