// "Coming up" as a swipeable stacked deck (Wallet-style).
// Smooth: the top card follows the finger directly (no React re-render while dragging),
// a quick flick or a long drag sends it off, and it fades in at the back of the stack.
import { useRef, useState } from 'react';
import { Icon, day, usd, type IconName } from './ui';

export type DeckItem = { key: string; label: string; date: string; amountCents: number; kind: 'bill' | 'spend' | 'income'; daysAway: number };

const THEME = (it: DeckItem): { icon: IconName; from: string; to: string } => {
  if (it.kind === 'income') return { icon: 'arrowUp', from: '#1d8f53', to: '#3ccf87' };
  if (it.label.startsWith('Gas')) return { icon: 'gas', from: '#d9601a', to: '#f59a5c' };
  if (it.label.startsWith('Groceries')) return { icon: 'cart', from: '#0f8f7e', to: '#36c2aa' };
  return { icon: 'bill', from: '#2f5bd9', to: '#6f9cf5' };
};

const VISIBLE = 3;

export default function CardDeck({ items }: { items: DeckItem[] }) {
  const [top, setTop] = useState(0);
  const [leaving, setLeaving] = useState<{ key: string; dir: 1 | -1 } | null>(null);
  const topEl = useRef<HTMLDivElement | null>(null);
  const drag = useRef<{ x0: number; t0: number; x: number; lastX: number; lastT: number } | null>(null);
  const n = items.length;
  if (!n) return null;

  const advance = (dir: 1 | -1) => {
    if (leaving) return;
    const it = items[top % n];
    setLeaving({ key: it.key, dir });
    setTop(t => (t + (dir === 1 ? 1 : n - 1)) % n);
    setTimeout(() => setLeaving(null), 380);
  };

  const onDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { x0: e.clientX, t0: performance.now(), x: 0, lastX: e.clientX, lastT: performance.now() };
    e.currentTarget.style.transition = 'none';
  };
  const onMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d) return;
    d.x = e.clientX - d.x0;
    d.lastX = e.clientX;
    d.lastT = performance.now();
    e.currentTarget.style.transform = `translate3d(${d.x}px, 0, 0) rotate(${d.x / 24}deg)`;
  };
  const onUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    drag.current = null;
    const el = e.currentTarget;
    el.style.transition = '';
    if (!d) return;
    const velocity = d.x / Math.max(1, performance.now() - d.t0); // px per ms
    if (Math.abs(d.x) > 80 || (Math.abs(velocity) > 0.6 && Math.abs(d.x) > 20)) {
      el.style.transform = '';
      advance(d.x < 0 ? 1 : -1);
    } else {
      el.style.transform = ''; // springs back via CSS transition
    }
  };

  // Render back-to-front: the card that just left (fading out at the back), then depth 2, 1, 0.
  const stack = Array.from({ length: Math.min(VISIBLE, n) }, (_, depth) => ({ it: items[(top + depth) % n], depth })).reverse();

  return (
    <div className="deck-wrap">
      <div className="deck">
        {leaving && (() => {
          const it = items.find(x => x.key === leaving.key)!;
          const th = THEME(it);
          return (
            <div key={`leave-${it.key}`} className="deck-card leaving" aria-hidden="true"
              style={{ background: `linear-gradient(135deg, ${th.from}, ${th.to})`, ['--dir' as string]: leaving.dir }}>
              <CardBody it={it} />
            </div>
          );
        })()}
        {stack.map(({ it, depth }) => {
          const th = THEME(it);
          const isTop = depth === 0;
          return (
            <div key={it.key} ref={isTop ? topEl : undefined}
              className={`deck-card ${isTop ? 'top' : ''}`}
              style={{
                background: `linear-gradient(135deg, ${th.from}, ${th.to})`,
                transform: isTop ? undefined : `translate3d(0, ${depth * 12}px, 0) scale(${1 - depth * 0.05})`,
                zIndex: 10 - depth,
              }}
              onPointerDown={isTop ? onDown : undefined}
              onPointerMove={isTop ? onMove : undefined}
              onPointerUp={isTop ? onUp : undefined}
              onPointerCancel={isTop ? onUp : undefined}
              aria-hidden={!isTop}>
              <CardBody it={it} />
            </div>
          );
        })}
      </div>
      <div className="deck-nav">
        <button className="icon-btn" aria-label="Previous" onClick={() => advance(-1)}><Icon name="back" size={18} /></button>
        <span className="deck-count">{top + 1} of {n}</span>
        <button className="icon-btn" aria-label="Next" onClick={() => advance(1)}><Icon name="chevron" size={18} /></button>
      </div>
    </div>
  );
}

function CardBody({ it }: { it: DeckItem }) {
  const th = THEME(it);
  return (
    <>
      <div className="deck-row">
        <span className="deck-icon"><Icon name={th.icon} size={20} /></span>
        <span className="deck-label">{it.label}</span>
        <span className="deck-when">{it.daysAway <= 0 ? 'Today' : it.daysAway === 1 ? 'Tomorrow' : `In ${it.daysAway} days`}</span>
      </div>
      <div className="deck-amt">{it.kind === 'income' ? '+' : ''}{usd(Math.abs(it.amountCents))}</div>
      <div className="deck-bottom">
        <span>{it.kind === 'income' ? 'Arrives' : 'Due'} {day(it.date)}</span>
        <span className="deck-note">{it.kind === 'income' ? 'Paycheck' : 'Scheduled · not paid'}</span>
      </div>
    </>
  );
}
