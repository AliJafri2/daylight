// First-run tour: dims the screen, spotlights one part of Home, and Ben explains it in a short bubble.
// Targets are elements with data-tour="...". Next / Skip; runs after onboarding and from Settings.
import { useEffect, useLayoutEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from './ui';

export type TourTab = 'home' | 'plan' | 'coach' | 'accounts';
const STEPS: Array<{ tab: TourTab; target: string; title: string; body: string }> = [
  { tab: 'home', target: 'ring', title: 'Your ring', body: "It compares what you can cover with what's due before payday. Red means you'll be short." },
  { tab: 'home', target: 'green', title: 'Stay in the green', body: 'Tap here and Ben finds easy fixes. Nothing changes until you approve.' },
  { tab: 'home', target: 'tiles', title: 'Your financial health', body: 'Tap any tile to see why, in plain words, using your own numbers.' },
  { tab: 'plan', target: 's360', title: 'Daylight 360° summary', body: 'Your whole money picture in three lines. It rewrites itself whenever anything changes.' },
  { tab: 'plan', target: 'agents', title: 'Your agents', body: 'Forecasting fixes this pay period, Research finds habits to change, Investing says where spare money goes. Tap one to run it.' },
  { tab: 'coach', target: 'ask', title: 'Ask Ben', body: 'Ask me anything about your money. I only use your real numbers.' },
  { tab: 'accounts', target: 'acct', title: 'Accounts', body: 'Everything you have and owe, in one place, live from your bank.' },
];
const PAD = 8;

type Rect = { top: number; left: number; width: number; height: number };

export default function Tour({ onClose, goTo }: { onClose: () => void; goTo: (tab: TourTab) => void }) {
  const [i, setI] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const step = STEPS[i];
  const finish = () => { goTo('home'); onClose(); };

  // Open the right tab, wait for the target to render, bring it into view, then keep it measured.
  useLayoutEffect(() => { goTo(step.tab); }, [step.tab]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    let el: HTMLElement | null = null;
    let tries = 0;
    const timers: number[] = [];
    const measure = () => {
      if (!el) return;
      const r = el.getBoundingClientRect();
      setRect({ top: r.top - PAD, left: r.left - PAD, width: r.width + PAD * 2, height: r.height + PAD * 2 });
    };
    const find = () => {
      el = document.querySelector<HTMLElement>(`[data-tour="${step.target}"]`);
      if (!el) { if (tries++ < 30) timers.push(window.setTimeout(find, 100)); return; }
      el.scrollIntoView({ block: 'center', behavior: 'smooth' });
      measure();
      timers.push(window.setTimeout(measure, 350), window.setTimeout(measure, 750));
    };
    setRect(null);
    find();
    window.addEventListener('scroll', measure, { passive: true });
    window.addEventListener('resize', measure);
    return () => { timers.forEach(clearTimeout); window.removeEventListener('scroll', measure); window.removeEventListener('resize', measure); };
  }, [step.target]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') finish(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }); // eslint-disable-line react-hooks/exhaustive-deps

  const last = i === STEPS.length - 1;
  const vh = window.innerHeight;
  // Bubble goes below the spotlight if there's room, otherwise above it.
  const below = rect ? rect.top + rect.height + 190 < vh : true;
  const bubbleStyle: React.CSSProperties = rect
    ? below ? { top: rect.top + rect.height + 12 } : { bottom: vh - rect.top + 12 }
    : { top: '40%' };

  return createPortal(
    <div className="tour" role="dialog" aria-modal="true" aria-label={`Tour step ${i + 1} of ${STEPS.length}: ${step.title}`}>
      <div className="tour-block" />
      {rect && <div className="tour-spot" style={{ top: rect.top, left: rect.left, width: rect.width, height: rect.height }} />}
      <div className="tour-bubble" key={i} style={bubbleStyle}>
        <div className="tour-top">
          <span className="tour-ico"><Icon name="sun" size={16} stroke={2.4} /></span>
          <span className="tour-title">{step.title}</span>
          <span className="tour-count">{i + 1} of {STEPS.length}</span>
        </div>
        <p className="tour-body">{step.body}</p>
        <div className="tour-actions">
          {!last ? <button className="tour-skip" onClick={finish}>Skip</button> : <span />}
          <div className="tour-dots" aria-hidden="true">{STEPS.map((_, k) => <i key={k} className={k === i ? 'on' : ''} />)}</div>
          <button className="tour-next" autoFocus onClick={() => (last ? finish() : setI(i + 1))}>
            {last ? 'Got it' : <>Next <Icon name="chevron" size={16} /></>}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
