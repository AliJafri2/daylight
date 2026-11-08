// The agents. Each one is just a Spacetime client writing rows the app streams live:
//   Forecast agent (deterministic) -> Savings agent (deterministic tools) -> Coach agent (Gemini)
//   -> Executor (after the user's approval, writes to Nessie).
import type { DbConnection } from './module_bindings/index.ts';
import { buildForecast, gasOptions, groceryOptions, planFixes, type PlanAction } from '../../shared/forecast.ts';
import { explainAll, type WhyRequest } from './coach.ts';
import { readMoney } from './money.ts';
import { nessie } from './nessie.ts';

const STEP_DELAY_MS = Number(process.env.STEP_DELAY_MS ?? 900);
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const log = (...a: unknown[]) => console.log(new Date().toLocaleTimeString(), ...a);

export const usd = (cents: number) => {
  const d = Math.abs(cents) / 100;
  const s = cents % 100 === 0 ? `$${d.toFixed(0)}` : `$${d.toFixed(2)}`;
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
    await step('coach', 'Writing it up in plain English and Spanish…');
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
        es: `Pagar ${a.payee === 'Car insurance' ? 'el seguro del auto' : a.payee} el ${Number(a.toDate.slice(8))} de noviembre, justo después del día de pago, deja ${usd(a.amountCents)} en tu cuenta cuando sale el pago del auto. Así evitas un cargo por sobregiro de ${usd(a.feeAvoidedCents || 3600)}, sin recargo por atraso.`,
      },
    };
  }
  if (a.kind === 'grocery_swap') {
    const o = a.option;
    return {
      facts: `Buy the usual ${o.items.length} items at ${o.place} instead of ${a.fromPlace} on ${day(a.date)}: ${usd(o.basketCents)} instead of ${usd(o.usualBasketCents)}. Extra driving costs ${usd(o.driveCostCents)}. Net savings ${usd(a.savingsCents)}.`,
      fallback: {
        en: `The same ${o.items.length} items cost ${usd(o.basketCents)} at ${o.place} instead of ${usd(o.usualBasketCents)} at ${a.fromPlace}. Even counting the drive, you keep ${usd(a.savingsCents)}.`,
        es: `Los mismos ${o.items.length} productos cuestan ${usd(o.basketCents)} en ${o.place} en vez de ${usd(o.usualBasketCents)} en ${a.fromPlace}. Aun contando el viaje, te ahorras ${usd(a.savingsCents)}.`,
      },
    };
  }
  const o = a.option;
  return {
    facts: `Fill up at ${o.place} (${usd(o.priceCents)} per gallon) instead of ${a.fromPlace} on ${day(a.date)}. About ${o.gallons.toFixed(0)} gallons. Extra driving ${o.extraRoundTripMiles.toFixed(1)} miles costs ${usd(o.driveCostCents)}. Net savings ${usd(a.savingsCents)}. Ending balance after all fixes ${usd(after.lowPoint.balanceCents)}.`,
    fallback: {
      en: `${o.place} is ${usd(o.priceCents)} a gallon. After the ${o.extraRoundTripMiles.toFixed(1)} extra miles, you still save ${usd(a.savingsCents)} on this fill-up.`,
      es: `${o.place} cuesta ${usd(o.priceCents)} por galón. Después de las ${o.extraRoundTripMiles.toFixed(1)} millas extra, aún ahorras ${usd(a.savingsCents)} en esta carga.`,
    },
  };
}

function actionRow(jobId: bigint, a: PlanAction, why: { en: string; es: string }, sortOrder: number) {
  const base = {
    jobId, kind: a.kind, savingsCents: BigInt(a.savingsCents), feeAvoidedCents: BigInt(a.feeAvoidedCents),
    whyEn: why.en, whyEs: why.es, sortOrder,
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
