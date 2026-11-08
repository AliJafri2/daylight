// Locks in the demo numbers from CLAUDE.md section 7. Run: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildForecast, gasOptions, groceryOptions, healthIndicators, planFixes, OVERDRAFT_FEE_CENTS } from './forecast.ts';
import * as demo from './demo-fixture.ts';

const ctx = { accounts: demo.accounts, gasPrices: demo.gasPrices, groceryPrices: demo.groceryPrices, vehicle: demo.vehicle };
const bal = (f: ReturnType<typeof buildForecast>, date: string) => f.days.find(d => d.date === date)!.balanceCents;

test('running balance matches the persona table', () => {
  const f = buildForecast(demo.forecastInput);
  const expected: Record<string, number> = {
    '2026-11-07': 1089, '2026-11-08': 944, '2026-11-09': 890, '2026-11-10': 805, '2026-11-12': 663,
    '2026-11-14': 545, '2026-11-15': 400, '2026-11-16': 346, '2026-11-17': -43, '2026-11-20': 1677,
    '2026-11-22': 1532, '2026-11-23': 1478, '2026-11-25': 1413, '2026-11-29': 1268, '2026-11-30': 1214,
    '2026-12-01': 114, '2026-12-04': 1834,
  };
  for (const [date, dollars] of Object.entries(expected)) assert.equal(bal(f, date), dollars * 100, date);
});

test('finds the $43 shortfall on Nov 17, 3 days before payday', () => {
  const f = buildForecast(demo.forecastInput);
  assert.deepEqual(f.shortfall, { date: '2026-11-17', balanceCents: -4300, daysAway: 10, daysBeforePayday: 3 });
  assert.equal(f.nextPayday, '2026-11-20');
  assert.deepEqual(f.lowPoint, { date: '2026-11-17', balanceCents: -4300 });
  assert.equal(f.overdraftFeesCents, OVERDRAFT_FEE_CENTS);
});

test('health indicators at start', () => {
  const h = healthIndicators(buildForecast(demo.forecastInput), demo.accounts);
  assert.equal(h.runwayDays, 10);
  assert.equal(h.creditUtilization, 0.736);
  assert.equal(h.overdraftRisk, 'high');
  assert.equal(h.savingsCents, 4000);
  assert.ok(h.savingsBufferDays < 1, `buffer ${h.savingsBufferDays} days`);
});

test('gas: Murphy USA wins on NET savings; Costco is cheaper per gallon but the drive eats it', () => {
  const opts = gasOptions('Shell', 5400, demo.gasPrices, demo.vehicle);
  const murphy = opts.find(o => o.place === 'Murphy USA')!;
  const costco = opts.find(o => o.place === 'Costco')!;
  assert.equal(opts[0].place, 'Murphy USA');
  assert.ok(costco.priceCents < murphy.priceCents, 'Costco should be cheaper per gallon');
  assert.ok(costco.netSavingsCents < murphy.netSavingsCents, 'but save less after driving');
  assert.ok(murphy.netSavingsCents >= 300 && murphy.netSavingsCents < 400, `murphy net ${murphy.netSavingsCents}`);
  assert.ok(opts.find(o => o.place === 'Exxon')!.netSavingsCents < 0, 'Exxon costs more');
});

test('groceries: Aldi is cheapest for the usual items after drive cost; H-E-B store brand is $18', () => {
  const opts = groceryOptions('H-E-B', demo.groceryPrices, demo.vehicle, 359);
  assert.equal(opts[0].place, 'Aldi');
  assert.equal(opts[0].usualBasketCents, 7747);
  assert.equal(opts[0].netSavingsCents, 2393);
  assert.equal(opts.find(o => o.place === 'H-E-B')!.netSavingsCents, 1800);
  assert.ok(opts.find(o => o.place === 'Walmart Supercenter')!.driveCostCents > 0);
});

test('Close the gap plan: move insurance, Aldi groceries, Murphy gas, ends ~+$102, avoids $36 fee', () => {
  const p = planFixes(demo.forecastInput, ctx);
  assert.deepEqual(p.actions.map(a => a.kind), ['move_bill', 'grocery_swap', 'gas_switch']);

  const move = p.actions[0];
  assert.equal(move.kind === 'move_bill' && `${move.payee} ${move.fromDate}->${move.toDate}`, 'Car insurance 2026-11-14->2026-11-21');
  assert.equal(move.feeAvoidedCents, OVERDRAFT_FEE_CENTS);
  assert.equal(p.actions[1].savingsCents, 2393);
  assert.ok(p.actions[1].kind === 'grocery_swap' && p.actions[1].option.place === 'Aldi');
  assert.ok(p.actions[2].kind === 'gas_switch' && p.actions[2].option.place === 'Murphy USA');

  assert.equal(p.after.shortfall, undefined);
  assert.equal(Math.round(bal(p.after, '2026-11-17') / 100), 102);
  assert.equal(p.feesAvoidedCents, OVERDRAFT_FEE_CENTS);
  // Moving the bill never causes a new shortfall later.
  assert.ok(p.after.days.every(d => d.balanceCents >= 0), 'no negative day after the plan');
});

test('no shortfall -> empty plan', () => {
  const rich = { ...demo.forecastInput, startBalanceCents: 500000 };
  const p = planFixes(rich, ctx);
  assert.equal(p.actions.length, 0);
  assert.equal(healthIndicators(p.before, demo.accounts).overdraftRisk, 'low');
});

test('what-if overrides do not mutate inputs', () => {
  const before = JSON.stringify(demo.forecastInput);
  buildForecast(demo.forecastInput, { billDates: { car_insurance: '2026-11-21' }, spendDeltaCents: { g1: -1800 } });
  assert.equal(JSON.stringify(demo.forecastInput), before);
});
