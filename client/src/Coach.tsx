// Coach chat: ask anything about your money; answers use only engine-computed numbers.
// Functional version; styling comes with the real design.
import { useMemo, useState } from 'react';
import { useSpacetimeDB, useTable } from 'spacetimedb/react';
import { tables, type DbConnection } from './module_bindings';

const time = (ts: { microsSinceUnixEpoch: bigint }) => Number(ts.microsSinceUnixEpoch / 1000n);

const SUGGESTIONS = {
  en: ['Why am I short?', 'Can I afford a $40 dinner Friday?', 'When do I get paid?'],
  es: ['¿Por qué me falta dinero?', '¿Puedo gastar $40 en una cena el viernes?', '¿Cuándo me pagan?'],
};

export default function Coach({ language }: { language: string }) {
  const { isActive, getConnection } = useSpacetimeDB();
  const conn = getConnection() as DbConnection | null;
  const [messages] = useTable(tables.myCoach);
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const lang = language === 'es' ? 'es' : 'en';

  const sorted = useMemo(() => [...messages].sort((a, b) => time(a.createdAt) - time(b.createdAt)), [messages]);
  const waiting = sorted.some(m => m.role === 'user' && m.status === 'pending');

  const ask = (q: string) => {
    if (!q.trim() || !conn || waiting) return;
    setError(null);
    conn.reducers.askCoach({ text: q, language: lang }).catch(e => setError(String(e?.message ?? e)));
    setText('');
  };

  return (
    <section style={{ border: '1px solid #ddd', borderRadius: 12, padding: 12, marginBottom: 16 }}>
      <h2 style={{ marginTop: 0 }}>{lang === 'es' ? 'Pregúntale a Minimum' : 'Ask Minimum'}</h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {sorted.map(m => (
          <div
            key={String(m.id)}
            style={{
              alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start',
              background: m.role === 'user' ? '#e8f0fe' : '#f3f3f3',
              borderRadius: 12, padding: '8px 12px', maxWidth: '85%', fontSize: 15,
            }}
          >
            {m.text}
          </div>
        ))}
        {waiting && <div style={{ color: '#888', fontSize: 14 }}>{lang === 'es' ? 'Pensando…' : 'Thinking…'}</div>}
      </div>

      {sorted.length === 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, margin: '8px 0' }}>
          {SUGGESTIONS[lang].map(s => (
            <button key={s} onClick={() => ask(s)} disabled={!isActive}>{s}</button>
          ))}
        </div>
      )}

      <form onSubmit={e => { e.preventDefault(); ask(text); }} style={{ display: 'flex', gap: 6, marginTop: 8 }}>
        <input
          value={text}
          onChange={e => setText(e.target.value)}
          placeholder={lang === 'es' ? 'Escribe tu pregunta…' : 'Ask about your money…'}
          style={{ flex: 1, padding: 10, fontSize: 16, borderRadius: 8, border: '1px solid #ccc' }}
          disabled={!isActive}
        />
        <button type="submit" disabled={!isActive || waiting || !text.trim()}>{lang === 'es' ? 'Enviar' : 'Send'}</button>
      </form>
      {error && <p style={{ color: 'crimson' }}>{error}</p>}
      {sorted.length > 0 && (
        <button onClick={() => void conn?.reducers.clearCoach({})} style={{ marginTop: 8, fontSize: 12 }}>
          {lang === 'es' ? 'Borrar conversación' : 'Clear chat'}
        </button>
      )}
    </section>
  );
}
