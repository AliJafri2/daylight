// Coach: Bevel-style greeting (soft aura, orb, "Here for you"), suggestion cards, chat bubbles,
// frosted input. Answers come from the worker (Gemini) using only engine-computed numbers.
import { useEffect, useMemo, useRef, useState } from 'react';
import { useSpacetimeDB, useTable } from 'spacetimedb/react';
import { tables, type DbConnection } from './module_bindings';
import { Icon, type IconName } from './ui';

const time = (ts: { microsSinceUnixEpoch: bigint }) => Number(ts.microsSinceUnixEpoch / 1000n);

const SUGGESTIONS: Array<{ q: string; sub: string; icon: IconName }> = [
  { q: 'Why am I short?', sub: 'See what drives it', icon: 'alert' },
  { q: 'Can I afford a $40 dinner Friday?', sub: 'Check before you spend', icon: 'tag' },
  { q: 'When do I get paid?', sub: 'Your next paycheck', icon: 'calendar' },
  { q: "What's the cheapest gas near me?", sub: 'After the drive', icon: 'gas' },
];

export default function Coach({ language, name, pending, onPendingSent }: {
  language: string; name: string; pending: string | null; onPendingSent: () => void;
}) {
  const { isActive, getConnection } = useSpacetimeDB();
  const conn = getConnection() as DbConnection | null;
  const [messages] = useTable(tables.myCoach);
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const lang = language === 'es' ? 'es' : 'en';

  const sorted = useMemo(() => [...messages].sort((a, b) => time(a.createdAt) - time(b.createdAt)), [messages]);
  const waiting = sorted.some(m => m.role === 'user' && m.status === 'pending');

  const ask = (q: string) => {
    if (!q.trim() || !conn || waiting) return;
    setError(null);
    conn.reducers.askCoach({ text: q, language: lang }).catch(e => setError(String(e?.message ?? e)));
    setText('');
  };

  useEffect(() => {
    if (pending && conn && isActive && !waiting) { ask(pending); onPendingSent(); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending, conn, isActive]);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [sorted.length, waiting]);

  const today = new Date(`${'2026-11-07'}T12:00:00`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

  return (
    <div className="screen aura" style={{ display: 'flex', flexDirection: 'column', minHeight: '100%' }}>
      <div className="topbar">
        <h1>Coach</h1>
        {sorted.length > 0 && (
          <button className="icon-btn" aria-label="New chat" onClick={() => void conn?.reducers.clearCoach({})}><Icon name="refresh" size={18} /></button>
        )}
      </div>

      {sorted.length === 0 ? (
        <div style={{ textAlign: 'center', marginTop: 40 }}>
          <div className="orb" style={{ width: 84, height: 84 }} />
          <div className="small muted" style={{ marginTop: 18 }}>{today}</div>
          <h2 style={{ fontSize: 26, letterSpacing: '-0.02em', margin: '6px 0 4px' }}>Here for you, {name}.</h2>
          <p className="muted" style={{ margin: 0 }}>Ask me anything about your money. I only use your real numbers.</p>
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

      {sorted.length === 0 && (
        <div style={{ display: 'flex', gap: 10, overflowX: 'auto', margin: '0 -20px', padding: '4px 20px 8px', scrollSnapType: 'x mandatory' }}>
          {SUGGESTIONS.map(s => (
            <button key={s.q} className="card" disabled={!isActive} onClick={() => ask(s.q)}
              style={{ flex: '0 0 auto', width: 220, display: 'flex', gap: 10, alignItems: 'center', textAlign: 'left', scrollSnapAlign: 'start', padding: 14 }}>
              <span className="glyph ink" style={{ width: 36, height: 36, background: 'var(--surface-2)', color: 'var(--ink)' }}><Icon name={s.icon} size={18} /></span>
              <span>
                <strong style={{ display: 'block', fontSize: 15, lineHeight: 1.25 }}>{s.q}</strong>
                <span className="small muted">{s.sub}</span>
              </span>
            </button>
          ))}
        </div>
      )}

      <form className="composer" onSubmit={e => { e.preventDefault(); ask(text); }}
        style={{ background: 'rgba(255,255,255,0.7)', WebkitBackdropFilter: 'blur(16px)', backdropFilter: 'blur(16px)', borderRadius: 28, padding: 6, boxShadow: 'var(--warm-shadow)' }}>
        <input value={text} onChange={e => setText(e.target.value)} placeholder="Ask MinMax anything…"
          style={{ boxShadow: 'none', background: 'transparent' }} disabled={!isActive} aria-label="Ask MinMax" />
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
