// Receipt agent: Gemini Vision reads the photo into lines (name, price, qty, price-book key).
// The savings math is shared/receipt.ts (no AI math). The photo is deleted once read.
import type { DbConnection } from './module_bindings/index.ts';
import { ALT_STORE, PRICE_BOOK, SAMPLE_RECEIPT, compareReceipt, type ReceiptLine } from '../../shared/receipt.ts';
import { usd } from './agents.ts';

const KEY = process.env.GEMINI_API_KEY ?? '';
const MODEL = process.env.GEMINI_MODEL ?? 'gemini-3.8-flash';
const STEP_DELAY_MS = Number(process.env.STEP_DELAY_MS ?? 900);
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const log = (...a: unknown[]) => console.log(new Date().toLocaleTimeString(), ...a);

const PROMPT = `This is a photo of a shopping receipt. Read every purchased line item.
Return JSON: {"store": string, "items": [{"name": string, "price": number, "qty": number, "key": string | null}]}
- name: the line as printed (short).
- price: the line total in dollars as printed (e.g. 4.29). Skip subtotal, tax, total, payment and discount lines.
- qty: how many units or pounds the line covers in the unit of its key (e.g. "2LB" ground beef = 2, a 2-pack of cereal = 2, 2.1 lb bananas = 2.1). Use 1 if unsure.
- key: the closest match from this list, or null if none fits (do not guess wildly):
${Object.entries(PRICE_BOOK).map(([k, [label, unit]]) => `  ${k} = ${label} (${unit})`).join('\n')}
If the image is not a receipt, return {"store": "", "items": []}.`;

async function readReceipt(mime: string, data: string): Promise<{ store: string; lines: ReceiptLine[] } | undefined> {
  if (!KEY) return undefined;
  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': KEY },
      signal: AbortSignal.timeout(30_000),
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ inline_data: { mime_type: mime, data } }, { text: PROMPT }] }],
        generationConfig: { temperature: 0, responseMimeType: 'application/json', thinkingConfig: { thinkingLevel: 'low' } },
      }),
    });
    if (!res.ok) throw new Error(`Gemini ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const body = await res.json();
    const parts: Array<{ text?: string; thought?: boolean }> = body?.candidates?.[0]?.content?.parts ?? [];
    const j = JSON.parse(parts.filter(p => !p.thought && p.text).map(p => p.text).join(''));
    const lines: ReceiptLine[] = (Array.isArray(j.items) ? j.items : [])
      .filter((i: any) => typeof i?.name === 'string' && typeof i?.price === 'number' && i.price > 0 && i.price < 500)
      .slice(0, 60)
      .map((i: any) => ({
        name: i.name.slice(0, 80),
        paidCents: Math.round(i.price * 100),
        qty: typeof i.qty === 'number' && i.qty > 0 && i.qty < 50 ? i.qty : 1,
        key: typeof i.key === 'string' && PRICE_BOOK[i.key] ? i.key : null,
      }));
    return { store: typeof j.store === 'string' ? j.store.slice(0, 60) : '', lines };
  } catch (err) {
    log('receipt: Gemini failed:', String(err).replaceAll(KEY || '\u0000', '***'));
    return undefined;
  }
}

export async function runReceiptJob(conn: DbConnection, jobId: bigint) {
  const r = [...conn.db.myReceipts.iter()].find(x => x.jobId === jobId);
  const step = async (message: string) => {
    await conn.reducers.addStep({ jobId, agent: 'receipt', message });
    await sleep(STEP_DELAY_MS);
  };
  if (!r) return;
  try {
    await conn.reducers.claimJob({ jobId });
    // The image row can arrive a moment after the receipt row.
    let img = conn.db.myReceiptImages.receiptId.find(r.id);
    for (let i = 0; !img && i < 20; i++) { await sleep(250); img = conn.db.myReceiptImages.receiptId.find(r.id); }
    if (!img) throw new Error('photo missing');

    await step('Reading your receipt…');
    let read = await readReceipt(img.mime, img.data);
    if (!read && r.isSample) read = { store: SAMPLE_RECEIPT.store, lines: SAMPLE_RECEIPT.lines }; // demo never dies
    if (!read || read.lines.length === 0) {
      await step("I couldn't read any items. Try a flatter, brighter photo.");
      await conn.reducers.finishReceipt({ receiptId: r.id, ok: false, store: '', totalCents: 0n, savingsCents: 0n });
      await conn.reducers.setJobStatus({ jobId, status: 'done', gapCents: 0n, gapDate: '' });
      return;
    }
    const cmp = compareReceipt(read.lines);
    const matched = cmp.items.filter(i => i.key).length;
    await step(`Found ${read.lines.length} items${read.store ? ` from ${read.store}` : ''}, ${usd(cmp.totalPaidCents)} total.`);
    await step(`Comparing ${matched} groceries with store-brand prices at ${ALT_STORE}…`);
    for (const s of cmp.swaps.slice(0, 3)) {
      await step(`${s.label}: you paid ${usd(s.paidCents)}, ${ALT_STORE} has it for ${usd(s.altCents!)}.`);
    }
    for (const i of cmp.items) {
      await conn.reducers.addReceiptItem({
        receiptId: r.id, name: i.name, label: i.label ?? '', qty: i.qty, paidCents: BigInt(i.paidCents),
        altCents: i.altCents === undefined ? undefined : BigInt(i.altCents), savingsCents: BigInt(i.savingsCents),
      });
    }
    await step(cmp.swaps.length
      ? `${cmp.swaps.length} items would be ${usd(cmp.savingsCents)} cheaper at ${ALT_STORE}. That's a free ${usd(cmp.savingsCents)} on your next trip.`
      : 'You already got good prices on this trip. Nice.');
    await conn.reducers.finishReceipt({ receiptId: r.id, ok: true, store: read.store, totalCents: BigInt(cmp.totalPaidCents), savingsCents: BigInt(cmp.savingsCents) });
    await conn.reducers.setJobStatus({ jobId, status: 'done', gapCents: 0n, gapDate: '' });
    log(`receipt ${r.id}: ${read.lines.length} lines, saves ${usd(cmp.savingsCents)}`);
  } catch (err) {
    log(`receipt ${r.id}: failed`, String(err));
    await conn.reducers.addStep({ jobId, agent: 'receipt', message: "Something went wrong reading that receipt. Please try again." }).catch(() => {});
    await conn.reducers.finishReceipt({ receiptId: r.id, ok: false, store: '', totalCents: 0n, savingsCents: 0n }).catch(() => {});
    await conn.reducers.setJobStatus({ jobId, status: 'failed', gapCents: 0n, gapDate: '' }).catch(() => {});
  }
}
