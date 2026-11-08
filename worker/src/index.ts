// Daylight agent worker: a normal Spacetime client that holds the secrets (Nessie, Gemini)
// and does the work the browser can't. Run: npm start --prefix worker   (or: npm run sync for one pass)
//
// It reacts to rows, never to direct calls from the app:
//   plan_job 'pending'      -> run the agents (stream agent_step rows, write plan_action rows)
//   plan_action 'approved'  -> execute in Nessie, then mark executed (screens turn green)
//   profile needsNessieReset -> put moved bills back in Nessie (demo reset)
//   coach_message (user)    -> answer with Gemini, grounded in engine numbers

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { DbConnection, tables } from './module_bindings/index.ts';
import { executeAction, restoreNessieBills, runPlanJob } from './agents.ts';
import { answerCoachQuestion } from './chat.ts';
import { hideKey } from './nessie.ts';
import { loadNessieIds, syncFromNessie } from './sync.ts';

const URI = process.env.SPACETIME_URI ?? 'wss://maincloud.spacetimedb.com';
const DB = process.env.SPACETIME_DB_NAME ?? 'minimum';
const SECRET = process.env.WORKER_SECRET ?? '';
const SYNC_EVERY_MS = Number(process.env.SYNC_INTERVAL_MS ?? 60_000);
const ONCE = process.argv.includes('--once');
const TOKEN_FILE = new URL('../.worker-token', import.meta.url);

if (!SECRET) {
  console.error('WORKER_SECRET is missing in worker/.env');
  process.exit(1);
}

const log = (...a: unknown[]) => console.log(new Date().toLocaleTimeString(), ...a);

function connect(): Promise<DbConnection> {
  return new Promise((resolve, reject) => {
    DbConnection.builder()
      .withUri(URI)
      .withDatabaseName(DB)
      .withToken(existsSync(TOKEN_FILE) ? readFileSync(TOKEN_FILE, 'utf8').trim() : undefined)
      .withAutomaticReconnect()
      .onConnect((conn, identity, token) => {
        writeFileSync(TOKEN_FILE, token);
        log(`connected to ${DB} as worker ${identity.toHexString().slice(0, 12)}…`);
        resolve(conn);
      })
      .onConnectError((_ctx, err) => reject(err))
      .build();
  });
}

function subscribe(conn: DbConnection): Promise<void> {
  return new Promise(resolve => {
    conn
      .subscriptionBuilder()
      .onApplied(() => resolve())
      .subscribe([
        tables.myProfile, tables.myAccounts, tables.myBills, tables.myIncome, tables.mySpend,
        tables.myJobs, tables.myActions, tables.price, tables.myCoach, tables.myTransactions,
      ]);
  });
}

async function main() {
  const ids = loadNessieIds();
  const conn = await connect();
  await conn.reducers.registerWorker({ secret: SECRET });
  log('registered as worker');
  await subscribe(conn);
  log('subscribed to live data');

  // One thing at a time keeps Nessie writes and Spacetime updates in a clean order.
  let chain: Promise<void> = Promise.resolve();
  const queue = (label: string, fn: () => Promise<unknown>) => {
    chain = chain
      .then(async () => void (await fn()))
      .catch(err => log(`${label} failed:`, hideKey(String(err))));
    return chain;
  };

  const sync = async () => {
    const profile = [...conn.db.myProfile.iter()][0];
    if (profile?.needsNessieReset) {
      const moved = await restoreNessieBills(conn, ids.accounts.checking);
      log(`demo reset: restored ${moved} bill date(s) in Nessie`);
    }
    try {
      const r = await syncFromNessie(conn, ids);
      log(`synced from Nessie: ${r.accounts} accounts, ${r.bills} bills, ${r.purchases} new purchases`);
    } catch (err) {
      // Nessie down? The app keeps running from the last synced copy in Spacetime.
      log('sync failed (app keeps using last synced data):', hideKey(String(err)));
    }
  };

  await queue('sync', sync);
  if (ONCE) {
    await chain;
    conn.disconnect();
    return;
  }

  const inFlight = new Set<string>();
  const once = (key: string, label: string, fn: () => Promise<unknown>) => {
    if (inFlight.has(key)) return;
    inFlight.add(key);
    void queue(label, fn);
  };

  const onJob = (job: { id: bigint; status: string }) => {
    if (job.status === 'pending') once(`job:${job.id}`, 'plan', () => runPlanJob(conn, job.id));
  };
  const onAction = (a: { id: bigint; status: string }) => {
    if (a.status === 'approved') once(`act:${a.id}`, 'execute', () => executeAction(conn, a.id, sync));
  };

  const onCoach = (msg: { id: bigint; role: string; status: string; text: string }) => {
    if (msg.role === 'user' && msg.status === 'pending') once(`chat:${msg.id}`, 'coach', () => answerCoachQuestion(conn, msg));
  };

  conn.db.myJobs.onInsert((_ctx, job) => onJob(job));
  conn.db.myCoach.onInsert((_ctx, msg) => onCoach(msg));
  conn.db.myJobs.onUpdate((_ctx, _old, job) => onJob(job));
  conn.db.myActions.onUpdate((_ctx, _old, a) => onAction(a));
  conn.db.myActions.onInsert((_ctx, a) => onAction(a)); // scheduled moves arrive already approved
  conn.db.myProfile.onUpdate((_ctx, old, p) => {
    if (p.needsNessieReset && !old.needsNessieReset) void queue('reset', sync);
  });

  // Catch up on anything that happened while the worker was offline.
  for (const job of conn.db.myJobs.iter()) onJob(job);
  for (const a of conn.db.myActions.iter()) onAction(a);
  for (const msg of conn.db.myCoach.iter()) onCoach(msg);

  setInterval(() => void queue('sync', sync), SYNC_EVERY_MS);
  log('worker ready: waiting for plan requests and approvals');
}

main().catch(err => {
  console.error('worker failed:', hideKey(String(err)));
  process.exit(1);
});
