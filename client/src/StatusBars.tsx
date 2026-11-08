// "Stay in the green" bar chart (builder's whiteboard design).
// One bar per day. Bar height = everything due from today through that day.
//   green = what you can already cover · red = how much more you need · light top = extra left over
// A full green bar (with extra on top) means you're ahead of upcoming payments.
// Uses the same engine forecast as everything else, so numbers always agree.
import { useMemo, useState } from 'react';
import type { Forecast } from '../../shared/forecast.ts';
import { day, usd } from './ui';

type Range = '1D' | '1W' | 'PAY' | '1M';
const RANGES: Array<{ id: Range; label: string }> = [
  { id: '1D', label: '1D' },
  { id: '1W', label: '1W' },
  { id: 'PAY', label: 'Pay period' },
  { id: '1M', label: '1M' },
];

type Bar = { date: string; due: number; covered: number; short: number; extra: number; events: string[] };

export default function StatusBars({ forecast }: { forecast: Forecast }) {
  const [range, setRange] = useState<Range>('PAY');
  const [picked, setPicked] = useState<number | null>(null);

  // Running totals from today: everything due vs everything you'll have (start + paychecks).
  const allBars: Bar[] = useMemo(() => {
    const start = forecast.days[0].balanceCents;
    let out = 0;
    let inc = 0;
    return forecast.days.map((d, i) => {
      if (i > 0) for (const e of d.events) { if (e.amountCents < 0) out -= e.amountCents; else inc += e.amountCents; }
      const have = start + inc;
      return {
        date: d.date,
        due: out,
        covered: Math.min(have, out),
        short: Math.max(0, out - have),
        extra: Math.max(0, have - out),
        events: d.events.map(e => `${e.label} ${e.amountCents > 0 ? '+' : ''}${usd(e.amountCents, { whole: true })}`),
      };
    });
  }, [forecast]);

  const payIdx = forecast.days.findIndex(d => d.date === forecast.nextPayday);
  const bars = useMemo(() => {
    if (range === '1D') return allBars.slice(0, 1);
    if (range === '1W') return allBars.slice(1, 8);
    if (range === 'PAY') return allBars.slice(1, payIdx > 0 ? payIdx : 15);
    return allBars.slice(1, 31);
  }, [allBars, range, payIdx]);

  // Default caption: the tightest day in view (biggest shortfall, or smallest cushion).
  const worst = bars.reduce((w, b, i) => (b.short - b.extra > bars[w].short - bars[w].extra ? i : w), 0);
  const sel = picked !== null && picked < bars.length ? picked : worst;
  const b = bars[sel];
  const top = Math.max(1, ...bars.map(x => x.covered + x.short + x.extra));
  const thin = bars.length > 16;

  return (
    <div className="sb">
      <div className="sb-caption" key={`${range}-${sel}-${b.date}`}>
        <strong>{sel === 0 && range === '1D' ? 'Today' : day(b.date)}</strong>
        {b.short > 0 ? (
          <> · {usd(b.due, { whole: true })} due, you can cover {usd(b.covered, { whole: true })} · <span className="red">{usd(b.short)} short</span></>
        ) : b.due > 0 ? (
          <> · {usd(b.due, { whole: true })} due, all covered · <span className="green">{usd(b.extra, { whole: true })} extra</span></>
        ) : (
          <> · nothing due yet · <span className="green">{usd(b.extra, { whole: true })} available</span></>
        )}
      </div>

      <div className={`sb-bars ${thin ? 'thin' : ''}`} role="img"
        aria-label={`Payments due versus money available, ${RANGES.find(r => r.id === range)!.label}. ${day(b.date)}: ${b.short > 0 ? `${usd(b.short)} short` : 'covered'}.`}>
        {bars.map((x, i) => {
          const h = (v: number) => `${(v / top) * 100}%`;
          return (
            <button key={`${range}-${x.date}`} className={`sb-col ${i === sel ? 'on' : ''}`} onClick={() => setPicked(i)}
              style={{ ['--d' as string]: `${i * (thin ? 18 : 45)}ms` }} aria-label={`${day(x.date)}`}>
              <span className="sb-stack">
                <span className="sb-extra" style={{ height: h(x.extra) }} />
                <span className="sb-short" style={{ height: h(x.short), minHeight: x.short > 0 ? 14 : 0 }} />
                <span className="sb-covered" style={{ height: h(x.covered) }} />
              </span>
              {(!thin || i % 5 === 0 || i === sel) && <span className="sb-x">{Number(x.date.slice(8))}</span>}
            </button>
          );
        })}
      </div>

      <div className="sb-legend">
        <span><i className="sw covered" />Covered</span>
        <span><i className="sw short" />Still need</span>
        <span><i className="sw extra" />Extra</span>
      </div>

      <div className="sb-ranges" role="tablist" aria-label="Time range">
        {RANGES.map(r => (
          <button key={r.id} role="tab" aria-selected={range === r.id} className={range === r.id ? 'on' : ''}
            onClick={() => { setRange(r.id); setPicked(null); }}>{r.label}</button>
        ))}
      </div>
    </div>
  );
}
