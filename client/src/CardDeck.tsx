// "Coming up" as a swipeable stacked deck (Wallet-style). Drag the top card left/right (or tap the
// arrows) to send it to the back. Each card is a scheduled payment, clearly not paid yet.
import { useRef, useState } from 'react';
import { Icon, day, usd, type IconName } from './ui';

export type DeckItem = { key: string; label: string; date: string; amountCents: number; kind: 'bill' | 'spend' | 'income'; daysAway: number };

const THEME = (it: DeckItem): { icon: IconName; from: string; to: string } => {
  if (it.kind === 'income') return { icon: 'arrowUp', from: '#1d8f53', to: '#34c77b' };
  if (it.label.startsWith('Gas')) return { icon: 'gas', from: '#df641a', to: '#f5a26b' };
  if (it.label.startsWith('Groceries')) return { icon: 'cart', from: '#0f8f7e', to: '#3cc3ac' };
  return { icon: 'bill', from: '#2f5bd9', to: '#6f9cf5' };
};

export default function CardDeck({ items }: { items: DeckItem[] }) {
  const [top, setTop] = useState(0);
  const [dx, setDx] = useState(0);
  const [flying, setFlying] = useState<0 | 1 | -1>(0);
  const start = useRef<number | null>(null);
  const n = items.length;
  if (!n) return null;

  const advance = (dir: 1 | -1) => {
    setFlying(dir);
    setTimeout(() => { setTop(t => (t + (dir === 1 ? 1 : n - 1)) % n); setFlying(0); setDx(0); }, 260);
  };

  return (
    <div className="deck-wrap">
      <div className="deck">
        {[3, 2, 1, 0].map(depth => {
          if (depth >= n) return null;
          const it = items[(top + depth) % n];
          const th = THEME(it);
          const isTop = depth === 0;
          const moveX = isTop ? (flying ? flying * -420 : dx) : 0;
          const style: React.CSSProperties = {
            transform: isTop
              ? `translateX(${moveX}px) rotate(${moveX / 22}deg)`
              : `translateY(${depth * 12}px) scale(${1 - depth * 0.05})`,
            zIndex: 10 - depth,
            opacity: depth === 3 ? 0 : 1,
            transition: start.current !== null && isTop ? 'none' : 'transform 0.45s var(--ease-spring), opacity 0.3s',
            background: `linear-gradient(135deg, ${th.from}, ${th.to})`,
          };
          return (
            <div key={it.key} className={`deck-card ${isTop ? 'top' : ''}`} style={style}
              onPointerDown={isTop ? e => { start.current = e.clientX; (e.target as Element).setPointerCapture?.(e.pointerId); } : undefined}
              onPointerMove={isTop ? e => { if (start.current !== null) setDx(e.clientX - start.current); } : undefined}
              onPointerUp={isTop ? () => { const d = dx; start.current = null; if (Math.abs(d) > 70) advance(d < 0 ? 1 : -1); else setDx(0); } : undefined}
              onPointerCancel={isTop ? () => { start.current = null; setDx(0); } : undefined}
              aria-hidden={!isTop}>
              <div className="deck-row">
                <span className="deck-icon"><Icon name={th.icon} size={22} /></span>
                <span className="deck-when">{it.daysAway <= 0 ? 'Today' : it.daysAway === 1 ? 'Tomorrow' : `In ${it.daysAway} days`}</span>
              </div>
              <div className="deck-label">{it.label}</div>
              <div className="deck-bottom">
                <span className="deck-date">{it.kind === 'income' ? 'Arrives' : 'Due'} {day(it.date)}</span>
                <span className="deck-amt">{it.kind === 'income' ? '+' : ''}{usd(Math.abs(it.amountCents))}</span>
              </div>
              <div className="deck-note">{it.kind === 'income' ? 'Paycheck coming in' : 'Scheduled · not paid yet'}</div>
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
