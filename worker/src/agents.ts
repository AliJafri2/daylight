// The agents. Each one is just a Spacetime client writing rows the app streams live:
//   Forecast agent (deterministic) -> Savings agent (deterministic tools) -> Coach agent (Gemini)
//   -> Executor (after the user's approval, writes to Nessie).
import type { DbConnection } from './module_bindings/index.ts';
import { buildForecast, gasOptions, groceryOptions, planFixes, type PlanAction } from '../../shared/forecast.ts';
import { spendingInsights, totalMonthly } from '../../shared/insights.ts';
import { explainAll, type WhyRequest } from './coach.ts';
import { readMoney } from './money.ts';
import { nessie } from './nessie.ts';
import { loadNessieIds } from './sync.ts';
import { SAFETY_FLOOR_CENTS, CUSHION_GOAL_CENTS, nextBestMove } from '../../shared/nextmove.ts';

const STEP_DELAY_MS = Number(process.env.STEP_DELAY_MS ?? 900);
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const log = (...a: unknown[]) => console.log(new Date().toLocaleTimeString(), ...a);

export const usd = (cents: number) => {
  const d = Math.abs(cents) / 100;
  const s = `$${d.toLocaleString('en-US', cents % 100 === 0 ? { maximumFractionDigits: 0 } : { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  return cents < 0 ? `-${s}` : s;
};
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const day = (d: string) => `${MONTHS[Number(d.slice(5, 7)) - 1]} ${Number(d.slice(8, 10))}`;

// ---------- Planning ----------

export async function runPlanJob(conn: DbConnection, jobId: bigint) {
  const step = async (agent: string, message: string) => {
    await conn.reducers.addStep({ jobId, agent, message });
    await sleep(STEP_DELAY_MS);
  };
  try {
    await conn.reducers.claimJob({ jobId });
    log(`job ${jobId}: claimed`);
    const m = readMoney(conn);
    if (!m) throw new Error('No data for this profile yet');

    // 1. Forecast agent (no AI: plain math)
    await step('forecast', 'Forecasting your next 4 weeks…');
    const f = buildForecast(m.input);
    if (!f.shortfall) {
      await step('forecast', `Good news: you stay above $0 until payday. Your lowest point is ${usd(f.lowPoint.balanceCents)} on ${day(f.lowPoint.date)}.`);
      await conn.reducers.setJobStatus({ jobId, status: 'done', gapCents: 0n, gapDate: '' });
      return;
    }
    const sf = f.shortfall;
    await step('forecast', `You'd be ${usd(-sf.balanceCents)} short on ${day(sf.date)}, ${sf.daysBeforePayday ?? '?'} days before payday. That's a ${usd(f.overdraftFeesCents)} overdraft fee.`);

    // 2. Savings agent (deterministic tools over bills, stores and gas stations)
    const plan = planFixes(m.input, { accounts: m.accounts, gasPrices: m.gasPrices, groceryPrices: m.groceryPrices, vehicle: m.vehicle });
    await step('savings', 'Checking which bills can safely move past payday…');
    const move = plan.actions.find(a => a.kind === 'move_bill');
    await step('savings', move && move.kind === 'move_bill'
      ? `${move.payee} (${usd(move.amountCents)}) can move from ${day(move.fromDate)} to ${day(move.toDate)}, the day after payday, without a late fee.`
      : 'No bills can safely move this time.');

    const trip = m.input.spend.filter(s => s.category === 'groceries' && s.date <= sf.date).sort((a, b) => b.date.localeCompare(a.date))[0];
    if (trip) {
      await step('savings', `Comparing your usual groceries at ${new Set(m.groceryPrices.map(p => p.place)).size} stores near you, counting the drive…`);
      const fuel = m.gasPrices.find(p => p.place === 'Shell')?.priceCents ?? 359;
      const opts = groceryOptions(trip.place, m.groceryPrices, m.vehicle, fuel);
      const best = opts[0];
      if (best && best.netSavingsCents > 0) {
        await step('savings', best.place === trip.place
          ? `Store brand at ${best.place} saves ${usd(best.netSavingsCents)} on your usual items.`
          : `${best.place} has your usual items for ${usd(best.basketCents)} vs ${usd(best.usualBasketCents)} at ${trip.place}: ${usd(best.netSavingsCents)} less, even after the drive.`);
      }
    }

    const fill = m.input.spend.filter(s => s.category === 'gas' && s.date <= sf.date).sort((a, b) => b.date.localeCompare(a.date))[0];
    if (fill) {
      await step('savings', 'Comparing gas near you, net of the extra driving…');
      const opts = gasOptions(fill.place, fill.amountCents, m.gasPrices, m.vehicle);
      const best = opts[0];
      const cheapest = [...opts].sort((a, b) => a.priceCents - b.priceCents)[0];
      if (best && cheapest && cheapest.place !== best.place) {
        await step('savings', `${cheapest.place} is cheapest per gallon, but the ${cheapest.extraRoundTripMiles.toFixed(0)}-mile round trip eats it. ${best.place} saves you ${usd(best.netSavingsCents)}.`);
      } else if (best) {
        await step('savings', `${best.place} saves you ${usd(best.netSavingsCents)} on your next fill-up.`);
      }
    }

    const low = plan.after.lowPoint.balanceCents;
    await step('forecast', `Re-checking your forecast with these fixes… You'd stay above $0 and end the pay period at ${usd(low)}.`);

    // 3. Coach agent (Gemini): plain-language "Why?" for each action, numbers supplied by the engine
    await step('coach', 'Writing it up in plain English…');
    const requests = plan.actions.map(a => whyRequest(a, f, plan.after));
    const { whys, source } = await explainAll(requests);
    log(`job ${jobId}: explanations from ${source}`);

    let order = 0;
    for (const [i, a] of plan.actions.entries()) {
      await conn.reducers.addAction(actionRow(jobId, a, whys[i], order++));
    }
    const fees = usd(plan.feesAvoidedCents);
    await conn.reducers.addStep({
      jobId, agent: 'coach',
      message: `Plan ready: avoid a ${fees} overdraft fee, save ${usd(plan.totalSavingsCents)}, and end at ${usd(low)} instead of ${usd(sf.balanceCents)}. Nothing happens until you approve.`,
    });
    await conn.reducers.setJobStatus({ jobId, status: 'ready', gapCents: BigInt(-sf.balanceCents), gapDate: sf.date });
    log(`job ${jobId}: ready with ${plan.actions.length} actions`);
  } catch (err) {
    log(`job ${jobId}: failed`, String(err));
    await conn.reducers.addStep({ jobId, agent: 'forecast', message: 'Something went wrong while planning. Please try again.' }).catch(() => {});
    await conn.reducers.setJobStatus({ jobId, status: 'failed', gapCents: 0n, gapDate: '' }).catch(() => {});
  }
}

