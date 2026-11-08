// Small shared UI pieces: icons (inline SVG, no icon library), money formatting, big number.
import { useEffect, useRef, useState, type ReactNode } from 'react';

import {
  House, ListChecks, MessageCircle, Wallet, ChevronLeft, ChevronRight, Lock, CalendarDays, Tag, Fuel,
  ShoppingCart, Receipt, PiggyBank, CreditCard, Hourglass, TriangleAlert, Settings, Check, Sparkles,
  ArrowUp, ArrowRight, X, Mic, Landmark, RefreshCw, MapPin, Sun, OctagonAlert, CircleCheck, ShieldCheck, ShoppingBag, Bike, Coffee, Tv, CalendarClock, Search, TrendingUp, Camera, ScanLine, type LucideIcon,
} from 'lucide-react';

// Professional icon set (Lucide, MIT). Same names as before so every screen upgrades at once.
const ICONS = {
  home: House, plan: ListChecks, chat: MessageCircle, wallet: Wallet, back: ChevronLeft, chevron: ChevronRight,
  lock: Lock, calendar: CalendarDays, tag: Tag, gas: Fuel, cart: ShoppingCart, bill: Receipt, piggy: PiggyBank,
  card: CreditCard, hourglass: Hourglass, alert: TriangleAlert, gear: Settings, check: Check, sparkle: Sparkles,
  arrowUp: ArrowUp, arrowRight: ArrowRight, x: X, mic: Mic, bank: Landmark, refresh: RefreshCw, pin: MapPin, sun: Sun, stop: OctagonAlert, checkCircle: CircleCheck, shield: ShieldCheck, bag: ShoppingBag, delivery: Bike, coffee: Coffee, tv: Tv, forecast: CalendarClock, search: Search, trend: TrendingUp, camera: Camera, scan: ScanLine,
} satisfies Record<string, LucideIcon>;

export type IconName = keyof typeof ICONS;

export function Icon({ name, size = 20, stroke = 1.75 }: { name: IconName; size?: number; stroke?: number }) {
  const C = ICONS[name];
  return <C size={size} strokeWidth={stroke} aria-hidden="true" />;
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

/** Smoothly glides a number to its new value when it changes (e.g. -$43 -> $102 after the fix). */
export function useAnimatedNumber(target: number, ms = 900) {
  // Starts AT the target (no count from $0 on load); glides only when the value changes.
  const [val, setVal] = useState(target);
  const from = useRef(target);
  useEffect(() => {
    if (from.current === target) return;
    const start = performance.now();
    const a = from.current;
    let raf = 0;
    const tick = (t: number) => {
      const k = Math.min(1, (t - start) / ms);
      const e = 1 - Math.pow(1 - k, 4);
      const v = a + (target - a) * e;
      setVal(v);
      from.current = v;
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return val;
}

/** Fuse-style big number: bold dollars, greyed cents. Glides smoothly when the value changes. */
export function BigMoney({ cents, tone, suffix }: { cents: number; tone?: 'red' | 'green'; suffix?: ReactNode }) {
  const shown = Math.round(useAnimatedNumber(cents));
  const abs = Math.abs(shown);
  const dollars = Math.floor(abs / 100).toLocaleString('en-US');
  const c = String(abs % 100).padStart(2, '0');
  return (
    <div className={`big-money ${tone ?? ''}`} aria-label={usd(cents)}>
      {shown < 0 ? '−' : ''}${dollars}
      <span className="cents">.{c}</span>
      {suffix && <span className="big-suffix">{suffix}</span>}
    </div>
  );
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const day = (d: string) => `${MONTHS[Number(d.slice(5, 7)) - 1]} ${Number(d.slice(8, 10))}`;
