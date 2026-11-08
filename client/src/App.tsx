// Daylight app shell: onboarding gate, 4 tabs (glassy static bar), status toasts, settings sheet.
import { useEffect, useMemo, useState } from 'react';
import { useSpacetimeDB, useTable } from 'spacetimedb/react';
import { tables, type DbConnection } from './module_bindings';
import { useMoney } from './engine';
import Onboarding from './Onboarding';
import Home from './Home';
import Plan, { type AgentKind } from './Agents';
import Tour, { type TourTab } from './Tour';
import HeadsUpBanner from './HeadsUp';
import { enablePush } from './push';
import Coach from './Coach';
import Accounts from './Accounts';
import { Icon, type IconName } from './ui';

type Tab = 'home' | 'plan' | 'coach' | 'accounts';
const TABS: Array<{ id: Tab; label: string; icon: IconName }> = [
  { id: 'home', label: 'Home', icon: 'home' },
  { id: 'plan', label: 'Plan', icon: 'plan' },
  { id: 'coach', label: 'Ben', icon: 'chat' },
  { id: 'accounts', label: 'Accounts', icon: 'wallet' },
];

const ONB_KEY = 'daylight:onboarded';
// Every fresh launch starts at the intro (each judge sees the full story). ?skip-intro jumps straight
// to the app (handy on the laptop); ?tab=plan opens a tab. The money data is NOT reset on launch:
// that would wipe a phone approval mid-demo. Use Settings -> Reset demo for that.
const params = new URLSearchParams(window.location.search);
const readOnboarded = () => params.has('skip-intro');
const initialTab = params.get('agent') === 'forecast' ? 'plan' : (['home', 'plan', 'coach', 'accounts'] as const).find(t => t === params.get('tab')) ?? 'home';
const writeOnboarded = (_v: boolean) => { try { localStorage.removeItem(ONB_KEY); } catch { /* private mode */ } }; // no longer remembered

