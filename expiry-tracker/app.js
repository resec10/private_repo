'use strict';

const $ = (sel) => document.querySelector(sel);
const ui = {
  summary: $('#summary'),
  banner: $('#banner'), bannerText: $('#banner-text'), bannerAction: $('#banner-action'), bannerClose: $('#banner-close'),
  search: $('#search'), list: $('#list'), empty: $('#empty'), noMatch: $('#no-match'),
  add: $('#add'),
  editor: $('#editor'), form: $('#product-form'), editorTitle: $('#editor-title'),
  name: $('#name'), suggestions: $('#name-suggestions'), expiry: $('#expiry'), bread: $('#bread'),
  preview: $('#photo-preview'), camera: $('#photo-camera'), gallery: $('#photo-gallery'), removePhoto: $('#photo-remove'),
  formError: $('#form-error'), del: $('#delete'), saveCopy: $('#save-copy'),
  settings: $('#settings'), openSettings: $('#open-settings'), alertStatus: $('#alert-status'), testAlert: $('#test-alert'),
  exportIcs: $('#export-ics'), exportBackup: $('#export-backup'), importBackup: $('#import-backup'),
  language: $('#language'),
  toast: $('#toast'), toastText: $('#toast-text'), toastAction: $('#toast-action'),
};

// Present when running inside the Android app (see android/), which provides notifications,
// the background check and file saving natively.
const native = window.ExpiryNative || null;

let products = [];
const photoUrls = new Map(); // product id -> { blob, url }
const dateFormats = new Map(); // "lang|withYear" -> Intl.DateTimeFormat

// editor state
let editing = null;          // product being edited, or null when adding
let pendingPhoto;            // undefined = unchanged, null = removed, Blob = new photo
let breadTouched = false;    // stop auto-suggesting once the user flips the switch

init();

async function init() {
  if (!native && 'serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch((err) => console.warn('Service worker not registered', err));
  }
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
  // the Android app alerts while closed, so calendar reminders aren't needed there
  if (native) $('#calendar-setting').hidden = true;
  await applyLanguage((await store.getMeta('lang')) || 'auto');
  bindEvents();
  await reload();
  renderBanner();
  if (!native && alertsGranted()) registerBackgroundCheck();
  await check();
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      render();
      renderBanner(); // the user may have changed notification settings meanwhile
      check();
    }
  });
  setInterval(() => {
    render();
    check();
  }, 30 * 60 * 1000);
}

// ---------------------------------------------------------------- data

async function reload() {
  products = await store.allProducts();
  render();
  if (native) {
    native.syncProducts(JSON.stringify(products.map((p) => ({ name: p.name, expiry: p.expiry, bread: Boolean(p.bread) }))));
  }
  const names = [...new Set(products.map((p) => p.name))].sort((a, b) => a.localeCompare(b));
  ui.suggestions.replaceChildren(...names.map((n) => Object.assign(document.createElement('option'), { value: n })));
}

