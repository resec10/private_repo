// Run from the expiry-tracker folder with: node --test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const ctx = vm.createContext({});
vm.runInContext(readFileSync(new URL('../shared.js', import.meta.url), 'utf8'), ctx);
const { daysUntil, needsAlert, describeDays, looksLikeBread, alertSummary, isoDate } = vm.runInContext(
  '({ daysUntil, needsAlert, describeDays, looksLikeBread, alertSummary, isoDate })', ctx);

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