function whyRequest(a: PlanAction, f: ReturnType<typeof buildForecast>, after: ReturnType<typeof buildForecast>): WhyRequest {
  const sf = f.shortfall!;
  if (a.kind === 'move_bill') {
    return {
      facts: `Move ${a.payee} (${usd(a.amountCents)}) from ${day(a.fromDate)} to ${day(a.toDate)}. Payday is the day before ${day(a.toDate)}. Without changes the balance hits ${usd(sf.balanceCents)} on ${day(sf.date)} and the bank charges a ${usd(a.feeAvoidedCents || 3600)} overdraft fee. No late fee if paid by ${day(a.toDate)}.`,
      fallback: {
        en: `Paying ${a.payee} on ${day(a.toDate)}, right after payday, keeps ${usd(a.amountCents)} in your account when your car payment comes out. That avoids a ${usd(a.feeAvoidedCents || 3600)} overdraft fee, with no late fee.`,
      },
    };
  }
  if (a.kind === 'grocery_swap') {
    const o = a.option;
    return {
      facts: `Buy the usual ${o.items.length} items at ${o.place} instead of ${a.fromPlace} on ${day(a.date)}: ${usd(o.basketCents)} instead of ${usd(o.usualBasketCents)}. Extra driving costs ${usd(o.driveCostCents)}. Net savings ${usd(a.savingsCents)}.`,
      fallback: {
        en: `The same ${o.items.length} items cost ${usd(o.basketCents)} at ${o.place} instead of ${usd(o.usualBasketCents)} at ${a.fromPlace}. Even counting the drive, you keep ${usd(a.savingsCents)}.`,
      },
    };
  }
  const o = a.option;
  return {
    facts: `Fill up at ${o.place} (${usd(o.priceCents)} per gallon) instead of ${a.fromPlace} on ${day(a.date)}. About ${o.gallons.toFixed(0)} gallons. Extra driving ${o.extraRoundTripMiles.toFixed(1)} miles costs ${usd(o.driveCostCents)}. Net savings ${usd(a.savingsCents)}. Ending balance after all fixes ${usd(after.lowPoint.balanceCents)}.`,
    fallback: {
      en: `${o.place} is ${usd(o.priceCents)} a gallon. After the ${o.extraRoundTripMiles.toFixed(1)} extra miles, you still save ${usd(a.savingsCents)} on this fill-up.`,
    },
  };
}