function newId() {
  return (self.crypto && crypto.randomUUID) ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

// ---------------------------------------------------------------- list

function render() {
  const today = isoDate();
  const q = ui.search.value.trim().toLocaleLowerCase();
  const shown = products
    .filter((p) => !q || p.name.toLocaleLowerCase().includes(q))
    .sort((a, b) => a.expiry.localeCompare(b.expiry) || a.name.localeCompare(b.name, currentLang));
  const groups = [
    { title: t('groupSoon', { days: t('days', { n: ALERT_DAYS }) }), cls: 'soon', items: shown.filter((p) => needsAlert(p, today)) },
    { title: t('groupBread'), cls: 'bread', items: shown.filter((p) => p.bread) },
    { title: t('groupLater'), cls: 'later', items: shown.filter((p) => !p.bread && !needsAlert(p, today)) },
  ].filter((g) => g.items.length);

  ui.list.replaceChildren(...groups.map((g) => {
    const section = el('section', { class: `group ${g.cls}` });
    section.append(el('h2', {}, `${g.title} (${g.items.length})`));
    const ul = el('ul');
    ul.append(...g.items.map((p) => {
      const li = el('li');
      li.append(card(p, today));
      return li;
    }));
    section.append(ul);
    return section;
  }));
  ui.empty.hidden = products.length > 0;
  ui.noMatch.hidden = !(products.length && !shown.length);

  const due = products.filter((p) => needsAlert(p, today)).length;
  const window10 = t('days', { n: ALERT_DAYS });
  ui.summary.textContent = !products.length ? t('summaryEmpty')
    : due ? t('expiringCount', { n: due, days: window10 }) : t('summaryNone', { days: window10 });
}

function card(p, today) {
  const days = daysUntil(p.expiry, today);
  const state = days < 0 ? 'expired' : p.bread ? 'bread' : needsAlert(p, today) ? 'alert' : 'ok';
  const btn = el('button', { class: `card ${state === 'ok' ? '' : state}`, type: 'button' });
  btn.addEventListener('click', () => openEditor(p));

  let thumb;
  if (p.photo) {
    thumb = el('img', { class: 'thumb', alt: '', src: photoUrl(p) });
  } else {
    thumb = el('span', { class: 'thumb', 'aria-hidden': 'true' }, (p.name.trim()[0] || '?').toLocaleUpperCase());
  }

  const meta = el('span', { class: 'meta' });
  meta.append(el('span', { class: `pill ${state === 'ok' ? '' : state}` }, capitalize(describeDays(days))));
  if (p.bread) {
    const tag = el('span', { class: 'tag' });
    tag.innerHTML = '<svg><use href="#i-bread"/></svg>';
    tag.append(t('breadTag'));
    meta.append(tag);
  }
  const info = el('span', { class: 'info' });
  info.append(el('span', { class: 'name' }, p.name), el('span', { class: 'date' }, t('expiresOn', { date: formatDate(p.expiry) })), meta);

  btn.append(thumb, info);
  return btn;
}

function photoUrl(p) {
  let entry = photoUrls.get(p.id);
  if (!entry || entry.blob !== p.photo) {
    if (entry) URL.revokeObjectURL(entry.url);
    entry = { blob: p.photo, url: URL.createObjectURL(p.photo) };
    photoUrls.set(p.id, entry);
  }
  return entry.url;
}

function forgetPhoto(id) {
  const entry = photoUrls.get(id);
  if (entry) URL.revokeObjectURL(entry.url);
  photoUrls.delete(id);
}

// ---------------------------------------------------------------- editor

function openEditor(product = null) {
  editing = product;
  pendingPhoto = undefined;
  breadTouched = Boolean(product);
  ui.form.reset();
  ui.formError.hidden = true;
  ui.editorTitle.textContent = product ? t('editProduct') : t('addProduct');
  ui.name.value = product ? product.name : '';
  ui.expiry.value = product ? product.expiry : '';
  ui.bread.checked = product ? Boolean(product.bread) : false;
  ui.del.hidden = !product;
  ui.saveCopy.hidden = !product;
  showPreview(product && product.photo ? product.photo : null);
  ui.editor.showModal();
  if (!product) ui.name.focus();
}

let previewUrl = null;
function showPreview(blob) {
  if (previewUrl) URL.revokeObjectURL(previewUrl);
  previewUrl = null;
  if (blob) {
    previewUrl = URL.createObjectURL(blob);
    ui.preview.replaceChildren(el('img', { src: previewUrl, alt: t('productPhoto') }));
  } else {
    ui.preview.innerHTML = '<svg><use href="#i-image"/></svg>';
    ui.preview.append(el('span', {}, t('noPhoto')));
  }
  ui.removePhoto.hidden = !blob;
}

async function onPhotoChosen(input) {
  const file = input.files && input.files[0];
  input.value = '';
  if (!file) return;
  try {
    pendingPhoto = await resizeImage(file);
    showPreview(pendingPhoto);
  } catch (err) {
    console.warn(err);
    toast(t('photoError'));
  }
}

/** Shrink photos to at most 900px on the long side so hundreds of products fit easily. */
async function resizeImage(file, max = 900) {
  let source;
  try {
    source = await createImageBitmap(file);
  } catch (_) {
    source = await loadImage(file);
  }
  const w = source.naturalWidth || source.width;
  const h = source.naturalHeight || source.height;
  const scale = Math.min(1, max / Math.max(w, h));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(w * scale);
  canvas.height = Math.round(h * scale);
  canvas.getContext('2d').drawImage(source, 0, 0, canvas.width, canvas.height);
  if (source.close) source.close();
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not encode photo'))), 'image/jpeg', 0.82);
  });
}

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Unsupported image')); };
    img.src = url;
  });
}

