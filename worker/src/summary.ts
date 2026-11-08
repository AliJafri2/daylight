// 360° summary: three short lines about George's whole financial picture, shown at the top of Plan.
// Right now / Watch out / Next move. Gemini writes the wording from engine facts only; a number check
// rejects anything invented, and a template is the fallback. Regenerated only when the numbers change.
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
- rightNow: where they stand today, across accounts and until payday.
- watchOut: the single biggest risk or cost right now.
- nextMove: the one most useful thing to do next. You may point to the "Forecasting agent", "Research agent" or "Investing agent" (they are right below this summary; say "below", never "on the Plan tab").
Each value is ONE sentence, at most 18 words, plain words, speaking to the user as "you".
Use ONLY numbers and dates that appear in FACTS. Never calculate or invent numbers.
Never suggest loans or cash advances. Return only the JSON.`;

function readTxns(conn: DbConnection) {
  return [...conn.db.myTransactions.iter()].map(t => ({ merchant: t.merchant, category: t.category, amountCents: Number(t.amountCents), date: t.date }));
}

// What the summary depends on. Same fingerprint = no need to call Gemini again.
export function summaryFingerprint(conn: DbConnection): string | undefined {
  const m = readMoney(conn);
  if (!m) return undefined;
  const f = buildForecast(m.input);
  const moves = [...conn.db.myActions.iter()].filter(a => a.kind === 'transfer' && a.status === 'executed').map(a => String(a.id));
  return JSON.stringify({
    sf: f.shortfall ? [f.shortfall.date, f.shortfall.balanceCents] : null,
    low: [f.lowPoint.date, f.lowPoint.balanceCents],
    acc: m.accounts.map(a => [a.kind, a.balanceCents]),
    habits: totalMonthly(spendingInsights(readTxns(conn), m.input.asOf)),
    moves,
  });
}

function template(conn: DbConnection): Lines | undefined {
  const m = readMoney(conn);
  if (!m) return undefined;
  const f = buildForecast(m.input);
  const h = healthIndicators(f, m.accounts);
  const habits = totalMonthly(spendingInsights(readTxns(conn), m.input.asOf));
  const nm = nextBestMove(m.input, m.accounts, { habitsMonthlyCents: habits });
  const card = m.accounts.find(a => a.kind === 'credit_card');
  const util = Math.round((h.creditUtilization ?? 0) * 100);
  const scheduled = [...conn.db.myActions.iter()].find(a => a.kind === 'transfer' && a.status === 'executed');
  const sf = f.shortfall;

  return {
    rightNow: sf
      ? `You have ${usd(m.input.startBalanceCents)} in checking, but you'd be ${usd(-sf.balanceCents)} short on ${day(sf.date)}, before payday.`
      : `You're covered until payday on ${f.nextPayday ? day(f.nextPayday) : 'soon'}; your lowest point is ${usd(f.lowPoint.balanceCents)}.`,
    watchOut: sf
      ? `If nothing changes, a ${usd(f.overdraftFeesCents)} overdraft fee hits on ${day(sf.date)}.`
      : card && card.balanceCents > 0
        ? `Your card is ${util}% used, costing interest every month.`
        : `Savings is ${usd(h.savingsCents)}, so one surprise bill could still hurt.`,
    nextMove: sf
      ? 'Run the Forecasting agent: it finds easy fixes that close the gap, no loan.'
      : scheduled
        ? `${scheduled.title} is scheduled. Next, the Research agent found ${usd(habits)} a month in small changes.`
        : nm.move
          ? `${nm.move.title} on ${day(nm.move.date)}; the Investing agent can schedule it.`
          : habits > 0
            ? `The Research agent found ${usd(habits)} a month in small spending changes.`
            : 'Keep going; Ben is keeping an eye on things.',
  };
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
  const fallback = template(conn);
  if (!fallback) return;
  const built = buildFacts(conn, '');
  let lines = fallback;
  let source = 'template';
  if (built) {
    // The template lines are engine output too, so their numbers count as grounded facts.
    const facts = `${built.facts}\nHints: ${fallback.rightNow} ${fallback.watchOut} ${fallback.nextMove}`;
    const text = await askGemini(SYSTEM, `FACTS:\n${facts}`, facts);
    const parsed = text ? parse(text) : undefined;
    if (parsed) { lines = parsed; source = 'gemini'; }
  }
  await conn.reducers.setSummary({ ...lines, source });
  log(`summary: updated (${source})`);
}
