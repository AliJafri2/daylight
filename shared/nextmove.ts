// Next best move: once this pay period is safe, where should the next spare dollar go?
// A fixed, explainable order (no stock picks, no AI math):
//   1. Cushion: get savings to $500, so one surprise doesn't mean an overdraft.
//   2. Card: pay down the highest-interest debt (27.9% beats any savings rate).
//   3. Roth IRA: invest for later in a broad, low-cost index fund.
// The amount is whatever stays spare through the NEXT pay period, keeping a $100 floor.

import { addDays, buildForecast, type Account, type Adjustments, type ForecastInput } from './forecast.ts';

export const CUSHION_GOAL_CENTS = 50_000;
export const SAFETY_FLOOR_CENTS = 10_000;
const ROUND_TO_CENTS = 500; // suggest round amounts ($5 steps); Nessie also only takes whole dollars

export type Step = {
  key: 'cushion' | 'card' | 'ira';
  title: string;
  detail: string;
  status: 'now' | 'next' | 'later' | 'done';
  progress?: { haveCents: number; goalCents: number };
};

export type NextMove = {
  // Why there's no move yet (e.g. this pay period still runs short).
  blockedReason?: string;
  move?: {
    amountCents: number;
    date: string; // day after payday
    toKind: 'savings' | 'credit_card' | 'ira';
    title: string;
    detail: string;
    why: string;
    lowAfterCents: number; // lowest checking balance before the next paycheck, after the move
  };
  steps: Step[];
  monthsToCushion?: number; // if the "Ben noticed" changes are followed too
  window?: { from: string; to: string; lowCents: number; lowDate: string }; // next pay period looked at
};

const usd = (c: number) => {
  const s = `$${(Math.abs(c) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).replace(/\.00$/, '')}`;
  return c < 0 ? `-${s}` : s;
};
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const day = (d: string) => `${MONTHS[Number(d.slice(5, 7)) - 1]} ${Number(d.slice(8, 10))}`;

export function nextBestMove(input: ForecastInput, accounts: Account[], opts: { adj?: Adjustments; habitsMonthlyCents?: number } = {}): NextMove {
  const f = buildForecast(input, opts.adj);
  const savings = accounts.filter(a => a.kind === 'savings').reduce((s, a) => s + a.balanceCents, 0);
  const card = accounts.find(a => a.kind === 'credit_card');
  const ira = accounts.find(a => a.kind === 'ira');
  const cushionDone = savings >= CUSHION_GOAL_CENTS;
  const cardInterest = card && card.apr ? Math.round((card.balanceCents * card.apr) / 100 / 12) : 0;

  const steps: Step[] = [
    {
      key: 'cushion', title: `Build a ${usd(CUSHION_GOAL_CENTS)} cushion`,
      detail: cushionDone
        ? 'Done. One surprise bill won\'t knock you below $0.'
        : `You have ${usd(savings)}. A small cushion is what stops one surprise from becoming a ${usd(3600)} overdraft fee.`,
      status: cushionDone ? 'done' : 'now',
      progress: { haveCents: savings, goalCents: CUSHION_GOAL_CENTS },
    },
    {
      key: 'card', title: 'Pay down your credit card',
      detail: card && card.balanceCents > 0
        ? `${usd(card.balanceCents)} at ${card.apr ?? '?'}% APR costs about ${usd(cardInterest)} a month in interest. Every dollar paid off "earns" ${card.apr ?? '?'}%, more than any savings account.`
        : 'No card balance. Nice.',
      status: !card || card.balanceCents <= 0 ? 'done' : cushionDone ? 'now' : 'next',
    },
    {
      key: 'ira', title: 'Invest for later',
      detail: `Add to your Roth IRA${ira ? ` (${usd(ira.balanceCents)} today)` : ''} in a broad, low-cost index fund. Slow and steady, no stock picking.`,
      status: 'later',
    },
  ];

  const habits = opts.habitsMonthlyCents ?? 0;

  if (f.shortfall) {
    return {
      blockedReason: `First things first: this pay period still runs ${usd(-f.shortfall.balanceCents)} short on ${day(f.shortfall.date)}. Close that gap, then extra money can go to work.`,
      steps,
      monthsToCushion: cushionDone || habits <= 0 ? undefined : Math.ceil((CUSHION_GOAL_CENTS - savings) / habits),
    };
  }

  // The window: payday up to (not including) the paycheck after it.
  const pay = input.income[0];
  const payday = f.nextPayday;
  if (!pay || !payday) return { blockedReason: 'No upcoming paycheck found.', steps };
  const nextPay = addDays(payday, pay.intervalDays);
  const window = f.days.filter(d => d.date >= payday && d.date < nextPay);
  if (!window.length || window[window.length - 1].date < addDays(nextPay, -1)) {
    return { blockedReason: 'Not enough forecast to see the next pay period yet.', steps };
  }
  const lowDay = window.reduce((a, d) => (d.balanceCents < a.balanceCents ? d : a));
  const low = lowDay.balanceCents;
  const win = { from: payday, to: addDays(nextPay, -1), lowCents: low, lowDate: lowDay.date };
  const spare = Math.floor((low - SAFETY_FLOOR_CENTS) / ROUND_TO_CENTS) * ROUND_TO_CENTS;

  const monthsToCushion = cushionDone || habits <= 0 ? undefined : Math.ceil((CUSHION_GOAL_CENTS - savings - Math.max(0, spare)) / habits);

  if (spare < ROUND_TO_CENTS) {
    return {
      blockedReason: `Next pay period is tight: your lowest point is ${usd(low)}. Ben will keep that money in checking for now.`,
      steps, monthsToCushion, window: win,
    };
  }

  const date = addDays(payday, 1);
  const toKind = !cushionDone ? 'savings' : card && card.balanceCents > 0 ? 'credit_card' : 'ira';
  const lowAfter = low - spare;
  const move = toKind === 'savings'
    ? {
      title: `Move ${usd(spare)} to savings`,
      detail: `On ${day(date)}, the day after payday. Savings goes from ${usd(savings)} to ${usd(savings + spare)}.`,
      why: `After your ${day(payday)} paycheck and every bill until ${day(nextPay)}, your lowest point is ${usd(low)}. Moving ${usd(spare)} still leaves ${usd(lowAfter)} as a buffer, and it grows your cushion from ${usd(savings)} to ${usd(savings + spare)}.`,
    }
    : toKind === 'credit_card'
      ? {
        title: `Pay ${usd(spare)} extra on your card`,
        detail: `On ${day(date)}, the day after payday.`,
        why: `Your cushion is set. Your lowest point before ${day(nextPay)} is ${usd(low)}, so ${usd(spare)} can go to the ${card?.apr}% card and still leave ${usd(lowAfter)}.`,
      }
      : {
        title: `Add ${usd(spare)} to your Roth IRA`,
        detail: `On ${day(date)}, the day after payday.`,
        why: `Cushion set and no card debt. Your lowest point before ${day(nextPay)} is ${usd(low)}, so ${usd(spare)} can be invested and still leave ${usd(lowAfter)}.`,
      };

  return { move: { amountCents: spare, date, toKind, lowAfterCents: lowAfter, ...move }, steps, monthsToCushion, window: win };
}