async function saveProduct(asNewBatch) {
  const name = ui.name.value.trim();
  const expiry = ui.expiry.value;
  if (!name || !/^\d{4}-\d{2}-\d{2}$/.test(expiry)) {
    ui.formError.textContent = !name ? t('errorName') : t('errorDate');
    ui.formError.hidden = false;
    (!name ? ui.name : ui.expiry).focus();
    return;
  }
  const keepOld = editing && !asNewBatch;
  const photo = pendingPhoto !== undefined ? pendingPhoto : (editing ? editing.photo : null);
  const product = {
    ...(keepOld ? editing : { id: newId(), createdAt: Date.now() }),
    name,
    expiry,
    bread: ui.bread.checked,
    photo: photo || null,
    updatedAt: Date.now(),
  };
  await store.putProduct(product);
  ui.editor.close();
  await reload();
  const desc = describeDays(daysUntil(expiry));
  toast(needsAlert(product) ? t('savedSoon', { name, desc }) : t('savedLater', { name, desc, date: formatDate(expiry) }));
}

async function deleteProduct() {
  const removed = editing;
  ui.editor.close();
  await store.deleteProduct(removed.id);
  forgetPhoto(removed.id);
  await reload();
  toast(t('deleted', { name: removed.name }), t('undo'), async () => {
    await store.putProduct(removed);
    await reload();
  });
}

// ---------------------------------------------------------------- alerts

/** 'granted' | 'default' (not asked yet) | 'denied' | 'unsupported' */
function alertPermission() {
  if (native) return native.permission();
  return 'Notification' in window ? Notification.permission : 'unsupported';
}

function alertsGranted() {
  return alertPermission() === 'granted';
}

function isIos() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

function isInstalled() {
  return matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
}

function renderBanner() {
  const permission = alertPermission();
  let text = '';
  let action = null;
  let dismissKey = null;
  if (permission === 'unsupported') {
    if (isIos() && !isInstalled()) {
      text = t('bannerIosInstall');
    } else {
      text = t('bannerNoNotifications');
    }
    dismissKey = 'dismissed-no-notifications';
  } else if (permission === 'default') {
    text = t('bannerAsk', { days: t('days', { n: ALERT_DAYS }) });
    action = { label: t('turnOnAlerts'), run: enableAlerts };
  } else if (permission === 'denied') {
    if (native) {
      text = t('bannerNativeOff');
      action = { label: t('openSettings'), run: () => native.openSettings() };
    } else {
      text = t('bannerBlocked');
      dismissKey = 'dismissed-denied';
    }
  }
  let dismissed = false;
  try { dismissed = Boolean(dismissKey && localStorage.getItem(dismissKey)); } catch (_) { /* storage blocked */ }

  ui.banner.hidden = !text || dismissed;
  ui.bannerText.textContent = text;
  ui.bannerAction.hidden = !action;
  if (action) {
    ui.bannerAction.textContent = action.label;
    ui.bannerAction.onclick = action.run;
  }
  ui.bannerClose.hidden = !dismissKey;
  ui.bannerClose.onclick = () => {
    try { localStorage.setItem(dismissKey, '1'); } catch (_) { /* storage blocked */ }
    ui.banner.hidden = true;
  };
}

