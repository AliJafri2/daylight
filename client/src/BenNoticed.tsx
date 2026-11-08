// "Ben noticed": habits from last month's purchases (synced from the bank) and what a small change
// frees up per month. Numbers come from shared/insights.ts (rules, no AI math). Monthly money, so it
// doesn't touch this pay period's ring; it's the "after payday" story.
import { useMemo, useState } from 'react';
import { useTable } from 'spacetimedb/react';
import { tables } from './module_bindings';
import { spendingInsights } from '../../shared/insights.ts';
import { CountUp, Icon } from './ui';

export default function BenNoticed({ asOf, onAsk, reveal = false }: { asOf: string; onAsk: (q: string) => void; reveal?: boolean }) {
  const [rows] = useTable(tables.myTransactions);
  const [open, setOpen] = useState<string | null>(null);
  const insights = useMemo(
    () => spendingInsights(rows.map(r => ({ merchant: r.merchant, category: r.category, amountCents: Number(r.amountCents), date: r.date })), asOf),
    [rows, asOf]
  );
  if (!insights.length) return null;

  return (
    <>
      <div className="noticed">
        {insights.map((x, k) => (
          <div key={x.key} className={`noticed-row ${reveal ? 'reveal-in' : ''}`} style={reveal ? { animationDelay: `${1.0 + k * 0.13}s`, ['--sweep' as string]: `${1.35 + k * 0.13}s` } : undefined}>
            <button className="noticed-main" onClick={() => setOpen(open === x.key ? null : x.key)} aria-expanded={open === x.key}>
              <span className={`noticed-ico i-${x.icon}`}><Icon name={x.icon} size={18} /></span>
              <span className="noticed-text">
                <span className="noticed-t">{x.title}</span>
                <span className="noticed-s">{x.change}</span>
              </span>
              <span className="noticed-amt">+<CountUp to={x.monthlySavingsCents} animate={reveal} delay={1150 + k * 130} ms={700} /><small>/mo</small></span>
            </button>
            {open === x.key && (
              <div className="noticed-why">
                <p>{x.why}</p>
                <button className="linkish" onClick={() => onAsk(`Help me spend less at ${x.merchant}`)}>Ask Ben about this</button>
              </div>
            )}
          </div>
        ))}
      </div>
    </>
  );
}
