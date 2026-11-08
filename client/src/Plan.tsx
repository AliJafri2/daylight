// Plan / Close the gap. Agent steps stream live like Bevel's "thinking" list, the plan arrives as
// cards (Wabi/Fuse), and a floating pill bar approves everything (Fuse). Nothing moves without a tap.
import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useSpacetimeDB, useTable } from 'spacetimedb/react';
import { tables, type DbConnection } from './module_bindings';
import { BigMoney, Glyph, Icon, day, usd, type IconName } from './ui';
import type { useMoney } from './engine';

type Money = Extract<ReturnType<typeof useMoney>, { ready: boolean; forecast: unknown }>;
const time = (ts: { microsSinceUnixEpoch: bigint }) => Number(ts.microsSinceUnixEpoch / 1000n);

const AGENT: Record<string, { icon: IconName; label: string }> = {
  forecast: { icon: 'calendar', label: 'Forecast' },
  savings: { icon: 'tag', label: 'Savings' },
  coach: { icon: 'sparkle', label: 'Coach' },
  executor: { icon: 'bank', label: 'Bank' },
};
const KIND: Record<string, { icon: IconName; color: 'blue' | 'teal' | 'orange' }> = {
  move_bill: { icon: 'calendar', color: 'blue' },
  grocery_swap: { icon: 'cart', color: 'teal' },
  gas_switch: { icon: 'gas', color: 'orange' },
};

