// Daylight 360° summary: three short lines about George's whole financial picture, shown at the top of Plan.
// Right now / Watch out / Next move. It watches BOTH the money and the journey (which agents ran, what was
// approved or scheduled), so "Next move" is always the next step, never an agent already used.
// Gemini writes the wording from engine facts only; a number check rejects anything invented; a template
// (which follows the same journey logic) is the fallback. Regenerated only when money or journey changes.
import type { DbConnection } from './module_bindings/index.ts';
import { buildForecast, healthIndicators } from '../../shared/forecast.ts';
import { spendingInsights, totalMonthly } from '../../shared/insights.ts';
import { nextBestMove } from '../../shared/nextmove.ts';
import { askGemini } from './coach.ts';
import { buildFacts } from './chat.ts';
import { readMoney } from './money.ts';
import { day, usd } from './agents.ts';

const log = (...a: unknown[]) => console.log(new Date().toLocaleTimeString(), ...a);

type Lines = { rightNow: string; watchOut: string; nextMove: string };

const SYSTEM = `You are Ben, the calm, kind AI money coach inside the Daylight app, for people living paycheck to paycheck.
Write a "360° summary" of the user's whole financial picture as JSON with exactly these keys:
{"rightNow": "...", "watchOut": "...", "nextMove": "..."}
- rightNow: where they stand today, across accounts and until payday. Reflect what they already did in JOURNEY (e.g. fixes approved, savings scheduled).
- watchOut: the single biggest risk or cost right now.
- nextMove: the ONE next step, following JOURNEY. Never suggest running an agent JOURNEY says was already run.
  If the Forecasting agent's fixes aren't approved and money runs short, point to the Forecasting agent below.
  Else if the Research agent hasn't run, point to it. Else if the Investing agent hasn't run, point to it.
  Else if the Investing move isn't scheduled yet, say to schedule it. If everything is done, give the most valuable
  real-world action from FACTS (the biggest habit change or paying down the card).
  Agents are right below this summary: say "below", never "on the Plan tab".
Each value is ONE sentence, at most 20 words, plain words, speaking to the user as "you".
Use ONLY numbers and dates that appear in FACTS or JOURNEY. Never calculate or invent numbers.
Never suggest loans or cash advances. Return only the JSON.`;

function readTxns(conn: DbConnection) {
  return [...conn.db.myTransactions.iter()].map(t => ({ merchant: t.merchant, category: t.category, amountCents: Number(t.amountCents), date: t.date }));
}

// Where the user is in the Forecasting -> Research -> Investing journey (from jobs + actions they took).
function journey(conn: DbConnection) {
  const jobs = [...conn.db.myJobs.iter()];
  const actions = [...conn.db.myActions.iter()];
  const latest = (kind: string) => jobs.filter(j => j.kind === kind).sort((a, b) => (a.id < b.id ? 1 : -1))[0];
  const f = latest('forecast');
  const r = latest('research');
  const i = latest('invest');
  const fixes = actions.filter(a => a.kind !== 'transfer');
  const approved = fixes.filter(a => a.status === 'executed').length;
  const waiting = f && f.status === 'ready' ? fixes.filter(a => a.jobId === f.id && a.status === 'proposed').length : 0;
  const transfer = actions.find(a => a.kind === 'transfer' && (a.status === 'executed' || a.status === 'approved'));
  return {
    forecast: approved > 0 ? 'approved' as const : waiting > 0 ? 'waiting' as const : f ? 'ran' as const : 'not_run' as const,
    approved, waiting,
    research: r && r.status === 'done' ? 'ran' as const : 'not_run' as const,
    invest: transfer ? 'scheduled' as const : i && i.status === 'done' ? 'ran' as const : 'not_run' as const,
    transferTitle: transfer?.title,
    transferDate: transfer?.newDate,
  };
}

function journeyText(j: ReturnType<typeof journey>, habitsCents: number, moveTitle?: string) {
  return [
    `Forecasting agent: ${j.forecast === 'approved' ? `ran; user approved ${j.approved} fixes (done in the bank)` : j.forecast === 'waiting' ? `ran; ${j.waiting} fixes found, waiting for the user's approval` : j.forecast === 'ran' ? 'ran' : 'not run yet'}.`,
    `Research agent: ${j.research === 'ran' ? `ran; found about ${usd(habitsCents)} a month in habit changes` : 'not run yet'}.`,
    `Investing agent: ${j.invest === 'scheduled' ? `ran; user scheduled "${j.transferTitle}"${j.transferDate ? ` for ${day(j.transferDate)}` : ''} with the bank` : j.invest === 'ran' ? `ran; suggested ${moveTitle ? `"${moveTitle}"` : 'waiting until there is spare money'}, not scheduled yet` : 'not run yet'}.`,
  ].join('\n');
}

