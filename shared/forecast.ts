// MinMax's deterministic money engine. NO AI here, by design: every number the app or the
// coach shows comes from these functions, so an LLM can explain numbers but never invent them.
// Used by the client (instant what-if) and the worker (planning). All money is integer cents.

// ---------- Types ----------

export type Bill = {
  id: string;
  payee: string;
  amountCents: number;
  dueDate: string; // YYYY-MM-DD
  movable: boolean;
  latestSafeDate?: string;
};
export type Income = { id: string; source: string; amountCents: number; nextDate: string; intervalDays: number };
export type Spend = { id: string; category: 'groceries' | 'gas' | string; place: string; amountCents: number; date: string };
export type Account = { kind: string; nickname: string; balanceCents: number; creditLimitCents?: number };
export type GasPrice = { place: string; priceCents: number; lat: number; lng: number };
export type GroceryPrice = {
  place: string;
  item: string;
  variant: 'name_brand' | 'store_brand' | string;
  priceCents: number;
  lat: number;
  lng: number;
};
export type Vehicle = { homeLat: number; homeLng: number; mpg: number };

export type ForecastInput = {
  asOf: string;
  startBalanceCents: number; // checking balance at the start of asOf
  bills: Bill[];
  income: Income[];
  spend: Spend[];
  horizonDays?: number; // default 28 (two pay periods)
};

/** What-if / plan overrides. Never mutates inputs. */
export type Adjustments = {
  billDates?: Record<string, string>; // bill id -> new due date
  spendDeltaCents?: Record<string, number>; // spend id -> change (negative = cheaper)
};

export type ForecastEvent = { date: string; label: string; amountCents: number; kind: 'bill' | 'spend' | 'income'; refId: string };
export type ForecastDay = { date: string; balanceCents: number; events: ForecastEvent[] };

export type Forecast = {
  asOf: string;
  days: ForecastDay[];
  nextPayday?: string;
  /** First day the end-of-day balance goes below zero. */
  shortfall?: { date: string; balanceCents: number; daysAway: number; daysBeforePayday?: number };
  /** Lowest end-of-day balance before the first payday after asOf (or after the shortfall). */
  lowPoint: { date: string; balanceCents: number };
  overdraftFeesCents: number;
};

export const OVERDRAFT_FEE_CENTS = 3600; // PNC overdraft item fee
export const CUSHION_CENTS = 10000; // planner aims to keep at least $100 at the low point

// ---------- Date helpers (UTC, no time zones) ----------

const DAY_MS = 86_400_000;
const toMs = (d: string) => Date.parse(`${d}T00:00:00Z`);
export const addDays = (d: string, n: number) => new Date(toMs(d) + n * DAY_MS).toISOString().slice(0, 10);
export const daysBetween = (a: string, b: string) => Math.round((toMs(b) - toMs(a)) / DAY_MS);

// ---------- Forecast ----------

