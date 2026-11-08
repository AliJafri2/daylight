// "Close your ring" (inspired by Apple Fitness's Move ring; our colors and meaning).
// Ring = everything due before payday. Filled = what you can cover.
//   < 100%  : red, open ring, "$43 to close your ring"
//   >= 100% : green, closed; past 100% it laps itself with a shadowed end = money left over
// Reference measurements: docs/design/18-rings.html (local only).
import { useEffect, useRef, useState } from 'react';
import { Icon, day, usd } from './ui';

const SIZE = 236;
const THICK = 40;

/** Animates 0 -> value on mount (ring fill-in), then glides on change (red -> green after the fix). */
function useRingProgress(target: number) {
  const [v, setV] = useState(0);
  const cur = useRef(0);
  useEffect(() => {
    const from = cur.current;
    const start = performance.now();
    const dur = from === 0 ? 1300 : 1100;
    let raf = 0;
    const tick = (t: number) => {
      const k = Math.min(1, (t - start) / dur);
      const e = 1 - Math.pow(1 - k, 3);
      const val = from + (target - from) * e;
      cur.current = val;
      setV(val);
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target]);
  return v;
}

export default function CoverRing({ dueCents, haveCents, payday }: { dueCents: number; haveCents: number; payday?: string }) {
  const target = dueCents > 0 ? haveCents / dueCents : 2;
  const closed = target >= 1;
  const redFrac = closed ? 0 : Math.max(1 - target, 0.07); // red block is at least 7% so it's visible
  const greenEnd = 1 - redFrac;
  const p = useRingProgress(closed ? target : greenEnd);
  const filled = !closed && p >= greenEnd - 0.002;
  const r = (SIZE - THICK) / 2;
  const c = SIZE / 2;
  const C = 2 * Math.PI * r;
  const first = Math.min(p, 1);
  const lap = p > 1 ? p - Math.floor(p) || (p > 1 ? 1 : 0) : 0;
  const gap = Math.max(0, dueCents - haveCents);
  const extra = Math.max(0, haveCents - dueCents);
  const tone = closed ? 'green' : 'red';

  return (
    <div className={`ring-wrap ${tone}`}>
      <div className="ring-box" style={{ width: SIZE, height: SIZE }}>
        <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} role="img"
          aria-label={closed ? `Ring closed. ${usd(extra)} left over after upcoming payments.` : `Ring ${Math.round(target * 100)}% closed. ${usd(gap)} to close it.`}>
          <defs>
            <linearGradient id="ring-red" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#ff6b6b" /><stop offset="1" stopColor="#e5484d" />
            </linearGradient>
            <linearGradient id="ring-green" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#3ccf87" /><stop offset="1" stopColor="#1d8f53" />
            </linearGradient>
            <filter id="ring-gap-glow" x="-50%" y="-50%" width="200%" height="200%">
              <feDropShadow dx="0" dy="0" stdDeviation="5" floodColor="#ff3b30" floodOpacity="0.55" />
            </filter>
            <filter id="ring-end" x="-50%" y="-50%" width="200%" height="200%">
              <feDropShadow dx="0" dy="0" stdDeviation={THICK * 0.14} floodColor="rgba(0,0,0,0.45)" />
            </filter>
          </defs>
          {/* track (hidden once the red block appears, so nothing sits under the red) */}
          <circle cx={c} cy={c} r={r} fill="none" className="ring-track" strokeWidth={THICK}
            style={{ opacity: filled ? 0 : 1, transition: 'opacity 0.3s' }} />
          {closed ? (
            <g transform={`rotate(-90 ${c} ${c})`}>
              {/* first lap */}
              <circle cx={c} cy={c} r={r} fill="none" stroke="url(#ring-green)" strokeWidth={THICK}
                strokeLinecap="round" strokeDasharray={`${Math.max(0.0001, first) * C} ${C}`} />
              {/* overflow lap: money left over */}
              {p > 1 && (
                <circle cx={c} cy={c} r={r} fill="none" stroke="url(#ring-green)" strokeWidth={THICK}
                  strokeLinecap="round" strokeDasharray={`${lap * C} ${C}`} filter="url(#ring-end)" />
              )}
            </g>
          ) : (
            <>
              {/* Short: two segments that never overlap. Green = covered, red = missing. */}
              {p > 0.01 && <path d={sector(c, r, THICK, 0, Math.min(p, greenEnd))} fill="url(#ring-green)" stroke="url(#ring-green)" strokeWidth={8} strokeLinejoin="round" />}
              {filled && (
                <path className="ring-gap" d={sector(c, r, THICK, greenEnd, 1)} fill="#ff3b30"
                  stroke="#ff3b30" strokeWidth={8} strokeLinejoin="round" filter="url(#ring-gap-glow)" />
              )}
            </>
          )}
        </svg>
        <span className="ring-arrow" aria-hidden="true" style={{ opacity: p > 0.02 ? 1 : 0 }}><Icon name="arrowRight" size={20} stroke={3} /></span>
        <div className="ring-center">
          {closed ? (
            <>
              <div className="ring-big">{usd(extra, { whole: true })}</div>
              <div className="ring-small">extra · ring closed</div>
            </>
          ) : (
            <>
              <div className="ring-big">{usd(gap, { whole: true })}</div>
              <div className="ring-small">to close your ring</div>
            </>
          )}
        </div>
      </div>

      <div className="ring-stats">
        <div>
          <div className="ring-stat-l">You have / due</div>
          <div className="ring-stat-v">
            <span className="ring-col">{usd(haveCents, { whole: true })}</span>/{usd(dueCents, { whole: true })}
          </div>
        </div>
        <div>
          <div className="ring-stat-l">{Math.round(target * 100)}%</div>
          <div className="ring-stat-v">{closed ? 'closed' : 'closed so far'}</div>
        </div>
        {payday && (
          <div>
            <div className="ring-stat-l">Payday</div>
            <div className="ring-stat-v">{day(payday)}</div>
          </div>
        )}
      </div>
    </div>
  );
}

/** Ring segment from `from` to `to` (fractions of the way round, clockwise from 12 o'clock).
 *  Shrunk 4px on every side; the 8px round-joined stroke gives rounded-square corners and leaves
 *  a thin seam between neighbouring segments. */
function sector(c: number, r: number, thick: number, from: number, to: number) {
  const inset = 4;
  const ro = r + thick / 2 - inset;
  const ri = r - thick / 2 + inset;
  const a1 = from * 2 * Math.PI + (inset + 2) / r;
  const a2 = Math.max(a1 + 0.001, to * 2 * Math.PI - (inset + 2) / r);
  const pt = (rad: number, a: number) => `${(c + rad * Math.sin(a)).toFixed(2)} ${(c - rad * Math.cos(a)).toFixed(2)}`;
  const large = a2 - a1 > Math.PI ? 1 : 0;
  return `M ${pt(ro, a1)} A ${ro} ${ro} 0 ${large} 1 ${pt(ro, a2)} L ${pt(ri, a2)} A ${ri} ${ri} 0 ${large} 0 ${pt(ri, a1)} Z`;
}
