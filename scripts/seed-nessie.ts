// Creates the demo persona "George" in Nessie (Capital One's mock bank) and saves every ID
// it created to worker/nessie-ids.json. The worker reads ONLY those IDs.
//
// Run from the repo root:   npm run nessie:seed
// Re-running creates a brand-new George (old one is left untouched); pass --force to overwrite the IDs file.
//
// Verified Nessie behavior (Nov 7 2026, by probing the live API):
// - Base URL must be https://api.nessieisreal.com (plain http refuses connections)
// - New object IDs come back at objectCreated._id
// - Amounts are whole dollars (cents are dropped)
// - Purchases/deposits do NOT change account balances, so balances are set at account creation
// - Purchases and deposits MUST include `status` (a purchase without it breaks listing)
// - PUT /bills/{id} {payment_date} moves a bill (used by "Close the gap")

import { existsSync, writeFileSync } from 'node:fs';

const KEY = process.env.NESSIE_KEY;
const BASE = process.env.NESSIE_BASE_URL ?? 'https://api.nessieisreal.com';
const OUT = 'worker/nessie-ids.json';

if (!KEY) {
  console.error('NESSIE_KEY is missing. Put it in worker/.env');
  process.exit(1);
}
if (existsSync(OUT) && !process.argv.includes('--force')) {
  console.error(`${OUT} already exists, so George is already in Nessie. Use --force to create a new George.`);
  process.exit(1);
}

