// Coach: Bevel-style greeting (soft aura, orb, "Here for you"), suggestion cards, chat bubbles,
// frosted input. Answers come from the worker (Gemini) using only engine-computed numbers.
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useSpacetimeDB, useTable } from 'spacetimedb/react';
import { tables, type DbConnection } from './module_bindings';
import { Icon } from './ui';

const time = (ts: { microsSinceUnixEpoch: bigint }) => Number(ts.microsSinceUnixEpoch / 1000n);


export default function Coach({ name, pending, onPendingSent }: {
  name: string; pending: string | null; onPendingSent: () => void;
}) {
  const { isActive, getConnection } = useSpacetimeDB();
  const conn = getConnection() as DbConnection | null;
  const [messages] = useTable(tables.myCoach);
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  const sorted = useMemo(() => [...messages].sort((a, b) => time(a.createdAt) - time(b.createdAt)), [messages]);
  const waiting = sorted.some(m => m.role === 'user' && m.status === 'pending');

  const ask = (q: string) => {
    if (!q.trim() || !conn || waiting) return;
    setError(null);
    conn.reducers.askCoach({ text: q }).catch(e => setError(String(e?.message ?? e)));
    setText('');
  };

  useEffect(() => {
    if (pending && conn && isActive && !waiting) { ask(pending); onPendingSent(); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending, conn, isActive]);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [sorted.length, waiting]);

  const today = new Date(`${'2026-11-07'}T12:00:00`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

  return (
    <div className="screen" style={{ display: 'flex', flexDirection: 'column', minHeight: '100dvh' }}>
      {createPortal(<div className="ben-bg" aria-hidden="true" />, document.body)}
      <div className="topbar">
        <h1>Ben</h1>
        {sorted.length > 0 && (
          <button className="icon-btn" aria-label="New chat" onClick={() => void conn?.reducers.clearCoach({})}><Icon name="refresh" size={18} /></button>
        )}
      </div>

      {sorted.length === 0 ? (
        <div style={{ textAlign: 'center', marginTop: 40 }}>
          <div className="small muted">{today}</div>
          <h2 style={{ fontSize: 26, letterSpacing: '-0.02em', margin: '6px 0 4px' }}>Hi {name}, I'm Ben.</h2>
          <p className="muted" style={{ margin: 0 }}>Your AI money coach. Ask me anything about your money.</p>
        </div>
      ) : (
        <div className="bubbles" style={{ marginTop: 4 }}>
          {sorted.map(m => (
            <div key={String(m.id)} className={`bubble ${m.role === 'user' ? 'me' : 'ai'}`}>{m.text}</div>
          ))}
          {waiting && <div className="bubble ai typing"><i /><i /><i /></div>}
          <div ref={endRef} />
        </div>
      )}

      <div style={{ flex: 1, minHeight: 24 }} />


      <form data-tour="ask" className="composer" onSubmit={e => { e.preventDefault(); ask(text); }}
        style={{ background: 'rgba(255,255,255,0.7)', WebkitBackdropFilter: 'blur(16px)', backdropFilter: 'blur(16px)', borderRadius: 28, padding: 6, boxShadow: 'var(--warm-shadow)' }}>
        <input value={text} onChange={e => setText(e.target.value)} placeholder="Ask Ben anything…"
          style={{ boxShadow: 'none', background: 'transparent' }} disabled={!isActive} aria-label="Ask Ben" />
        {text.trim() ? (
          <button type="submit" className="send" aria-label="Send" disabled={!isActive || waiting}><Icon name="arrowUp" size={20} /></button>
        ) : (
          <button type="button" className="send" aria-label="Voice (coming soon)" style={{ background: 'var(--surface-2)', color: 'var(--ink)' }}><Icon name="mic" size={20} /></button>
        )}
      </form>
      {error && <p className="small" style={{ color: 'var(--red)' }}>{error}</p>}
    </div>
  );
}
