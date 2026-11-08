import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compareReceipt, SAMPLE_RECEIPT } from './receipt.ts';

test('sample receipt: store-brand swaps at Aldi', () => {
  const r = compareReceipt(SAMPLE_RECEIPT.lines);
  const by = Object.fromEntries(r.swaps.map(s => [s.key, s.savingsCents]));
  assert.deepEqual(by, {
    cereal_box: 460, // $8.98 - 2 × $2.19
    ground_beef_lb: 400, // $12.98 - 2 × $4.49
    pasta_sauce: 220, // $3.99 - $1.79
    bread_loaf: 204, // $3.49 - $1.45
    cheese_shredded_8oz: 180, // $3.99 - $2.19
    milk_gal: 170, // $4.29 - $2.59
    eggs_dozen: 160, // $3.89 - $2.29
    pasta_lb: 74, // $1.89 - $1.15
    bananas_lb: 31, // $1.47 - 2.1 lb × $0.55 ($1.16)
  });
  assert.equal(r.savingsCents, 1899);
  assert.equal(r.totalPaidCents, 4996);
  // The birthday card isn't a grocery: no match, no swap.
  assert.ok(!r.swaps.some(s => s.key === null));
});

test('never suggests a swap that costs more', () => {
  const r = compareReceipt([{ name: 'MILK', paidCents: 199, qty: 1, key: 'milk_gal' }]);
  assert.equal(r.swaps.length, 0);
  assert.equal(r.savingsCents, 0);
});
