// Plan tab: three agents, each in its own tile. Tap one to open it and run it whenever you like.
//   Forecasting agent: finds this pay period's fixes (the ring)          -> ForecastAgent (Plan.tsx)
//   Research agent:    reads last month's purchases, finds habits         -> AgentRun + BenNoticed
//   Investing agent:   where spare money goes (cushion -> card -> IRA)    -> AgentRun + NextMove
// Every run is a Spacetime job; the worker streams its steps live.
import { useEffect, useMemo, useState } from 'react';
import { useSpacetimeDB, useTable } from 'spacetimedb/react';
import { tables, type DbConnection } from './module_bindings';
import ForecastAgent from './Plan';
import BenNoticed from './BenNoticed';
import NextMove from './NextMove';
import { AgentBar } from './AgentBar';
import { spendingInsights, totalMonthly } from '../../shared/insights.ts';
import { nextBestMove } from '../../shared/nextmove.ts';
import { Icon, day, usd, type IconName } from './ui';
import type { useMoney } from './engine';

type Money = Extract<ReturnType<typeof useMoney>, { ready: boolean; forecast: unknown }>;
export type AgentKind = 'forecast' | 'research' | 'invest';
const time = (ts: { microsSinceUnixEpoch: bigint }) => Number(ts.microsSinceUnixEpoch / 1000n);

const AGENTS: Record<AgentKind, { name: string; icon: IconName; color: string; blurb: string }> = {
  forecast: { name: 'Forecasting agent', icon: 'forecast', color: 'blue', blurb: 'Sees trouble coming before payday and finds the fixes.' },
  research: { name: 'Research agent', icon: 'search', color: 'orange', blurb: "Reads last month's spending and finds habits worth changing." },
  invest: { name: 'Investing agent', icon: 'trend', color: 'green', blurb: 'Tells you where spare money should go once you\'re covered.' },
};

function useLatestJob(kind: AgentKind) {
  const [jobs] = useTable(tables.myJobs);
  return useMemo(() => [...jobs].filter(j => j.kind === kind).sort((a, b) => (a.id < b.id ? 1 : -1))[0], [jobs, kind]);
}

export default function Plan({ m, agent, setAgent, onDone, onAsk }: {
  m: Money; agent: AgentKind | null; setAgent: (a: AgentKind | null) => void; onDone: () => void; onAsk: (q: string) => void;
}) {
  const back = () => setAgent(null);
  if (agent === 'forecast') return <ForecastAgent m={m} onDone={onDone} onBack={back} />;
  if (agent === 'research') return <AgentRun kind="research" m={m} onBack={back} onAsk={onAsk} />;
  if (agent === 'invest') return <AgentRun kind="invest" m={m} onBack={back} onAsk={onAsk} />;
  return <Hub m={m} open={setAgent} />;
}

// ---------- The three tiles ----------

