// Locks the "next best move" numbers for George after the 3 fixes are approved.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nextBestMove } from './nextmove.ts';
import { adjustmentsFor, planFixes, buildForecast } from './forecast.ts';
import * as demo from './demo-fixture.ts';

const ctx = { accounts: demo.accounts, gasPrices: demo.gasPrices, groceryPrices: demo.groceryPrices, vehicle: demo.vehicle };

test('blocked while this pay period still runs short', () => {
  const r = nextBestMove(demo.forecastInput, demo.accounts, { habitsMonthlyCents: 25219 });
  assert.equal(r.move, undefined);
  assert.match(r.blockedReason!, /\$43 short on Nov 17/);
  assert.equal(r.steps[0].status, 'now');
});

test('after the fixes: move $40 to savings the day after payday', () => {
  const plan = planFixes(demo.forecastInput, ctx);
  const adj = adjustmentsFor(plan.actions);
  const r = nextBestMove(demo.forecastInput, demo.accounts, { adj, habitsMonthlyCents: 25219 });
  // Lowest point Nov 20 - Dec 3 is $141.41 (Dec 1 rent); keep $100 -> $41.41 -> round down to $40.
  assert.equal(r.move?.amountCents, 4000);
  assert.equal(r.move?.date, '2026-11-21');
  assert.equal(r.move?.toKind, 'savings');
  assert.equal(r.move?.lowAfterCents, 10141);
  assert.equal(r.monthsToCushion, 2); // ($500 - $40 - $40) / $252.19 a month
  // Card interest: $1,840 × 27.9% / 12
  assert.match(r.steps[1].detail, /\$42\.78 a month/);
});

test('the move itself never pushes checking below the floor', () => {
  const plan = planFixes(demo.forecastInput, ctx);
  const adj = adjustmentsFor(plan.actions);
  const r = nextBestMove(demo.forecastInput, demo.accounts, { adj });
  const withMove = { ...demo.forecastInput, spend: [...demo.forecastInput.spend, { id: 'mv', category: 'savings', place: 'Savings', amountCents: r.move!.amountCents, date: r.move!.date }] };
  const f = buildForecast(withMove, adj);
  assert.equal(f.shortfall, undefined);
  assert.ok(f.days.filter(d => d.date < '2026-12-04').every(d => d.balanceCents >= 10000));
});