async function post(path: string, body: unknown): Promise<string> {
  const res = await fetch(`${BASE}${path}?key=${KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`POST ${path} failed (${res.status}): ${text}`);
  const id = JSON.parse(text)?.objectCreated?._id;
  if (!id) throw new Error(`POST ${path}: no objectCreated._id in ${text}`);
  return id as string;
}

async function getJson(path: string): Promise<any> {
  const res = await fetch(`${BASE}${path}?key=${KEY}`);
  const text = await res.text();
  if (!res.ok) throw new Error(`GET ${path} failed (${res.status}): ${text}`);
  return JSON.parse(text);
}

const address = (street_number: string, street_name: string, zip = '75080') => ({
  street_number, street_name, city: 'Richardson', state: 'TX', zip,
});

// Approximate locations near UTD / Richardson TX (same places as the Spacetime price table).
const MERCHANTS = {
  heb: { name: 'H-E-B', category: 'Groceries', address: address('1111', 'W Campbell Rd'), geocode: { lat: 32.996, lng: -96.762 } },
  walmart: { name: 'Walmart Supercenter', category: 'Groceries', address: address('1501', 'N Plano Rd'), geocode: { lat: 32.968, lng: -96.700 } },
  aldi: { name: 'Aldi', category: 'Groceries', address: address('2150', 'N Coit Rd'), geocode: { lat: 32.980, lng: -96.770 } },
  kroger: { name: 'Kroger', category: 'Groceries', address: address('1325', 'E Belt Line Rd'), geocode: { lat: 32.948, lng: -96.715 } },
  shell: { name: 'Shell', category: 'Gas', address: address('2201', 'N Central Expy'), geocode: { lat: 32.9925, lng: -96.752 } },
  exxon: { name: 'Exxon', category: 'Gas', address: address('1900', 'N Central Expy'), geocode: { lat: 32.986, lng: -96.7445 } },
  quiktrip: { name: 'QuikTrip', category: 'Gas', address: address('3300', 'N Coit Rd'), geocode: { lat: 33.005, lng: -96.770 } },
  murphy: { name: 'Murphy USA', category: 'Gas', address: address('2800', 'N Coit Rd'), geocode: { lat: 32.998, lng: -96.7585 } },
} as const;

async function main() {
  console.log(`Creating George in Nessie at ${BASE} ...`);

  const customerId = await post('/customers', {
    first_name: 'George',
    last_name: 'Parker',
    address: address('800', 'W Campbell Rd'),
  });
  console.log('  customer', customerId);

  // Balances as of Sat Nov 7 2026 (see CLAUDE.md section 7).
  const account = (type: string, nickname: string, balance: number) =>
    post(`/customers/${customerId}/accounts`, { type, nickname, rewards: 0, balance });
  const checking = await account('Checking', 'Everyday Checking', 1089);
  const savings = await account('Savings', 'Rainy Day Savings', 40);
  const creditCard = await account('Credit Card', 'Credit Card', 1840);
  console.log('  accounts created');

  const autoLoan = await post(`/accounts/${checking}/loans`, {
    type: 'auto', status: 'approved', credit_score: 640, monthly_payment: 389, amount: 14200,
    description: 'Auto loan',
  });

  const merchantIds: Record<string, string> = {};
  for (const [k, m] of Object.entries(MERCHANTS)) merchantIds[k] = await post('/merchants', m);
  console.log('  merchants created');

  // Upcoming bills from checking. Car insurance is the one "Close the gap" moves.
  const bill = (key: string, payee: string, nickname: string, payment_date: string, payment_amount: number) =>
    post(`/accounts/${checking}/bills`, {
      status: 'pending', payee, nickname, payment_date,
      recurring_date: Number(payment_date.slice(8, 10)), payment_amount,
    }).then(id => [key, id] as const);
  const bills = Object.fromEntries(
    await Promise.all([
      bill('phone', 'Phone', 'Phone', '2026-11-10', 85),
      bill('electricity', 'Electricity', 'Electricity', '2026-11-12', 142),
      bill('car_insurance', 'Car insurance', 'Car insurance', '2026-11-14', 118),
      bill('car_payment', 'Car payment', 'Car payment', '2026-11-17', 389),
      bill('internet', 'Internet', 'Internet', '2026-11-25', 65),
      bill('rent', 'Rent', 'Rent', '2026-12-01', 1100),
    ])
  );
  console.log('  bills created');

  // ~4 weeks of history so "where your money goes" looks real. History only: balances don't move.
  const purchase = (merchant: keyof typeof MERCHANTS, purchase_date: string, amount: number, description: string) =>
    post(`/accounts/${checking}/purchases`, {
      merchant_id: merchantIds[merchant], medium: 'balance', purchase_date, amount,
      status: 'completed', description,
    });
  const history: Array<[keyof typeof MERCHANTS, string, number, string]> = [
    ['heb', '2026-10-10', 148, 'Weekly groceries'],
    ['shell', '2026-10-11', 53, 'Gas'],
    ['walmart', '2026-10-15', 37, 'Household'],
    ['heb', '2026-10-17', 142, 'Weekly groceries'],
    ['shell', '2026-10-18', 55, 'Gas'],
    ['heb', '2026-10-24', 151, 'Weekly groceries'],
    ['exxon', '2026-10-25', 54, 'Gas'],
    ['heb', '2026-10-31', 146, 'Weekly groceries'],
    ['shell', '2026-11-01', 52, 'Gas'],
    ['kroger', '2026-11-04', 23, 'Milk and bread'],
  ];
  for (const h of history) await purchase(...h);
  for (const date of ['2026-10-23', '2026-11-06']) {
    await post(`/accounts/${checking}/deposits`, {
      medium: 'balance', transaction_date: date, status: 'completed', amount: 1720, description: 'Paycheck',
    });
  }
  console.log('  history created (10 purchases, 2 paychecks)');

  // Read back to confirm balances match the persona exactly.
  const accounts: Array<{ _id: string; nickname: string; balance: number }> =
    await getJson(`/customers/${customerId}/accounts`);
  const expected: Record<string, number> = { [checking]: 1089, [savings]: 40, [creditCard]: 1840 };
  let ok = true;
  for (const a of accounts) {
    const want = expected[a._id];
    const match = want === a.balance;
    if (!match) ok = false;
    console.log(`  ${match ? 'OK ' : 'BAD'} ${a.nickname}: $${a.balance}${match ? '' : ` (expected $${want})`}`);
  }

  const ids = {
    createdAt: new Date().toISOString(),
    customerId,
    accounts: { checking, savings, creditCard },
    loans: { autoLoan },
    bills,
    merchants: merchantIds,
  };
  writeFileSync(OUT, JSON.stringify(ids, null, 2) + '\n');
  console.log(`Saved IDs to ${OUT}`);
  if (!ok) {
    console.error('Balances did not match. Check the output above.');
    process.exit(1);
  }
  console.log('Done. George is in Nessie.');
}

main().catch(err => {
  console.error(String(err).replaceAll(KEY, '***'));
  process.exit(1);
});
