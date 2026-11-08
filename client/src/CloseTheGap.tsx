// Close the gap: request a plan, watch the agents stream their steps, approve, watch it turn green.
// Functional version; styling comes with the real design.
import { useMemo, useState } from 'react';
import { useSpacetimeDB, useTable } from 'spacetimedb/react';
import { tables, type DbConnection } from './module_bindings';

const money = (cents: bigint | number) =>
  (Number(cents) / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
const time = (ts: { microsSinceUnixEpoch: bigint }) => Number(ts.microsSinceUnixEpoch / 1000n);

const AGENT_LABEL: Record<string, string> = {
  forecast: 'Forecast', savings: 'Savings', coach: 'Coach', executor: 'Bank',
};

export default function CloseTheGap({ language }: { language: string }) {
  const { isActive, getConnection } = useSpacetimeDB();
  const conn = getConnection() as DbConnection | null;
  const [jobs] = useTable(tables.myJobs);
  const [steps] = useTable(tables.mySteps);
  const [actions] = useTable(tables.myActions);
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
  const working = job && (job.status === 'pending' || job.status === 'running');
  const canStart = isActive && (!job || job.status === 'done' || job.status === 'failed');
  const open = jobActions.filter(a => a.status === 'proposed');
  const fees = jobActions.reduce((s, a) => s + Number(a.feeAvoidedCents), 0);
  const saved = jobActions.reduce((s, a) => s + Number(a.savingsCents), 0);

  return (
    <section style={{ border: '1px solid #ddd', borderRadius: 12, padding: 12, marginBottom: 16 }}>
      <button
        disabled={!canStart}
        onClick={() => call(conn?.reducers.requestPlan({}))}
        style={{ width: '100%', padding: 14, fontSize: 18, borderRadius: 10 }}
      >
        {working ? 'Working on it…' : 'Close the gap'}
      </button>
      {error && <p style={{ color: 'crimson' }}>{error}</p>}

      {jobSteps.length > 0 && (
        <ol style={{ paddingLeft: 18, fontSize: 14 }}>
          {jobSteps.map(s => (
            <li key={String(s.id)} style={{ margin: '6px 0' }}>
              <strong>{AGENT_LABEL[s.agent] ?? s.agent}:</strong> {s.message}
            </li>
          ))}
          {working && <li style={{ color: '#888' }}>…</li>}
        </ol>
      )}

      {jobActions.length > 0 && (
        <div>
          <p style={{ fontWeight: 600 }}>
            Avoid {money(fees)} in fees + save {money(saved)}
          </p>
          {jobActions.map(a => {
            const why = language === 'es' ? a.whyEs : a.whyEn;
            const key = String(a.id);
            return (
              <div key={key} style={{ border: '1px solid #eee', borderRadius: 10, padding: 10, margin: '8px 0' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                  <strong>{a.title}</strong>
                  <span style={{ whiteSpace: 'nowrap' }}>
                    {a.feeAvoidedCents > 0n ? `${money(a.feeAvoidedCents)} fee avoided` : `${money(a.savingsCents)} saved`}
                  </span>
                </div>
                <div style={{ fontSize: 13, color: '#555' }}>{a.detail}</div>
                <button onClick={() => setOpenWhy(openWhy === key ? null : key)} style={{ marginTop: 6 }}>
                  {language === 'es' ? '¿Por qué?' : 'Why?'}
                </button>
                {openWhy === key && <p style={{ fontSize: 14 }}>{why}</p>}
                <div style={{ marginTop: 6 }}>
                  {a.status === 'proposed' ? (
                    <>
                      <button onClick={() => call(conn?.reducers.approveAction({ actionId: a.id }))}>Approve</button>{' '}
                      <button
                        onClick={() =>
                          call(
                            conn?.reducers
                              .rejectAction({ actionId: a.id })
                              .then(() => conn?.reducers.closeJobIfSettled({ jobId: a.jobId }))
                          )
                        }
                      >
                        Skip
                      </button>
                    </>
                  ) : (
                    <em>{a.status === 'executed' ? 'Done ✓' : a.status === 'approved' ? 'Doing it…' : a.status}</em>
                  )}
                </div>
              </div>
            );
          })}
          {open.length > 1 && job && (
            <button
              onClick={() => call(conn?.reducers.approveAll({ jobId: job.id }))}
              style={{ width: '100%', padding: 12, fontSize: 16, borderRadius: 10 }}
            >
              Approve all
            </button>
          )}
        </div>
      )}
    </section>
  );
}
