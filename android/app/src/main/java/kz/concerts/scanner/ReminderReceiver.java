package kz.concerts.scanner;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** Срабатывает в назначенное время и показывает напоминание. */
public class ReminderReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context ctx, Intent intent) {
        String title = intent.getStringExtra("title");
        String body = intent.getStringExtra("body");
        if (title == null || title.isEmpty()) return;
        Notifier.show(ctx, intent.getIntExtra("id", 1), title, body == null ? "" : body);
    }
}
