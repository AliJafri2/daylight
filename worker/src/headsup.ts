// Heads-up: Ben reaches out first. Message comes from the forecast engine; push goes to every phone
// that turned notifications on (Web Push, VAPID). The in-app banner works even without push.
import webpush from 'web-push';
import type { DbConnection } from './module_bindings/index.ts';
import { buildForecast } from '../../shared/forecast.ts';
import { readMoney } from './money.ts';
import { day, usd } from './agents.ts';

const PUB = process.env.VAPID_PUBLIC_KEY ?? '';
const PRIV = process.env.VAPID_PRIVATE_KEY ?? '';
const SUBJECT = process.env.VAPID_SUBJECT ?? 'mailto:daylight-demo@example.com';
const DELAY_MS = Number(process.env.HEADS_UP_DELAY_MS ?? 5000); // time to lock the phone for the demo
const log = (...a: unknown[]) => console.log(new Date().toLocaleTimeString(), ...a);
if (PUB && PRIV) webpush.setVapidDetails(SUBJECT, PUB, PRIV);

export async function sendHeadsUp(conn: DbConnection, id: bigint) {
  await new Promise(r => setTimeout(r, DELAY_MS));
  const m = readMoney(conn);
  const f = m ? buildForecast(m.input) : undefined;
  const sf = f?.shortfall;
  const title = sf ? 'Heads up from Ben' : 'Ben checked in';
  const body = sf
    ? `You'll be ${usd(-sf.balanceCents)} short on ${day(sf.date)}. I found a fix. Tap to review.`
    : `You're covered until payday${f?.nextPayday ? ` on ${day(f.nextPayday)}` : ''}. Nothing to do.`;

  let pushed = 0;
  if (PUB && PRIV) {
    const payload = JSON.stringify({ title, body, url: sf ? '/?skip-intro&agent=forecast' : '/?skip-intro' });
    for (const s of [...conn.db.myPushSubs.iter()]) {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256Dh, auth: s.auth } }, payload, { TTL: 300, urgency: 'high' });
        pushed++;
      } catch (err) {
        const code = (err as { statusCode?: number }).statusCode;
        if (code === 404 || code === 410) await conn.reducers.dropPushSub({ endpoint: s.endpoint }).catch(() => {});
        log('heads-up: push failed', code ?? String(err).slice(0, 120));
      }
    }
  } else {
    log('heads-up: no VAPID keys, in-app banner only');
  }
  await conn.reducers.markHeadsUpSent({ id, title, body, pushed });
  log(`heads-up ${id}: sent to ${pushed} phone(s)`);
}
