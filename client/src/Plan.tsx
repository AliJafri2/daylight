// Plan: the ring is the star. Toggle each fix and watch the red gap fill in (a what-if built into
// the plan); one button approves the ones you picked. Working = a live checklist; Done = the ring
// closes and laps. Every number comes from the shared engine.
import { useEffect, useMemo, useState } from 'react';
import { useSpacetimeDB, useTable } from 'spacetimedb/react';
import { tables, type DbConnection } from './module_bindings';
import { buildForecast, type Adjustments } from '../../shared/forecast.ts';
import CoverRing, { ringFrom } from './CoverRing';
import { Icon, day, usd, type IconName } from './ui';
import { AgentBar } from './AgentBar';
import type { useMoney } from './engine';

type Money = Extract<ReturnType<typeof useMoney>, { ready: boolean; forecast: unknown }>;
const time = (ts: { microsSinceUnixEpoch: bigint }) => Number(ts.microsSinceUnixEpoch / 1000n);

const KIND: Record<string, IconName> = { move_bill: 'calendar', grocery_swap: 'cart', gas_switch: 'gas' };
const AGENT: Record<string, string> = { forecast: 'Forecast', savings: 'Savings', spending: 'Spending', coach: 'Ben', executor: 'Bank' };

export default function ForecastAgent({ m, onDone, onBack, onResearch }: { m: Money; onDone: () => void; onBack: () => void; onResearch?: () => void }) {
  const { isActive, getConnection } = useSpacetimeDB();
  const conn = getConnection() as DbConnection | null;
  const [jobs] = useTable(tables.myJobs);
  const [steps] = useTable(tables.mySteps);
  const [actions] = useTable(tables.myActions);
  const [off, setOff] = useState<Set<string>>(new Set()); // fixes the user un-ticked
  const [openWhy, setOpenWhy] = useState<string | null>(null);
  const [showSteps, setShowSteps] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const job = useMemo(() => [...jobs].filter(j => j.kind === 'forecast').sort((a, b) => (a.id < b.id ? 1 : -1))[0], [jobs]);
  const jobSteps = useMemo(
    () => (job ? steps.filter(s => s.jobId === job.id).sort((a, b) => time(a.createdAt) - time(b.createdAt)) : []),
    [steps, job]
  );
  const jobActions = useMemo(
    () => (job ? actions.filter(a => a.jobId === job.id && a.kind !== 'transfer').sort((a, b) => a.sortOrder - b.sortOrder) : []),
    [actions, job]
  );
  useEffect(() => { setOff(new Set()); }, [job?.id]);

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
  const selected = jobActions.filter(a => !off.has(String(a.id)));

  // Live preview: the engine re-runs the forecast with only the ticked fixes applied.
  const selKey = selected.map(a => String(a.id)).join(',');
  const preview = useMemo(() => {
    const adj: Adjustments = { billDates: {}, spendDeltaCents: {} };
    for (const a of selected) {
      if (a.kind === 'move_bill' && a.billId !== undefined && a.newDate) adj.billDates![String(a.billId)] = a.newDate;
      if (a.spendId !== undefined && a.spendDeltaCents !== undefined) adj.spendDeltaCents![String(a.spendId)] = Number(a.spendDeltaCents);
    }
    const f = buildForecast(m.input, adj);
    return { f, ring: ringFrom(f) };
  }, [m.input, selKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const contribution = (a: (typeof jobActions)[number]) => {
    if (a.kind === 'move_bill') {
      const b = m.input.bills.find(x => x.id === String(a.billId));
      return b ? b.amountCents : 0;
    }
    return Number(a.savingsCents);
  };
  const fees = selected.reduce((s, a) => s + Number(a.feeAvoidedCents), 0);

  function stepsLink() {
    if (!jobSteps.length) return null;
    return (
      <div style={{ marginTop: 18, textAlign: 'center' }}>
        <button className="linkish" onClick={() => setShowSteps(v => !v)}>{showSteps ? 'Hide the details' : 'See how Ben figured this out'}</button>
        {showSteps && (
          <div className="card" style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 10, textAlign: 'left' }}>
            {jobSteps.map(s => (
              <div key={String(s.id)} style={{ fontSize: 14, color: 'var(--ink-2)' }}>
                <strong style={{ color: 'var(--ink)' }}>{AGENT[s.agent] ?? s.agent}:</strong> {s.message}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // ---------- 4. Done ----------
  if (done) {
    const r = ringFrom(m.forecast);
    return (
      <div className="screen plan">
        <AgentBar title="Forecasting agent" onBack={onBack} />
        <CoverRing dueCents={r.due} haveCents={r.have} payday={m.forecast.nextPayday} heroCents={m.forecast.lowPoint.balanceCents} />
        <div className="plan-done">
          <div className="plan-head">{m.forecast.shortfall ? 'Done! Closer to green.' : 'Done! Ring closed.'}</div>
          <p className="plan-sub">{executed.length} fix{executed.length === 1 ? '' : 'es'} made{fees > 0 ? `, no ${usd(fees, { whole: true })} overdraft fee` : ''}. No loan.</p>
        </div>
        <div className="fixes">
          {executed.map(a => (
            <div className="fixrow done" key={String(a.id)}>
              <div className="fix-main">
                <span className="fix-ico ok"><Icon name="check" size={18} stroke={2.5} /></span>
                <span className="fix-text"><span className="fix-t">{a.title}</span></span>
              </div>
            </div>
          ))}
        </div>
        {onResearch && <button className="btn" style={{ marginTop: 20 }} onClick={onResearch}><Icon name="search" /> Begin my spending research</button>}
        <button className="btn green" style={{ marginTop: onResearch ? 10 : 20 }} onClick={onDone}>See my new forecast</button>
                {stepsLink()}
      </div>
    );
  }

  // ---------- 3. Ready: toggle fixes, watch the ring ----------
  if (ready || executing) {
    return (
      <div className="screen plan">
        <AgentBar title="Forecasting agent" onBack={onBack} />
        <CoverRing dueCents={preview.ring.due} haveCents={preview.ring.have} payday={m.forecast.nextPayday}
          heroCents={preview.f.shortfall ? preview.f.shortfall.balanceCents : preview.f.lowPoint.balanceCents} />
        <p className="plan-hint">{executing ? 'Making the changes…' : 'Tap a fix to see what it does to your ring.'}</p>

        <div className="fixes">
          {jobActions.map((a, k) => {
            const key = String(a.id);
            const on = !off.has(key);
            const st = a.status;
            const add = contribution(a);
            return (
              <div key={key} className={`fixrow ${on ? 'on' : ''}`} style={{ animationDelay: `${k * 0.07}s` }}>
                <button className="fix-main" disabled={executing} aria-pressed={on}
                  onClick={() => setOff(s => { const n = new Set(s); if (n.has(key)) n.delete(key); else n.add(key); return n; })}>
                  <span className="fix-ico"><Icon name={KIND[a.kind] ?? 'sparkle'} size={18} /></span>
                  <span className="fix-text">
                    <span className="fix-t">{a.title}</span>
                    <span className="fix-s">
                      <strong>+{usd(add, { whole: add % 100 === 0 })}</strong>
                      {a.feeAvoidedCents > 0n ? ` · avoids a ${usd(Number(a.feeAvoidedCents), { whole: true })} fee` : ' saved'}
                    </span>
                  </span>
                  {st === 'approved' ? <span className="spinner" />
                    : <span className={`fix-tick ${on || st === 'executed' ? 'on' : ''}`}>{(on || st === 'executed') && <Icon name="check" size={14} stroke={3} />}</span>}
                </button>
                <button className="fix-why" onClick={() => setOpenWhy(openWhy === key ? null : key)}>{openWhy === key ? 'Hide' : 'Why?'}</button>
                {openWhy === key && <p className="fix-whytext">{a.whyEn}</p>}
              </div>
            );
          })}
        </div>

        {!executing && (
          <>
            <button className="btn plan-go" disabled={selected.length === 0} onClick={() => {
              if (!job) return;
              const yes = selected.map(a => conn?.reducers.approveAction({ actionId: a.id }));
              const no = jobActions.filter(a => off.has(String(a.id))).map(a => conn?.reducers.rejectAction({ actionId: a.id }));
              call(Promise.all([...yes, ...no]).then(() => conn?.reducers.closeJobIfSettled({ jobId: job.id })));
            }}>
              {selected.length === 0 ? 'Pick at least one fix' : `Approve ${selected.length} fix${selected.length === 1 ? '' : 'es'}`}
            </button>
            <p className="plan-fine">Nothing changes until you tap.</p>
          </>
        )}
        {stepsLink()}
        {error && <p className="small" style={{ color: 'var(--red)' }}>{error}</p>}
      </div>
    );
  }

  // ---------- 2. Working: live checklist ----------
  if (working) {
    const doing = jobSteps.filter(s => s.message.trim().endsWith('…'));
    const items = doing.length ? doing : [{ id: 0n, message: 'Starting…' }];
    return (
      <div className="screen plan">
        <AgentBar title="Forecasting agent" onBack={onBack} />
        <div className="plan-working">
          <div className="work-spin" />
          <div className="plan-head" style={{ marginTop: 18 }}>Ben is finding the cheapest fix</div>
        </div>
        <div className="checklist">
          {items.map((s, k) => {
            const finished = k < items.length - 1;
            return (
              <div className={`check-item ${finished ? 'done' : ''}`} key={String(s.id)}>
                {finished ? <span className="ci-dot"><Icon name="check" size={13} stroke={3} /></span> : <span className="spinner" />}
                <span>{s.message.replace(/…$/, '')}</span>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // ---------- 1. Start ----------
  const r0 = ringFrom(m.forecast);
  return (
    <div className="screen plan">
      <AgentBar title="Forecasting agent" onBack={onBack} />
      <CoverRing dueCents={r0.due} haveCents={r0.have} payday={m.forecast.nextPayday} heroCents={sf ? sf.balanceCents : m.forecast.lowPoint.balanceCents} />
      {sf ? (
        <>
          <p className="plan-hint">Ben can close your ring in a few seconds. Nothing changes until you say so.</p>
          <button className="btn plan-go" disabled={!isActive} onClick={() => { setShowSteps(false); call(conn?.reducers.requestPlan({})); }}>
            <Icon name="sparkle" /> Find a fix
          </button>
          {job?.status === 'failed' && <p className="small" style={{ color: 'var(--red)' }}>Something went wrong. Tap Find a fix to try again.</p>}
        </>
      ) : (
        <p className="plan-hint">Your ring is closed. Nothing to fix before payday ({m.forecast.nextPayday ? day(m.forecast.nextPayday) : 'soon'}).</p>
      )}
      {error && <p className="small" style={{ color: 'var(--red)' }}>{error}</p>}
    </div>
  );
}
