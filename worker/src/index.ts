// Minimum agent worker: a normal Spacetime client that holds the secrets (Nessie, Gemini)
// and does the work the browser can't. Run: npm start --prefix worker   (or: npm run sync for one pass)

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { DbConnection } from './module_bindings/index.ts';
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

async function syncOnce(conn: DbConnection, ids: ReturnType<typeof loadNessieIds>) {
  try {
    const r = await syncFromNessie(conn, ids);
    log(`synced from Nessie: ${r.accounts} accounts, ${r.bills} bills`);
  } catch (err) {
    // Nessie down? The app keeps running from the last synced copy in Spacetime.
    log('sync failed (app keeps using last synced data):', hideKey(String(err)));
  }
}

async function main() {
  const ids = loadNessieIds();
  const conn = await connect();
  await conn.reducers.registerWorker({ secret: SECRET });
  log('registered as worker');

  await syncOnce(conn, ids);
  if (ONCE) {
    conn.disconnect();
    return;
  }
  setInterval(() => void syncOnce(conn, ids), SYNC_EVERY_MS);
}

main().catch(err => {
  console.error('worker failed:', hideKey(String(err)));
  process.exit(1);
});