export function buildForecast(input: ForecastInput, adj: Adjustments = {}): Forecast {
  const horizon = input.horizonDays ?? 28;
  const end = addDays(input.asOf, horizon);
  const events: ForecastEvent[] = [];

  for (const b of input.bills) {
    const date = adj.billDates?.[b.id] ?? b.dueDate;
    events.push({ date, label: b.payee, amountCents: -b.amountCents, kind: 'bill', refId: b.id });
  }
  for (const s of input.spend) {
    const amount = Math.max(0, s.amountCents + (adj.spendDeltaCents?.[s.id] ?? 0));
    events.push({ date: s.date, label: s.category === 'gas' ? `Gas (${s.place})` : `Groceries (${s.place})`, amountCents: -amount, kind: 'spend', refId: s.id });
  }
  const paydays: string[] = [];
  for (const inc of input.income) {
    for (let d = inc.nextDate; d <= end; d = addDays(d, inc.intervalDays)) {
      if (d > input.asOf) {
        events.push({ date: d, label: inc.source, amountCents: inc.amountCents, kind: 'income', refId: inc.id });
        paydays.push(d);
      }
      if (inc.intervalDays <= 0) break;
    }
  }
  paydays.sort();

  const byDate = new Map<string, ForecastEvent[]>();
  for (const e of events) {
    if (e.date <= input.asOf || e.date > end) continue;
    (byDate.get(e.date) ?? byDate.set(e.date, []).get(e.date)!).push(e);
  }

  const days: ForecastDay[] = [{ date: input.asOf, balanceCents: input.startBalanceCents, events: [] }];
  let balance = input.startBalanceCents;
  let fees = 0;
  let shortfall: Forecast['shortfall'];
  for (let i = 1; i <= horizon; i++) {
    const date = addDays(input.asOf, i);
    const todays = byDate.get(date) ?? [];
    const before = balance;
    for (const e of todays) balance += e.amountCents;
    // One overdraft item fee on a day that takes the account negative (PNC caps at one per day).
    if (before >= 0 && balance < 0) fees += OVERDRAFT_FEE_CENTS;
    if (balance < 0 && !shortfall) shortfall = { date, balanceCents: balance, daysAway: i };
    days.push({ date, balanceCents: balance, events: todays });
  }

  const nextPayday = paydays[0];
  if (shortfall) {
    const payAfter = paydays.find(p => p > shortfall!.date);
    if (payAfter) shortfall.daysBeforePayday = daysBetween(shortfall.date, payAfter);
  }

  // The pay period we care about ends the day before the first payday after the shortfall
  // (or after today when there's no shortfall).
  const anchor = shortfall?.date ?? input.asOf;
  const periodEnd = paydays.find(p => p > anchor) ?? end;
  let low = days[0];
  for (const d of days) if (d.date < periodEnd && d.balanceCents < low.balanceCents) low = d;

  return { asOf: input.asOf, days, nextPayday, shortfall, lowPoint: { date: low.date, balanceCents: low.balanceCents }, overdraftFeesCents: fees };
}

// ---------- Health indicators ----------

export type Health = {
  runwayDays: number; // days until the balance first goes negative (horizon if never)
  runwayIsCapped: boolean;
  creditUtilization?: number; // 0..1
  overdraftRisk: 'high' | 'medium' | 'low';
  savingsCents: number;
  savingsBufferDays: number; // how many days of average spending savings would cover
};

export function healthIndicators(f: Forecast, accounts: Account[]): Health {
  const horizon = f.days.length - 1;
  const cards = accounts.filter(a => a.kind === 'credit_card' && a.creditLimitCents);
  const limit = cards.reduce((s, a) => s + (a.creditLimitCents ?? 0), 0);
  const owed = cards.reduce((s, a) => s + a.balanceCents, 0);
  const savingsCents = accounts.filter(a => a.kind === 'savings').reduce((s, a) => s + a.balanceCents, 0);
  const outflow = f.days.flatMap(d => d.events).filter(e => e.amountCents < 0).reduce((s, e) => s - e.amountCents, 0);
  const avgDaily = horizon > 0 ? outflow / horizon : 0;
  return {
    runwayDays: f.shortfall?.daysAway ?? horizon,
    runwayIsCapped: !f.shortfall,
    creditUtilization: limit > 0 ? owed / limit : undefined,
    overdraftRisk: f.shortfall ? 'high' : f.lowPoint.balanceCents < CUSHION_CENTS ? 'medium' : 'low',
    savingsCents,
    savingsBufferDays: avgDaily > 0 ? savingsCents / avgDaily : Infinity,
  };
}

// ---------- Gas: net savings after drive cost ----------

