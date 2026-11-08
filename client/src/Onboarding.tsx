// Onboarding (UI only, no real auth): Title -> Create account -> Connect bank -> "I'm MinMax".
// References: Fuse welcome (word wheel), Fuse sign-up, Cleo AI "I'm Cleo AI" screen.
import { useEffect, useState } from 'react';
import { Icon, type IconName } from './ui';

type Step = 'title' | 'create' | 'bank' | 'ai';

const WORDS: Array<{ word: string; icon: IconName; color: string }> = [
  { word: 'Gas', icon: 'gas', color: '#f2771e' },
  { word: 'Groceries', icon: 'cart', color: '#1d8f53' },
  { word: 'Bills', icon: 'bill', color: '#3b6ff5' },
  { word: 'Savings', icon: 'piggy', color: '#7c5cf2' },
  { word: 'Payday', icon: 'calendar', color: '#0f9d8a' },
];

function WordWheel() {
  const n = WORDS.length;
  const list = [...WORDS, ...WORDS, ...WORDS];
  const [i, setI] = useState(n);
  const [animate, setAnimate] = useState(true);

  useEffect(() => {
    const t = setInterval(() => setI(x => x + 1), 1700);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    if (i >= 2 * n) {
      const t = setTimeout(() => { setAnimate(false); setI(i - n); }, 650);
      return () => clearTimeout(t);
    }
    if (!animate) requestAnimationFrame(() => setAnimate(true));
  }, [i, n, animate]);

  return (
    <div className="wheel" aria-hidden="true">
      <div className="wheel-track" style={{ transform: `translateY(${(2 - i) * 72}px)`, transition: animate ? undefined : 'none' }}>
        {list.map((w, k) => (
          <div key={k} className={`wheel-word ${k === i ? 'active' : ''}`}>
            {k === i && <span className="wglyph" style={{ background: w.color }}><Icon name={w.icon} size={18} /></span>}
            {w.word}
          </div>
        ))}
      </div>
    </div>
  );
}

function Progress({ at }: { at: number }) {
  return (
    <div className="progress" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
      {[0, 1, 2].map(k => <span key={k} className={k <= at ? 'on' : ''} />)}
    </div>
  );
}

const COLOR: Record<Step, string> = { title: 'g-green', create: 'g-blue', bank: 'g-purple', ai: 'g-orange' };
const i = (n: number) => ({ ['--i' as string]: n });

