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
  // Path is relative to worker/ (npm scripts run there).
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
  await conn.reducers.markNessieSynced({});
  return { accounts: accounts.length + loans.length, bills: upcoming.length };
}
