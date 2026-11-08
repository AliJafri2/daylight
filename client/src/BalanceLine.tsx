// Thin balance line (Fuse-style): today -> a few days after payday. Dips below the dashed $0 line
// in red; when the forecast changes (plan approved, what-if), the line morphs smoothly to the new shape.
import { useEffect, useRef, useState } from 'react';
import type { Forecast } from '../../shared/forecast.ts';
import { day } from './ui';

const W = 340;
const H = 120;
const PAD = 8;

export default function BalanceLine({ forecast }: { forecast: Forecast }) {
  const until = forecast.nextPayday ?? forecast.days[forecast.days.length - 1].date;
  const days = forecast.days.filter(d => d.date <= until).concat(forecast.days.filter(d => d.date > until).slice(0, 2));
  const target = days.map(d => d.balanceCents);

  // Animate between successive shapes.
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

  const min = Math.min(0, ...vals, ...target);
  const max = Math.max(...vals, ...target, 1);
  const x = (i: number) => PAD + (i * (W - PAD * 2)) / Math.max(1, vals.length - 1);
  const y = (v: number) => PAD + ((max - v) * (H - PAD * 2)) / (max - min || 1);
  const pts = vals.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`);
  const path = `M${pts.join(' L')}`;
  const zeroY = y(0);
  const negative = vals.some(v => v < 0);
  const lowIdx = vals.indexOf(Math.min(...vals));

  return (
    <div className="chart">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img"
        aria-label={`Balance from ${day(days[0].date)} to ${day(days[days.length - 1].date)}`}>
        <defs>
          <clipPath id="above"><rect x="0" y="0" width={W} height={zeroY} /></clipPath>
          <clipPath id="below"><rect x="0" y={zeroY} width={W} height={H - zeroY + 20} /></clipPath>
          <linearGradient id="fillG" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor={negative ? '#111' : '#1d8f53'} stopOpacity="0.10" />
            <stop offset="1" stopColor={negative ? '#111' : '#1d8f53'} stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={`${path} L${x(vals.length - 1)},${H} L${x(0)},${H} Z`} fill="url(#fillG)" clipPath="url(#above)" />
        <line x1="0" x2={W} y1={zeroY} y2={zeroY} stroke="#cfcac1" strokeDasharray="3 4" strokeWidth="1" />
        <path className="draw" pathLength={1} d={path} fill="none" stroke={negative ? '#111' : '#1d8f53'} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" clipPath="url(#above)" style={{ transition: 'stroke 0.6s' }} />
        <path className="draw" pathLength={1} d={path} fill="none" stroke="#d64545" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" clipPath="url(#below)" />
        <circle className="low-pulse" cx={x(lowIdx)} cy={y(vals[lowIdx])} r="4.5" fill={vals[lowIdx] < 0 ? '#d64545' : '#1d8f53'} />
        <circle className="low-dot" cx={x(lowIdx)} cy={y(vals[lowIdx])} r="4.5" fill={vals[lowIdx] < 0 ? '#d64545' : '#1d8f53'} stroke="#fff" strokeWidth="2" />
      </svg>
      <div className="chart-legend">
        <span>Today</span>
        <span>$0 line</span>
        <span>Payday {day(until)}</span>
      </div>
    </div>
  );
}
