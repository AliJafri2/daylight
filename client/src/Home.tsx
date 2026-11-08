// Home: "Am I okay until payday?" One sentence-number, a thin balance line, 4 health tiles
// (tap = Why?), the "I found a fix" card, and what's coming up. Reference: Fuse home.
import { useState } from 'react';
import { createPortal } from 'react-dom';
import BalanceLine from './BalanceLine';
import { addDays } from '../../shared/forecast.ts';
import { BigMoney, Glyph, Icon, day, usd, type IconName } from './ui';
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

  const upcoming = f.days.slice(1).filter(d => d.date <= addDays(f.asOf, 14)).flatMap(d => d.events.map(e => ({ ...e, date: d.date })));

  return (
    <div className="screen">
      <div className={`status-glow ${sf ? 'red' : 'green'}`} aria-hidden="true" />
      <div className="topbar">
        <h1>Hi, {name}!</h1>
        <button className="icon-btn" aria-label="Settings" onClick={onSettings}><Icon name="gear" size={20} /></button>
      </div>

      <div className="eyebrow">Before payday · {f.nextPayday ? day(f.nextPayday) : '—'}</div>
      {sf ? (
        <>
          <BigMoney cents={sf.balanceCents} tone="red" />
          <div className="hero-sub">Your balance on {day(sf.date)}, {sf.daysBeforePayday} days before payday. You'd be ${(-sf.balanceCents / 100).toFixed(0)} short.</div>
        </>
      ) : (
        <>
          <BigMoney cents={low.balanceCents} tone="green" suffix="left" />
          <div className="hero-sub">The least you'll have before payday ({day(low.date)}). You're covered.</div>
        </>
      )}

      <BalanceLine forecast={f} />

      {sf && plan.actions.length > 0 && (
        <button className="fix-card" onClick={onOpenPlan}>
          <Glyph name="sparkle" color="green" />
          <span>
            <span className="title">I found a fix</span>
            <span className="small" style={{ display: 'block', color: 'var(--ink-2)' }}>
              Avoid a {usd(plan.feesAvoidedCents, { whole: true })} fee and end at {usd(plan.after.lowPoint.balanceCents, { sign: true })}.
            </span>
          </span>
          <span className="chev"><Icon name="chevron" /></span>
        </button>
      )}

      <div className="section-title">Your health</div>
      <p className="section-sub">Tap any card to see why.</p>
      <div className="tiles">
        {tiles.map(t => (
          <button key={t.label} className={`tile t-${t.color}`} onClick={() => setWhy(t.why)} aria-label={`${t.value} ${t.label}. Tap for why`}>
            <span className="tap">Why? <Icon name="chevron" size={14} /></span>
            <Glyph name={t.icon} color={t.color} />
            <span style={{ marginTop: 'auto' }}>
              <span className="value" style={{ display: 'block' }}>{t.value}</span>
              <span className="label">{t.label}</span>
            </span>
          </button>
        ))}
      </div>

      <div className="section-title">Coming up</div>
      <p className="section-sub">Scheduled for the next two weeks. Nothing here has been paid yet.</p>
      <div className="list">
        {upcoming.map((e, k) => (
          <div className="list-row" key={k}>
            <Glyph name={e.kind === 'income' ? 'arrowUp' : e.label.startsWith('Gas') ? 'gas' : e.label.startsWith('Groceries') ? 'cart' : 'bill'}
              color={e.kind === 'income' ? 'green' : e.label.startsWith('Gas') ? 'orange' : e.label.startsWith('Groceries') ? 'teal' : 'blue'} size={32} />
            <div className="main">
              <div className="name">{e.label}</div>
              <div className="due">{e.kind === 'income' ? 'Arrives' : 'Due'} {day(e.date)}</div>
            </div>
            <div className={`amt ${e.amountCents > 0 ? 'pos' : 'scheduled'}`}>{e.amountCents > 0 ? usd(e.amountCents, { sign: true }) : usd(-e.amountCents)}</div>
          </div>
        ))}
      </div>

      {why && createPortal(
        <>
          <div className="backdrop" onClick={() => setWhy(null)} />
          <div className="sheet" role="dialog" aria-label={why.title}>
            <div className="grabber" />
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 8 }}>
              <div className="orb" style={{ width: 32, height: 32, margin: 0 }} />
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