function requestAlertPermission() {
  if (!native) return Notification.requestPermission();
  return new Promise((resolve) => {
    window.__nativePermissionResult = (state) => {
      window.__nativePermissionResult = null;
      resolve(state);
    };
    native.requestPermission();
  });
}

async function enableAlerts() {
  const result = await requestAlertPermission();
  renderBanner();
  if (result !== 'granted') return;
  let shown;
  if (native) {
    shown = native.checkNow(true);
  } else {
    registerBackgroundCheck();
    shown = await runDailyCheck(await notifier(), { force: true });
  }
  toast(shown ? t('alertsOnWithSummary') : t('alertsOnNothing', { days: t('days', { n: ALERT_DAYS }) }));
}

/** Something with showNotification(): the service worker if available, else plain Notification. */
async function notifier() {
  if ('serviceWorker' in navigator) {
    const reg = await Promise.race([navigator.serviceWorker.ready, new Promise((r) => setTimeout(r, 3000))]);
    if (reg) return reg;
  }
  return { showNotification: async (title, options) => { new Notification(title, options); } };
}

async function registerBackgroundCheck() {
  try {
    const reg = await navigator.serviceWorker.ready;
    if (!('periodicSync' in reg)) return;
    const status = await navigator.permissions.query({ name: 'periodic-background-sync' });
    if (status.state === 'granted') {
      await reg.periodicSync.register('expiry-check', { minInterval: 12 * 60 * 60 * 1000 });
    }
  } catch (_) {
    // not supported here; the check still runs whenever the app is opened
  }
}

async function check() {
  try {
    if (native) native.checkNow(false);
    else await runDailyCheck(await notifier());
  } catch (err) {
    console.warn('Expiry check failed', err);
  }
}

async function sendAlertNow() {
  const permission = alertPermission();
  if (permission === 'default') return enableAlerts();
  if (permission === 'denied' && native) return native.openSettings();
  if (permission !== 'granted') return toast(t('notAllowed'));
  if (native) {
    native.sendAlertNow();
  } else {
    const n = await notifier();
    const shown = await runDailyCheck(n, { force: true });
    if (!shown) {
      await n.showNotification(t('testTitle'), {
        body: `${t('summaryNone', { days: t('days', { n: ALERT_DAYS }) })}.`, tag: 'expiry-alert', icon: 'icons/icon-192.png',
      });
    }
  }
  toast(t('alertSent'));
}

function renderAlertStatus() {
  const permission = alertPermission();
  let text;
  let button = t('sendAlertNow');
  if (permission === 'unsupported') {
    text = isIos() && !isInstalled() ? t('statusIosInstall') : t('statusUnsupported');
  } else if (permission === 'granted') {
    text = `${t('statusOn', { days: t('days', { n: ALERT_DAYS }) })} ${native ? t('statusOnNative') : t('statusOnWeb')}`;
  } else if (permission === 'denied') {
    text = native ? t('statusOffNative') : t('statusBlocked');
    button = t('openNotificationSettings');
  } else {
    text = t('statusOff');
    button = t('turnOnAlerts');
  }
  ui.alertStatus.textContent = text;
  ui.testAlert.textContent = button;
  ui.testAlert.hidden = permission === 'unsupported' || (permission === 'denied' && !native);
}

/** Android back button: close an open sheet first. Returns whether something was closed. */
window.__handleBack = () => {
  const open = document.querySelector('dialog[open]');
  if (!open) return false;
  open.close();
  return true;
};

// ---------------------------------------------------------------- backup & calendar

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

