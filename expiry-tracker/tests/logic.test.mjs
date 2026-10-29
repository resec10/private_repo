// Run from the expiry-tracker folder with: node --test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const ctx = vm.createContext({});
ctx.self = ctx;
for (const file of ['../i18n.js', '../shared.js']) {
  vm.runInContext(readFileSync(new URL(file, import.meta.url), 'utf8'), ctx);
}
const { daysUntil, needsAlert, describeDays, looksLikeBread, alertSummary, isoDate,
  t, pluralCategory, detectLang, MESSAGES } = vm.runInContext(
  '({ daysUntil, needsAlert, describeDays, looksLikeBread, alertSummary, isoDate, t, pluralCategory, detectLang, MESSAGES })', ctx);

test('daysUntil counts calendar days', () => {
  assert.equal(daysUntil('2026-11-04', '2026-10-25'), 10);
  assert.equal(daysUntil('2026-10-25', '2026-10-25'), 0);
  assert.equal(daysUntil('2026-10-24', '2026-10-25'), -1);
  assert.equal(daysUntil('2027-01-01', '2026-12-31'), 1);
  assert.equal(daysUntil('2028-03-01', '2028-02-28'), 2); // leap year
});

test('daysUntil is not shifted by daylight-saving changes', () => {
  // clocks change on 2026-03-29 and 2026-10-25 in Europe
  assert.equal(daysUntil('2026-03-30', '2026-03-28'), 2);
  assert.equal(daysUntil('2026-10-26', '2026-10-24'), 2);
});

test('isoDate formats the local date', () => {
  assert.equal(isoDate(new Date(2026, 0, 5, 23, 59)), '2026-01-05');
});

test('alerts start 10 days before expiry and never fire for bread', () => {
  const today = '2026-10-25';
  assert.equal(needsAlert({ expiry: '2026-11-04', bread: false }, today), true); // 10 days
  assert.equal(needsAlert({ expiry: '2026-11-05', bread: false }, today), false); // 11 days
  assert.equal(needsAlert({ expiry: '2026-10-20', bread: false }, today), true); // expired
  assert.equal(needsAlert({ expiry: '2026-10-26', bread: true }, today), false);
  assert.equal(needsAlert({ expiry: '2026-10-20', bread: true }, today), false);
});

test('describeDays wording', () => {
  assert.equal(describeDays(5), 'expires in 5 days');
  assert.equal(describeDays(1), 'expires tomorrow');
  assert.equal(describeDays(0), 'expires today');
  assert.equal(describeDays(-1), 'expired yesterday');
  assert.equal(describeDays(-3), 'expired 3 days ago');
});

test('bread is suggested from the name', () => {
  for (const name of ['Bread', 'Whole wheat bread', 'Pane casereccio', 'Pâine albă', 'PAINE NEAGRA',
    'Baguette', 'Focaccia genovese', 'Roggenbrot', 'Brot']) {
    // compound words such as "Roggenbrot" are not matched; only whole words are
    assert.equal(looksLikeBread(name), name !== 'Roggenbrot', name);
  }
  for (const name of ['Milk', 'Panna da cucina', 'Pan di Stelle', 'Breadsticks', 'Panettone']) {
    assert.equal(looksLikeBread(name), false, name);
  }
});

test('alertSummary lists only products that need attention, soonest first', () => {
  const today = '2026-10-25';
  const products = [
    { name: 'Cheese', expiry: '2026-12-01', bread: false },
    { name: 'Milk', expiry: '2026-10-30', bread: false },
    { name: 'Yogurt', expiry: '2026-10-24', bread: false },
    { name: 'Pane', expiry: '2026-10-26', bread: true },
  ];
  const s = alertSummary(products, today);
  assert.equal(s.count, 2);
  assert.equal(s.title, '2 products expire within 10 days');
  assert.equal(s.body, 'Yogurt: expired yesterday\nMilk: expires in 5 days');
  assert.equal(alertSummary([products[0], products[3]], today), null);
  assert.equal(alertSummary([products[1]], today).title, 'Milk expires in 5 days');
});

test('alertSummary caps the list at six names', () => {
  const products = Array.from({ length: 9 }, (_, i) => ({ name: `P${i}`, expiry: '2026-10-27', bread: false }));
  const s = alertSummary(products, '2026-10-25');
  assert.equal(s.body.split('\n').length, 7);
  assert.match(s.body, /\+ 3 more$/);
});

// ---------------------------------------------------------------- translations

test('plural rules match the CLDR rules built into Intl for 0..300', () => {
  for (const lang of ['en', 'ro', 'ru']) {
    const cldr = new Intl.PluralRules(lang);
    for (let n = 0; n <= 300; n++) assert.equal(pluralCategory(lang, n), cldr.select(n), `${lang} ${n}`);
  }
});