/** Straight-line miles between two points (haversine). */
export function milesBetween(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 3958.8;
  const rad = (x: number) => (x * Math.PI) / 180;
  const dLat = rad(lat2 - lat1);
  const dLng = rad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

export type GasOption = {
  place: string;
  priceCents: number;
  gallons: number;
  extraRoundTripMiles: number;
  grossSavingsCents: number;
  driveCostCents: number;
  netSavingsCents: number;
};

/**
 * net = (usual_price - alt_price) * gallons - (extra_round_trip_miles / mpg) * alt_price
 * Stations with net <= $1 are rejected (the "drive 6 miles to save 8 cents" trap).
 */
export function gasOptions(usualPlace: string, fillCents: number, prices: GasPrice[], v: Vehicle): GasOption[] {
  const usual = prices.find(p => p.place === usualPlace);
  if (!usual) return [];
  const gallons = fillCents / usual.priceCents;
  const usualMiles = milesBetween(v.homeLat, v.homeLng, usual.lat, usual.lng);
  return prices
    .filter(p => p.place !== usualPlace)
    .map(p => {
      const extra = Math.max(0, milesBetween(v.homeLat, v.homeLng, p.lat, p.lng) - usualMiles) * 2;
      const gross = (usual.priceCents - p.priceCents) * gallons;
      const drive = (extra / v.mpg) * p.priceCents;
      return {
        place: p.place,
        priceCents: p.priceCents,
        gallons,
        extraRoundTripMiles: extra,
        grossSavingsCents: Math.round(gross),
        driveCostCents: Math.round(drive),
        netSavingsCents: Math.round(gross - drive),
      };
    })
    .sort((a, b) => b.netSavingsCents - a.netSavingsCents);
}

export const MIN_GAS_NET_CENTS = 100;

// ---------- Groceries: the usual basket across stores, net of drive cost ----------

export type GroceryOption = {
  place: string;
  usualBasketCents: number; // the usual items, name brand, at the usual store
  basketCents: number; // same items, cheapest version at this store
  extraRoundTripMiles: number;
  driveCostCents: number;
  netSavingsCents: number;
  items: { item: string; fromCents: number; toCents: number }[];
};

/**
 * For each store, price Bill's usual items at their cheapest version there (store brand counts),
 * subtract extra driving vs the usual store. Includes "same store, store brand" as an option.
 * Only items every store carries are compared, so totals are apples to apples.
 */
export function groceryOptions(usualPlace: string, prices: GroceryPrice[], v: Vehicle, fuelPriceCents: number): GroceryOption[] {
  const usualRows = prices.filter(p => p.place === usualPlace);
  if (!usualRows.length) return [];
  const stores = [...new Set(prices.map(p => p.place))];
  const cheapest = (place: string, item: string) => {
    const rows = prices.filter(p => p.place === place && p.item === item);
    return rows.length ? Math.min(...rows.map(r => r.priceCents)) : undefined;
  };
  const items = [...new Set(usualRows.map(p => p.item))].filter(item => stores.every(s => cheapest(s, item) !== undefined));
  const usualPrice = (item: string) =>
    usualRows.find(p => p.item === item && p.variant === 'name_brand')?.priceCents ?? cheapest(usualPlace, item)!;
  const usualBasket = items.reduce((s, i) => s + usualPrice(i), 0);
  const loc = (place: string) => prices.find(p => p.place === place)!;
  const usualMiles = milesBetween(v.homeLat, v.homeLng, loc(usualPlace).lat, loc(usualPlace).lng);

  return stores
    .map(place => {
      const rows = items.map(item => ({ item, fromCents: usualPrice(item), toCents: cheapest(place, item)! }));
      const basket = rows.reduce((s, r) => s + r.toCents, 0);
      const extra = place === usualPlace ? 0 : Math.max(0, milesBetween(v.homeLat, v.homeLng, loc(place).lat, loc(place).lng) - usualMiles) * 2;
      const drive = Math.round((extra / v.mpg) * fuelPriceCents);
      return {
        place,
        usualBasketCents: usualBasket,
        basketCents: basket,
        extraRoundTripMiles: extra,
        driveCostCents: drive,
        netSavingsCents: usualBasket - basket - drive,
        items: rows.filter(r => r.toCents < r.fromCents),
      };
    })
    .sort((a, b) => b.netSavingsCents - a.netSavingsCents);
}

// ---------- Planner (the savings agent's deterministic core) ----------

export type PlanAction =
  | { kind: 'move_bill'; billId: string; payee: string; fromDate: string; toDate: string; amountCents: number; savingsCents: 0; feeAvoidedCents: number }
  | { kind: 'grocery_swap'; spendId: string; date: string; fromPlace: string; option: GroceryOption; savingsCents: number; feeAvoidedCents: number }
  | { kind: 'gas_switch'; spendId: string; date: string; fromPlace: string; option: GasOption; savingsCents: number; feeAvoidedCents: number };

export type Plan = {
  before: Forecast;
  after: Forecast;
  actions: PlanAction[];
  adjustments: Adjustments;
  totalSavingsCents: number;
  feesAvoidedCents: number;
};

export function adjustmentsFor(actions: PlanAction[]): Adjustments {
  const adj: Adjustments = { billDates: {}, spendDeltaCents: {} };
  for (const a of actions) {
    if (a.kind === 'move_bill') adj.billDates![a.billId] = a.toDate;
    else adj.spendDeltaCents![a.spendId] = (adj.spendDeltaCents![a.spendId] ?? 0) - a.savingsCents;
  }
  return adj;
}

/**
 * Greedy: add fixes in priority order (fee-avoiding bill moves, then grocery swaps, then gas)
 * until the low point clears the cushion. Re-runs the forecast after every step.
 */
export function planFixes(
  input: ForecastInput,
  ctx: { accounts: Account[]; gasPrices: GasPrice[]; groceryPrices: GroceryPrice[]; vehicle: Vehicle }
): Plan {
  const before = buildForecast(input);
  const actions: PlanAction[] = [];
  const current = () => buildForecast(input, adjustmentsFor(actions));
  const done = () => current().lowPoint.balanceCents >= CUSHION_CENTS;

  const shortfall = before.shortfall;
  if (!shortfall) return { before, after: before, actions, adjustments: {}, totalSavingsCents: 0, feesAvoidedCents: 0 };
  const payday = before.days.find(d => d.date > shortfall.date && d.events.some(e => e.kind === 'income'))?.date;

  // 1. Move bills due before the shortfall to the day after payday (never past latestSafeDate).
  if (payday) {
    const candidates = input.bills
      .filter(b => b.movable && b.dueDate <= shortfall.date && b.latestSafeDate && b.latestSafeDate > payday)
      .sort((a, b) => b.amountCents - a.amountCents);
    for (const b of candidates) {
      if (done()) break;
      const toDate = addDays(payday, 1) <= b.latestSafeDate! ? addDays(payday, 1) : b.latestSafeDate!;
      actions.push({ kind: 'move_bill', billId: b.id, payee: b.payee, fromDate: b.dueDate, toDate, amountCents: b.amountCents, savingsCents: 0, feeAvoidedCents: 0 });
    }
  }

  // 2. Cheapest store for the usual grocery items on the last trip before the shortfall (net of drive).
  const fill = input.spend.filter(s => s.category === 'gas' && s.date <= shortfall.date).sort((a, b) => b.date.localeCompare(a.date))[0];
  const fuelPrice = ctx.gasPrices.find(p => p.place === fill?.place)?.priceCents ?? ctx.gasPrices[0]?.priceCents ?? 350;
  const trip = input.spend.filter(s => s.category === 'groceries' && s.date <= shortfall.date).sort((a, b) => b.date.localeCompare(a.date))[0];
  if (trip && !done()) {
    const best = groceryOptions(trip.place, ctx.groceryPrices, ctx.vehicle, fuelPrice)[0];
    if (best && best.netSavingsCents > 0) {
      actions.push({ kind: 'grocery_swap', spendId: trip.id, date: trip.date, fromPlace: trip.place, option: best, savingsCents: Math.min(best.netSavingsCents, trip.amountCents), feeAvoidedCents: 0 });
    }
  }

  // 3. Cheaper gas on the last fill-up before the shortfall, by NET savings.
  if (fill && !done()) {
    const best = gasOptions(fill.place, fill.amountCents, ctx.gasPrices, ctx.vehicle)[0];
    if (best && best.netSavingsCents > MIN_GAS_NET_CENTS) {
      actions.push({ kind: 'gas_switch', spendId: fill.id, date: fill.date, fromPlace: fill.place, option: best, savingsCents: best.netSavingsCents, feeAvoidedCents: 0 });
    }
  }

  const after = current();
  // Credit the avoided overdraft fee to the first action that makes the shortfall disappear.
  if (before.overdraftFeesCents > after.overdraftFeesCents) {
    for (let i = 1; i <= actions.length; i++) {
      if (!buildForecast(input, adjustmentsFor(actions.slice(0, i))).shortfall) {
        actions[i - 1].feeAvoidedCents = before.overdraftFeesCents - after.overdraftFeesCents;
        break;
      }
    }
  }
  return {
    before,
    after,
    actions,
    adjustments: adjustmentsFor(actions),
    totalSavingsCents: actions.reduce((s, a) => s + a.savingsCents, 0),
    feesAvoidedCents: actions.reduce((s, a) => s + a.feeAvoidedCents, 0),
  };
}
