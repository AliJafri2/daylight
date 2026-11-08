// Coach agent: Gemini turns engine facts into a 1-2 sentence plain-language "Why?".
// Strict rule: it may only use numbers we pass in. If Gemini is slow or fails, we use templates,
// so the demo never waits on the AI.

const KEY = process.env.GEMINI_API_KEY ?? '';
const MODEL = process.env.GEMINI_MODEL ?? 'gemini-3.8-flash';
const TIMEOUT_MS = 10_000;

export type Why = { en: string };
export type WhyRequest = { facts: string; fallback: Why };

const SYSTEM = `You are Ben, the AI money coach inside the MinMax app, for people living paycheck to paycheck.
For each numbered item, write ONE or TWO short sentences (max 40 words) explaining why this move helps,
in plain words a stressed parent understands at a glance. Speak to the user as "you".
Use ONLY the numbers and facts given. Never invent, round differently, or add numbers. No jargon, no exclamation marks.
Return JSON: an array with one object {"en": string} per item, in the same order.`;

export async function explainAll(items: WhyRequest[]): Promise<{ whys: Why[]; source: 'gemini' | 'fallback' }> {
  if (!KEY || items.length === 0) return { whys: items.map(i => i.fallback), source: 'fallback' };
  try {
    const prompt = items.map((it, i) => `${i + 1}. ${it.facts}`).join('\n');
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': KEY },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM }] },
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: 'application/json',
          temperature: 0.3,
          thinkingConfig: { thinkingLevel: 'low' }, // fast; 'minimal' is not supported on 3.8
        },
      }),
    });
    if (!res.ok) throw new Error(`Gemini ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const data = await res.json();
    const parts: Array<{ text?: string; thought?: boolean }> = data?.candidates?.[0]?.content?.parts ?? [];
    const text = parts.filter(p => !p.thought && p.text).map(p => p.text).join('');
    const parsed = JSON.parse(text) as Why[];
    if (!Array.isArray(parsed) || parsed.length !== items.length) throw new Error('Gemini returned the wrong shape');
    const whys = parsed.map((w, i) =>
      typeof w?.en === 'string' && numbersAreGrounded(w, items[i].facts) ? w : items[i].fallback
    );
    return { whys, source: 'gemini' };
  } catch (err) {
    console.log('coach: using fallback explanations:', String(err).replaceAll(KEY, '***'));
    return { whys: items.map(i => i.fallback), source: 'fallback' };
  }
}

/** Guard against hallucinated figures: every number in the answer must appear in the source text. */
function numbersAreGrounded(w: Why, facts: string) {
  return textIsGrounded(w.en, facts);
}

function numbersIn(s: string) {
  return (s.replace(/(\d),(\d{3})\b/g, '$1$2').match(/\d+(?:[.,]\d+)?/g) ?? []).map(x => x.replace(',', '.'));
}

export function textIsGrounded(answer: string, source: string) {
  const allowed = new Set(numbersIn(source));
  return numbersIn(answer).every(x => allowed.has(x) || allowed.has(x.replace(/\.0+$/, '')));
}

/** Free-form answer (coach chat). Returns undefined on timeout, error, or an ungrounded number. */
export async function askGemini(system: string, prompt: string, groundingSource: string): Promise<string | undefined> {
  if (!KEY) return undefined;
  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': KEY },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.3, thinkingConfig: { thinkingLevel: 'low' } },
      }),
    });
    if (!res.ok) throw new Error(`Gemini ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const data = await res.json();
    const parts: Array<{ text?: string; thought?: boolean }> = data?.candidates?.[0]?.content?.parts ?? [];
    const text = parts.filter(p => !p.thought && p.text).map(p => p.text).join('').trim();
    if (!text) throw new Error('empty answer');
    if (!textIsGrounded(text, groundingSource)) {
      console.log('coach: rejected an answer with a number not in the facts:', text.slice(0, 160));
      return undefined;
    }
    return text;
  } catch (err) {
    console.log('coach: chat fallback:', String(err).replaceAll(KEY, '***'));
    return undefined;
  }
}