async function download(filename, blob) {
  if (native) {
    // the Android app opens its "Save to…" screen and confirms itself
    const dataUrl = await blobToDataUrl(blob);
    native.saveFile(filename, blob.type || 'application/octet-stream', dataUrl.slice(dataUrl.indexOf(',') + 1));
    return;
  }
  const url = URL.createObjectURL(blob);
  const a = el('a', { href: url, download: filename });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

async function exportBackup() {
  if (!products.length) return toast(t('nothingToBackup'));
  const items = await Promise.all(products.map(async (p) => ({ ...p, photo: p.photo ? await blobToDataUrl(p.photo) : null })));
  const data = { app: 'expiry-tracker', version: 1, exportedAt: new Date().toISOString(), products: items };
  await download(`expiry-backup-${isoDate()}.json`, new Blob([JSON.stringify(data)], { type: 'application/json' }));
  if (!native) toast(t('backupSaved', { products: t('products', { n: products.length }) }));
}

async function importBackup(file) {
  let data;
  try {
    data = JSON.parse(await file.text());
  } catch (_) {
    return toast(t('invalidBackup'));
  }
  if (!data || data.app !== 'expiry-tracker' || !Array.isArray(data.products)) {
    return toast(t('notOurBackup'));
  }
  let count = 0;
  for (const p of data.products) {
    if (!p || typeof p.name !== 'string' || !p.name.trim() || !/^\d{4}-\d{2}-\d{2}$/.test(String(p.expiry))) continue;
    let photo = null;
    if (typeof p.photo === 'string' && /^data:image\/(jpeg|png|webp);base64,/.test(p.photo)) {
      photo = await (await fetch(p.photo)).blob();
    }
    await store.putProduct({
      id: typeof p.id === 'string' && p.id ? p.id : newId(),
      name: p.name.trim().slice(0, 120),
      expiry: p.expiry,
      bread: Boolean(p.bread),
      photo,
      createdAt: Number(p.createdAt) || Date.now(),
      updatedAt: Number(p.updatedAt) || Date.now(),
    });
    count++;
  }
  await reload();
  ui.settings.close();
  toast(t('restored', { products: t('products', { n: count }) }));
}

function icsText(s) {
  return s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

/** Fold lines longer than 75 bytes, as the iCalendar format requires. */
function icsFold(line) {
  const enc = new TextEncoder();
  const out = [];
  let cur = '';
  for (const ch of line) {
    const limit = out.length ? 74 : 75; // continuation lines start with a space
    if (enc.encode(cur + ch).length > limit) {
      out.push(cur);
      cur = ch;
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out.join('\r\n ');
}

function nextDay(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
}

function exportCalendar() {
  const items = products.filter((p) => !p.bread && daysUntil(p.expiry) >= 0);
  if (!items.length) return toast(t('noCalendarItems'));
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Expiry Tracker//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH'];
  for (const p of items) {
    lines.push(
      'BEGIN:VEVENT',
      `UID:${p.id}@expiry-tracker`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${p.expiry.replace(/-/g, '')}`,
      `DTEND;VALUE=DATE:${nextDay(p.expiry).replace(/-/g, '')}`,
      `SUMMARY:${icsText(t('icsSummary', { name: p.name }))}`,
      'TRANSP:TRANSPARENT',
      // 09:00 ten days before (the all-day event starts at 00:00 on the expiry date)
      'BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${icsText(t('icsAlarmBefore', { name: p.name, days: t('days', { n: ALERT_DAYS }) }))}`,
      `TRIGGER:-P${ALERT_DAYS - 1}DT15H`, 'END:VALARM',
      'BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${icsText(t('icsAlarmToday', { name: p.name }))}`, 'TRIGGER:PT9H', 'END:VALARM',
      'END:VEVENT',
    );
  }
  lines.push('END:VCALENDAR');
  download('expiry-reminders.ics', new Blob([`${lines.map(icsFold).join('\r\n')}\r\n`], { type: 'text/calendar' }));
  toast(t('calendarSaved', { reminders: t('reminders', { n: items.length * 2 }) }));
}

// ---------------------------------------------------------------- helpers

function el(tag, attrs = {}, text) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  if (text !== undefined) node.textContent = text;
  return node;
}

function formatDate(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  const withYear = y !== new Date().getFullYear();
  const key = `${currentLang}|${withYear}`;
  if (!dateFormats.has(key)) {
    dateFormats.set(key, new Intl.DateTimeFormat(currentLang, {
      weekday: 'short', day: 'numeric', month: 'short', ...(withYear ? { year: 'numeric' } : {}),
    }));
  }
  return dateFormats.get(key).format(new Date(y, m - 1, d));
}

function capitalize(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

let toastTimer = null;
function toast(message, actionLabel, action) {
  ui.toastText.textContent = message;
  ui.toastAction.hidden = !actionLabel;
  ui.toastAction.textContent = actionLabel || '';
  ui.toastAction.onclick = actionLabel ? () => { ui.toast.hidden = true; action(); } : null;
  ui.toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { ui.toast.hidden = true; }, actionLabel ? 7000 : 4000);
}

// ---------------------------------------------------------------- language

/** chosen: "auto" (follow the phone) or a code from LANGUAGES (i18n.js). */
async function applyLanguage(chosen) {
  setLang(chosen in LANGUAGES ? chosen : detectLang());
  ui.language.value = chosen in LANGUAGES ? chosen : 'auto';
  document.documentElement.lang = currentLang;
  document.title = t('appTitle');
  for (const node of document.querySelectorAll('[data-i18n]')) node.textContent = t(node.dataset.i18n);
  for (const node of document.querySelectorAll('[data-i18n-placeholder]')) node.placeholder = t(node.dataset.i18nPlaceholder);
  for (const node of document.querySelectorAll('[data-i18n-aria-label]')) node.setAttribute('aria-label', t(node.dataset.i18nAriaLabel));
  if (native) native.setLanguage(currentLang); // background notifications use the same language
}

// ---------------------------------------------------------------- events

function bindEvents() {
  ui.add.addEventListener('click', () => openEditor());
  ui.search.addEventListener('input', render);
  ui.name.addEventListener('input', () => {
    if (!breadTouched) ui.bread.checked = looksLikeBread(ui.name.value);
    ui.formError.hidden = true;
  });
  ui.expiry.addEventListener('input', () => { ui.formError.hidden = true; });
  ui.bread.addEventListener('change', () => { breadTouched = true; });
  ui.camera.addEventListener('change', () => onPhotoChosen(ui.camera));
  ui.gallery.addEventListener('change', () => onPhotoChosen(ui.gallery));
  ui.removePhoto.addEventListener('click', () => { pendingPhoto = null; showPreview(null); });
  ui.form.addEventListener('submit', (e) => {
    e.preventDefault();
    saveProduct(e.submitter === ui.saveCopy);
  });
  ui.del.addEventListener('click', deleteProduct);
  document.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => b.closest('dialog').close()));
  for (const d of [ui.editor, ui.settings]) {
    d.addEventListener('click', (e) => { // tap on the backdrop (outside the sheet) to close
      if (e.target !== d) return;
      const r = d.getBoundingClientRect();
      if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) d.close();
    });
  }
  ui.openSettings.addEventListener('click', () => {
    renderAlertStatus();
    ui.settings.showModal();
  });
  ui.testAlert.addEventListener('click', async () => {
    await sendAlertNow();
    renderAlertStatus();
  });
  ui.language.addEventListener('change', async () => {
    await store.setMeta('lang', ui.language.value);
    await applyLanguage(ui.language.value);
    render();
    renderBanner();
    renderAlertStatus();
  });
  ui.exportIcs.addEventListener('click', exportCalendar);
  ui.exportBackup.addEventListener('click', exportBackup);
  ui.importBackup.addEventListener('change', () => {
    const file = ui.importBackup.files[0];
    ui.importBackup.value = '';
    if (file) importBackup(file);
  });
}
