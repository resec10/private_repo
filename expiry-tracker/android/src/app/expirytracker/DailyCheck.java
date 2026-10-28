package app.expirytracker;

import android.app.NotificationManager;
import android.app.job.JobInfo;
import android.app.job.JobScheduler;
import android.content.ComponentName;
import android.content.Context;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.os.Build;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.Calendar;
import java.util.List;

/**
 * One summary notification a day. The web app keeps the product list in its own storage and
 * mirrors name/expiry/bread here (syncProducts) so the check can run while the app is closed.
 */
final class DailyCheck {
    static final String PERMISSION = "android.permission.POST_NOTIFICATIONS";
    private static final String PREFS = "expiry";
    private static final int JOB_ID = 1;

    private DailyCheck() {
    }

    static SharedPreferences prefs(Context c) {
        return c.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    static void saveProducts(Context c, String json) {
        prefs(c).edit().putString("products", json).apply();
    }

    static List<AlertLogic.Product> loadProducts(Context c) {
        List<AlertLogic.Product> out = new ArrayList<AlertLogic.Product>();
        try {
            JSONArray arr = new JSONArray(prefs(c).getString("products", "[]"));
            for (int i = 0; i < arr.length(); i++) {
                JSONObject o = arr.getJSONObject(i);
                out.add(new AlertLogic.Product(o.optString("name"), o.optString("expiry"), o.optBoolean("bread")));
            }
        } catch (Exception ignored) {
            // corrupt data: behave as if there were no products until the app syncs again
        }
        return out;
    }

    static String today() {
        Calendar cal = Calendar.getInstance();
        return AlertLogic.isoDate(cal.get(Calendar.YEAR), cal.get(Calendar.MONTH) + 1, cal.get(Calendar.DAY_OF_MONTH));
    }

    static boolean notificationsAllowed(Context c) {
        NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
        if (!nm.areNotificationsEnabled()) return false;
        return Build.VERSION.SDK_INT < 33 || c.checkSelfPermission(PERMISSION) == PackageManager.PERMISSION_GRANTED;
    }

    /**
     * @param force       ignore "already alerted today"
     * @param quietHours  background runs stay silent before 08:00 and from 21:00
     * @return whether a notification was shown
     */
    static boolean run(Context c, boolean force, boolean quietHours) {
        if (!notificationsAllowed(c)) return false;
        String today = today();
        SharedPreferences p = prefs(c);
        if (!force && today.equals(p.getString("lastAlertDay", null))) return false;
        if (quietHours) {
            int hour = Calendar.getInstance().get(Calendar.HOUR_OF_DAY);
            if (hour < 8 || hour >= 21) return false;
        }
        p.edit().putString("lastAlertDay", today).apply();
        AlertLogic.Summary s = AlertLogic.summarize(loadProducts(c), today);
        if (s == null) return false;
        Notifier.show(c, s.title, s.body);
        return true;
    }

    /** Wake every few hours (Android batches this to save battery); the first run after 08:00 alerts. */
    static void schedule(Context c) {
        JobScheduler js = (JobScheduler) c.getSystemService(Context.JOB_SCHEDULER_SERVICE);
        if (js == null || js.getPendingJob(JOB_ID) != null) return;
        JobInfo job = new JobInfo.Builder(JOB_ID, new ComponentName(c, ExpiryJobService.class))
                .setPeriodic(3 * 60 * 60 * 1000L, 60 * 60 * 1000L)
                .setPersisted(true)
                .build();
        js.schedule(job);
    }
}
