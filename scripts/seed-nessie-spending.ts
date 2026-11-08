// Adds a realistic month of everyday (discretionary) spending to George's Nessie checking account,
// so the Spending agent has real patterns to reason about. Purchases don't change Nessie balances
// (verified), so George's $1,089 / -$43 story is untouched.
// Run from the repo root:  npm run nessie:spending   (once; refuses to run twice)

import { readFileSync, writeFileSync } from 'node:fs';

const KEY = process.env.NESSIE_KEY;
const BASE = process.env.NESSIE_BASE_URL ?? 'https://api.nessieisreal.com';
const IDS_FILE = 'worker/nessie-ids.json';

if (!KEY) { console.error('NESSIE_KEY is missing. Put it in worker/.env'); process.exit(1); }
const ids = JSON.parse(readFileSync(IDS_FILE, 'utf8'));
if (ids.spendingSeeded && !process.argv.includes('--force')) {
  console.error('Spending history already added. Use --force to add it again.');
  process.exit(1);
}

async function post(path: string, body: unknown): Promise<string> {
  const res = await fetch(`${BASE}${path}?key=${KEY}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`POST ${path} failed (${res.status}): ${text}`);
  return JSON.parse(text).objectCreated._id as string;
}

const addr = (n: string, street: string) => ({ street_number: n, street_name: street, city: 'Richardson', state: 'TX', zip: '75080' });
const MERCHANTS = {
  macys: { name: "Macy's", category: 'Shopping', address: addr('2201', 'Dallas Pkwy'), geocode: { lat: 33.0193, lng: -96.8256 } },
  doordash: { name: 'DoorDash', category: 'Food delivery', address: addr('1', 'Online'), geocode: { lat: 32.99, lng: -96.75 } },
  starbucks: { name: 'Starbucks', category: 'Coffee', address: addr('801', 'W Campbell Rd'), geocode: { lat: 32.9866, lng: -96.7512 } },
  amazon: { name: 'Amazon', category: 'Shopping', address: addr('1', 'Online'), geocode: { lat: 32.99, lng: -96.75 } },
  netflix: { name: 'Netflix', category: 'Streaming', address: addr('1', 'Online'), geocode: { lat: 32.99, lng: -96.75 } },
  hulu: { name: 'Hulu', category: 'Streaming', address: addr('1', 'Online'), geocode: { lat: 32.99, lng: -96.75 } },
  spotify: { name: 'Spotify', category: 'Music', address: addr('1', 'Online'), geocode: { lat: 32.99, lng: -96.75 } },
} as const;

// Oct 8 - Nov 6 (the 30 days before "today", Nov 7). Whole dollars: Nessie drops cents.
const PURCHASES: Array<[keyof typeof MERCHANTS, string, number, string]> = [
  ['macys', '2026-10-12', 48, 'Clothes'], ['macys', '2026-10-19', 36, 'Clothes'], ['macys', '2026-10-26', 52, 'Shoes'],
  ['macys', '2026-11-01', 41, 'Clothes'], ['macys', '2026-11-05', 37, 'Home goods'],
  ['doordash', '2026-10-09', 28, 'Dinner delivery'], ['doordash', '2026-10-14', 34, 'Dinner delivery'], ['doordash', '2026-10-18', 31, 'Dinner delivery'],
  ['doordash', '2026-10-23', 26, 'Lunch delivery'], ['doordash', '2026-10-30', 38, 'Dinner delivery'], ['doordash', '2026-11-04', 29, 'Dinner delivery'],
  ['starbucks', '2026-10-08', 7, 'Coffee'], ['starbucks', '2026-10-13', 6, 'Coffee'], ['starbucks', '2026-10-16', 7, 'Coffee'],
  ['starbucks', '2026-10-20', 7, 'Coffee'], ['starbucks', '2026-10-22', 6, 'Coffee'], ['starbucks', '2026-10-27', 7, 'Coffee'],
  ['starbucks', '2026-10-29', 7, 'Coffee'], ['starbucks', '2026-11-03', 7, 'Coffee'], ['starbucks', '2026-11-06', 7, 'Coffee'],
  ['amazon', '2026-10-11', 24, 'Household items'], ['amazon', '2026-10-21', 39, 'Kids toys'], ['amazon', '2026-11-02', 17, 'Phone charger'],
  ['netflix', '2026-10-20', 15, 'Monthly subscription'], ['hulu', '2026-10-22', 18, 'Monthly subscription'], ['spotify', '2026-10-14', 12, 'Monthly subscription'],
];

async function main() {
  const merchantIds: Record<string, string> = {};
  for (const [k, m] of Object.entries(MERCHANTS)) merchantIds[k] = await post('/merchants', m);
  console.log('  merchants created');
  for (const [m, date, amount, description] of PURCHASES) {
    await post(`/accounts/${ids.accounts.checking}/purchases`, {
      merchant_id: merchantIds[m], medium: 'balance', purchase_date: date, amount, status: 'completed', description,
    });
  }
  console.log(`  ${PURCHASES.length} purchases added`);
  ids.merchants = { ...ids.merchants, ...merchantIds };
  ids.spendingSeeded = true;
  writeFileSync(IDS_FILE, JSON.stringify(ids, null, 2) + '\n');
  console.log('Done. George now has a month of everyday spending in Nessie.');
}

main().catch(err => { console.error(String(err).replaceAll(KEY!, '***')); process.exit(1); });