export default function Onboarding({ onDone }: { onDone: (name?: string) => void }) {
  // ?ob=create|bank|ai opens a specific step (handy for previews and demos).
  const [step, setStep] = useState<Step>(() => (['create', 'bank', 'ai'] as const).find(x => x === new URLSearchParams(location.search).get('ob')) ?? 'title');
  const [out, setOut] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [name, setName] = useState('George');
  const [email, setEmail] = useState('george.parker@example.com');
  const [bank, setBank] = useState<'idle' | 'connecting' | 'done'>('idle');

  // Name typed on "Create your account" is saved; "Log in" / "Skip" keep the existing name.
  const [created, setCreated] = useState(false);
  const finish = () => {
    setLeaving(true);
    setTimeout(() => onDone(created ? name : undefined), 420);
  };
  // Content dissolves up, the background morphs to the next color, new content rises in.
  const go = (next: Step) => {
    setOut(true);
    setTimeout(() => { setStep(next); setOut(false); window.scrollTo({ top: 0 }); }, 300);
  };

  const top = (back: Step | null, at: number) => (
    <div style={i(0)}>
      <div className="onb-top">
        {back ? <button className="back" aria-label="Back" onClick={() => go(back)}><Icon name="back" size={24} /></button> : <span />}
        <button className="skip" onClick={finish}>Skip</button>
      </div>
      <Progress at={at} />
    </div>
  );

  let content;
  if (step === 'title') {
    content = (
      <div className={`step ${out ? 'out' : ''}`} key="title">
        <div style={i(0)}><WordWheel /></div>
        <div className="title-content" style={i(1)}>
          <div className="app-mark">MM</div>
          <h1>Minimum effort,<br />maximum savings.</h1>
          <p>Forecast your finances with AI and get a plan to stay on top of everything.</p>
          <button className="btn white" onClick={() => go('create')}>Get started</button>
          <button className="btn ghost" onClick={finish}>Log in</button>
        </div>
      </div>
    );
  } else if (step === 'create') {
    content = (
      <div className={`step ${out ? 'out' : ''}`} key="create">
        {top('title', 0)}
        <h1 className="ob" style={i(1)}>Create your account</h1>
        <p className="lead" style={i(2)}>Just the basics. Your bank login never lives here.</p>
        <div className="field" style={i(3)}>
          <label htmlFor="name">First name</label>
          <input id="name" value={name} onChange={e => setName(e.target.value)} autoComplete="given-name" />
        </div>
        <div className="field" style={i(4)}>
          <label htmlFor="email">Email</label>
          <input id="email" type="email" value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" />
        </div>
        <div className="field" style={i(5)}>
          <label htmlFor="pw">Password</label>
          <input id="pw" type="password" defaultValue="minmax-demo" autoComplete="new-password" />
        </div>
        <div className="ob-foot" style={i(6)}>
          <button className="btn white" disabled={!name.trim()} onClick={() => { setCreated(true); go('bank'); }}>Create account</button>
        </div>
      </div>
    );
  } else if (step === 'bank') {
    const connect = () => {
      if (bank !== 'idle') return;
      setBank('connecting');
      setTimeout(() => setBank('done'), 1300);
    };
    content = (
      <div className={`step ${out ? 'out' : ''}`} key="bank">
        {top('create', 1)}
        <h1 className="ob" style={i(1)}>Connect your bank</h1>
        <p className="lead" style={i(2)}>I'll forecast your next 2 weeks using your balances and upcoming bills.</p>
        <div className="stack" style={i(3)}>
          <button className="bank-row" onClick={connect}>
            <span className="bank-logo" style={{ background: '#004977' }}><Icon name="bank" size={22} /></span>
            <span style={{ flex: 1 }}>
              <strong style={{ display: 'block' }}>Capital One</strong>
              <span className="small muted">{bank === 'done' ? 'Connected · checking, savings, card, auto loan' : 'Tap to connect (demo bank)'}</span>
            </span>
            {bank === 'connecting' && <span className="spinner" />}
            {bank === 'done' && <span className="check" style={{ marginLeft: 0 }}><Icon name="check" size={16} stroke={3} /></span>}
          </button>
          {[{ n: 'PNC', c: '#e35205' }, { n: 'Chase', c: '#117aca' }].map(b => (
            <div key={b.n} className="bank-row" style={{ opacity: 0.6 }}>
              <span className="bank-logo" style={{ background: b.c }}><Icon name="bank" size={22} /></span>
              <span style={{ flex: 1 }}>
                <strong style={{ display: 'block' }}>{b.n}</strong>
                <span className="small muted">Coming soon</span>
              </span>
            </div>
          ))}
        </div>
        <div className="ob-foot" style={i(4)}>
          <div className="note"><Icon name="lock" size={16} /> Your password stays with your bank. I can only read.</div>
          <button className="btn white" disabled={bank !== 'done'} onClick={() => go('ai')}>
            {bank === 'done' ? 'Continue' : 'Connect a bank to continue'}
          </button>
        </div>
      </div>
    );
  } else {
    content = (
      <div className={`step ${out ? 'out' : ''}`} key="ai">
        {top('bank', 2)}
        <div className="orb" style={{ margin: '4px 0 16px', ...i(1) }} />
        <h1 className="ob" style={i(2)}>Hi, I'm Ben</h1>
        <p className="lead" style={i(3)}>Your AI money coach. Ask me anything.</p>
        <div className="ai-pill" aria-hidden="true" style={{ margin: '0 0 24px', width: '100%', ...i(4) }}><div>Can I afford dinner out on Friday?</div></div>
        <div className="powers" style={i(5)}>
          {[
            ['See trouble coming', 'I forecast your balance every day until payday, so you know about a shortfall two weeks early.'],
            ['Find the cheapest fix', 'I compare your bills, grocery stores and gas stations to find savings. No loans, ever.'],
            ['You stay in control', 'I suggest, you decide. Nothing changes until you tap approve.'],
          ].map(([t, d], k) => (
            <div className="power" key={t} style={{ animationDelay: `${0.45 + k * 0.12}s` }}>
              <span className="num">{k + 1}</span>
              <div><h3>{t}</h3><p>{d}</p></div>
            </div>
          ))}
        </div>
        <div className="ob-foot" style={i(6)}>
          <button className="btn white" onClick={finish}>Let's go</button>
        </div>
      </div>
    );
  }

  return (
    <div className={`grad-screen ${COLOR[step]} ${leaving ? 'leaving' : ''}`}>
      {content}
    </div>
  );
}
