// Checking balance, today -> just past payday. Self-explaining: labeled start, low point (with
// its cause), payday marker, a red "below $0" zone, and touch-to-explore for any day.
// When the forecast changes (plan approved), the line morphs smoothly to the new shape.
import { useEffect, useRef, useState } from 'react';
import type { Forecast } from '../../shared/forecast.ts';
import { day, usd } from './ui';

const W = 340;
const H = 150;
const TOP = 34; // room for labels above the line
const BOTTOM = 14;

export default function BalanceLine({ forecast }: { forecast: Forecast }) {
  const payday = forecast.nextPayday;
  const lastIdx = (() => {
    const p = forecast.days.findIndex(d => d.date === payday);
    return p >= 0 ? Math.min(forecast.days.length - 1, p + 2) : Math.min(forecast.days.length - 1, 14);
  })();
  const days = forecast.days.slice(0, lastIdx + 1);
  const target = days.map(d => d.balanceCents);

  // Morph between successive shapes.
  const [vals, setVals] = useState(target);
  const prev = useRef(target);
  useEffect(() => {
    const from = prev.current;
    if (from.length !== target.length) { prev.current = target; setVals(target); return; }
    const start = performance.now();
    let raf = 0;
    const tick = (t: number) => {
      const k = Math.min(1, (t - start) / 900);
      const e = 1 - Math.pow(1 - k, 3);
      setVals(target.map((v, i) => from[i] + (v - from[i]) * e));
      if (k < 1) raf = requestAnimationFrame(tick);
      else prev.current = target;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target.join(',')]);

  // Scale to the days BEFORE payday so the dip is easy to see; the payday jump runs off the top.
  const payPos = forecast.days.findIndex(d => d.date === payday);
  const pre = target.slice(0, payPos > 0 ? payPos : target.length);
  const min = Math.min(0, ...pre, ...vals.slice(0, pre.length));
  const max = Math.max(...pre, ...vals.slice(0, pre.length), 1);
  const pad = (max - min) * 0.12;
  const lo = min - pad;
  const hi = max + pad;
  const xPct = (i: number) => (i * 100) / Math.max(1, vals.length - 1);
  const x = (i: number) => (xPct(i) / 100) * W;
  const y = (v: number) => Math.max(TOP - 14, TOP + ((hi - v) * (H - TOP - BOTTOM)) / (hi - lo || 1));
  const path = `M${vals.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' L')}`;
  const zeroY = y(0);
  const negative = target.some(v => v < 0);

  const lowIdx = target.indexOf(Math.min(...target));
  const lowDay = days[lowIdx];
  const lowCause = lowDay?.events.filter(e => e.amountCents < 0).sort((a, b) => a.amountCents - b.amountCents)[0];
  const payIdx = days.findIndex(d => d.date === payday);
  const payAmt = payIdx >= 0 ? days[payIdx].events.find(e => e.kind === 'income')?.amountCents : undefined;

  // Touch / hover to explore any day.
  const [scrub, setScrub] = useState<number | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const onMove = (clientX: number) => {
    const r = box.current?.getBoundingClientRect();
    if (!r) return;
    const k = Math.round(((clientX - r.left) / r.width) * (vals.length - 1));
    setScrub(Math.max(0, Math.min(vals.length - 1, k)));
  };
  const sd = scrub !== null ? days[scrub] : null;

  // Keep edge labels inside the chart.
  const clampPct = (p: number) => Math.max(14, Math.min(86, p));

  return (
    <div className="bl">
      <div className="bl-title">
        <span>Your checking balance</span>
        <span className="muted">next 2 weeks</span>
      </div>

      <div
        className="bl-chart"
        ref={box}
        onPointerDown={e => { (e.target as Element).setPointerCapture?.(e.pointerId); onMove(e.clientX); }}
        onPointerMove={e => { if (e.pointerType === 'mouse' || scrub !== null) onMove(e.clientX); }}
        onPointerUp={() => setScrub(null)}
        onPointerLeave={() => setScrub(null)}
        role="img"
        aria-label={`Checking balance from ${day(days[0].date)} to ${day(days[days.length - 1].date)}. Lowest ${usd(target[lowIdx])} on ${day(lowDay.date)}.`}
      >
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
          <defs>
            <clipPath id="bl-above"><rect x="0" y="0" width={W} height={zeroY} /></clipPath>
            <clipPath id="bl-below"><rect x="0" y={zeroY} width={W} height={H} /></clipPath>
            <linearGradient id="bl-fill" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0" stopColor={negative ? '#111' : '#1d8f53'} stopOpacity="0.10" />
              <stop offset="1" stopColor={negative ? '#111' : '#1d8f53'} stopOpacity="0" />
            </linearGradient>
          </defs>
          {/* below-$0 zone */}
          <rect x="0" y={zeroY} width={W} height={Math.max(0, H - zeroY)} fill="#d64545" opacity="0.07" />
          <path d={`${path} L${x(vals.length - 1)},${zeroY} L${x(0)},${zeroY} Z`} fill="url(#bl-fill)" clipPath="url(#bl-above)" />
          <line x1="0" x2={W} y1={zeroY} y2={zeroY} stroke="#c9c4bb" strokeDasharray="3 4" strokeWidth="1" vectorEffect="non-scaling-stroke" />
          {payIdx >= 0 && <line x1={x(payIdx)} x2={x(payIdx)} y1={TOP - 6} y2={H} stroke="#1d8f53" strokeDasharray="2 4" strokeWidth="1.5" vectorEffect="non-scaling-stroke" opacity="0.6" />}
          <path className="draw" pathLength={1} d={path} fill="none" stroke={negative ? '#111' : '#1d8f53'} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" clipPath="url(#bl-above)" vectorEffect="non-scaling-stroke" style={{ transition: 'stroke 0.6s' }} />
          <path className="draw" pathLength={1} d={path} fill="none" stroke="#d64545" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" clipPath="url(#bl-below)" vectorEffect="non-scaling-stroke" />
          {scrub !== null && <line x1={x(scrub)} x2={x(scrub)} y1={TOP - 10} y2={H} stroke="#111" strokeWidth="1" vectorEffect="non-scaling-stroke" opacity="0.35" />}
        </svg>

        {/* Dots as HTML so they stay round on any screen width */}
        <span className="bl-dot" style={{ left: `${xPct(0)}%`, top: y(vals[0]) }} />
        <span className={`bl-dot big ${target[lowIdx] < 0 ? 'red' : 'green'}`} style={{ left: `${xPct(lowIdx)}%`, top: y(vals[lowIdx]) }} />
        {scrub !== null && <span className="bl-dot" style={{ left: `${xPct(scrub)}%`, top: y(vals[scrub]) }} />}

        {/* Labels */}
        {scrub === null ? (
          <>
            <span className="bl-label" style={{ left: 0, top: Math.max(0, y(vals[0]) - 30), transform: 'none' }}>
              Today <strong>{usd(target[0], { whole: true })}</strong>
            </span>
            <span className={`bl-callout ${target[lowIdx] < 0 ? 'red' : 'green'}`} style={{ left: `${clampPct(xPct(lowIdx))}%`, top: Math.max(0, y(vals[lowIdx]) - 58) }}>
              <strong>{target[lowIdx] < 0 ? '' : 'Lowest: '}{day(lowDay.date)} · {usd(target[lowIdx])}</strong>
              {lowCause && <small>after {lowCause.label.toLowerCase()} {usd(-lowCause.amountCents, { whole: true })}</small>}
            </span>
            {payIdx >= 0 && payAmt && (
              <span className="bl-label green" style={{ left: `${clampPct(xPct(payIdx))}%`, top: -4 }}>
                Payday <strong>+{usd(payAmt, { whole: true })}</strong>
              </span>
            )}
          </>
        ) : sd && (
          <span className="bl-callout" style={{ left: `${clampPct(xPct(scrub))}%`, top: 0 }}>
            <strong>{day(sd.date)} · {usd(target[scrub])}</strong>
            <small>{sd.events.length ? sd.events.map(e => `${e.label} ${e.amountCents > 0 ? '+' : ''}${usd(e.amountCents, { whole: true })}`).join(', ') : 'Nothing scheduled'}</small>
          </span>
        )}
      </div>

      <div className="bl-legend">
        <span><i className="sw red" /> Below $0 = overdraft fee</span>
        <span className="muted">Drag to explore</span>
      </div>
    </div>
  );
}
