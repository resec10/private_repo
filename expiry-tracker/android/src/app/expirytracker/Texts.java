package app.expirytracker;

import java.util.HashMap;
import java.util.Map;

/**
 * Native-side text in the app's languages. The notification strings must match i18n.js exactly
 * (checked by tests/AlertLogicTest.java). Plural keys end in .one / .few / .many / .other.
 */
final class Texts {
    private static final Map<String, Map<String, String>> MESSAGES = new HashMap<String, Map<String, String>>();

    static {
        Map<String, String> en = lang("en");
        en.put("days.one", "{n} day");
        en.put("days.other", "{n} days");
        en.put("expiresIn", "expires in {days}");
        en.put("expiresTomorrow", "expires tomorrow");
        en.put("expiresToday", "expires today");
        en.put("expiredYesterday", "expired yesterday");
        en.put("expiredAgo", "expired {days} ago");
        en.put("expiringCount.one", "{n} product expires within {days}");
        en.put("expiringCount.other", "{n} products expire within {days}");
        en.put("alertTitleOne", "{name} {desc}");
        en.put("alertLine", "{name}: {desc}");
        en.put("alertMore", "+ {n} more");
        en.put("tapToOpen", "Tap to open Expiry Tracker.");
        en.put("summaryNone", "Nothing expires in the next {days}");
        en.put("testTitle", "Expiry alerts are on");
        en.put("saved", "Saved.");
        en.put("saveFailed", "Could not save the file.");
        en.put("noCamera", "No camera app found on this phone.");
        en.put("noPicker", "No app found to choose files.");

        Map<String, String> ro = lang("ro");
        ro.put("days.one", "{n} zi");
        ro.put("days.few", "{n} zile");
        ro.put("days.other", "{n} de zile");
        ro.put("expiresIn", "expiră în {days}");
        ro.put("expiresTomorrow", "expiră mâine");
        ro.put("expiresToday", "expiră azi");
        ro.put("expiredYesterday", "a expirat ieri");
        ro.put("expiredAgo", "a expirat acum {days}");
        ro.put("expiringCount.one", "{n} produs expiră în următoarele {days}");
        ro.put("expiringCount.few", "{n} produse expiră în următoarele {days}");
        ro.put("expiringCount.other", "{n} de produse expiră în următoarele {days}");
        ro.put("alertTitleOne", "{name}: {desc}");
        ro.put("alertLine", "{name}: {desc}");
        ro.put("alertMore", "+ încă {n}");
        ro.put("tapToOpen", "Atinge pentru a deschide aplicația.");
        ro.put("summaryNone", "Nimic nu expiră în următoarele {days}");
        ro.put("testTitle", "Alertele de expirare sunt activate");
        ro.put("saved", "Salvat.");
        ro.put("saveFailed", "Fișierul nu a putut fi salvat.");
        ro.put("noCamera", "Nu există nicio aplicație de cameră pe acest telefon.");
        ro.put("noPicker", "Nu există nicio aplicație pentru alegerea fișierelor.");

        Map<String, String> ru = lang("ru");
        ru.put("days.one", "{n} день");
        ru.put("days.few", "{n} дня");
        ru.put("days.many", "{n} дней");
        ru.put("expiresIn", "истекает через {days}");
        ru.put("expiresTomorrow", "истекает завтра");
        ru.put("expiresToday", "истекает сегодня");
        ru.put("expiredYesterday", "истёк вчера");
        ru.put("expiredAgo", "истёк {days} назад");
        ru.put("expiringCount.one", "{n} товар: срок истекает в течение {days}");
        ru.put("expiringCount.few", "{n} товара: срок истекает в течение {days}");
        ru.put("expiringCount.many", "{n} товаров: срок истекает в течение {days}");
        ru.put("alertTitleOne", "{name}: {desc}");
        ru.put("alertLine", "{name}: {desc}");
        ru.put("alertMore", "+ ещё {n}");
        ru.put("tapToOpen", "Нажмите, чтобы открыть приложение.");
        ru.put("summaryNone", "В ближайшие {days} ничего не истекает");
        ru.put("testTitle", "Уведомления о сроках включены");
        ru.put("saved", "Сохранено.");
        ru.put("saveFailed", "Не удалось сохранить файл.");
        ru.put("noCamera", "На телефоне нет приложения камеры.");
        ru.put("noPicker", "Нет приложения для выбора файлов.");
    }

    private Texts() {
    }

    private static Map<String, String> lang(String code) {
        Map<String, String> m = new HashMap<String, String>();
        MESSAGES.put(code, m);
        return m;
    }

    static String normalize(String lang) {
        return lang != null && MESSAGES.containsKey(lang) ? lang : "en";
    }

    /** CLDR plural category for whole numbers (same rules as pluralCategory in i18n.js). */
    static String pluralCategory(String lang, long n) {
        n = Math.abs(n);
        if ("ru".equals(lang)) {
            long m10 = n % 10;
            long m100 = n % 100;
            if (m10 == 1 && m100 != 11) return "one";
            if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return "few";
            return "many";
        }
        if ("ro".equals(lang)) {
            if (n == 1) return "one";
            if (n == 0 || (n % 100 >= 1 && n % 100 <= 19)) return "few";
            return "other";
        }
        return n == 1 ? "one" : "other";
    }

    /** Message `key` with {placeholders} filled from name/value pairs. */
    static String t(String lang, String key, String... params) {
        lang = normalize(lang);
        String msg = MESSAGES.get(lang).get(key);
        if (msg == null) msg = MESSAGES.get("en").get(key);
        if (msg == null) return key;
        for (int i = 0; i + 1 < params.length; i += 2) msg = msg.replace("{" + params[i] + "}", params[i + 1]);
        return msg;
    }

    /** Plural message `key` for count n, e.g. plural("ru", "days", 5) = "5 дней". */
    static String plural(String lang, String key, long n, String... params) {
        lang = normalize(lang);
        String[] all = new String[params.length + 2];
        all[0] = "n";
        all[1] = String.valueOf(n);
        System.arraycopy(params, 0, all, 2, params.length);
        return t(lang, key + "." + pluralCategory(lang, n), all);
    }
}
