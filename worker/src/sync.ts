// Sync agent: copies George's bank data from Nessie into Spacetime.
// Once synced, the app keeps running from the Spacetime copy even if Nessie goes down.

import { readFileSync } from 'node:fs';
import type { DbConnection } from './module_bindings/index.ts';
import { nessie, toCents } from './nessie.ts';

type NessieIds = {
  customerId: string;
  accounts: { checking: string; savings: string; creditCard: string };
};

const KIND: Record<string, string> = { Checking: 'checking', Savings: 'savings', 'Credit Card': 'credit_card' };

export function loadNessieIds(): NessieIds {
  // Hosted (Railway): the IDs come from an env var. Locally: worker/nessie-ids.json.
  const raw = process.env.NESSIE_IDS_JSON?.trim();
  if (raw) {
    // Tolerate the value being pasted with surrounding quotes (some dashboards add them).
    const unquoted = /^(['"]).*\1$/s.test(raw) && !raw.startsWith('{') ? raw.slice(1, -1) : raw;
    return JSON.parse(unquoted);
  }
  return JSON.parse(readFileSync(new URL('../nessie-ids.json', import.meta.url), 'utf8'));
}

export async function syncFromNessie(conn: DbConnection, ids: NessieIds) {
  const [accounts, bills, loans] = await Promise.all([
    nessie.accounts(ids.customerId),
    nessie.bills(ids.accounts.checking),
    nessie.loans(ids.accounts.checking),
  ]);

  for (const a of accounts) {
    const kind = KIND[a.type];
    if (!kind) continue;
    await conn.reducers.syncAccount({ nessieId: a._id, kind, nickname: a.nickname, balanceCents: toCents(a.balance) });
  }
  for (const l of loans) {
    if (l.type !== 'auto') continue;
    await conn.reducers.syncAccount({ nessieId: l._id, kind: 'auto_loan', nickname: 'Auto Loan', balanceCents: toCents(l.amount) });
  }
  const upcoming = bills.filter(b => b.status === 'pending' || b.status === 'recurring');
  for (const b of upcoming) {
    await conn.reducers.syncBill({
      nessieBillId: b._id,
      payee: b.payee,
      amountCents: toCents(b.payment_amount),
      dueDate: b.payment_date,
    });
  }
  const tx = await syncPurchases(conn, ids, seenPurchases);
  await conn.reducers.markNessieSynced({});
  return { accounts: accounts.length + loans.length, bills: upcoming.length, purchases: tx };
}

// Purchase history -> transaction table (the Spending agent reads it). Only new purchases are sent.
const merchantCache = new Map<string, { name: string; category: string }>();
const seenPurchases = new Set<string>();

async function syncPurchases(conn: DbConnection, ids: NessieIds, seen: Set<string>) {
  const purchases = await nessie.purchases(ids.accounts.checking);
  let added = 0;
  for (const p of purchases) {
    if (seen.has(p._id) || p.status === 'cancelled') continue;
    let m = merchantCache.get(p.merchant_id);
    if (!m) {
      try {
        const r = await nessie.merchant(p.merchant_id);
        m = { name: r.name, category: Array.isArray(r.category) ? (r.category[0] ?? 'Other') : (r.category || 'Other') };
      } catch { m = { name: 'Unknown store', category: 'Other' }; }
      merchantCache.set(p.merchant_id, m);
    }
    await conn.reducers.syncTransaction({
      nessieId: p._id, merchant: m.name, category: m.category, amountCents: toCents(p.amount),
      date: p.purchase_date.slice(0, 10), description: p.description ?? '',
    });
    seen.add(p._id);
    added++;
  }
  return added;
}