export default function Plan({ m, language, onDone }: { m: Money; language: string; onDone: () => void }) {
  const { isActive, getConnection } = useSpacetimeDB();
  const conn = getConnection() as DbConnection | null;
  const [jobs] = useTable(tables.myJobs);
  const [steps] = useTable(tables.mySteps);
  const [actions] = useTable(tables.myActions);
  const [openWhy, setOpenWhy] = useState<string | null>(null);
  const [stepsOpen, setStepsOpen] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const job = useMemo(() => [...jobs].sort((a, b) => (a.id < b.id ? 1 : -1))[0], [jobs]);
  const jobSteps = useMemo(
    () => (job ? steps.filter(s => s.jobId === job.id).sort((a, b) => time(a.createdAt) - time(b.createdAt)) : []),
    [steps, job]
  );
  const jobActions = useMemo(
    () => (job ? actions.filter(a => a.jobId === job.id).sort((a, b) => a.sortOrder - b.sortOrder) : []),
    [actions, job]
  );
  const working = !!job && (job.status === 'pending' || job.status === 'running');
  const done = !!job && job.status === 'done' && jobActions.length > 0;
  const open = jobActions.filter(a => a.status === 'proposed');
  const fees = jobActions.reduce((s, a) => s + Number(a.feeAvoidedCents), 0);
  const saved = jobActions.reduce((s, a) => s + Number(a.savingsCents), 0);
  const sf = m.forecast.shortfall;

  // Collapse the thinking list once the plan is ready (like Bevel's "Thought for 8 seconds").
  useEffect(() => { if (job?.status === 'ready') setStepsOpen(false); }, [job?.status]);

  const call = (p: Promise<unknown> | undefined) => {
    setError(null);
    void p?.catch(e => setError(String(e?.message ?? e)));
  };
  const start = () => call(conn?.reducers.requestPlan({}));
  const seconds = jobSteps.length > 1 ? Math.max(1, Math.round((time(jobSteps[jobSteps.length - 1].createdAt) - time(jobSteps[0].createdAt)) / 1000)) : 0;

  return (
    <div className="screen aura">
      <div className="topbar"><h1>Close the gap</h1></div>

      {/* Before: what's wrong, one button */}
      {!job || (job.status === 'done' && !done) || job.status === 'failed' ? (
        <>
          {sf ? (
            <>
              <div className="eyebrow">Without changes</div>
              <BigMoney cents={-sf.balanceCents} tone="red" suffix="short" />
              <div className="hero-sub">on {day(sf.date)}. I'll look at your bills, groceries and gas to find the cheapest fix. Nothing changes until you approve.</div>
              <div style={{ height: 20 }} />
              <button className="btn" disabled={!isActive} onClick={start}><Icon name="sparkle" /> Close the gap</button>
            </>
          ) : (
            <div className="summary">
              <strong>You're covered until payday.</strong>
              <div>Your lowest point is {usd(m.forecast.lowPoint.balanceCents)} on {day(m.forecast.lowPoint.date)}.</div>
            </div>
          )}
          {job?.status === 'failed' && <p className="small" style={{ color: 'var(--red)' }}>Something went wrong. Tap Close the gap to try again.</p>}
        </>
      ) : null}

      {/* During / after: the agents' thinking list */}
      {job && jobSteps.length > 0 && (
        <div className="card" style={{ marginBottom: 14 }}>
          <button onClick={() => setStepsOpen(o => !o)} style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%' }}>
            {working ? <span className="spinner" /> : <Icon name="sparkle" size={18} />}
            <strong style={{ flex: 1, textAlign: 'left' }}>
              {working ? 'Working on it…' : `Worked through ${jobSteps.length} steps${seconds ? ` in ${seconds}s` : ''}`}
            </strong>
            <span style={{ transform: stepsOpen ? 'rotate(90deg)' : 'none', transition: 'transform 0.2s', color: 'var(--ink-3)' }}><Icon name="chevron" size={18} /></span>
          </button>
          {stepsOpen && (
            <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 10 }}>
              {jobSteps.map(s => (
                <div key={String(s.id)} style={{ display: 'flex', gap: 10, animation: 'bubbleIn 0.35s ease both' }}>
                  <span style={{ color: 'var(--ink-3)', marginTop: 2 }}><Icon name={AGENT[s.agent]?.icon ?? 'sparkle'} size={16} /></span>
                  <span style={{ fontSize: 15, color: 'var(--ink-2)' }}>
                    <strong style={{ color: 'var(--ink)' }}>{AGENT[s.agent]?.label ?? s.agent}.</strong> {s.message}
                  </span>
                </div>
              ))}
              {working && <div className="typing"><i /><i /><i /></div>}
            </div>
          )}
        </div>
      )}

      {/* The plan */}
      {jobActions.length > 0 && (
        <>
          <div className={`summary ${done ? '' : ''}`}>
            {done ? (
              <>
                <strong>Gap closed. You'll end at {usd(m.forecast.lowPoint.balanceCents, { sign: true })}.</strong>
                <div>Avoided a {usd(fees, { whole: true })} overdraft fee and saved {usd(saved)}. No loan, no fee.</div>
              </>
            ) : (
              <>
                <strong>Avoid a {usd(fees, { whole: true })} fee + save {usd(saved)}</strong>
                <div>End the pay period at {usd(m.plan.after.lowPoint.balanceCents, { sign: true })} instead of {usd(sf?.balanceCents ?? 0)}.</div>
              </>
            )}
          </div>

          {jobActions.map((a, k) => {
            const key = String(a.id);
            const kind = KIND[a.kind] ?? { icon: 'sparkle' as IconName, color: 'blue' as const };
            return (
              <div className="plan-card" key={key} style={{ animationDelay: `${k * 0.08}s` }}>
                <div className="row">
                  <Glyph name={kind.icon} color={kind.color} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <h3>{a.title}</h3>
                    <div className="detail">{a.detail}</div>
                  </div>
                  <div className="save">
                    {a.feeAvoidedCents > 0n ? usd(Number(a.feeAvoidedCents), { whole: true }) : usd(Number(a.savingsCents))}
                    <small>{a.feeAvoidedCents > 0n ? 'fee avoided' : 'saved'}</small>
                  </div>
                </div>
                {openWhy === key && <div className="why">{language === 'es' ? a.whyEs : a.whyEn}</div>}
                <div className="actions">
                  <button className="pill" onClick={() => setOpenWhy(openWhy === key ? null : key)}>
                    <Icon name="sparkle" size={16} /> {openWhy === key ? 'Hide' : 'Why?'}
                  </button>
                  {a.status === 'proposed' ? (
                    <>
                      <button className="pill" onClick={() => call(conn?.reducers.rejectAction({ actionId: a.id }).then(() => conn?.reducers.closeJobIfSettled({ jobId: a.jobId })))}>Skip</button>
                      <button className="pill dark" onClick={() => call(conn?.reducers.approveAction({ actionId: a.id }))}>Approve</button>
                    </>
                  ) : (
                    <span className="status-done" style={{ flex: 1, justifyContent: 'center', color: a.status === 'executed' ? 'var(--green)' : 'var(--ink-3)' }}>
                      {a.status === 'executed' ? <><Icon name="check" size={18} stroke={3} /> Done</> : a.status === 'approved' ? <><span className="spinner" /> Doing it…</> : a.status === 'rejected' ? 'Skipped' : 'Failed'}
                    </span>
                  )}
                </div>
              </div>
            );
          })}

          {done && (
            <div style={{ marginTop: 16 }}>
              <button className="btn green" onClick={onDone}>See my new forecast</button>
            </div>
          )}
        </>
      )}

      {error && <p className="small" style={{ color: 'var(--red)' }}>{error}</p>}

      {/* Floating approve bar (Fuse) */}
      {open.length > 1 && job && createPortal(
        <div style={{ position: 'fixed', left: '50%', transform: 'translateX(-50%)', bottom: 'calc(88px + var(--safe-b))', width: 'min(440px, calc(100% - 24px))', zIndex: 15 }}>
          <button className="btn" style={{ boxShadow: '0 12px 30px rgba(17,17,17,0.25)' }} onClick={() => call(conn?.reducers.approveAll({ jobId: job.id }))}>
            <Icon name="check" stroke={3} /> Approve all {open.length}
          </button>
        </div>,
        document.body
      )}
    </div>
  );
}