function actionRow(jobId: bigint, a: PlanAction, why: { en: string }, sortOrder: number) {
  const base = {
    jobId, kind: a.kind, savingsCents: BigInt(a.savingsCents), feeAvoidedCents: BigInt(a.feeAvoidedCents),
    whyEn: why.en, sortOrder,
    billId: undefined as bigint | undefined, newDate: undefined as string | undefined,
    spendId: undefined as bigint | undefined, spendDeltaCents: undefined as bigint | undefined, newPlace: undefined as string | undefined,
  };
  const weekday = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' });
  if (a.kind === 'move_bill') {
    const days = Math.round((Date.parse(a.toDate) - Date.parse(a.fromDate)) / 86_400_000);
    const later = days % 7 === 0 ? `${days / 7} week${days === 7 ? '' : 's'} later` : `${days} days later`;
    return {
      ...base,
      title: `Pay ${a.payee.toLowerCase()} ${later}`,
      detail: `On ${day(a.toDate)}, the day after payday, instead of ${day(a.fromDate)}. No late fee.`,
      billId: BigInt(a.billId), newDate: a.toDate,
    };
  }
  if (a.kind === 'grocery_swap') {
    const o = a.option;
    return {
      ...base,
      title: `Shop at ${o.place} on ${weekday(a.date)}`,
      detail: `Same ${o.items.length} groceries for ${usd(o.basketCents)} instead of ${usd(o.usualBasketCents)} at ${a.fromPlace}, even counting the drive.`,
      spendId: BigInt(a.spendId), spendDeltaCents: BigInt(-a.savingsCents), newPlace: o.place,
    };
  }
  const o = a.option;
  return {
    ...base,
    title: `Get gas at ${o.place} on ${weekday(a.date)}`,
    detail: `${usd(o.priceCents)} a gallon instead of ${usd(Math.round(o.priceCents + (o.grossSavingsCents / o.gallons)))} at ${a.fromPlace}, even counting the drive.`,
    spendId: BigInt(a.spendId), spendDeltaCents: BigInt(-a.savingsCents), newPlace: o.place,
  };
}

// ---------- Research agent: reads last month's purchases, finds habits worth changing ----------

