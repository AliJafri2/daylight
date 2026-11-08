// Scan a receipt: photo -> Spacetime -> worker (Gemini Vision reads it) -> store-brand prices at Aldi.
// The phone shrinks the photo first (~150 KB). The worker deletes the photo once it's read.
import { useMemo, useRef, useState } from 'react';
import { useSpacetimeDB, useTable } from 'spacetimedb/react';
import { tables, type DbConnection } from './module_bindings';
import { Icon, usd } from './ui';

const time = (ts: { microsSinceUnixEpoch: bigint }) => Number(ts.microsSinceUnixEpoch / 1000n);

async function shrink(blob: Blob, max = 1280): Promise<string> {
  const bmp = await createImageBitmap(blob);
  const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bmp.width * scale);
  canvas.height = Math.round(bmp.height * scale);
  canvas.getContext('2d')!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', 0.72).split(',')[1];
}

export default function ReceiptScanner() {
  const { isActive, getConnection } = useSpacetimeDB();
  const conn = getConnection() as DbConnection | null;
  const [receipts] = useTable(tables.myReceipts);
  const [items] = useTable(tables.myReceiptItems);
  const [steps] = useTable(tables.mySteps);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fresh, setFresh] = useState(false); // hide the old result after "Scan another"
  const input = useRef<HTMLInputElement>(null);

  const r = useMemo(() => [...receipts].sort((a, b) => (a.id < b.id ? 1 : -1))[0], [receipts]);
  const rSteps = useMemo(() => (r ? steps.filter(s => s.jobId === r.jobId).sort((a, b) => time(a.createdAt) - time(b.createdAt)) : []), [steps, r]);
  const rItems = useMemo(() => (r ? items.filter(i => i.receiptId === r.id) : []), [items, r]);
  const swaps = rItems.filter(i => i.savingsCents > 0n).sort((a, b) => Number(b.savingsCents - a.savingsCents));

  const send = async (blob: Blob, isSample: boolean) => {
    setError(null);
    setBusy(true);
    try {
      const data = await shrink(blob);
      await conn?.reducers.scanReceipt({ mime: 'image/jpeg', data, isSample });
      setFresh(false);
    } catch (e) {
      setError(String((e as Error)?.message ?? e));
    } finally {
      setBusy(false);
    }
  };
  const sample = async () => send(await (await fetch('/sample-receipt.jpg')).blob(), true);

  const reading = busy || (!!r && r.status === 'pending' && !fresh);
  const show = r && !fresh;

  return (
    <section className="rscan">
      <div className="rscan-head">
        <span className="pico blue"><Icon name="scan" size={20} stroke={2.4} /></span>
        <div>
          <div className="agent-name">Scan a receipt</div>
          <div className="agent-blurb">Ben reads it and finds the same groceries for less.</div>
        </div>
      </div>

      {reading && (
        <div className="checklist agent-steps">
          {(rSteps.length ? rSteps : [{ id: 0n, message: busy ? 'Uploading your photo…' : 'Starting…' }]).map((s, k, arr) => (
            <div className={`check-item ${k === arr.length - 1 ? '' : 'done'}`} key={String(s.id)}>
              {k === arr.length - 1 ? <span className="spinner" /> : <span className="ci-dot"><Icon name="check" size={13} stroke={3} /></span>}
              <span>{s.message}</span>
            </div>
          ))}
        </div>
      )}

      {show && !reading && r.status === 'done' && (
        <div className="rscan-result">
          <div className="rscan-total">
            {swaps.length ? <>Save <strong>{usd(Number(r.savingsCents))}</strong> at Aldi</> : 'Good prices on this trip'}
          </div>
          <div className="rscan-sub">{rItems.length} items{r.store ? ` from ${r.store}` : ''} · {usd(Number(r.totalCents))} total · compared with Aldi store brand</div>
          <div className="rscan-list">
            {swaps.map(i => (
              <div className="rscan-row" key={String(i.id)}>
                <span className="rscan-name">{i.label || i.name}<small>{i.name}</small></span>
                <span className="rscan-prices"><s>{usd(Number(i.paidCents))}</s> {usd(Number(i.altCents ?? 0n))}</span>
                <span className="rscan-save">+{usd(Number(i.savingsCents))}</span>
              </div>
            ))}
          </div>
          {rItems.length > swaps.length && <p className="rscan-note">{rItems.length - swaps.length} other item{rItems.length - swaps.length === 1 ? '' : 's'} already a good price or not in Ben's price list.</p>}
        </div>
      )}
      {show && !reading && r.status === 'failed' && <p className="rscan-note">{rSteps[rSteps.length - 1]?.message ?? "Couldn't read that one."}</p>}

      {!reading && (
        <div className="rscan-actions">
          <input ref={input} type="file" accept="image/*" capture="environment" hidden
            onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void send(f, false); }} />
          <button className="btn plan-go" disabled={!isActive} onClick={() => input.current?.click()}>
            <Icon name="camera" /> {show ? 'Scan another receipt' : 'Take a photo'}
          </button>
          <button className="linkish" disabled={!isActive} onClick={() => void sample()}>Try a sample receipt</button>
        </div>
      )}
      {error && <p className="small" style={{ color: 'var(--red)' }}>{error}</p>}
      <p className="nm-fine">Your photo is deleted as soon as Ben reads it.</p>
    </section>
  );
}
