// Turn on push notifications for this device and save the subscription in Spacetime (worker reads it).
import type { DbConnection } from './module_bindings';

const KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined;

export const pushSupported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
export const isInstalled = () => window.matchMedia?.('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true;

function keyBytes(b64: string) {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, c => c.charCodeAt(0));
}

export async function registerSW() {
  if (!('serviceWorker' in navigator)) return;
  try { await navigator.serviceWorker.register('/sw.js'); } catch (e) { console.warn('service worker failed', e); }
}

export async function enablePush(conn: DbConnection): Promise<'on' | 'denied' | 'unsupported' | 'install-first'> {
  if (!pushSupported() || !KEY) return /iPhone|iPad/.test(navigator.userAgent) && !isInstalled() ? 'install-first' : 'unsupported';
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') return 'denied';
  const reg = await navigator.serviceWorker.ready;
  const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(KEY) }));
  const j = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } };
  await conn.reducers.savePushSub({ endpoint: j.endpoint, p256Dh: j.keys.p256dh, auth: j.keys.auth });
  return 'on';
}
