// "Ben noticed": habits from last month's purchases (synced from the bank) and what a small change
// frees up per month. Numbers come from shared/insights.ts (rules, no AI math). Monthly money, so it
// doesn't touch this pay period's ring; it's the "after payday" story.
import { useMemo, useState } from 'react';
import { useTable } from 'spacetimedb/react';
import { tables } from './module_bindings';
import { spendingInsights } from '../../shared/insights.ts';
import { Icon, usd } from './ui';

export default function BenNoticed({ asOf, onAsk }: { asOf: string; onAsk: (q: string) => void }) {
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
        {insights.map(x => (
          <div key={x.key} className="noticed-row">
            <button className="noticed-main" onClick={() => setOpen(open === x.key ? null : x.key)} aria-expanded={open === x.key}>
              <span className={`noticed-ico i-${x.icon}`}><Icon name={x.icon} size={18} /></span>
              <span className="noticed-text">
                <span className="noticed-t">{x.title}</span>
                <span className="noticed-s">{x.change}</span>
              </span>
              <span className="noticed-amt">+{usd(x.monthlySavingsCents, { whole: true })}<small>/mo</small></span>
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
