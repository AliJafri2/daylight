// Coach chat agent. Gemini answers George's questions, but every number it may use is computed
// here by the deterministic engine first ("the AI never does math"). Answers that contain a
// number not present in the facts or the question are rejected and replaced.
import { spendingInsights, totalMonthly } from '../../shared/insights.ts';
import type { DbConnection } from './module_bindings/index.ts';
import { addDays, buildForecast, healthIndicators, planFixes } from '../../shared/forecast.ts';
import { askGemini } from './coach.ts';
import { readMoney } from './money.ts';
import { day, usd } from './agents.ts';

const log = (...a: unknown[]) => console.log(new Date().toLocaleTimeString(), ...a);

export function buildFacts(conn: DbConnection, question: string) {
  const m = readMoney(conn);
  if (!m) return undefined;
  const f = buildForecast(m.input);
  const h = healthIndicators(f, m.accounts);
  const plan = planFixes(m.input, { accounts: m.accounts, gasPrices: m.gasPrices, groceryPrices: m.groceryPrices, vehicle: m.vehicle });
  const pay = m.input.income[0];

  const lines: string[] = [];
  lines.push(`Today is ${day(m.input.asOf)}. Next payday is ${f.nextPayday ? day(f.nextPayday) : 'unknown'}${pay ? `, ${usd(pay.amountCents)} every ${pay.intervalDays} days` : ''}.`);
  for (const a of m.accounts) {
    const limit = a.creditLimitCents ? ` of a ${usd(a.creditLimitCents)} limit (${Math.round((a.balanceCents / a.creditLimitCents) * 100)}% used)` : '';
    lines.push(`${a.nickname} (${a.kind}): ${usd(a.balanceCents)}${limit}.`);
  }
  if (f.shortfall) {
    lines.push(`Without changes, checking goes to ${usd(f.shortfall.balanceCents)} on ${day(f.shortfall.date)}, ${f.shortfall.daysBeforePayday} days before payday, causing a ${usd(f.overdraftFeesCents)} overdraft fee.`);
  } else {
    lines.push(`Checking stays above $0 until payday. Lowest point: ${usd(f.lowPoint.balanceCents)} on ${day(f.lowPoint.date)}.`);
  }
  lines.push(`Runway: ${h.runwayDays} days. Overdraft risk: ${h.overdraftRisk}. Savings: ${usd(h.savingsCents)}.`);
  lines.push('Upcoming (date: item amount -> checking balance after that day):');
  for (const d of f.days.slice(1)) {
    if (!d.events.length) continue;
    lines.push(`  ${day(d.date)}: ${d.events.map(e => `${e.label} ${usd(e.amountCents)}`).join(', ')} -> ${usd(d.balanceCents)}`);
  }
  if (plan.actions.length) {
    lines.push(`"Stay in the green" plan (needs the user's approval): ${plan.actions.map(a => {
      if (a.kind === 'move_bill') return `pay ${a.payee} on ${day(a.toDate)} instead of ${day(a.fromDate)}, avoiding the ${usd(a.feeAvoidedCents)} fee`;
      if (a.kind === 'grocery_swap') return `buy the usual items at ${a.option.place} for ${usd(a.option.basketCents)} instead of ${usd(a.option.usualBasketCents)}, saving ${usd(a.savingsCents)}`;
      return `fill up at ${a.option.place}, saving ${usd(a.savingsCents)} after drive cost`;
    }).join('; ')}. Result: lowest point ${usd(plan.after.lowPoint.balanceCents)}.`);
  }

  // Affordability: for each dollar amount in the question, the engine computes the effect of
  // spending it tomorrow, so Gemini can answer "can I afford $40?" without doing math.
  const amounts = [...question.matchAll(/\$?\s?(\d{1,5}(?:\.\d{1,2})?)\s?(?:dollars|dólares|bucks)?/gi)]
    .map(x => Math.round(Number(x[1]) * 100))
    .filter(c => c >= 100 && c <= 500000)
    .slice(0, 3);
  for (const cents of amounts) {
    const extra = buildForecast({ ...m.input, spend: [...m.input.spend, { id: 'whatif', category: 'other', place: 'extra', amountCents: cents, date: addDays(m.input.asOf, 1) }] });
    lines.push(extra.shortfall
      ? `If the user spends an extra ${usd(cents)} before payday, checking would go as low as ${usd(extra.lowPoint.balanceCents)} on ${day(extra.lowPoint.date)}, with a ${usd(extra.overdraftFeesCents)} overdraft fee.`
      : `If the user spends an extra ${usd(cents)} before payday, the lowest point would be ${usd(extra.lowPoint.balanceCents)} on ${day(extra.lowPoint.date)}, still above $0.`);
  }

  // Spending habits from last month's purchases (same rules as the Home "Ben noticed" card).
  const txns = [...conn.db.myTransactions.iter()].map(t => ({ merchant: t.merchant, category: t.category, amountCents: Number(t.amountCents), date: t.date }));
  const habits = spendingInsights(txns, m.input.asOf);
  if (habits.length) {
    lines.push(`Spending habits from the last 30 days (monthly savings, after payday; not part of this pay period's plan):`);
    for (const x of habits) lines.push(`  ${x.why} Suggested change: ${x.change}.`);
    lines.push(`  Together these free up about ${usd(totalMonthly(habits))} a month.`);
  }

  return {
    facts: lines.join('\n'),
    summary: f.shortfall
      ? `Here's what I know: without changes you'd be ${usd(-f.shortfall.balanceCents)} short on ${day(f.shortfall.date)}. Tap Stay in the green and I'll find a fix.`
      : `Here's what I know: you stay above $0 until payday. Your lowest point is ${usd(f.lowPoint.balanceCents)} on ${day(f.lowPoint.date)}.`,
  };
}

const CHAT_SYSTEM = `You are Ben, the calm, kind AI money coach inside the Daylight app, for people living paycheck to paycheck.
Answer the user's question in at most 3 short sentences (max 60 words), in plain words.
Use ONLY the numbers and dates in FACTS or in the question. Never calculate, estimate, or invent new numbers.
If the answer needs a number that is not in FACTS, say what you do know and suggest tapping "Stay in the green".
Never suggest payday loans, cash advances, or borrowing. Don't give investment, tax, or legal advice.
Return plain text only.`;

export async function answerCoachQuestion(conn: DbConnection, msg: { id: bigint; text: string }) {
  const built = buildFacts(conn, msg.text);
  let reply = built ? built.summary : "I don't have your numbers yet.";
  if (built) {
    const prompt = `FACTS:\n${built.facts}\n\nQUESTION: ${msg.text}`;
    const answer = await askGemini(CHAT_SYSTEM, prompt, `${built.facts}\n${msg.text}`);
    if (answer) reply = answer;
  }
  await conn.reducers.addCoachReply({ replyTo: msg.id, text: reply });
  log(`coach: answered "${msg.text.slice(0, 40)}"`);
}
