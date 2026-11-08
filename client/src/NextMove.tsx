// "After payday": Ben's next best move for spare money (cushion -> card -> Roth IRA).
// Numbers come from shared/nextmove.ts. Scheduling goes through Spacetime; the worker re-checks it
// with the engine and records it in the bank (Nessie). Nothing moves until the user taps.
import { useMemo, useState } from 'react';
import { useSpacetimeDB, useTable } from 'spacetimedb/react';
import { tables, type DbConnection } from './module_bindings';
import { nextBestMove } from '../../shared/nextmove.ts';
import { spendingInsights, totalMonthly } from '../../shared/insights.ts';
import { Icon, day, usd, type IconName } from './ui';
import type { useMoney } from './engine';

type Money = Extract<ReturnType<typeof useMoney>, { ready: boolean; forecast: unknown }>;
const STEP_ICON: Record<string, IconName> = { cushion: 'piggy', card: 'card', ira: 'arrowUp' };
const STATUS: Record<string, string> = { now: 'Now', next: 'Next', later: 'Later', done: 'Done' };

export default function NextMove({ m, jobId }: { m: Money; jobId?: bigint }) {
  const { isActive, getConnection } = useSpacetimeDB();
  const conn = getConnection() as DbConnection | null;
  const [actions] = useTable(tables.myActions);
  const [txns] = useTable(tables.myTransactions);
  const [why, setWhy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const habits = useMemo(
    () => totalMonthly(spendingInsights(txns.map(r => ({ merchant: r.merchant, category: r.category, amountCents: Number(r.amountCents), date: r.date })), m.input.asOf)),
    [txns, m.input.asOf]
  );
  const nm = useMemo(() => nextBestMove(m.input, m.accounts, { habitsMonthlyCents: habits }), [m.input, m.accounts, habits]);
  const scheduled = jobId === undefined ? undefined
    : [...actions].filter(a => a.jobId === jobId && a.kind === 'transfer').sort((a, b) => (a.id < b.id ? 1 : -1))[0];

  const schedule = () => {
    if (!nm.move) return;
    setError(null);
    conn?.reducers.scheduleMove({ amountCents: BigInt(nm.move.amountCents), date: nm.move.date, toKind: nm.move.toKind })
      ?.catch((e: unknown) => setError(String((e as Error)?.message ?? e)));
  };

  let hero: React.ReactNode;
  if (scheduled && scheduled.status !== 'failed') {
    const doneNow = scheduled.status === 'executed';
    hero = (
      <div className="nm-hero">
        <div className="nm-title">{scheduled.title}</div>
        <div className="nm-detail">{scheduled.newDate ? `On ${day(scheduled.newDate)}, the day after payday.` : ''}</div>
        <div className={`nm-status ${doneNow ? 'ok' : ''}`}>
          {doneNow ? <><Icon name="check" size={16} stroke={3} /> Scheduled in your bank</> : <><span className="spinner" /> Scheduling with your bank…</>}
        </div>
      </div>
    );
  } else if (nm.move) {
    hero = (
      <div className="nm-hero">
        <div className="nm-title">{nm.move.title}</div>
        <div className="nm-detail">{nm.move.detail}</div>
        <div className="nm-actions">
          <button className="btn nm-go" disabled={!isActive || jobId === undefined} onClick={schedule}>Schedule it</button>
          <button className="fix-why" onClick={() => setWhy(v => !v)}>{why ? 'Hide' : 'Why?'}</button>
        </div>
        {why && <p className="nm-why">{nm.move.why}</p>}
        {scheduled?.status === 'failed' && <p className="small" style={{ color: 'var(--red)' }}>Ben stopped that move to keep you safe. Check the plan details.</p>}
        {error && <p className="small" style={{ color: 'var(--red)' }}>{error}</p>}
      </div>
    );
  } else {
    hero = <div className="nm-hero"><div className="nm-detail" style={{ marginTop: 0 }}>{nm.blockedReason}</div></div>;
  }

  return (
    <div className="nextmove">
      <div className="section-title">After payday</div>
      <p className="noticed-lead">Ben's next best move for spare money.</p>
      {hero}
      <div className="nm-steps">
        {nm.steps.map((s, i) => (
          <div key={s.key} className={`nm-step s-${s.status}`}>
            <span className="nm-num"><Icon name={STEP_ICON[s.key]} size={16} /></span>
            <span className="nm-text">
              <span className="nm-st">{i + 1}. {s.title} <span className="nm-chip">{STATUS[s.status]}</span></span>
              <span className="nm-sd">{s.detail}</span>
              {s.progress && (
                <span className="nm-bar" aria-label={`${usd(s.progress.haveCents)} of ${usd(s.progress.goalCents)}`}>
                  <span style={{ width: `${Math.min(100, (s.progress.haveCents / s.progress.goalCents) * 100)}%` }} />
                </span>
              )}
            </span>
          </div>
        ))}
      </div>
      {nm.monthsToCushion !== undefined && (
        <p className="nm-foot">With Ben's spending tips (+{usd(habits, { whole: true })}/mo), you'd reach {usd(50000, { whole: true })} in about {nm.monthsToCushion} month{nm.monthsToCushion === 1 ? '' : 's'}.</p>
      )}
      <p className="nm-fine">General guidance, not investment advice.</p>
    </div>
  );
}
