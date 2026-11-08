// Receipt scanning: Gemini reads the photo and labels each line with a price-book key (or none).
// Everything after that is plain math here: compare what you paid to the store-brand price at Aldi.
// The price book is demo data (approximate Richardson TX prices); production would license a price feed.

export const ALT_STORE = 'Aldi';

// key -> [label, unit, Aldi store-brand price in cents]
export const PRICE_BOOK: Record<string, [string, string, number]> = {
  milk_gal: ['Milk', '1 gallon', 259],
  eggs_dozen: ['Eggs', '1 dozen', 229],
  bread_loaf: ['Sandwich bread', '1 loaf', 145],
  butter_lb: ['Butter', '1 lb', 389],
  cheese_shredded_8oz: ['Shredded cheese', '8 oz', 219],
  cheese_slices: ['Sliced cheese', '12 oz', 279],
  yogurt_32oz: ['Yogurt', '32 oz', 279],
  cereal_box: ['Cereal', '1 box', 219],
  oatmeal: ['Oatmeal', '42 oz', 349],
  pasta_lb: ['Pasta', '1 lb', 115],
  pasta_sauce: ['Pasta sauce', '24 oz jar', 179],
  rice_2lb: ['Rice', '2 lb', 189],
  beans_can: ['Canned beans', '1 can', 79],
  tortillas: ['Tortillas', '1 pack', 199],
  ground_beef_lb: ['Ground beef', '1 lb', 449],
  chicken_breast_lb: ['Chicken breast', '1 lb', 299],
  bananas_lb: ['Bananas', '1 lb', 55],
  apples_3lb: ['Apples', '3 lb bag', 349],
  potatoes_5lb: ['Potatoes', '5 lb bag', 349],
  onions_3lb: ['Onions', '3 lb bag', 249],
  coffee_ground: ['Ground coffee', '12 oz', 549],
  peanut_butter: ['Peanut butter', '16 oz', 219],
  orange_juice: ['Orange juice', '52 oz', 299],
  paper_towels_6: ['Paper towels', '6 rolls', 699],
  toilet_paper_12: ['Toilet paper', '12 rolls', 899],
  diapers: ['Diapers', '1 pack', 1299],
  chips: ['Chips', '1 bag', 199],
  soda_12pk: ['Soda', '12 pack', 499],
};

export type ReceiptLine = { name: string; paidCents: number; qty: number; key: string | null };
export type ReceiptSwap = ReceiptLine & { label?: string; altCents?: number; savingsCents: number };

// Only suggest a swap when it saves at least this much (no "save 4 cents" noise).
const MIN_SAVINGS_CENTS = 25;

export function compareReceipt(lines: ReceiptLine[]) {
  const items: ReceiptSwap[] = lines.map(l => {
    const book = l.key ? PRICE_BOOK[l.key] : undefined;
    if (!book || l.qty <= 0) return { ...l, savingsCents: 0 };
    const alt = Math.round(book[2] * l.qty);
    const save = l.paidCents - alt;
    return save >= MIN_SAVINGS_CENTS ? { ...l, label: book[0], altCents: alt, savingsCents: save } : { ...l, label: book[0], altCents: alt, savingsCents: 0 };
  });
  const swaps = items.filter(i => i.savingsCents > 0).sort((a, b) => b.savingsCents - a.savingsCents);
  return {
    items,
    swaps,
    totalPaidCents: lines.reduce((s, l) => s + l.paidCents, 0),
    savingsCents: swaps.reduce((s, i) => s + i.savingsCents, 0),
  };
}

// What Gemini returned for the bundled sample receipt (used if Gemini is unavailable).
export const SAMPLE_RECEIPT = {
  store: 'Corner Market',
  lines: [
    { name: 'BRAND NAME 2% MILK GAL', paidCents: 429, qty: 1, key: 'milk_gal' },
    { name: 'LARGE EGGS 12CT', paidCents: 389, qty: 1, key: 'eggs_dozen' },
    { name: 'HONEY WHEAT BREAD', paidCents: 349, qty: 1, key: 'bread_loaf' },
    { name: 'GROUND BEEF 80/20 2LB', paidCents: 1298, qty: 2, key: 'ground_beef_lb' },
    { name: 'FROSTED FLAKES 2CT', paidCents: 898, qty: 2, key: 'cereal_box' },
    { name: 'SHRED CHEDDAR 8OZ', paidCents: 399, qty: 1, key: 'cheese_shredded_8oz' },
    { name: 'BANANAS 2.1LB', paidCents: 147, qty: 2.1, key: 'bananas_lb' },
    { name: 'SPAGHETTI 1LB', paidCents: 189, qty: 1, key: 'pasta_lb' },
    { name: 'MARINARA SAUCE 24OZ', paidCents: 399, qty: 1, key: 'pasta_sauce' },
    { name: 'BIRTHDAY CARD', paidCents: 499, qty: 1, key: null },
  ] as ReceiptLine[],
};
