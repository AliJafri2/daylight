// Plan: one clear state at a time (tester feedback: "too many words").
//   1. What's wrong + "Find a fix"   2. Ben is working (live)   3. Here's the fix + "Fix it"   4. Done
// The agents' full step list stays one tap away ("See how I figured this out") for judges.
import { useMemo, useState } from 'react';
import { useSpacetimeDB, useTable } from 'spacetimedb/react';
import { tables, type DbConnection } from './module_bindings';
import { BigMoney, Glyph, Icon, day, usd, type IconName } from './ui';
import type { useMoney } from './engine';

type Money = Extract<ReturnType<typeof useMoney>, { ready: boolean; forecast: unknown }>;
const time = (ts: { microsSinceUnixEpoch: bigint }) => Number(ts.microsSinceUnixEpoch / 1000n);

const KIND: Record<string, { icon: IconName; color: 'blue' | 'teal' | 'orange' }> = {
  move_bill: { icon: 'calendar', color: 'blue' },
  grocery_swap: { icon: 'cart', color: 'teal' },
  gas_switch: { icon: 'gas', color: 'orange' },
};
const AGENT: Record<string, string> = { forecast: 'Forecast', savings: 'Savings', coach: 'Ben', executor: 'Bank' };

export default function Plan({ m, onDone }: { m: Money; onDone: () => void }) {
  const { isActive, getConnection } = useSpacetimeDB();
  const conn = getConnection() as DbConnection | null;
  const [jobs] = useTable(tables.myJobs);
  const [steps] = useTable(tables.mySteps);
  const [actions] = useTable(tables.myActions);
  const [showSteps, setShowSteps] = useState(false);
  const [review, setReview] = useState(false);
  const [openWhy, setOpenWhy] = useState<string | null>(null);
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

  const call = (p: Promise<unknown> | undefined) => {
    setError(null);
    void p?.catch(e => setError(String(e?.message ?? e)));
  };

  const sf = m.forecast.shortfall;
  const working = !!job && (job.status === 'pending' || job.status === 'running');
  const proposed = jobActions.filter(a => a.status === 'proposed');
  const executing = jobActions.some(a => a.status === 'approved');
  const executed = jobActions.filter(a => a.status === 'executed');
  const ready = !!job && job.status === 'ready' && proposed.length > 0 && !executing;
  const done = !!job && job.status === 'done' && executed.length > 0;
  const fees = jobActions.reduce((s, a) => s + Number(a.feeAvoidedCents), 0);
  const saved = jobActions.reduce((s, a) => s + Number(a.savingsCents), 0);
  const latestStep = jobSteps[jobSteps.length - 1];
  const gapDate = job?.gapDate || sf?.date;
  const gapCents = job && job.gapCents > 0n ? -Number(job.gapCents) : sf?.balanceCents ?? 0;

  const stepsList = (label: string) => jobSteps.length > 0 && (
    <div style={{ marginTop: 20 }}>
      <button className="linkish" onClick={() => setShowSteps(v => !v)}>{showSteps ? 'Hide the details' : label}</button>
      {showSteps && (
        <div className="card" style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {jobSteps.map(s => (
            <div key={String(s.id)} style={{ fontSize: 15, color: 'var(--ink-2)', animation: 'bubbleIn 0.3s ease both' }}>
              <strong style={{ color: 'var(--ink)' }}>{AGENT[s.agent] ?? s.agent}:</strong> {s.message}
            </div>
          ))}
        </div>
      )}
    </div>
  );

  const card = (a: (typeof jobActions)[number], k: number, mode: 'propose' | 'review' | 'status') => {
    const key = String(a.id);
    const kind = KIND[a.kind] ?? { icon: 'sparkle' as IconName, color: 'blue' as const };
    const chip = a.feeAvoidedCents > 0n ? `Avoids a ${usd(Number(a.feeAvoidedCents), { whole: true })} fee` : `Saves ${usd(Number(a.savingsCents))}`;
    return (
      <div className="fix" key={key} style={{ animationDelay: `${k * 0.08}s` }}>
        <Glyph name={kind.icon} color={kind.color} size={40} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <h3>{a.title}</h3>
          <p>{a.detail}</p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <span className="chip-save">{chip}</span>
            <button className="linkish" style={{ marginTop: 8 }} onClick={() => setOpenWhy(openWhy === key ? null : key)}>
              {openWhy === key ? 'Hide' : 'Why?'}
            </button>
          </div>
          {openWhy === key && <p style={{ background: 'var(--surface-2)', padding: 12, borderRadius: 14, marginTop: 10 }}>{a.whyEn}</p>}
          {mode === 'review' && a.status === 'proposed' && (
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <button className="pill" style={{ flex: 1, justifyContent: 'center' }}
                onClick={() => call(conn?.reducers.rejectAction({ actionId: a.id }).then(() => conn?.reducers.closeJobIfSettled({ jobId: a.jobId })))}>Skip</button>
              <button className="pill dark" style={{ flex: 1, justifyContent: 'center' }} onClick={() => call(conn?.reducers.approveAction({ actionId: a.id }))}>Approve</button>
            </div>
          )}
          {mode !== 'propose' && a.status !== 'proposed' && (
            <div className="status-done" style={{ marginTop: 10, color: a.status === 'executed' ? 'var(--green)' : 'var(--ink-3)' }}>
              {a.status === 'executed' ? <><Icon name="check" size={18} stroke={3} /> Done</> : a.status === 'approved' ? <><span className="spinner" /> Doing it…</> : a.status === 'rejected' ? 'Skipped' : "Couldn't do this one"}
            </div>
          )}
        </div>
      </div>
    );
  };

  // 4. Done
  if (done) {
    return (
      <div className="screen">
        <div className="topbar"><h1>Your plan</h1></div>
        <div className="done-hero">
          <div className="celebrate"><i /><i /><i /><div className="check-big"><Icon name="check" size={40} stroke={3} /></div></div>
          <div className="plan-head">Done!</div>
          <p className="plan-sub">
            You'll have <strong style={{ color: 'var(--green)' }}>{usd(m.forecast.lowPoint.balanceCents)}</strong> on {day(gapDate ?? m.forecast.lowPoint.date)} instead of {usd(gapCents)}.
            {fees > 0 && <> No {usd(fees, { whole: true })} overdraft fee.</>} No loan.
          </p>
        </div>
        {jobActions.map((a, k) => card(a, k, 'status'))}
        <div style={{ height: 16 }} />
        <button className="btn green" onClick={onDone}>See my new forecast</button>
        {stepsList('See how I figured this out')}
      </div>
    );
  }

  // 3. Ready (or executing)
  if (ready || executing) {
    return (
      <div className="screen">
        <div className="topbar"><h1>Your plan</h1></div>
        <div className="plan-head">{executing ? 'Making the changes…' : "Here's how to fix it"}</div>
        <p className="plan-sub">
          {jobActions.length} small change{jobActions.length === 1 ? '' : 's'}. You'll have{' '}
          <strong style={{ color: 'var(--green)' }}>{usd(m.plan.after.lowPoint.balanceCents)}</strong> on {day(gapDate ?? '')} instead of {usd(gapCents)}.
        </p>
        {jobActions.map((a, k) => card(a, k, review || executing ? 'review' : 'propose'))}
        <div style={{ height: 18 }} />
        {!executing && !review && (
          <>
            <button className="btn" onClick={() => job && call(conn?.reducers.approveAll({ jobId: job.id }))}>
              <Icon name="check" stroke={3} /> Fix it ({fees > 0 ? `avoid a ${usd(fees, { whole: true })} fee, ` : ''}save {usd(saved)})
            </button>
            <p className="small muted" style={{ textAlign: 'center', margin: '10px 0 0' }}>
              Nothing changes until you tap. <button className="linkish" onClick={() => setReview(true)}>Review each one</button>
            </p>
          </>
        )}
        {stepsList('See how I figured this out')}
        {error && <p className="small" style={{ color: 'var(--red)' }}>{error}</p>}
      </div>
    );
  }

  // 2. Working
  if (working) {
    return (
      <div className="screen">
        <div className="topbar"><h1>Your plan</h1></div>
        <div style={{ textAlign: 'center', padding: '40px 0 10px' }}>
          <div className="orb" style={{ width: 84, height: 84 }} />
          <div className="plan-head" style={{ marginTop: 22 }}>Ben is finding the cheapest fix…</div>
          <p className="plan-sub" key={latestStep ? String(latestStep.id) : 'start'} style={{ animation: 'bubbleIn 0.35s ease both', minHeight: 48 }}>
            {latestStep?.message ?? 'Starting…'}
          </p>
        </div>
        {stepsList("See how I'm figuring this out")}
      </div>
    );
  }

  // 1. Start
  return (
    <div className="screen">
      <div className="topbar"><h1>Your plan</h1></div>
      {sf ? (
        <>
          <div className="eyebrow">Without changes</div>
          <BigMoney cents={sf.balanceCents} tone="red" />
          <div className="plan-head" style={{ fontSize: 24, marginTop: 10 }}>You need {usd(-sf.balanceCents, { whole: true })} more to stay in the green.</div>
          <p className="plan-sub">That's on {day(sf.date)}, {sf.daysBeforePayday} days before payday. I can find a fix in a few seconds, and nothing changes until you say so.</p>
          <button className="btn" disabled={!isActive} onClick={() => { setShowSteps(false); setReview(false); call(conn?.reducers.requestPlan({})); }}>
            <Icon name="sparkle" /> Find a fix
          </button>
          {job?.status === 'failed' && <p className="small" style={{ color: 'var(--red)' }}>Something went wrong. Tap Find a fix to try again.</p>}
        </>
      ) : (
        <div className="done-hero">
          <div className="check-big"><Icon name="check" size={40} stroke={3} /></div>
          <div className="plan-head">You're covered</div>
          <p className="plan-sub">The least you'll have before payday is {usd(m.forecast.lowPoint.balanceCents)} on {day(m.forecast.lowPoint.date)}. Nothing to fix right now.</p>
        </div>
      )}
      {error && <p className="small" style={{ color: 'var(--red)' }}>{error}</p>}
    </div>
  );
}
