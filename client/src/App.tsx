// Temporary "is the data live?" screen. The real dashboard replaces this in step 3.
import { useMemo } from 'react';
import { tables } from './module_bindings';
import { useSpacetimeDB, useTable } from 'spacetimedb/react';
import type { DbConnection } from './module_bindings';
import { useMoney } from './engine';
import CloseTheGap from './CloseTheGap';

const money = (cents: bigint) =>
  (Number(cents) / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' });

export default function App() {
  const { isActive, getConnection } = useSpacetimeDB();
  const conn = getConnection() as DbConnection | null;

  const [profiles] = useTable(tables.myProfile);
  const [accounts, accountsReady] = useTable(tables.myAccounts);
  const [bills] = useTable(tables.myBills);
  const [income] = useTable(tables.myIncome);
  const [spend] = useTable(tables.mySpend);
  const [prices] = useTable(tables.price);

  const upcoming = useMemo(() => {
    const rows = [
      ...bills.map(b => ({ key: `b${b.id}`, date: b.dueDate, label: b.payee, cents: -b.amountCents })),
      ...spend.map(s => ({ key: `s${s.id}`, date: s.date, label: `${s.category} (${s.place})`, cents: -s.amountCents })),
      ...income.map(i => ({ key: `i${i.id}`, date: i.nextDate, label: i.source, cents: i.amountCents })),
    ];
    return rows.sort((a, b) => a.date.localeCompare(b.date));
  }, [bills, spend, income]);

  const profile = profiles[0];
  const m = useMoney();

  return (
    <main style={{ maxWidth: 480, margin: '0 auto', padding: 16, fontFamily: 'system-ui, sans-serif' }}>
      <h1 style={{ marginBottom: 4 }}>Minimum</h1>
      <p style={{ marginTop: 0, color: isActive ? 'green' : 'crimson' }}>
        {isActive ? 'Live' : 'Connecting…'}
        {profile && ` · ${profile.displayName} · as of ${profile.asOfDate}`}
      </p>

      {m.ready && (
        <section style={{ padding: 12, borderRadius: 12, background: m.forecast.shortfall ? '#fdecea' : '#e8f5e9', marginBottom: 16 }}>
          <strong style={{ fontSize: 22 }}>
            {m.forecast.shortfall
              ? `${money(BigInt(-m.forecast.shortfall.balanceCents))} short on ${m.forecast.shortfall.date.slice(5)}`
              : `You're okay until payday`}
          </strong>
          <div style={{ fontSize: 14, marginTop: 6 }}>
            Runway {m.health.runwayDays} days · Card {Math.round((m.health.creditUtilization ?? 0) * 100)}% used ·
            Overdraft risk {m.health.overdraftRisk} · Savings {money(BigInt(m.health.savingsCents))}
          </div>
          <div style={{ fontSize: 14, marginTop: 6, color: '#555' }}>
            Engine's plan: {m.plan.actions.map(a => a.kind).join(' + ') || 'none'} → low point{' '}
            {money(BigInt(m.plan.after.lowPoint.balanceCents))}, fees avoided {money(BigInt(m.plan.feesAvoidedCents))}
          </div>
        </section>
      )}

      <CloseTheGap language={profile?.language ?? 'en'} />

      <h2>Accounts</h2>
      {!accountsReady && <p>Loading…</p>}
      <ul style={{ listStyle: 'none', padding: 0 }}>
        {accounts.map(a => (
          <li key={String(a.id)} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0' }}>
            <span>{a.nickname}</span>
            <strong>{money(a.balanceCents)}</strong>
          </li>
        ))}
      </ul>

      <h2>Upcoming</h2>
      <ul style={{ listStyle: 'none', padding: 0 }}>
        {upcoming.map(r => (
          <li key={r.key} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}>
            <span>{r.date.slice(5)} · {r.label}</span>
            <span style={{ color: r.cents < 0n ? 'inherit' : 'green' }}>{money(r.cents)}</span>
          </li>
        ))}
      </ul>

      <p style={{ color: '#666' }}>{prices.length} live prices loaded.</p>
      <button disabled={!isActive} onClick={() => void conn?.reducers.resetDemo({}).catch(console.error)}>
        Reset demo data
      </button>
    </main>
  );
}
