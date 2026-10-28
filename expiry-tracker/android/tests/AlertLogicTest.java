package app.expirytracker;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

/** Plain-JVM checks that the Android alert rules match shared.js (same cases as tests/logic.test.mjs). */
public final class AlertLogicTest {
    private static int passed = 0;

    private static void eq(Object actual, Object expected, String what) {
        if (expected == null ? actual != null : !expected.equals(actual)) {
            throw new AssertionError(what + ": expected <" + expected + "> but was <" + actual + ">");
        }
        passed++;
    }

    private static AlertLogic.Product p(String name, String expiry, boolean bread) {
        return new AlertLogic.Product(name, expiry, bread);
    }

    public static void main(String[] args) {
        eq(AlertLogic.daysUntil("2026-11-04", "2026-10-25"), 10, "10 days");
        eq(AlertLogic.daysUntil("2026-10-25", "2026-10-25"), 0, "same day");
        eq(AlertLogic.daysUntil("2026-10-24", "2026-10-25"), -1, "yesterday");
        eq(AlertLogic.daysUntil("2027-01-01", "2026-12-31"), 1, "new year");
        eq(AlertLogic.daysUntil("2028-03-01", "2028-02-28"), 2, "leap year");
        eq(AlertLogic.daysUntil("2026-03-30", "2026-03-28"), 2, "spring DST");
        eq(AlertLogic.daysUntil("2026-10-26", "2026-10-24"), 2, "autumn DST");
        eq(AlertLogic.epochDay("1970-01-01"), 0L, "epoch");
        eq(AlertLogic.epochDay("2000-03-01"), 11017L, "2000-03-01");

        String today = "2026-10-25";
        eq(AlertLogic.needsAlert(p("a", "2026-11-04", false), today), true, "10 days alerts");
        eq(AlertLogic.needsAlert(p("a", "2026-11-05", false), today), false, "11 days does not");
        eq(AlertLogic.needsAlert(p("a", "2026-10-20", false), today), true, "expired alerts");
        eq(AlertLogic.needsAlert(p("a", "2026-10-26", true), today), false, "bread never");
        eq(AlertLogic.needsAlert(p("a", "2026-10-20", true), today), false, "expired bread never");

        eq(AlertLogic.describeDays(5), "expires in 5 days", "wording 5");
        eq(AlertLogic.describeDays(1), "expires tomorrow", "wording 1");
        eq(AlertLogic.describeDays(0), "expires today", "wording 0");
        eq(AlertLogic.describeDays(-1), "expired yesterday", "wording -1");
        eq(AlertLogic.describeDays(-3), "expired 3 days ago", "wording -3");

        List<AlertLogic.Product> products = Arrays.asList(
                p("Cheese", "2026-12-01", false), p("Milk", "2026-10-30", false),
                p("Yogurt", "2026-10-24", false), p("Pane", "2026-10-26", true),
                p("Broken", "not-a-date", false));
        AlertLogic.Summary s = AlertLogic.summarize(products, today);
        eq(s.count, 2, "summary count");
        eq(s.title, "2 products expire within 10 days", "summary title");
        eq(s.body, "Yogurt: expired yesterday\nMilk: expires in 5 days", "summary body");
        eq(AlertLogic.summarize(Arrays.asList(products.get(0), products.get(3)), today), null, "nothing due");
        eq(AlertLogic.summarize(Arrays.asList(products.get(1)), today).title, "Milk expires in 5 days", "single title");

        List<AlertLogic.Product> many = new ArrayList<AlertLogic.Product>();
        for (int i = 0; i < 9; i++) many.add(p("P" + i, "2026-10-27", false));
        String body = AlertLogic.summarize(many, today).body;
        eq(body.split("\n").length, 7, "capped at six names plus a 'more' line");
        eq(body.endsWith("+ 3 more"), true, "more line");

        System.out.println("AlertLogicTest: all " + passed + " checks passed");
    }
}