async function runSimpleJob(conn: DbConnection, jobId: bigint, agent: string, body: (step: (m: string) => Promise<void>) => Promise<void>) {
  const step = async (message: string) => {
    await conn.reducers.addStep({ jobId, agent, message });
    await sleep(STEP_DELAY_MS);
  };
  try {
    await conn.reducers.claimJob({ jobId });
    log(`job ${jobId} (${agent}): claimed`);
    await body(step);
    await conn.reducers.setJobStatus({ jobId, status: 'done', gapCents: 0n, gapDate: '' });
    log(`job ${jobId} (${agent}): done`);
  } catch (err) {
    log(`job ${jobId} (${agent}): failed`, String(err));
    await conn.reducers.addStep({ jobId, agent, message: 'Something went wrong. Please try again.' }).catch(() => {});
    await conn.reducers.setJobStatus({ jobId, status: 'failed', gapCents: 0n, gapDate: '' }).catch(() => {});
  }
}

const readTxns = (conn: DbConnection) =>
  [...conn.db.myTransactions.iter()].map(t => ({ merchant: t.merchant, category: t.category, amountCents: Number(t.amountCents), date: t.date }));

export function runResearchJob(conn: DbConnection, jobId: bigint) {
  return runSimpleJob(conn, jobId, 'research', async step => {
    const m = readMoney(conn);
    if (!m) throw new Error('No data for this profile yet');
    const txns = readTxns(conn).filter(t => t.date < m.input.asOf).sort((a, b) => a.date.localeCompare(b.date));
    await step('Reading your purchases from the bank…');
    if (!txns.length) { await step('No purchases yet. Check back after you spend a little.'); return; }
    await step(`Found ${txns.length} purchases from ${day(txns[0].date)} to ${day(txns[txns.length - 1].date)}.`);

    await step('Grouping them by category…');
    const byCat = new Map<string, number>();
    for (const t of txns) byCat.set(t.category, (byCat.get(t.category) ?? 0) + t.amountCents);
    const top = [...byCat].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([c, v]) => `${c} ${usd(v)}`).join(', ');
    await step(`Biggest categories: ${top}.`);

    await step('Looking for habits you could change…');
    const habits = spendingInsights(txns, m.input.asOf);
    for (const h of habits) await step(`${h.title}. ${h.change}: about ${usd(h.monthlySavingsCents)} a month.`);
    await step(habits.length
      ? `Found about ${usd(totalMonthly(habits))} a month you could keep. Nothing changes unless you decide to.`
      : 'Your spending looks steady. Nothing stands out to change.');
  });
}

// ---------- Investing agent: where spare money should go once the pay period is safe ----------

export function runInvestJob(conn: DbConnection, jobId: bigint) {
  return runSimpleJob(conn, jobId, 'invest', async step => {
    const m = readMoney(conn);
    if (!m) throw new Error('No data for this profile yet');
    const habits = totalMonthly(spendingInsights(readTxns(conn), m.input.asOf));
    const nm = nextBestMove(m.input, m.accounts, { habitsMonthlyCents: habits });

    await step('Checking this pay period first…');
    const f = buildForecast(m.input);
    if (f.shortfall) {
      await step(`You'd still be ${usd(-f.shortfall.balanceCents)} short on ${day(f.shortfall.date)}. Run the Forecasting agent first: no spare money until that's fixed.`);
      return;
    }
    await step('This pay period is covered.');

    if (nm.window) {
      await step(`Looking ahead to your next pay period (${day(nm.window.from)} to ${day(nm.window.to)})…`);
      await step(`Lowest point: ${usd(nm.window.lowCents)} on ${day(nm.window.lowDate)}. I always keep at least ${usd(SAFETY_FLOOR_CENTS)} in checking.`);
    }

    await step('Comparing where spare money does the most good…');
    const card = m.accounts.find(a => a.kind === 'credit_card');
    const savings = m.accounts.filter(a => a.kind === 'savings').reduce((s, a) => s + a.balanceCents, 0);
    await step(`Savings: ${usd(savings)} of a ${usd(CUSHION_GOAL_CENTS)} cushion.${card?.apr ? ` Card: ${usd(card.balanceCents)} at ${card.apr}% APR.` : ''} Cushion comes first, then the card, then investing.`);

    await step(nm.move ? `Suggestion: ${nm.move.title.toLowerCase()} on ${day(nm.move.date)}. Nothing moves until you tap.` : (nm.blockedReason ?? 'No spare money this time.'));
  });
}

