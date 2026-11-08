// George's demo data in engine format. Mirrors the Spacetime seed (spacetimedb/src/index.ts)
// and CLAUDE.md section 7. Used by tests and as the client's offline fallback.
import type { Account, Bill, ForecastInput, GasPrice, GroceryPrice, Income, Spend, Vehicle } from './forecast.ts';

export const bills: Bill[] = [
  { id: 'phone', payee: 'Phone', amountCents: 8500, dueDate: '2026-11-10', movable: false },
  { id: 'electricity', payee: 'Electricity', amountCents: 14200, dueDate: '2026-11-12', movable: false },
  { id: 'car_insurance', payee: 'Car insurance', amountCents: 11800, dueDate: '2026-11-14', movable: true, latestSafeDate: '2026-11-21' },
  { id: 'car_payment', payee: 'Car payment', amountCents: 38900, dueDate: '2026-11-17', movable: false },
  { id: 'internet', payee: 'Internet', amountCents: 6500, dueDate: '2026-11-25', movable: false },
  { id: 'rent', payee: 'Rent', amountCents: 110000, dueDate: '2026-12-01', movable: false },
];

export const income: Income[] = [{ id: 'pay', source: 'Paycheck', amountCents: 172000, nextDate: '2026-11-20', intervalDays: 14 }];

export const spend: Spend[] = [
  ...['2026-11-08', '2026-11-15', '2026-11-22', '2026-11-29'].map((date, i) => ({ id: `g${i}`, category: 'groceries', place: 'H-E-B', amountCents: 14500, date })),
  ...['2026-11-09', '2026-11-16', '2026-11-23', '2026-11-30'].map((date, i) => ({ id: `f${i}`, category: 'gas', place: 'Shell', amountCents: 5400, date })),
];

export const accounts: Account[] = [
  { kind: 'checking', nickname: 'Everyday Checking', balanceCents: 108900 },
  { kind: 'savings', nickname: 'Rainy Day Savings', balanceCents: 4000 },
  { kind: 'credit_card', nickname: 'Credit Card', balanceCents: 184000, creditLimitCents: 250000, apr: 27.9 },
  { kind: 'auto_loan', nickname: 'Auto Loan', balanceCents: 1420000 },
  { kind: 'ira', nickname: 'Roth IRA', balanceCents: 65000 },
  { kind: 'cd', nickname: '6-month CD (matures Mar 2027)', balanceCents: 30000 },
];

export const gasPrices: GasPrice[] = [
  { place: 'Shell', priceCents: 359, lat: 32.9925, lng: -96.752 },
  { place: 'Exxon', priceCents: 362, lat: 32.986, lng: -96.7445 },
  { place: 'QuikTrip', priceCents: 339, lat: 33.005, lng: -96.77 },
  { place: 'Murphy USA', priceCents: 335, lat: 32.998, lng: -96.7585 },
  { place: 'Costco', priceCents: 329, lat: 33.07, lng: -96.82 },
];

// George's usual items. Columns: H-E-B name brand, H-E-B store brand, Aldi, Walmart (store brand), Kroger (store brand).
// Keep in sync with seedPrices() in spacetimedb/src/index.ts.
export const GROCERY_TABLE: Array<[string, number, number, number, number, number]> = [
  ['Cereal, 2-pack', 898, 548, 449, 512, 529],
  ['Ground beef, 3 lb', 1647, 1347, 1299, 1324, 1399],
  ['Milk, 2 gallons', 758, 558, 518, 536, 578],
  ['Shredded cheese, 2 lb', 998, 698, 598, 648, 698],
  ['Diapers, 80 ct', 2799, 2199, 1999, 2097, 2249],
  ['Pasta and sauce', 647, 597, 485, 504, 589],
];
export const GROCERY_STORES = {
  'H-E-B': { lat: 32.996, lng: -96.762 },
  Aldi: { lat: 32.98, lng: -96.77 },
  'Walmart Supercenter': { lat: 32.968, lng: -96.7 },
  Kroger: { lat: 32.948, lng: -96.715 },
} as const;

export const groceryPrices: GroceryPrice[] = GROCERY_TABLE.flatMap(([item, hebName, hebStore, aldi, walmart, kroger]) => {
  const row = (place: keyof typeof GROCERY_STORES, variant: string, priceCents: number) => ({ place, item, variant, priceCents, ...GROCERY_STORES[place] });
  return [
    row('H-E-B', 'name_brand', hebName),
    row('H-E-B', 'store_brand', hebStore),
    row('Aldi', 'store_brand', aldi),
    row('Walmart Supercenter', 'store_brand', walmart),
    row('Kroger', 'store_brand', kroger),
  ];
});

export const vehicle: Vehicle = { homeLat: 32.9857, homeLng: -96.7502, mpg: 25 };

export const forecastInput: ForecastInput = {
  asOf: '2026-11-07',
  startBalanceCents: 108900,
  bills,
  income,
  spend,
};
