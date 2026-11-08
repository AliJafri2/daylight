// Locks the "Ben noticed" numbers for George's seeded month of spending (scripts/seed-nessie-spending.ts).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spendingInsights, totalMonthly, type Txn } from './insights.ts';

const d = (merchant: string, category: string, pairs: Array<[string, number]>): Txn[] =>
  pairs.map(([date, dollars]) => ({ merchant, category, date, amountCents: dollars * 100 }));

const george: Txn[] = [
  ...d("Macy's", 'Shopping', [['2026-10-12', 48], ['2026-10-19', 36], ['2026-10-26', 52], ['2026-11-01', 41], ['2026-11-05', 37]]),
  ...d('DoorDash', 'Food delivery', [['2026-10-09', 28], ['2026-10-14', 34], ['2026-10-18', 31], ['2026-10-23', 26], ['2026-10-30', 38], ['2026-11-04', 29]]),
  ...d('Starbucks', 'Coffee', [['2026-10-08', 7], ['2026-10-13', 6], ['2026-10-16', 7], ['2026-10-20', 7], ['2026-10-22', 6], ['2026-10-27', 7], ['2026-10-29', 7], ['2026-11-03', 7], ['2026-11-06', 7]]),
  ...d('Amazon', 'Shopping', [['2026-10-11', 24], ['2026-10-21', 39], ['2026-11-02', 17]]),
  ...d('Netflix', 'Streaming', [['2026-10-20', 15]]),
  ...d('Hulu', 'Streaming', [['2026-10-22', 18]]),
  ...d('Spotify', 'Music', [['2026-10-14', 12]]),
];

test("George's spending insights", () => {
  const xs = spendingInsights(george, '2026-11-07');
  const byKey = Object.fromEntries(xs.map(x => [x.key, x.monthlySavingsCents]));
  assert.deepEqual(byKey, {
    "shop:Macy's": 12840, // $214 / 5 trips × 3 fewer
    'delivery:DoorDash': 7440, // $186 / 6 × 4 fewer × 60%
    'coffee:Starbucks': 3139, // ($61/9 - $0.50) × 5 fewer
    'streaming:Hulu': 1800,
  });
  assert.equal(totalMonthly(xs), 25219);
  assert.equal(xs[0].key, "shop:Macy's"); // biggest first
});

test('ignores purchases outside the 30-day window and Amazon (only 3 trips)', () => {
  const xs = spendingInsights([...george, ...d("Macy's", 'Shopping', [['2026-09-01', 500]])], '2026-11-07');
  assert.equal(xs.find(x => x.merchant === "Macy's")!.spentCents, 21400);
  assert.ok(!xs.some(x => x.merchant === 'Amazon'));
});
