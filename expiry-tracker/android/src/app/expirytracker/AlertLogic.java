package app.expirytracker;

import java.text.Collator;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.List;
import java.util.regex.Pattern;

/**
 * The alert rules from shared.js, for the background check that runs while the app is closed.
 * No Android types here, so it can be unit-tested on a plain JVM (see tests/AlertLogicTest.java).
 */
final class AlertLogic {
    static final int ALERT_DAYS = 10;
    private static final Pattern ISO_DATE = Pattern.compile("\\d{4}-\\d{2}-\\d{2}");

    static final class Product {
        final String name;
        final String expiry;
        final boolean bread;

        Product(String name, String expiry, boolean bread) {
            this.name = name;
            this.expiry = expiry;
            this.bread = bread;
        }
    }

    static final class Summary {
        final String title;
        final String body;
        final int count;

        Summary(String title, String body, int count) {
            this.title = title;
            this.body = body;
            this.count = count;
        }
    }

    private AlertLogic() {
    }

    static boolean isIsoDate(String s) {
        return s != null && ISO_DATE.matcher(s).matches();
    }

    static String isoDate(int year, int month, int day) {
        return String.format(java.util.Locale.ROOT, "%04d-%02d-%02d", year, month, day);
    }

    /** Days since 1970-01-01 of a YYYY-MM-DD date (days_from_civil, H. Hinnant). */
    static long epochDay(String iso) {
        long y = Integer.parseInt(iso.substring(0, 4));
        int m = Integer.parseInt(iso.substring(5, 7));
        int d = Integer.parseInt(iso.substring(8, 10));
        y -= m <= 2 ? 1 : 0;
        long era = (y >= 0 ? y : y - 399) / 400;
        long yoe = y - era * 400;
        long doy = (153L * (m + (m > 2 ? -3 : 9)) + 2) / 5 + d - 1;
        long doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
        return era * 146097 + doe - 719468;
    }

    static int daysUntil(String expiry, String today) {
        return (int) (epochDay(expiry) - epochDay(today));
    }

    static boolean needsAlert(Product p, String today) {
        return !p.bread && daysUntil(p.expiry, today) <= ALERT_DAYS;
    }

    static String describeDays(int days) {
        if (days < -1) return "expired " + (-days) + " days ago";
        if (days == -1) return "expired yesterday";
        if (days == 0) return "expires today";
        if (days == 1) return "expires tomorrow";
        return "expires in " + days + " days";
    }

    /** Notification text for today, or null when nothing needs attention. */
    static Summary summarize(List<Product> products, final String today) {
        List<Product> due = new ArrayList<Product>();
        for (Product p : products) {
            if (isIsoDate(p.expiry) && needsAlert(p, today)) due.add(p);
        }
        if (due.isEmpty()) return null;
        final Collator collator = Collator.getInstance();
        Collections.sort(due, new Comparator<Product>() {
            @Override
            public int compare(Product a, Product b) {
                int byDays = Integer.compare(daysUntil(a.expiry, today), daysUntil(b.expiry, today));
                return byDays != 0 ? byDays : collator.compare(a.name, b.name);
            }
        });
        if (due.size() == 1) {
            Product p = due.get(0);
            return new Summary(p.name + " " + describeDays(daysUntil(p.expiry, today)), "Tap to open Expiry Tracker.", 1);
        }
        StringBuilder body = new StringBuilder();
        for (int i = 0; i < due.size() && i < 6; i++) {
            Product p = due.get(i);
            if (i > 0) body.append('\n');
            body.append(p.name).append(": ").append(describeDays(daysUntil(p.expiry, today)));
        }
        if (due.size() > 6) body.append("\n+ ").append(due.size() - 6).append(" more");
        return new Summary(due.size() + " products expire within " + ALERT_DAYS + " days", body.toString(), due.size());
    }
}
