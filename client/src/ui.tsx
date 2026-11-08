// Small shared UI pieces: icons (inline SVG, no icon library), money formatting, big number.
import type { ReactNode } from 'react';

const P = {
  home: 'M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z',
  plan: 'M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01',
  chat: 'M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z',
  wallet: 'M3 7a2 2 0 0 1 2-2h13v4M3 7v11a2 2 0 0 0 2 2h15V9H5a2 2 0 0 1-2-2zM16 14.5h.01',
  back: 'M15 18l-6-6 6-6',
  chevron: 'M9 18l6-6-6-6',
  lock: 'M6 11h12v10H6zM8 11V7a4 4 0 0 1 8 0v4',
  calendar: 'M4 6h16v15H4zM4 10h16M9 3v4M15 3v4',
  tag: 'M3 12V3h9l9 9-9 9zM7.5 7.5h.01',
  gas: 'M4 21V5a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v16M4 11h11M15 8l3 3v6a1.5 1.5 0 0 0 3 0V9l-3-3',
  cart: 'M3 4h2l2.4 11h10.2L20 8H6.2M9 20h.01M17 20h.01',
  bill: 'M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6',
  piggy: 'M5 11a7 6 0 0 1 13-2h2v4l-2 1-1 3h-2l-1-1.5H10L9 17H7l-1-3a6 6 0 0 1-1-3zM15 10h.01',
  card: 'M3 6h18v12H3zM3 10h18',
  hourglass: 'M7 3h10M7 21h10M8 3c0 5 8 5 8 9s-8 4-8 9M16 3c0 5-8 5-8 9s8 4 8 9',
  alert: 'M12 3 2 20h20zM12 10v4M12 17h.01',
  gear: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19 12a7 7 0 0 0-.1-1.2l2-1.6-2-3.4-2.4 1a7 7 0 0 0-2-1.2L14 3h-4l-.5 2.6a7 7 0 0 0-2 1.2l-2.4-1-2 3.4 2 1.6a7 7 0 0 0 0 2.4l-2 1.6 2 3.4 2.4-1a7 7 0 0 0 2 1.2L10 21h4l.5-2.6a7 7 0 0 0 2-1.2l2.4 1 2-3.4-2-1.6c.1-.4.1-.8.1-1.2z',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  sparkle: 'M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z',
  arrowUp: 'M12 19V5M5 12l7-7 7 7',
  arrowRight: 'M5 12h14M13 5l7 7-7 7',
  x: 'M6 6l12 12M18 6 6 18',
  mic: 'M12 3a3 3 0 0 1 3 3v6a3 3 0 0 1-6 0V6a3 3 0 0 1 3-3zM5 11a7 7 0 0 0 14 0M12 18v3',
  bank: 'M3 10 12 4l9 6M5 10v8M9.5 10v8M14.5 10v8M19 10v8M3 20h18',
  refresh: 'M20 11a8 8 0 0 0-14.9-3M4 4v4h4M4 13a8 8 0 0 0 14.9 3M20 20v-4h-4',
  pin: 'M12 21s7-6.2 7-12a7 7 0 1 0-14 0c0 5.8 7 12 7 12zM12 11.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z',
} as const;

export type IconName = keyof typeof P;

export function Icon({ name, size = 20, stroke = 2 }: { name: IconName; size?: number; stroke?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={stroke}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={P[name]} />
    </svg>
  );
}

export function Glyph({ name, color, size = 34 }: { name: IconName; color: 'blue' | 'orange' | 'purple' | 'teal' | 'green' | 'red' | 'ink'; size?: number }) {
  return (
    <span className={`glyph ${color}`} style={{ width: size, height: size }}>
      <Icon name={name} size={Math.round(size * 0.55)} />
    </span>
  );
}

export const usd = (cents: number, opts: { sign?: boolean; whole?: boolean } = {}) => {
  const abs = Math.abs(cents) / 100;
  const s = abs.toLocaleString('en-US', {
    style: 'currency', currency: 'USD',
    minimumFractionDigits: opts.whole ? 0 : 2, maximumFractionDigits: opts.whole ? 0 : 2,
  });
  if (cents < 0) return `-${s}`;
  return opts.sign ? `+${s}` : s;
};

/** Fuse-style big number: bold dollars, greyed cents. */
export function BigMoney({ cents, tone, suffix }: { cents: number; tone?: 'red' | 'green'; suffix?: ReactNode }) {
  const abs = Math.abs(cents);
  const dollars = Math.floor(abs / 100).toLocaleString('en-US');
  const c = String(abs % 100).padStart(2, '0');
  return (
    <div className={`big-money ${tone ?? ''}`}>
      {cents < 0 ? '−' : ''}${dollars}
      <span className="cents">.{c}</span>
      {suffix && <span className="big-suffix">{suffix}</span>}
    </div>
  );
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const day = (d: string) => `${MONTHS[Number(d.slice(5, 7)) - 1]} ${Number(d.slice(8, 10))}`;
