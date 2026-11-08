// The in-app side of a heads-up: a banner slides down on every open screen the moment Ben sends one.
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTable } from 'spacetimedb/react';
import { tables } from './module_bindings';
import { Icon } from './ui';

export default function HeadsUpBanner({ onReview }: { onReview: () => void }) {
  const [rows] = useTable(tables.myHeadsUps);
  const seen = useRef<Set<string> | null>(null);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  // Heads-ups already sent before this screen opened don't pop up again.
  useEffect(() => {
    if (seen.current === null) seen.current = new Set(rows.filter(r => r.status === 'sent').map(r => String(r.id)));
  }, [rows]);
  const h = useMemo(
    () => [...rows].filter(r => r.status === 'sent' && seen.current && !seen.current.has(String(r.id)) && !dismissed.has(String(r.id)))
      .sort((a, b) => (a.id < b.id ? 1 : -1))[0],
    [rows, dismissed]
  );
  if (!h) return null;
  const close = () => setDismissed(s => new Set(s).add(String(h.id)));
  return (
    <div className="headsup" role="alert" key={String(h.id)}>
      <span className="headsup-ico"><img src="/icon.svg" alt="" width={36} height={36} /></span>
      <button className="headsup-main" onClick={() => { close(); onReview(); }}>
        <span className="headsup-top"><strong>{h.title}</strong><span>now</span></span>
        <span className="headsup-body">{h.body}</span>
      </button>
      <button className="headsup-x" aria-label="Dismiss" onClick={close}><Icon name="x" size={16} /></button>
    </div>
  );
}
