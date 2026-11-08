// Accounts: the whole picture (PNC's "see it all") + "Cheapest near you" (gas by true cost incl.
// the drive, the usual groceries across 4 stores). All numbers from the shared engine.
import { gasOptions, groceryOptions } from '../../shared/forecast.ts';
import { Glyph, Icon, usd, type IconName } from './ui';
import type { useMoney } from './engine';

type Money = Extract<ReturnType<typeof useMoney>, { ready: boolean; forecast: unknown }>;

const KIND: Record<string, { icon: IconName; color: 'blue' | 'purple' | 'orange' | 'teal' | 'green' | 'ink'; label: string }> = {
  checking: { icon: 'wallet', color: 'blue', label: 'Checking' },
  savings: { icon: 'piggy', color: 'purple', label: 'Savings' },
  credit_card: { icon: 'card', color: 'ink', label: 'Credit card' },
  auto_loan: { icon: 'gas', color: 'orange', label: 'Auto loan' },
  ira: { icon: 'sparkle', color: 'teal', label: 'Roth IRA' },
  cd: { icon: 'lock', color: 'green', label: 'CD' },
};

export default function Accounts({ m, syncedAgo }: { m: Money; syncedAgo: string | null }) {
  const debt = new Set(['credit_card', 'auto_loan']);
  const have = m.accounts.filter(a => !debt.has(a.kind)).reduce((s, a) => s + a.balanceCents, 0);
  const owe = m.accounts.filter(a => debt.has(a.kind)).reduce((s, a) => s + a.balanceCents, 0);

  const usualGas = m.input.spend.find(s => s.category === 'gas');
  const usualGroc = m.input.spend.find(s => s.category === 'groceries');
  const fuel = m.gasPrices.find(p => p.place === usualGas?.place)?.priceCents ?? 359;
  const gas = usualGas ? gasOptions(usualGas.place, usualGas.amountCents, m.gasPrices, m.vehicle) : [];
  const usualGasPrice = m.gasPrices.find(p => p.place === usualGas?.place);
  const groc = usualGroc ? groceryOptions(usualGroc.place, m.groceryPrices, m.vehicle, fuel) : [];
  const bestGas = gas[0];
  const bestGroc = groc[0];
  const trips = (cat: string) => m.input.spend.filter(s => s.category === cat).length;
  const monthly = (bestGas && bestGas.netSavingsCents > 100 ? bestGas.netSavingsCents * trips('gas') : 0)
    + (bestGroc && bestGroc.netSavingsCents > 0 ? bestGroc.netSavingsCents * trips('groceries') : 0);

  return (
    <div className="screen">
      <div className="topbar"><h1>Accounts</h1></div>

      <div className="tiles" style={{ marginBottom: 6 }}>
        <div className="tile t-green" style={{ minHeight: 110 }}>
          <span className="label" style={{ fontWeight: 600 }}>You have</span>
          <span className="value" style={{ fontSize: 28, color: 'var(--green)' }}>{usd(have, { whole: true })}</span>
          <span className="label">cash, savings, IRA, CD</span>
        </div>
        <div className="tile t-red" style={{ minHeight: 110 }}>
          <span className="label" style={{ fontWeight: 600 }}>You owe</span>
          <span className="value" style={{ fontSize: 28 }}>{usd(owe, { whole: true })}</span>
          <span className="label">credit card, car loan</span>
        </div>
      </div>
      <div className="note" style={{ marginTop: 10 }}>
        <Icon name="refresh" size={14} /> {syncedAgo ? `Live from Capital One · updated ${syncedAgo}` : 'Connected to Capital One (demo)'}
      </div>

      <div className="section-title">All accounts</div>
      <div className="list">
        {m.accounts.map((a, idx) => {
          const k = KIND[a.kind] ?? { icon: 'wallet' as IconName, color: 'blue' as const, label: a.kind };
          const isDebt = debt.has(a.kind);
          return (
            <div className="list-row rise" key={a.nickname} style={{ ['--i' as string]: idx }}>
              <Glyph name={k.icon} color={k.color} size={36} />
              <div className="main">
                <div className="name">{a.nickname}</div>
                <div className="sub">
                  {k.label} · {a.kind === 'ira' || a.kind === 'cd' ? 'added by you' : 'from Capital One'}
                  {a.creditLimitCents ? ` · ${Math.round((a.balanceCents / a.creditLimitCents) * 100)}% of ${usd(a.creditLimitCents, { whole: true })}` : ''}
                </div>
              </div>
              <div className="amt" style={{ color: isDebt ? 'var(--ink-2)' : undefined }}>{isDebt ? '-' : ''}{usd(a.balanceCents)}</div>
            </div>
          );
        })}
      </div>

      <div className="section-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        Cheapest near you <span className="badge green">{usd(monthly, { whole: true })}/mo</span>
      </div>
      <p className="small muted" style={{ marginTop: -6 }}>Counted after the extra drive, for your car. Switching saves about {usd(monthly, { whole: true })} a month.</p>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '14px 16px 6px', display: 'flex', gap: 8, alignItems: 'center' }}>
          <Glyph name="gas" color="orange" size={28} /><strong>Gas</strong>
          <span className="small muted" style={{ marginLeft: 'auto' }}>vs {usualGas?.place} {usualGasPrice ? usd(usualGasPrice.priceCents) : ''}/gal</span>
        </div>
        {gas.map((o, k) => (
          <div className="list-row" key={o.place}>
            <span style={{ width: 22, fontWeight: 700, color: 'var(--ink-3)' }}>{k + 1}</span>
            <div className="main">
              <div className="name">{o.place} <span className="muted small">{usd(o.priceCents)}/gal</span></div>
              <div className="sub">{o.extraRoundTripMiles < 0.05 ? 'No extra driving' : `+${o.extraRoundTripMiles.toFixed(1)} mi round trip · drive costs ${usd(o.driveCostCents)}`}</div>
            </div>
            <div className="amt" style={{ color: o.netSavingsCents > 100 ? 'var(--green)' : 'var(--ink-3)' }}>
              {o.netSavingsCents > 0 ? usd(o.netSavingsCents, { sign: true }) : '—'}
            </div>
          </div>
        ))}
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden', marginTop: 12 }}>
        <div style={{ padding: '14px 16px 6px', display: 'flex', gap: 8, alignItems: 'center' }}>
          <Glyph name="cart" color="teal" size={28} /><strong>Your usual groceries</strong>
          <span className="small muted" style={{ marginLeft: 'auto' }}>{bestGroc?.items.length ?? 0} items</span>
        </div>
        {groc.map((o, k) => (
          <div className="list-row" key={o.place}>
            <span style={{ width: 22, fontWeight: 700, color: 'var(--ink-3)' }}>{k + 1}</span>
            <div className="main">
              <div className="name">{o.place}{o.place === usualGroc?.place ? ' (store brand)' : ''}</div>
              <div className="sub">{usd(o.basketCents)} vs {usd(o.usualBasketCents)}{o.extraRoundTripMiles > 0.05 ? ` · drive ${usd(o.driveCostCents)}` : ''}</div>
            </div>
            <div className="amt pos">{usd(o.netSavingsCents, { sign: true })}</div>
          </div>
        ))}
      </div>
      <p className="small muted" style={{ marginTop: 10 }}>Sample prices for the demo. In production MinMax uses a licensed price feed.</p>
    </div>
  );
}
