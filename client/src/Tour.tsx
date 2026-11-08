// First-run tour: dims the screen, spotlights one part of the app, and Ben explains it in a short bubble.
// Smooth by design: between steps the bubble fades out, the spotlight glides (following the page while it
// scrolls), then the next bubble fades in. Switching tabs first glides the spotlight to that tab's button
// with a "Going to Plan" label, so it's always clear where you are.
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from './ui';

export type TourTab = 'home' | 'plan' | 'coach' | 'accounts';
const TAB_NAME: Record<TourTab, string> = { home: 'Home', plan: 'Plan', coach: 'Ben', accounts: 'Accounts' };

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
const FADE_MS = 220; // bubble fade out
const GLIDE_MS = 480; // spotlight glide (matches the CSS transition)
const TRAVEL_MS = 900; // how long we show "Going to <tab>"

type Rect = { top: number; left: number; width: number; height: number; radius: number };
const wait = (ms: number) => new Promise(r => setTimeout(r, ms));
const rectOf = (el: Element, radius = 22): Rect => {
  const r = el.getBoundingClientRect();
  return { top: r.top - PAD, left: r.left - PAD, width: r.width + PAD * 2, height: r.height + PAD * 2, radius };
};

export default function Tour({ onClose, goTo }: { onClose: () => void; goTo: (tab: TourTab) => void }) {
  const [i, setI] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const [showBubble, setShowBubble] = useState(false);
  const [travel, setTravel] = useState<TourTab | null>(null);
  const busy = useRef(false);
  const follow = useRef<{ el: HTMLElement | null; raf: number }>({ el: null, raf: 0 });
  const step = STEPS[i];

  // Keep the spotlight glued to an element (e.g. while the page smooth-scrolls to it).
  const track = useCallback((el: HTMLElement | null, ms: number) => {
    cancelAnimationFrame(follow.current.raf);
    follow.current.el = el;
    if (!el) return;
    const until = performance.now() + ms;
    const loop = () => {
      if (follow.current.el !== el) return;
      setRect(rectOf(el, el.closest('.tabbar') ? 999 : 22));
      if (performance.now() < until) follow.current.raf = requestAnimationFrame(loop);
    };
    loop();
  }, []);

  const findTarget = async (target: string) => {
    for (let k = 0; k < 40; k++) {
      const el = document.querySelector<HTMLElement>(`[data-tour="${target}"]`);
      if (el) return el;
      await wait(50);
    }
    return null;
  };

  // Show step k: open its tab (with a visible "going to" beat if the tab changes), glide, fade in.
  const show = useCallback(async (k: number, from: number | null) => {
    busy.current = true;
    const s = STEPS[k];
    setShowBubble(false);
    if (from !== null) await wait(FADE_MS);
    if (from !== null && STEPS[from].tab !== s.tab) {
      const tabBtn = document.querySelector<HTMLElement>(`[data-tab="${s.tab}"]`);
      if (tabBtn) {
        setTravel(s.tab);
        track(tabBtn, GLIDE_MS + 100);
        await wait(TRAVEL_MS);
      }
      goTo(s.tab);
      setTravel(null);
    } else if (from === null) {
      goTo(s.tab);
    }
    setI(k);
    const el = await findTarget(s.target);
    if (el) {
      el.scrollIntoView({ block: 'center', behavior: 'smooth' });
      track(el, 900);
      await wait(GLIDE_MS + 120);
    }
    setShowBubble(true);
    busy.current = false;
  }, [goTo, track]);

  useEffect(() => { void show(0, null); return () => cancelAnimationFrame(follow.current.raf); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Stay aligned if the viewport changes.
  useEffect(() => {
    const re = () => { if (follow.current.el) setRect(rectOf(follow.current.el, follow.current.el.closest('.tabbar') ? 999 : 22)); };
    window.addEventListener('resize', re);
    window.addEventListener('scroll', re, { passive: true });
    return () => { window.removeEventListener('resize', re); window.removeEventListener('scroll', re); };
  }, []);

  const last = i === STEPS.length - 1;
  const finish = useCallback(async () => {
    setShowBubble(false);
    await wait(FADE_MS);
    goTo('home');
    onClose();
  }, [goTo, onClose]);
  const next = () => { if (!busy.current) { if (last) void finish(); else void show(i + 1, i); } };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') void finish(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [finish]);

  const vh = window.innerHeight;
  const below = rect ? rect.top + rect.height + 200 < vh : true;
  const bubbleStyle: React.CSSProperties = rect
    ? below ? { top: rect.top + rect.height + 12 } : { bottom: vh - rect.top + 12 }
    : { top: '40%' };

  return createPortal(
    <div className="tour" role="dialog" aria-modal="true" aria-label={`Tour step ${i + 1} of ${STEPS.length}: ${step.title}`}>
      <div className="tour-block" />
      <div className={`tour-spot ${rect ? '' : 'none'}`}
        style={rect ? { top: rect.top, left: rect.left, width: rect.width, height: rect.height, borderRadius: Math.min(rect.radius, rect.height / 2) } : undefined} />

      {travel && rect && (
        <div className="tour-travel" style={{ bottom: vh - rect.top + 12, left: Math.min(Math.max(rect.left + rect.width / 2, 100), window.innerWidth - 100) }} aria-live="polite">
          Going to {TAB_NAME[travel]} <Icon name="arrowRight" size={14} />
        </div>
      )}

      <div className={`tour-bubble ${showBubble ? 'in' : ''}`} style={bubbleStyle} aria-hidden={!showBubble}>
        <div className="tour-top">
          <span className="tour-ico"><Icon name="sun" size={16} stroke={2.4} /></span>
          <span className="tour-title">{step.title}</span>
          <span className="tour-count"><span className="tour-tab">{TAB_NAME[step.tab]}</span>{i + 1} of {STEPS.length}</span>
        </div>
        <p className="tour-body">{step.body}</p>
        <div className="tour-actions">
          {!last ? <button className="tour-skip" onClick={() => void finish()}>Skip</button> : <span />}
          <div className="tour-dots" aria-hidden="true">{STEPS.map((_, k) => <i key={k} className={k === i ? 'on' : k < i ? 'past' : ''} />)}</div>
          <button className="tour-next" autoFocus onClick={next}>
            {last ? 'Got it' : <>Next <Icon name="chevron" size={16} /></>}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