// ---------- Executor (only after the user's approval) ----------

export async function executeAction(conn: DbConnection, actionId: bigint, resync: () => Promise<void>) {
  const a = [...conn.db.myActions.iter()].find(x => x.id === actionId);
  if (!a || a.status !== 'approved') return;
  const say = (message: string) => conn.reducers.addStep({ jobId: a.jobId, agent: 'executor', message }).catch(() => {});
  try {
    if (a.kind === 'move_bill' && a.billId !== undefined && a.newDate) {
      let bill = [...conn.db.myBills.iter()].find(b => b.id === a.billId);
      if (bill && !bill.nessieBillId) {
        await resync();
        bill = [...conn.db.myBills.iter()].find(b => b.id === a.billId);
      }
      if (!bill?.nessieBillId) throw new Error('Bill is not linked to the bank yet');
      await nessie.moveBill(bill.nessieBillId, a.newDate);
      await conn.reducers.markActionExecuted({ actionId, ok: true, nessieRef: bill.nessieBillId });
      await say(`Done: ${bill.payee} now pays on ${day(a.newDate)} in your bank account (Nessie).`);
    } else if (a.kind === 'transfer' && a.newDate) {
      // Guardrail: re-check with the engine before touching the bank. Never dip below the $100 floor.
      const m = readMoney(conn);
      if (!m) throw new Error('No data yet');
      const amount = Number(a.savingsCents);
      const f = buildForecast({ ...m.input, spend: [...m.input.spend, { id: 'move', category: 'savings', place: 'Savings', amountCents: amount, date: a.newDate }] });
      const low = Math.min(...f.days.map(d => d.balanceCents));
      if (f.shortfall || low < SAFETY_FLOOR_CENTS) {
        await conn.reducers.markActionExecuted({ actionId, ok: false, nessieRef: undefined });
        await say(`I didn't move ${usd(amount)}: it would leave you with ${usd(low)}, below the $100 floor. Nothing was changed.`);
        return;
      }
      const ids = loadNessieIds();
      const desc = 'Daylight: move to savings';
      await nessie.withdraw(ids.accounts.checking, amount / 100, a.newDate, desc);
      const dep = await nessie.deposit(ids.accounts.savings, amount / 100, a.newDate, desc);
      await conn.reducers.markActionExecuted({ actionId, ok: true, nessieRef: dep.objectCreated._id });
      await say(`Done: ${usd(amount)} moves from checking to savings on ${day(a.newDate)} in your bank account (Nessie).`);
    } else {
      await conn.reducers.markActionExecuted({ actionId, ok: true, nessieRef: undefined });
      await say(`Added to your plan: ${a.title}.`);
    }
    log(`action ${actionId}: executed (${a.kind})`);
  } catch (err) {
    log(`action ${actionId}: failed`, String(err));
    await conn.reducers.markActionExecuted({ actionId, ok: false, nessieRef: undefined }).catch(() => {});
    await say(`Couldn't complete "${a.title}". Nothing was changed.`);
  }
}

// ---------- Demo reset: put moved bills back in Nessie ----------

export async function restoreNessieBills(conn: DbConnection, checkingId: string) {
  const bills = await nessie.bills(checkingId);
  const mine = [...conn.db.myBills.iter()];
  let moved = 0;
  for (const nb of bills) {
    const sb = mine.find(b => b.payee === nb.payee);
    if (sb && sb.dueDate !== nb.payment_date) {
      await nessie.moveBill(nb._id, sb.dueDate);
      moved++;
    }
  }
  await conn.reducers.ackNessieReset({});
  return moved;
}