// What the summary depends on. Same fingerprint = no need to call Gemini again.
export function summaryFingerprint(conn: DbConnection): string | undefined {
  const m = readMoney(conn);
  if (!m) return undefined;
  const f = buildForecast(m.input);
  return JSON.stringify({
    sf: f.shortfall ? [f.shortfall.date, f.shortfall.balanceCents] : null,
    low: [f.lowPoint.date, f.lowPoint.balanceCents],
    acc: m.accounts.map(a => [a.kind, a.balanceCents]),
    habits: totalMonthly(spendingInsights(readTxns(conn), m.input.asOf)),
    journey: journey(conn),
  });
}

function template(conn: DbConnection): { lines: Lines; journeyFacts: string } | undefined {
  const m = readMoney(conn);
  if (!m) return undefined;
  const f = buildForecast(m.input);
  const h = healthIndicators(f, m.accounts);
  const insights = spendingInsights(readTxns(conn), m.input.asOf);
  const habits = totalMonthly(insights);
  const nm = nextBestMove(m.input, m.accounts, { habitsMonthlyCents: habits });
  const card = m.accounts.find(a => a.kind === 'credit_card');
  const util = Math.round((h.creditUtilization ?? 0) * 100);
  const j = journey(conn);
  const sf = f.shortfall;
  const top = insights[0];

  const rightNow = sf
    ? `You have ${usd(m.input.startBalanceCents)} in checking, but you'd be ${usd(-sf.balanceCents)} short on ${day(sf.date)}, before payday.`
    : j.forecast === 'approved'
      ? `Your ${j.approved} fixes are in the bank, so you're covered until payday with ${usd(f.lowPoint.balanceCents)} to spare.`
      : `You're covered until payday on ${f.nextPayday ? day(f.nextPayday) : 'soon'}; your lowest point is ${usd(f.lowPoint.balanceCents)}.`;

  const watchOut = sf
    ? `If nothing changes, a ${usd(f.overdraftFeesCents)} overdraft fee hits on ${day(sf.date)}.`
    : card && card.balanceCents > 0
      ? `Your card is ${util}% used at ${card.apr ?? ''}% APR, which costs you interest every month.`.replace(' at % APR', '')
      : `Savings is ${usd(h.savingsCents)}, so one surprise bill could still hurt.`;

  let nextMove: string;
  if (sf && j.forecast !== 'approved') nextMove = j.forecast === 'waiting'
    ? `Approve the ${j.waiting} fixes in the Forecasting agent below to close the gap, no loan.`
    : 'Run the Forecasting agent below: it finds easy fixes that close the gap, no loan.';
  else if (j.research === 'not_run') nextMove = 'Run the Research agent below to find small habit changes that free up money each month.';
  else if (j.invest === 'not_run') nextMove = nm.move
    ? `Run the Investing agent below: ${nm.move.title.toLowerCase()} could start your cushion.`
    : 'Run the Investing agent below to see where spare money should go once you can.';
  else if (j.invest === 'ran' && nm.move) nextMove = `Schedule "${nm.move.title}" in the Investing agent below to grow your cushion.`;
  else if (top) nextMove = `${top.change} at ${top.merchant} to keep about ${usd(top.monthlySavingsCents)} a month, then start on the card.`;
  else nextMove = 'Keep going: Ben is keeping an eye on things until payday.';

  return { lines: { rightNow, watchOut, nextMove }, journeyFacts: journeyText(j, habits, nm.move?.title) };
}

function parse(text: string): Lines | undefined {
  try {
    const j = JSON.parse(text.replace(/^```(?:json)?\s*|\s*```$/g, ''));
    if ([j.rightNow, j.watchOut, j.nextMove].every(v => typeof v === 'string' && v.trim().length > 0 && v.length < 240)) {
      return { rightNow: j.rightNow.trim(), watchOut: j.watchOut.trim(), nextMove: j.nextMove.trim() };
    }
  } catch { /* fall through */ }
  return undefined;
}

export async function writeSummary(conn: DbConnection) {
  const t = template(conn);
  if (!t) return;
  const built = buildFacts(conn, '');
  let lines = t.lines;
  let source = 'template';
  if (built) {
    // The template lines are engine output too, so their numbers count as grounded facts.
    const facts = `${built.facts}\nJOURNEY (what the user has done in Daylight so far):\n${t.journeyFacts}\nSuggested lines (follow their direction): ${t.lines.rightNow} ${t.lines.watchOut} ${t.lines.nextMove}`;
    const text = await askGemini(SYSTEM, `FACTS:\n${facts}`, facts);
    const parsed = text ? parse(text) : undefined;
    if (parsed) { lines = parsed; source = 'gemini'; }
  }
  await conn.reducers.setSummary({ ...lines, source });
  log(`summary: updated (${source})`);
}
