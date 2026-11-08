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

export default function Onboarding({ onDone }: { onDone: (name?: string) => void }) {
  const [step, setStep] = useState<Step>('title');
  const [phase, setPhase] = useState<'in' | 'out'>('in');
  const [leaving, setLeaving] = useState(false);
  const [name, setName] = useState('Bill');
  const [email, setEmail] = useState('bill.parker@example.com');
  const [bank, setBank] = useState<'idle' | 'connecting' | 'done'>('idle');

  // Name typed on "Create your account" is saved; "Log in" / "Skip" keep the existing name.
  const [created, setCreated] = useState(false);
  const finish = () => {
    setLeaving(true);
    setTimeout(() => onDone(created ? name : undefined), 420);
  };
  // Smooth step changes: current step slides/fades out, next slides in.
  const go = (next: Step) => {
    setPhase('out');
    setTimeout(() => { setStep(next); setPhase('in'); window.scrollTo({ top: 0 }); }, step === 'title' ? 380 : 260);
  };
  const anim = phase === 'out' ? (step === 'title' ? 'title-out' : 'step-out') : 'step-in';

  if (step === 'title') {
    return (
      <div className={`title-screen ${leaving ? 'leaving' : phase === 'out' ? 'title-out' : ''}`}>
        <WordWheel />
        <div className="title-content">
          <div className="app-mark">MM</div>
          <h1>Minimum effort,<br />maximum savings.</h1>
          <p>Forecast your finances with AI and get a plan to stay on top of them.</p>
          <button className="btn white" onClick={() => go('create')}>Get started</button>
          <button className="btn ghost" onClick={finish}>Log in</button>
        </div>
      </div>
    );
  }

  const top = (back: Step | null, at: number) => (
    <>
      <div className="onb-top">
        {back ? (
          <button className="back" aria-label="Back" onClick={() => go(back)}><Icon name="back" size={24} /></button>
        ) : <span />}
        <button className="skip" onClick={finish}>Skip</button>
      </div>
      <Progress at={at} />
    </>
  );

  if (step === 'create') {
    return (
      <div className="onb blue" key="create">
        <div className={anim} style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
          {top('title', 0)}
          <h1>Create your account</h1>
          <p className="lead">Just the basics. Your bank login never lives here.</p>
          <div className="field">
            <label htmlFor="name">First name</label>
            <input id="name" value={name} onChange={e => setName(e.target.value)} autoComplete="given-name" />
          </div>
          <div className="field">
            <label htmlFor="email">Email</label>
            <input id="email" type="email" value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" />
          </div>
          <div className="field">
            <label htmlFor="pw">Password</label>
            <input id="pw" type="password" defaultValue="minmax-demo" autoComplete="new-password" />
          </div>
          <div className="grow" />
          <button className="btn" disabled={!name.trim()} onClick={() => { setCreated(true); go('bank'); }}>Create account</button>
        </div>
      </div>
    );
  }

  if (step === 'bank') {
    const connect = () => {
      if (bank !== 'idle') return;
      setBank('connecting');
      setTimeout(() => setBank('done'), 1300);
    };
    return (
      <div className="onb purple" key="bank">
        <div className={anim} style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
          {top('create', 1)}
          <h1>Connect your bank</h1>
          <p className="lead">I use your balances and upcoming bills to forecast your next two weeks. Read-only, so nothing moves without you.</p>
          <div className="stack">
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
              <div key={b.n} className="bank-row" style={{ opacity: 0.55 }}>
                <span className="bank-logo" style={{ background: b.c }}><Icon name="bank" size={22} /></span>
                <span style={{ flex: 1 }}>
                  <strong style={{ display: 'block' }}>{b.n}</strong>
                  <span className="small muted">Coming soon</span>
                </span>
              </div>
            ))}
          </div>
          <div className="note" style={{ marginTop: 18 }}><Icon name="lock" size={16} /> Your password stays with your bank. I can only read.</div>
          <div className="grow" style={{ minHeight: 24 }} />
          <button className="btn" disabled={bank !== 'done'} onClick={() => go('ai')}>
            {bank === 'done' ? 'Continue' : 'Connect a bank to continue'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={`onb orange ${leaving ? 'leaving' : ''}`} key="ai">
      <div className={anim} style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
        {top('bank', 2)}
        <div className="orb" style={{ margin: '4px 0 18px' }} />
        <h1>Hi, I'm Ben</h1>
        <p className="lead">Your AI money coach. Ask me anything.</p>
        <div className="ai-pill" aria-hidden="true" style={{ margin: '4px 0 28px', width: '100%' }}><div>Can I afford dinner out on Friday?</div></div>
        <h2 style={{ fontSize: 20, margin: '0 0 12px', letterSpacing: '-0.01em' }}>How I help you</h2>
        <div className="powers">
          {[
            ['See trouble coming', 'I forecast your balance every day until payday, so you know about a shortfall two weeks early.'],
            ['Find the cheapest fix', 'I compare your bills, grocery stores and gas stations to find savings. No loans, ever.'],
            ['You stay in control', 'I suggest, you decide. Nothing changes until you tap approve.'],
          ].map(([t, d], k) => (
            <div className="power" key={t} style={{ animationDelay: `${0.15 + k * 0.15}s` }}>
              <span className="num">{k + 1}</span>
              <div><h3>{t}</h3><p>{d}</p></div>
            </div>
          ))}
        </div>
        <div className="grow" style={{ minHeight: 20 }} />
        <button className="btn" onClick={finish}>Let's go</button>
      </div>
    </div>
  );
}
