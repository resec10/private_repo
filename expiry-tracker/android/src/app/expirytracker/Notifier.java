package app.expirytracker;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.os.Build;

final class Notifier {
    private static final String CHANNEL = "expiry-alerts";
    private static final int NOTIFICATION_ID = 1; // one summary; a new one replaces the old

    private Notifier() {
    }

    static void ensureChannel(Context c) {
        if (Build.VERSION.SDK_INT < 26) return;
        NotificationChannel ch = new NotificationChannel(CHANNEL, c.getString(R.string.channel_name),
                NotificationManager.IMPORTANCE_DEFAULT);
        ch.setDescription(c.getString(R.string.channel_description));
        ((NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE)).createNotificationChannel(ch);
    }

    @SuppressWarnings("deprecation")
    static void show(Context c, String title, String body) {
        ensureChannel(c);
        Intent open = new Intent(c, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent tap = PendingIntent.getActivity(c, 0, open,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        Notification.Builder b = Build.VERSION.SDK_INT >= 26
                ? new Notification.Builder(c, CHANNEL)
                : new Notification.Builder(c).setPriority(Notification.PRIORITY_DEFAULT);
        b.setSmallIcon(R.drawable.ic_stat_notify)
                .setColor(0xFF1F7A4D)
                .setContentTitle(title)
                .setContentText(body.split("\n", 2)[0])
                .setStyle(new Notification.BigTextStyle().bigText(body))
                .setContentIntent(tap)
                .setAutoCancel(true)
                .setShowWhen(true);
        ((NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE)).notify(NOTIFICATION_ID, b.build());
    }
}
