// The in-app side of a heads-up: a banner slides down on every open screen the moment Ben sends one.
// Only heads-ups requested after this screen opened are shown (never old ones), only the newest,
// and one tap on X dismisses it. Hidden while the tour is running.
import { useMemo, useRef, useState } from 'react';
import { useTable } from 'spacetimedb/react';
import { tables } from './module_bindings';
import { Icon } from './ui';

const GRACE_MS = 5_000; // only covers small clock differences between the server and this device

export default function HeadsUpBanner({ onReview, hidden = false }: { onReview: () => void; hidden?: boolean }) {
  const [rows] = useTable(tables.myHeadsUps);
  const openedAt = useRef(Date.now());
  const [dismissedUpTo, setDismissedUpTo] = useState<bigint>(0n);

  const h = useMemo(() => {
    const newest = [...rows]
      .filter(r => r.status === 'sent' && Number(r.createdAt.microsSinceUnixEpoch / 1000n) >= openedAt.current - GRACE_MS)
      .sort((a, b) => (a.id < b.id ? 1 : -1))[0];
    return newest && newest.id > dismissedUpTo ? newest : undefined;
  }, [rows, dismissedUpTo]);

  if (!h || hidden) return null;
  const close = () => setDismissedUpTo(h.id);
  return (
    <div className="headsup" role="alert" key={String(h.id)}>
      <span className="headsup-ico"><img src="/icon.svg" alt="" width={36} height={36} /></span>
      <button className="headsup-main" onClick={() => { close(); onReview(); }}>
        <span className="headsup-top"><strong>{h.title}</strong><span>now</span></span>
        <span className="headsup-body">{h.body}</span>
      </button>
      <button className="headsup-x" aria-label="Dismiss" onClick={close}><Icon name="x" size={18} /></button>
    </div>
  );
}
