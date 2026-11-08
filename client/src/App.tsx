// MinMax app shell: onboarding gate, 4 tabs (glassy static bar), status toasts, settings sheet.
import { useEffect, useMemo, useState } from 'react';
import { useSpacetimeDB, useTable } from 'spacetimedb/react';
import { tables, type DbConnection } from './module_bindings';
import { useMoney } from './engine';
import Onboarding from './Onboarding';
import Home from './Home';
import Plan from './Plan';
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

const ONB_KEY = 'minmax:onboarded';
// ?skip-intro jumps straight to the app (handy for judges' QR codes); ?tab=plan opens a tab.
const params = new URLSearchParams(window.location.search);
const readOnboarded = () => {
  if (params.has('skip-intro')) return true;
  try { return localStorage.getItem(ONB_KEY) === '1'; } catch { return false; }
};
const initialTab = (['home', 'plan', 'coach', 'accounts'] as const).find(t => t === params.get('tab')) ?? 'home';
const writeOnboarded = (v: boolean) => { try { if (v) localStorage.setItem(ONB_KEY, '1'); else localStorage.removeItem(ONB_KEY); } catch { /* private mode */ } };

export default function App() {
  const { isActive, getConnection } = useSpacetimeDB();
  const conn = getConnection() as DbConnection | null;
  const [onboarded, setOnboarded] = useState(readOnboarded);
  const [tab, setTab] = useState<Tab>(initialTab);
  const [settings, setSettings] = useState(false);
  const [pendingQ, setPendingQ] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());
  const m = useMoney();
  const [jobs] = useTable(tables.myJobs);
  const [actions] = useTable(tables.myActions);

  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 30_000); return () => clearInterval(t); }, []);
  useEffect(() => { window.scrollTo({ top: 0 }); }, [tab]);

  const latestJob = useMemo(() => [...jobs].sort((a, b) => (a.id < b.id ? 1 : -1))[0], [jobs]);
  const toast = actions.some(a => a.status === 'approved')
    ? 'Making the changes in your bank…'
    : latestJob && (latestJob.status === 'pending' || latestJob.status === 'running') && tab !== 'plan'
      ? 'Ben is working on your plan…'
      : null;

  if (!onboarded) {
    return <div className="app" style={{ minHeight: '100dvh' }}><Onboarding onDone={n => { if (n?.trim()) void conn?.reducers.setDisplayName({ name: n }).catch(console.error); writeOnboarded(true); setOnboarded(true); setTab('home'); }} /></div>;
  }

  if (!m.ready || !('forecast' in m)) {
    return (
      <div className="app" style={{ display: 'grid', placeItems: 'center', minHeight: '100dvh' }}>
        <div style={{ textAlign: 'center' }}>
          <div className="orb" />
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

      {tab === 'home' && (
        <Home m={m} name={name} onOpenPlan={() => setTab('plan')} onSettings={() => setSettings(true)}
          onAsk={q => { setPendingQ(q); setTab('coach'); }} />
      )}
      {tab === 'plan' && <Plan m={m} onDone={() => setTab('home')} />}
      {tab === 'coach' && <Coach name={name} pending={pendingQ} onPendingSent={() => setPendingQ(null)} />}
      {tab === 'accounts' && <Accounts m={m} syncedAgo={syncedAgo} />}

      <nav className="tabbar" aria-label="Main">
        <span className="tab-indicator" aria-hidden="true"
          style={{ transform: `translateX(calc(${TABS.findIndex(t => t.id === tab)} * (100% + 8px)))` }} />
        {TABS.map(t => (
          <button key={t.id} className={`tab ${tab === t.id ? 'active' : ''}`} onClick={() => setTab(t.id)} aria-current={tab === t.id ? 'page' : undefined}>
            <Icon name={t.icon} size={22} />
            {t.label}
            <span className="dot" />
          </button>
        ))}
      </nav>

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
            </div>
          </div>
        </>
      )}
    </div>
  );
}
