// Reads the worker's live Spacetime cache and builds the shared engine's inputs.
// The worker joins the demo profile like any device, so it sees the same my_* views as the app.
import type { DbConnection } from './module_bindings/index.ts';
import type { Account, ForecastInput, GasPrice, GroceryPrice, Vehicle } from '../../shared/forecast.ts';

const n = (v: bigint) => Number(v);

export function readMoney(conn: DbConnection) {
  const profile = [...conn.db.myProfile.iter()][0];
  const accountRows = [...conn.db.myAccounts.iter()];
  const checking = accountRows.find(a => a.kind === 'checking');
  if (!profile || !checking) return undefined;

  const billRows = [...conn.db.myBills.iter()];
  const spendRows = [...conn.db.mySpend.iter()];
  const priceRows = [...conn.db.price.iter()];

  const accounts: Account[] = accountRows.map(a => ({
    kind: a.kind, nickname: a.nickname, balanceCents: n(a.balanceCents),
    creditLimitCents: a.creditLimitCents === undefined ? undefined : n(a.creditLimitCents),
  }));
  const input: ForecastInput = {
    asOf: profile.asOfDate,
    startBalanceCents: n(checking.balanceCents),
    bills: billRows.map(b => ({
      id: String(b.id), payee: b.payee, amountCents: n(b.amountCents), dueDate: b.dueDate,
      movable: b.movable, latestSafeDate: b.latestSafeDate,
    })),
    income: [...conn.db.myIncome.iter()].map(i => ({
      id: String(i.id), source: i.source, amountCents: n(i.amountCents), nextDate: i.nextDate, intervalDays: i.intervalDays,
    })),
    spend: spendRows.map(s => ({ id: String(s.id), category: s.category, place: s.place, amountCents: n(s.amountCents), date: s.date })),
  };
  const gasPrices: GasPrice[] = priceRows
    .filter(p => p.kind === 'gas')
    .map(p => ({ place: p.place, priceCents: n(p.priceCents), lat: p.lat, lng: p.lng }));
  const groceryPrices: GroceryPrice[] = priceRows
    .filter(p => p.kind === 'grocery')
    .map(p => ({ place: p.place, item: p.item, variant: p.variant, priceCents: n(p.priceCents), lat: p.lat, lng: p.lng }));
  const vehicle: Vehicle = { homeLat: profile.homeLat, homeLng: profile.homeLng, mpg: profile.vehicleMpg };

  return { profile, accounts, input, gasPrices, groceryPrices, vehicle, billRows, spendRows };
}
