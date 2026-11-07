// Tiny Nessie client. The API key stays in this process (worker/.env), never in the browser.
// Verified against the live API Nov 7 2026: https only, whole-dollar amounts.

const KEY = process.env.NESSIE_KEY ?? '';
const BASE = process.env.NESSIE_BASE_URL ?? 'https://api.nessieisreal.com';

export const hideKey = (s: string) => (KEY ? s.replaceAll(KEY, '***') : s);

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}?key=${KEY}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(15_000),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(hideKey(`Nessie ${method} ${path} -> ${res.status}: ${text}`));
  return JSON.parse(text) as T;
}

export type NessieAccount = { _id: string; type: string; nickname: string; balance: number };
export type NessieBill = { _id: string; status: string; payee: string; payment_date: string; payment_amount: number };
export type NessieLoan = { _id: string; type: string; amount: number; monthly_payment: number };

export const nessie = {
  accounts: (customerId: string) => request<NessieAccount[]>('GET', `/customers/${customerId}/accounts`),
  bills: (accountId: string) => request<NessieBill[]>('GET', `/accounts/${accountId}/bills`),
  loans: (accountId: string) => request<NessieLoan[]>('GET', `/accounts/${accountId}/loans`),
  moveBill: (billId: string, paymentDate: string) =>
    request<unknown>('PUT', `/bills/${billId}`, { payment_date: paymentDate }),
};

export const toCents = (dollars: number) => BigInt(Math.round(dollars * 100));