export default function App() {
  const { isActive, getConnection } = useSpacetimeDB();
  const conn = getConnection() as DbConnection | null;
  const [onboarded, setOnboarded] = useState(readOnboarded);
  const [tab, setTab] = useState<Tab>(initialTab);
  const [settings, setSettings] = useState(false);
  const [agent, setAgent] = useState<AgentKind | null>(params.get('agent') === 'forecast' ? 'forecast' : null);
  const [pushMsg, setPushMsg] = useState<string | null>(null);
  const [tour, setTour] = useState(false);
  const [pendingQ, setPendingQ] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());
  const m = useMoney();
  const [jobs] = useTable(tables.myJobs);
  const [actions] = useTable(tables.myActions);

  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 30_000); return () => clearInterval(t); }, []);
  useEffect(() => { window.scrollTo({ top: 0 }); }, [tab]);
  // Tapping a heads-up notification while the app is open: jump to the Forecasting agent.
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    const onMsg = (e: MessageEvent) => { if (e.data?.type === 'open' && String(e.data.url).includes('agent=forecast')) { setOnboarded(true); setAgent('forecast'); setTab('plan'); } };
    navigator.serviceWorker.addEventListener('message', onMsg);
    return () => navigator.serviceWorker.removeEventListener('message', onMsg);
  }, []);

  const latestJob = useMemo(() => [...jobs].sort((a, b) => (a.id < b.id ? 1 : -1))[0], [jobs]);
  const toast = actions.some(a => a.status === 'approved')
    ? 'Making the changes in your bank…'
    : latestJob && (latestJob.status === 'pending' || latestJob.status === 'running') && tab !== 'plan'
      ? 'Ben is working on your plan…'
      : null;

  if (!onboarded) {
    return <div className="app" style={{ minHeight: '100dvh' }}><Onboarding onDone={n => { if (n?.trim()) void conn?.reducers.setDisplayName({ name: n }).catch(console.error); writeOnboarded(true); setOnboarded(true); setTab('home'); setTour(true); }} /></div>;
  }

  if (!m.ready || !('forecast' in m)) {
    return (
      <div className="app" style={{ display: 'grid', placeItems: 'center', minHeight: '100dvh' }}>
        <div style={{ textAlign: 'center' }}>
          <div className="app-tile"><img src="/icon.svg" alt="" width={56} height={56} /></div>
          <p className="muted" style={{ marginTop: 16 }}>{isActive ? 'Loading your money…' : 'Connecting…'}</p>
        </div>
      </div>
    );
  }

  const profile = m.profile;
  const name = profile.displayName;
  const synced = profile.lastNessieSync ? Number(profile.lastNessieSync.microsSinceUnixEpoch / 1000n) : null;
  const syncedAgo = synced ? (() => { const min = Math.max(0, Math.round((now - synced) / 60000)); return min < 1 ? 'just now' : `${min} min ago`; })() : null;

  return (
    <div className="app">
      {toast && <div className="toast"><span className="spinner" />{toast}</div>}
      <HeadsUpBanner hidden={tour} onReview={() => { setAgent('forecast'); setTab('plan'); }} />

      {tab === 'home' && (
        <Home m={m} name={name} onOpenPlan={() => { setAgent('forecast'); setTab('plan'); }} onSettings={() => setSettings(true)}
          onAsk={q => { setPendingQ(q); setTab('coach'); }} />
      )}
      {tab === 'plan' && <Plan m={m} agent={agent} setAgent={setAgent} onDone={() => setTab('home')} onAsk={q => { setPendingQ(q); setTab('coach'); }} />}
      {tab === 'coach' && <Coach name={name} pending={pendingQ} onPendingSent={() => setPendingQ(null)} />}
      {tab === 'accounts' && <Accounts m={m} syncedAgo={syncedAgo} />}

      <nav className="tabbar" aria-label="Main">
        <span className="tab-indicator" aria-hidden="true"
          style={{ transform: `translateX(calc(${TABS.findIndex(t => t.id === tab)} * (100% + 8px)))` }} />
        {TABS.map(t => (
          <button key={t.id} data-tab={t.id} className={`tab ${tab === t.id ? 'active' : ''}`} onClick={() => { if (t.id === 'plan') setAgent(null); setTab(t.id); }} aria-current={tab === t.id ? 'page' : undefined}>
            <Icon name={t.icon} size={22} />
            {t.label}
            <span className="dot" />
          </button>
        ))}
      </nav>

      {tour && <Tour onClose={() => setTour(false)} goTo={(t: TourTab) => { if (t === 'plan') setAgent(null); setTab(t); }} />}

      {settings && (
        <>
          <div className="backdrop" onClick={() => setSettings(false)} />
          <div className="sheet" role="dialog" aria-label="Settings">
            <div className="grabber" />
            <h2>Settings</h2>
            <div className="stack">
              <button className="btn secondary" disabled={!isActive}
                onClick={() => { void conn?.reducers.resetDemo({}).catch(console.error); setSettings(false); setTab('home'); }}>
                <Icon name="refresh" /> Reset demo
              </button>
              <button className="btn secondary" onClick={() => { writeOnboarded(false); setOnboarded(false); setSettings(false); }}>
                Replay intro
              </button>
              <button className="btn secondary" onClick={() => { setSettings(false); setTab('home'); setTour(true); }}>
                Replay tour
              </button>
            </div>
            <h3 className="settings-h">Heads-up from Ben</h3>
            <p className="settings-p">Ben messages you when you're about to run short. On iPhone, add Daylight to your Home Screen first.</p>
            <div className="stack">
              <button className="btn secondary" disabled={!isActive} onClick={async () => {
                if (!conn) return;
                setPushMsg('Turning on…');
                try {
                  const r = await enablePush(conn);
                  setPushMsg(r === 'on' ? 'Notifications are on for this device.' : r === 'denied' ? 'Notifications are blocked. Allow them in your phone settings.' : r === 'install-first' ? 'Add Daylight to your Home Screen, open it from there, then try again.' : "This browser can't do push. The in-app banner still works.");
                } catch (e) { setPushMsg(String((e as Error)?.message ?? e)); }
              }}>
                <Icon name="bell" /> Turn on notifications
              </button>
              <button className="btn" disabled={!isActive} onClick={() => {
                setPushMsg('Sent. Lock your phone: Ben will reach out in 5 seconds.');
                void conn?.reducers.requestHeadsUp({}).catch(e => setPushMsg(String(e?.message ?? e)));
              }}>
                Send me a heads-up (demo)
              </button>
              {pushMsg && <p className="settings-p" role="status">{pushMsg}</p>}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
