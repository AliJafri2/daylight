// Turns live Spacetime rows into the shared engine's inputs, and runs it.
// Everything recomputes instantly whenever a row changes (sync, approval, what-if).
import { useMemo } from 'react';
import { useTable } from 'spacetimedb/react';
import { tables } from './module_bindings';
import {
  buildForecast, healthIndicators, planFixes,
  type Account, type Adjustments, type ForecastInput, type GasPrice, type GroceryPrice, type Vehicle,
} from '../../shared/forecast.ts';

const n = (v: bigint) => Number(v);

export function useMoney(adjustments?: Adjustments) {
  const [profiles] = useTable(tables.myProfile);
  const [accountRows, accountsReady] = useTable(tables.myAccounts);
  const [billRows, billsReady] = useTable(tables.myBills);
  const [incomeRows] = useTable(tables.myIncome);
  const [spendRows] = useTable(tables.mySpend);
  const [priceRows] = useTable(tables.price);

  return useMemo(() => {
    const profile = profiles[0];
    const checking = accountRows.find(a => a.kind === 'checking');
    if (!profile || !checking) return { ready: false as const };

    const accounts: Account[] = accountRows.map(a => ({
      kind: a.kind, nickname: a.nickname, balanceCents: n(a.balanceCents),
      creditLimitCents: a.creditLimitCents === undefined ? undefined : n(a.creditLimitCents), apr: a.apr,
    }));
    const input: ForecastInput = {
      asOf: profile.asOfDate,
      startBalanceCents: n(checking.balanceCents),
      bills: billRows.map(b => ({
        id: String(b.id), payee: b.payee, amountCents: n(b.amountCents), dueDate: b.dueDate,
        movable: b.movable, latestSafeDate: b.latestSafeDate,
      })),
      income: incomeRows.map(i => ({
        id: String(i.id), source: i.source, amountCents: n(i.amountCents), nextDate: i.nextDate, intervalDays: i.intervalDays,
      })),
      spend: spendRows.map(s => ({
        id: String(s.id), category: s.category, place: s.place, amountCents: n(s.amountCents), date: s.date,
      })),
    };
    const gasPrices: GasPrice[] = priceRows
      .filter(p => p.kind === 'gas')
      .map(p => ({ place: p.place, priceCents: n(p.priceCents), lat: p.lat, lng: p.lng }));
    const groceryPrices: GroceryPrice[] = priceRows
      .filter(p => p.kind === 'grocery')
      .map(p => ({ place: p.place, item: p.item, variant: p.variant, priceCents: n(p.priceCents), lat: p.lat, lng: p.lng }));
    const vehicle: Vehicle = { homeLat: profile.homeLat, homeLng: profile.homeLng, mpg: profile.vehicleMpg };

    const forecast = buildForecast(input, adjustments);
    return {
      ready: accountsReady && billsReady,
      profile,
      accounts,
      input,
      forecast,
      health: healthIndicators(forecast, accounts),
      plan: planFixes(input, { accounts, gasPrices, groceryPrices, vehicle }),
      gasPrices,
      groceryPrices,
      vehicle,
    };
  }, [profiles, accountRows, billRows, incomeRows, spendRows, priceRows, accountsReady, billsReady, adjustments]);
}