test('every message exists in all languages, with the same placeholders and plural forms', () => {
  const forms = { en: ['one', 'other'], ro: ['one', 'few', 'other'], ru: ['one', 'few', 'many'] };
  const placeholders = (m) => [...new Set((typeof m === 'object' ? Object.values(m).join(' ') : m).match(/\{\w+\}/g) || [])].sort();
  for (const key of Object.keys(MESSAGES.en)) {
    for (const lang of ['ro', 'ru']) {
      const msg = MESSAGES[lang][key];
      assert.ok(msg !== undefined, `${lang} is missing ${key}`);
      assert.deepEqual(placeholders(msg), placeholders(MESSAGES.en[key]), `${lang}.${key} placeholders`);
      if (typeof MESSAGES.en[key] === 'object') assert.deepEqual(Object.keys(msg).sort(), forms[lang].sort(), `${lang}.${key} plural forms`);
    }
  }
  for (const lang of ['ro', 'ru']) {
    for (const key of Object.keys(MESSAGES[lang])) assert.ok(key in MESSAGES.en, `${lang} has unknown key ${key}`);
  }
});

test('Romanian wording', () => {
  assert.equal(describeDays(1, 'ro'), 'expiră mâine');
  assert.equal(describeDays(0, 'ro'), 'expiră azi');
  assert.equal(describeDays(5, 'ro'), 'expiră în 5 zile');
  assert.equal(describeDays(20, 'ro'), 'expiră în 20 de zile');
  assert.equal(describeDays(101, 'ro'), 'expiră în 101 zile');
  assert.equal(describeDays(-1, 'ro'), 'a expirat ieri');
  assert.equal(describeDays(-3, 'ro'), 'a expirat acum 3 zile');
  assert.equal(describeDays(-25, 'ro'), 'a expirat acum 25 de zile');
  assert.equal(t('products', { n: 1 }, 'ro'), '1 produs');
});

test('Russian wording', () => {
  assert.equal(describeDays(1, 'ru'), 'истекает завтра');
  assert.equal(describeDays(0, 'ru'), 'истекает сегодня');
  assert.equal(describeDays(2, 'ru'), 'истекает через 2 дня');
  assert.equal(describeDays(5, 'ru'), 'истекает через 5 дней');
  assert.equal(describeDays(11, 'ru'), 'истекает через 11 дней');
  assert.equal(describeDays(21, 'ru'), 'истекает через 21 день');
  assert.equal(describeDays(-1, 'ru'), 'истёк вчера');
  assert.equal(describeDays(-3, 'ru'), 'истёк 3 дня назад');
  assert.equal(t('products', { n: 22 }, 'ru'), '22 товара');
});

test('notification summary in Romanian and Russian', () => {
  const today = '2026-10-25';
  const products = [
    { name: 'Lapte', expiry: '2026-10-30', bread: false },
    { name: 'Iaurt', expiry: '2026-10-24', bread: false },
    { name: 'Pâine', expiry: '2026-10-26', bread: true },
  ];
  const ro = alertSummary(products, today, 'ro');
  assert.equal(ro.title, '2 produse expiră în următoarele 10 zile');
  assert.equal(ro.body, 'Iaurt: a expirat ieri\nLapte: expiră în 5 zile');
  assert.equal(alertSummary([products[0]], today, 'ro').title, 'Lapte: expiră în 5 zile');
  const ru = alertSummary([{ name: 'Молоко', expiry: '2026-10-30', bread: false },
    { name: 'Кефир', expiry: '2026-10-24', bread: false }], today, 'ru');
  assert.equal(ru.title, '2 товара: срок истекает в течение 10 дней');
  assert.equal(ru.body, 'Кефир: истёк вчера\nМолоко: истекает через 5 дней');
  const many = Array.from({ length: 9 }, (_, i) => ({ name: `P${i}`, expiry: '2026-10-27', bread: false }));
  assert.match(alertSummary(many, today, 'ru').body, /\+ ещё 3$/);
  assert.match(alertSummary(many, today, 'ro').body, /\+ încă 3$/);
  assert.equal(alertSummary(many, today, 'ru').title, '9 товаров: срок истекает в течение 10 дней');
});

test('bread is recognised in Romanian and Russian too', () => {
  for (const name of ['Pâine albă', 'Paine neagra', 'Baghetă', 'Lipie', 'Chiflă cu susan',
    'Хлеб белый', 'Батон нарезной', 'Лаваш армянский', 'Булочка с маком']) {
    assert.equal(looksLikeBread(name), true, name);
  }
  for (const name of ['Lapte', 'Brânză', 'Молоко', 'Хлебцы ржаные']) {
    assert.equal(looksLikeBread(name), false, name);
  }
});

test('language detection from the phone settings', () => {
  assert.equal(detectLang(['ro-RO']), 'ro');
  assert.equal(detectLang(['ro-MD', 'en']), 'ro');
  assert.equal(detectLang(['mo']), 'ro');
  assert.equal(detectLang(['ru-RU']), 'ru');
  assert.equal(detectLang(['de-DE', 'ru']), 'ru');
  assert.equal(detectLang(['fr-FR']), 'en');
  assert.equal(detectLang([]), 'en');
});
