// Accounts: the whole picture (PNC's "see it all"). What you have, what you owe, every account,
// grouped and ordered so it reads top to bottom. Same visual system as Home and Plan.
import { Icon, usd, type IconName } from './ui';
import type { useMoney } from './engine';

type Money = Extract<ReturnType<typeof useMoney>, { ready: boolean; forecast: unknown }>;

const KIND: Record<string, { icon: IconName; color: string; label: string; order: number }> = {
  checking: { icon: 'wallet', color: 'blue', label: 'Checking', order: 0 },
  savings: { icon: 'piggy', color: 'purple', label: 'Savings', order: 1 },
  ira: { icon: 'trend', color: 'green', label: 'Roth IRA', order: 2 },
  cd: { icon: 'lock', color: 'teal', label: 'CD', order: 3 },
  credit_card: { icon: 'card', color: 'ink', label: 'Credit card', order: 4 },
  auto_loan: { icon: 'gas', color: 'orange', label: 'Auto loan', order: 5 },
};
const GROUPS: Array<{ title: string; kinds: string[] }> = [
  { title: 'Cash', kinds: ['checking', 'savings'] },
  { title: 'Investments', kinds: ['ira', 'cd'] },
  { title: 'Debts', kinds: ['credit_card', 'auto_loan'] },
];
const DEBT = new Set(['credit_card', 'auto_loan']);

function Money({ cents, negative }: { cents: number; negative?: boolean }) {
  const abs = Math.abs(cents);
  return (
    <span className="acct-amt">
      {negative ? '−' : ''}${Math.floor(abs / 100).toLocaleString('en-US')}<span className="cents">.{String(abs % 100).padStart(2, '0')}</span>
    </span>
  );
}

export default function Accounts({ m, syncedAgo }: { m: Money; syncedAgo: string | null }) {
  const have = m.accounts.filter(a => !DEBT.has(a.kind)).reduce((s, a) => s + a.balanceCents, 0);
  const owe = m.accounts.filter(a => DEBT.has(a.kind)).reduce((s, a) => s + a.balanceCents, 0);
  let i = 0;

  return (
    <div className="screen">
      <div className="topbar"><h1>Accounts</h1></div>

      <div className="acct-hero rise" style={{ ['--i' as string]: 0 }} data-tour="acct">
        <div className="acct-half">
          <span className="acct-k">You have</span>
          <span className="acct-big green">{usd(have, { whole: true })}</span>
          <span className="acct-s">cash, savings, IRA, CD</span>
        </div>
        <div className="acct-div" />
        <div className="acct-half">
          <span className="acct-k">You owe</span>
          <span className="acct-big">{usd(owe, { whole: true })}</span>
          <span className="acct-s">credit card, car loan</span>
        </div>
      </div>
      <div className="acct-sync rise" style={{ ['--i' as string]: 1 }}>
        <span className="acct-dot" /> {syncedAgo ? `Live from Capital One · updated ${syncedAgo}` : 'Connected to Capital One (demo)'}
      </div>

      {GROUPS.map(g => {
        const rows = m.accounts.filter(a => g.kinds.includes(a.kind)).sort((a, b) => (KIND[a.kind]?.order ?? 9) - (KIND[b.kind]?.order ?? 9));
        if (!rows.length) return null;
        return (
          <div key={g.title}>
            <div className="section-title">{g.title}</div>
            <div className="acct-list">
              {rows.map(a => {
                const k = KIND[a.kind] ?? { icon: 'wallet' as IconName, color: 'blue', label: a.kind, order: 9 };
                const isDebt = DEBT.has(a.kind);
                const util = a.creditLimitCents ? Math.round((a.balanceCents / a.creditLimitCents) * 100) : undefined;
                return (
                  <div className="acct-row rise" key={a.nickname} style={{ ['--i' as string]: 2 + i++ }}>
                    <span className={`pico ${k.color}`}><Icon name={k.icon} size={20} stroke={2.4} /></span>
                    <div className="acct-main">
                      <div className="acct-name">{a.nickname}</div>
                      <div className="acct-sub">{k.label} · {a.kind === 'ira' || a.kind === 'cd' ? 'added by you' : 'Capital One'}</div>
                      {util !== undefined && (
                        <div className="acct-util">
                          <span className="acct-bar"><span style={{ width: `${Math.min(100, util)}%` }} className={util >= 30 ? 'hi' : ''} /></span>
                          <span>{util}% of {usd(a.creditLimitCents!, { whole: true })}</span>
                        </div>
                      )}
                    </div>
                    <Money cents={a.balanceCents} negative={isDebt} />
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
