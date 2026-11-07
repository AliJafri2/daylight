// Bill's demo data in engine format. Mirrors the Spacetime seed (spacetimedb/src/index.ts)
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
  { kind: 'credit_card', nickname: 'Credit Card', balanceCents: 184000, creditLimitCents: 250000 },
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

export const groceryPrices: GroceryPrice[] = [
  ['Cereal, 2-pack', 898, 548],
  ['Ground beef, 3 lb', 1647, 1347],
  ['Milk, 2 gallons', 758, 558],
  ['Shredded cheese, 2 lb', 998, 698],
  ['Diapers, 80 ct', 2799, 2199],
  ['Pasta and sauce', 647, 597],
].flatMap(([item, name, store]) => [
  { item: item as string, variant: 'name_brand', priceCents: name as number },
  { item: item as string, variant: 'store_brand', priceCents: store as number },
]);

export const vehicle: Vehicle = { homeLat: 32.9857, homeLng: -96.7502, mpg: 25 };

export const forecastInput: ForecastInput = {
  asOf: '2026-11-07',
  startBalanceCents: 108900,
  bills,
  income,
  spend,
};
