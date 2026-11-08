// Home: "Am I okay until payday?" One sentence-number, a thin balance line, 4 health tiles
// (tap = Why?), the "I found a fix" card, and what's coming up. Reference: Fuse home.
import { useState } from 'react';
import { createPortal } from 'react-dom';
import CoverRing from './CoverRing';
import CardDeck from './CardDeck';
import { addDays, daysBetween } from '../../shared/forecast.ts';
import { Icon, day, usd, type IconName } from './ui';
import type { useMoney } from './engine';

type Money = Extract<ReturnType<typeof useMoney>, { ready: boolean; forecast: unknown }>;

type Why = { title: string; body: string; ask: string };

export default function Home({ m, name, onOpenPlan, onAsk, onSettings }: {
  m: Money; name: string; onOpenPlan: () => void; onAsk: (q: string) => void; onSettings: () => void;
}) {
  const [why, setWhy] = useState<Why | null>(null);
  const f = m.forecast;
  const h = m.health;
  const sf = f.shortfall;
  const util = Math.round((h.creditUtilization ?? 0) * 100);
  const plan = m.plan;
  const low = f.lowPoint;

  const tiles: Array<{ icon: IconName; color: 'blue' | 'orange' | 'purple' | 'teal' | 'red' | 'green'; value: string; label: string; why: Why }> = [
    {
      icon: 'hourglass', color: sf ? 'red' : 'green',
      value: sf ? `${h.runwayDays} days` : 'Covered',
      label: sf ? 'until you run short' : 'until payday',
      why: {
        title: sf ? `${h.runwayDays} days until you run short` : "You're covered until payday",
        body: sf
          ? `Your checking has ${usd(m.input.startBalanceCents)} today. After the bills and trips coming up, it drops to ${usd(sf.balanceCents)} on ${day(sf.date)}, ${sf.daysBeforePayday} days before your paycheck.`
          : `Your lowest point before payday is ${usd(low.balanceCents)} on ${day(low.date)}. Nothing goes below $0.`,
        ask: 'Why am I short?',
      },
    },
    {
      icon: 'card', color: 'blue', value: `${util}%`, label: 'of card limit used',
      why: {
        title: `${util}% of your card limit is used`,
        body: `You owe ${usd(m.accounts.find(a => a.kind === 'credit_card')?.balanceCents ?? 0)} on a ${usd(m.accounts.find(a => a.kind === 'credit_card')?.creditLimitCents ?? 0)} limit. Lenders like to see under 30%, so this is high. It's a next step after this pay period, not an emergency.`,
        ask: 'How can I lower my card balance?',
      },
    },
    {
      icon: 'alert', color: h.overdraftRisk === 'high' ? 'orange' : 'teal',
      value: h.overdraftRisk[0].toUpperCase() + h.overdraftRisk.slice(1), label: 'overdraft risk',
      why: {
        title: `Overdraft risk: ${h.overdraftRisk}`,
        body: sf
          ? `If nothing changes, your ${day(sf.date)} payments take you below $0. Most banks charge ${usd(f.overdraftFeesCents)} when that happens.`
          : `Your balance stays above $0 the whole way to payday${low.balanceCents < 10000 ? ', but it gets close. A $100 cushion would be safer.' : '.'}`,
        ask: 'What happens if I overdraft?',
      },
    },
    {
      icon: 'piggy', color: 'purple', value: usd(h.savingsCents, { whole: true }), label: 'in savings',
      why: {
        title: `${usd(h.savingsCents)} in savings`,
        body: `That covers ${h.savingsBufferDays < 1 ? 'less than a day' : `${Math.floor(h.savingsBufferDays)} days`} of your usual spending. Even a small cushion helps you skip fees when timing is tight.`,
        ask: 'How much should I keep in savings?',
      },
    },
  ];

  // Ring: payments due from today up to (not including) payday vs money available until then.
  const ring = (() => {
    const before = f.days.slice(1).filter(d => !f.nextPayday || d.date < f.nextPayday);
    const due = before.flatMap(d => d.events).filter(e => e.amountCents < 0).reduce((a, e) => a - e.amountCents, 0);
    const income = before.flatMap(d => d.events).filter(e => e.amountCents > 0).reduce((a, e) => a + e.amountCents, 0);
    return { due, have: f.days[0].balanceCents + income };
  })();
  const upcoming = f.days.slice(1).filter(d => d.date <= addDays(f.asOf, 14)).flatMap(d => d.events.map(e => ({ ...e, date: d.date })));

  return (
    <div className="screen">
      <div className="home-top rise" style={{ ['--i' as string]: 0 }}>
        <div>
          <div className="hero-hi">Hi, {name}!</div>
          <div className="hero-sub">Forecast until payday{f.nextPayday ? ` · ${day(f.asOf)}–${(() => { const end = addDays(f.nextPayday!, -1); return end.slice(0, 7) === f.asOf.slice(0, 7) ? String(Number(end.slice(8, 10))) : day(end); })()}` : ''}</div>
        </div>
        <button className="icon-btn" aria-label="Settings" onClick={onSettings}><Icon name="gear" size={20} /></button>
      </div>

      <div className="rise" style={{ ['--i' as string]: 1 }} data-tour="ring">
        <CoverRing dueCents={ring.due} haveCents={ring.have} payday={f.nextPayday} heroCents={sf ? sf.balanceCents : low.balanceCents} />
      </div>

      <button className={`ai-cta rise ${sf ? '' : 'ok'}`} style={{ ['--i' as string]: 2 }} onClick={onOpenPlan} data-tour="green">
        <span className="spark"><Icon name={sf ? 'sparkle' : 'check'} size={22} stroke={sf ? 2 : 3} /></span>
        <span>
          {sf ? 'Stay in the green!' : "You're in the green"}
          <span className="sub">
            {sf && plan.actions.length > 0
              ? `Ben found ${plan.actions.length} easy fixes`
              : 'Ben is keeping an eye on it'}
          </span>
        </span>
        <span className="chev"><Icon name="chevron" /></span>
      </button>

      <div className="section-title">Your financial health</div>
      <p className="section-sub">Tap any card to see why.</p>
      <div className="tiles" data-tour="tiles">
        {tiles.map((t, k) => (
          <button key={t.label} className={`tile t-${t.color} rise`} style={{ ['--i' as string]: 3 + k }} onClick={() => setWhy(t.why)} aria-label={`${t.value} ${t.label}. Tap for why`}>
            <span className="more"><Icon name="chevron" size={18} /></span>
            <span className="glyph"><Icon name={t.icon} size={18} /></span>
            <span style={{ marginTop: 'auto' }}>
              <span className={`value ${t.color === 'red' || t.color === 'orange' ? 'warn' : ''}`} style={{ display: 'block' }}>{t.value}</span>
              <span className="label">{t.label}</span>
            </span>
          </button>
        ))}
      </div>

      <div className="section-title">Coming up</div>
      <p className="section-sub">Scheduled for the next two weeks. Swipe to see each one.</p>
      <CardDeck items={upcoming.map((e, k) => ({
        key: `${e.date}-${k}`, label: e.label, date: e.date, amountCents: e.amountCents,
        kind: e.kind, daysAway: daysBetween(f.asOf, e.date),
      }))} />


      {why && createPortal(
        <>
          <div className="backdrop" onClick={() => setWhy(null)} />
          <div className="sheet" role="dialog" aria-label={why.title}>
            <div className="grabber" />
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 8 }}>
              <span className="why-ico"><Icon name="sparkle" size={16} /></span>
              <span className="small muted" style={{ fontWeight: 600 }}>Why?</span>
            </div>
            <h2>{why.title}</h2>
            <p style={{ color: 'var(--ink-2)', fontSize: 17, marginTop: 0 }}>{why.body}</p>
            <div className="stack">
              <button className="btn" onClick={() => { onAsk(why.ask); setWhy(null); }}>Ask Ben: "{why.ask}"</button>
              <button className="btn secondary" onClick={() => setWhy(null)}>Got it</button>
            </div>
          </div>
        </>,
        document.body
      )}
    </div>
  );
}
