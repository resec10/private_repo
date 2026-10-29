/* Shared by the page (app.js) and the service worker (sw.js). Needs i18n.js loaded first.
   Plain script, not a module, so the worker can load it with importScripts() on every browser. */

const ALERT_DAYS = 10;
const DB_NAME = 'expiry-tracker';
const DB_VERSION = 1;

// ---------------------------------------------------------------- storage (IndexedDB)

let dbPromise = null;

function openDb() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        req.result.createObjectStore('products', { keyPath: 'id' });
        req.result.createObjectStore('meta');
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => {
        dbPromise = null;
        reject(req.error);
      };
    });
  }
  return dbPromise;
}

async function withStore(name, mode, fn) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(name, mode);
    const req = fn(tx.objectStore(name));
    tx.oncomplete = () => resolve(req ? req.result : undefined);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

const store = {
  allProducts: () => withStore('products', 'readonly', (s) => s.getAll()),
  putProduct: (product) => withStore('products', 'readwrite', (s) => s.put(product)),
  deleteProduct: (id) => withStore('products', 'readwrite', (s) => s.delete(id)),
  getMeta: (key) => withStore('meta', 'readonly', (s) => s.get(key)),
  setMeta: (key, value) => withStore('meta', 'readwrite', (s) => s.put(value, key)),
};

// ---------------------------------------------------------------- dates

/** Local calendar date as YYYY-MM-DD. */
function isoDate(d = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Whole days from `today` to `expiry` (both YYYY-MM-DD). Negative once expired. */
function daysUntil(expiry, today = isoDate()) {
  // compare as UTC midnights so daylight-saving changes never shift the count
  const utc = (s) => {
    const [y, m, d] = s.split('-').map(Number);
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((utc(expiry) - utc(today)) / 86400000);
}

/** Bread never alerts; everything else alerts from ALERT_DAYS before expiry onwards. */
function needsAlert(product, today = isoDate()) {
  return !product.bread && daysUntil(product.expiry, today) <= ALERT_DAYS;
}

/** "expires in 5 days", "expired yesterday"… in the current (or given) language; see i18n.js. */
function describeDays(days, lang = currentLang) {
  if (days < -1) return t('expiredAgo', { days: t('days', { n: -days }, lang) }, lang);
  if (days === -1) return t('expiredYesterday', {}, lang);
  if (days === 0) return t('expiresToday', {}, lang);
  if (days === 1) return t('expiresTomorrow', {}, lang);
  return t('expiresIn', { days: t('days', { n: days }, lang) }, lang);
}

// ---------------------------------------------------------------- bread detection

// Only a suggestion for the "Bread" switch; the user can always change it.
const BREAD_WORDS = [
  'bread', 'breads', 'loaf', 'loaves', 'baguette', 'baguettes', 'ciabatta', 'focaccia',
  'pane', 'panino', 'panini', 'pain', 'brot', 'brötchen', 'chleb',
  // Romanian
  'pâine', 'paine', 'pâini', 'paini', 'franzelă', 'franzela', 'baghetă', 'bagheta', 'baghete',
  'lipie', 'lipii', 'chiflă', 'chifla', 'chifle',
  // Russian
  'хлеб', 'батон', 'багет', 'буханка', 'лаваш', 'чиабатта', 'фокачча', 'булка', 'булочка',
  'булочки', 'лепёшка', 'лепешка',
];
const BREAD_RE = new RegExp(`(^|[^\\p{L}])(${BREAD_WORDS.join('|')})(?=$|[^\\p{L}])`, 'iu');

function looksLikeBread(name) {
  return BREAD_RE.test(String(name).normalize('NFC'));
}

// ---------------------------------------------------------------- daily alert

/** Notification text for everything that needs attention today, or null if nothing does. */
function alertSummary(products, today = isoDate(), lang = currentLang) {
  const due = products
    .filter((p) => needsAlert(p, today))
    .map((p) => ({ name: p.name, days: daysUntil(p.expiry, today) }))
    .sort((a, b) => a.days - b.days || a.name.localeCompare(b.name));
  if (!due.length) return null;
  if (due.length === 1) {
    const title = t('alertTitleOne', { name: due[0].name, desc: describeDays(due[0].days, lang) }, lang);
    return { title, body: t('tapToOpen', {}, lang), count: 1 };
  }
  const lines = due.slice(0, 6).map((d) => t('alertLine', { name: d.name, desc: describeDays(d.days, lang) }, lang));
  if (due.length > 6) lines.push(t('alertMore', { n: due.length - 6 }, lang));
  const title = t('expiringCount', { n: due.length, days: t('days', { n: ALERT_DAYS }, lang) }, lang);
  return { title, body: lines.join('\n'), count: due.length };
}

/** The language chosen in Settings ("auto" or unset means the phone's language). */
async function effectiveLang() {
  const chosen = await store.getMeta('lang');
  return chosen && chosen in LANGUAGES ? chosen : detectLang();
}

async function updateBadge(count) {
  const nav = self.navigator;
  try {
    if (count && nav.setAppBadge) await nav.setAppBadge(count);
    else if (nav.clearAppBadge) await nav.clearAppBadge();
  } catch (_) {
    // badges are a nice-to-have; some platforms refuse them
  }
}

/**
 * Show at most one summary notification per day. Called when the app opens or comes back to
 * the foreground, every 30 minutes while it is open, and from background sync where supported.
 * `notifier` is a ServiceWorkerRegistration (or anything with showNotification).
 */
async function runDailyCheck(notifier, { force = false } = {}) {
  const today = isoDate();
  const summary = alertSummary(await store.allProducts(), today, await effectiveLang());
  await updateBadge(summary ? summary.count : 0);
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return null;
  if (!force && (await store.getMeta('lastAlertDay')) === today) return null;
  await store.setMeta('lastAlertDay', today);
  if (!summary) return null;
  await notifier.showNotification(summary.title, {
    body: summary.body,
    tag: 'expiry-alert',
    renotify: true,
    icon: 'icons/icon-192.png',
    badge: 'icons/badge-96.png',
    data: { url: './' },
  });
  return summary;
}