function Hub({ m, open }: { m: Money; open: (a: AgentKind) => void }) {
  const [txns] = useTable(tables.myTransactions);
  const [actions] = useTable(tables.myActions);
  const fJob = useLatestJob('forecast');
  const rJob = useLatestJob('research');
  const iJob = useLatestJob('invest');

  const habits = useMemo(
    () => totalMonthly(spendingInsights(txns.map(r => ({ merchant: r.merchant, category: r.category, amountCents: Number(r.amountCents), date: r.date })), m.input.asOf)),
    [txns, m.input.asOf]
  );
  const nm = useMemo(() => nextBestMove(m.input, m.accounts, { habitsMonthlyCents: habits }), [m.input, m.accounts, habits]);
  const sf = m.forecast.shortfall;
  const running = (j?: { status: string }) => !!j && (j.status === 'pending' || j.status === 'running');

  const status: Record<AgentKind, { text: string; tone: 'red' | 'green' | 'muted' | 'busy' }> = {
    forecast: running(fJob) ? { text: 'Working…', tone: 'busy' }
      : fJob?.status === 'ready' ? { text: `${actions.filter(a => a.jobId === fJob.id && a.status === 'proposed').length} fixes waiting for you`, tone: 'red' }
        : sf ? { text: `${usd(-sf.balanceCents, { whole: -sf.balanceCents % 100 === 0 })} short on ${day(sf.date)}`, tone: 'red' }
          : { text: 'Covered until payday', tone: 'green' },
    research: running(rJob) ? { text: 'Working…', tone: 'busy' }
      : rJob?.status === 'done' ? { text: `Found +${usd(habits, { whole: true })} a month`, tone: 'green' }
        : { text: 'Not run yet', tone: 'muted' },
    invest: running(iJob) ? { text: 'Working…', tone: 'busy' }
      : iJob?.status === 'done' && actions.some(x => x.jobId === iJob.id && x.kind === 'transfer' && x.status === 'executed')
        ? { text: `${actions.find(x => x.jobId === iJob.id && x.kind === 'transfer' && x.status === 'executed')!.title}: scheduled`, tone: 'green' }
      : iJob?.status === 'done' ? (nm.move ? { text: nm.move.title, tone: 'green' } : { text: sf ? 'Close the gap first' : 'Nothing spare yet', tone: 'muted' })
        : { text: 'Not run yet', tone: 'muted' },
  };

  return (
    <div className="screen plan">
      <div className="topbar"><h1>Your plan</h1></div>
      <Summary360 />
      <div className="section-title">Your agents</div>
      <p className="hub-lead">Tap one to run it. Nothing changes until you approve.</p>
      <div className="agent-tiles">
        {(Object.keys(AGENTS) as AgentKind[]).map((k, i) => {
          const a = AGENTS[k];
          const st = status[k];
          return (
            <button key={k} className="agent-tile rise" style={{ ['--i' as string]: i }} onClick={() => open(k)}>
              <span className={`pico ${a.color}`}><Icon name={a.icon} size={22} stroke={2.4} /></span>
              <span className="agent-text">
                <span className="agent-name">{a.name}</span>
                <span className="agent-blurb">{a.blurb}</span>
                <span className={`agent-status ${st.tone}`}>{st.tone === 'busy' && <span className="spinner" />}{st.text}</span>
              </span>
              <span className="chev"><Icon name="chevron" size={18} /></span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ---------- Research / Investing agent screen: run, stream steps, show results ----------

function AgentRun({ kind, m, onBack, onAsk }: { kind: 'research' | 'invest'; m: Money; onBack: () => void; onAsk: (q: string) => void }) {
  const { isActive, getConnection } = useSpacetimeDB();
  const conn = getConnection() as DbConnection | null;
  const [steps] = useTable(tables.mySteps);
  const [txns] = useTable(tables.myTransactions);
  const [error, setError] = useState<string | null>(null);
  const [showSteps, setShowSteps] = useState(false);
  const job = useLatestJob(kind);
  const a = AGENTS[kind];

  const jobSteps = useMemo(
    () => (job ? steps.filter(s => s.jobId === job.id).sort((x, y) => time(x.createdAt) - time(y.createdAt)) : []),
    [steps, job]
  );
  const working = !!job && (job.status === 'pending' || job.status === 'running');
  const done = !!job && job.status === 'done';
  const habits = useMemo(
    () => totalMonthly(spendingInsights(txns.map(r => ({ merchant: r.merchant, category: r.category, amountCents: Number(r.amountCents), date: r.date })), m.input.asOf)),
    [txns, m.input.asOf]
  );

  const run = () => {
    setError(null);
    setShowSteps(false);
    conn?.reducers.runAgent({ kind })?.catch((e: unknown) => setError(String((e as Error)?.message ?? e)));
  };

  const stepList = (live: boolean) => (
    <div className="checklist agent-steps">
      {(jobSteps.length ? jobSteps : [{ id: 0n, message: 'Starting…' }]).map((s, k, arr) => {
        const last = k === arr.length - 1;
        const spinning = live && last;
        return (
          <div className={`check-item ${spinning ? '' : 'done'} ${s.message.endsWith('…') ? '' : 'finding'}`} key={String(s.id)}>
            {spinning ? <span className="spinner" /> : <span className="ci-dot"><Icon name="check" size={13} stroke={3} /></span>}
            <span>{s.message}</span>
          </div>
        );
      })}
    </div>
  );

  return (
    <div className="screen plan">
      <AgentBar title={a.name} onBack={onBack} />

      {!working && !done && (
        <div className="agent-intro">
          <span className={`pico ${a.color} big`}><Icon name={a.icon} size={30} stroke={2.2} /></span>
          <p className="plan-hint">{kind === 'research'
            ? 'Ben reads your purchases from the last 30 days and looks for small habits that add up. It only looks; nothing changes.'
            : 'Once this pay period is covered, Ben works out how much is truly spare and where it does the most good: cushion, then card, then investing.'}</p>
          <button className="btn plan-go" disabled={!isActive} onClick={run}><Icon name="sparkle" /> Run {a.name.toLowerCase()}</button>
          {job?.status === 'failed' && <p className="small" style={{ color: 'var(--red)' }}>Something went wrong. Tap run to try again.</p>}
        </div>
      )}

      {working && (
        <>
          <div className="plan-working">
            <div className="work-spin" />
            <div className="plan-head" style={{ marginTop: 18 }}>{kind === 'research' ? 'Ben is reading your spending' : 'Ben is finding your next move'}</div>
          </div>
          {stepList(true)}
        </>
      )}

      {done && (
        <>
          {kind === 'research' ? (
            <>
              <div className="agent-result-head">
                <div className="plan-head">Found +{usd(habits, { whole: true })} a month</div>
                <p className="plan-sub">Small changes to last month's habits. Tap one to see the math.</p>
              </div>
              <BenNoticed asOf={m.input.asOf} onAsk={onAsk} />
            </>
          ) : (
            <>
              <div className="agent-result-head">
                <div className="plan-head">{m.forecast.shortfall ? 'Close the gap first' : 'Your next best move'}</div>
                <p className="plan-sub">{m.forecast.shortfall ? 'Here is the order Ben will follow once you\'re covered.' : 'For spare money after payday. Nothing moves until you tap.'}</p>
              </div>
              <NextMove m={m} jobId={job.id} />
            </>
          )}
          <div style={{ marginTop: 18, textAlign: 'center' }}>
            <button className="linkish" onClick={() => setShowSteps(v => !v)}>{showSteps ? 'Hide the details' : 'See how Ben figured this out'}</button>
          </div>
          {showSteps && stepList(false)}
          <button className="btn secondary" style={{ marginTop: 18 }} disabled={!isActive} onClick={run}>Run again</button>
        </>
      )}
      {error && <p className="small" style={{ color: 'var(--red)' }}>{error}</p>}
    </div>
  );
}

// ---------- 360° summary (always fresh: the worker rewrites it whenever the numbers change) ----------

function Summary360() {
  const [rows] = useTable(tables.mySummary);
  const [, tick] = useState(0);
  useEffect(() => { const t = setInterval(() => tick(x => x + 1), 30_000); return () => clearInterval(t); }, []);
  const s = rows[0];
  const lines: Array<{ key: string; label: string; tone: string; text?: string }> = [
    { key: 'now', label: 'Right now', tone: 'blue', text: s?.rightNow },
    { key: 'watch', label: 'Watch out', tone: 'orange', text: s?.watchOut },
    { key: 'next', label: 'Next move', tone: 'green', text: s?.nextMove },
  ];
  const ago = s ? Math.max(0, Math.round((Date.now() - time(s.updatedAt)) / 60_000)) : 0;
  return (
    <section className="s360" aria-label="Daylight 360 degree summary" aria-live="polite">
      <div className="s360-head">
        <span className="s360-ico"><Icon name="sun" size={18} stroke={2.4} /></span>
        <span className="s360-title">Daylight 360° summary</span>
      </div>
      {lines.map(l => (
        <div className="s360-row" key={l.key}>
          <span className={`s360-label ${l.tone}`}>{l.label}</span>
          {l.text ? <span key={l.text} className="s360-text">{l.text}</span> : <span className="s360-skel" />}
        </div>
      ))}
      <div className="s360-foot">{s ? `Written by Ben from your numbers · ${ago < 1 ? 'just now' : `${ago} min ago`}` : 'Ben is reading your accounts…'}</div>
    </section>
  );
}
