# MinMax: HackUTD 2026 Build Brief (handoff to Claude Code)

> Read this whole file before writing any code. It captures several hours of planning, research and decisions. Do NOT re-open settled decisions (see "Decisions already made"). Your job is to help build, ship and demo this project before the deadline.

---

## 0. Who you're working with and how to work

- **The builder is a first-time hackathon participant working SOLO.** They are here to win. Explain things in plain English, keep momentum, and avoid jargon dumps.
- **No scope creep.** The builder has explicitly rejected several pivots. Stay on the paycheck-to-paycheck / cost-of-living idea below. If you think something should change, raise it in one or two sentences, then continue with the plan unless they agree.
- **Execution beats ideas now.** The idea is locked. Favor working, demoable features over perfect architecture. Build the must-have core first, then add features in priority order only if time allows.
- **Verify APIs against the real docs before relying on them.** Some SpacetimeDB TypeScript syntax and Nessie endpoints below are from memory and marked "VERIFY". Check the docs (links in section 13) and fix rather than guess.
- **Never let a broken feature break the demo.** Every external dependency needs a fallback (section 9).
- Commit early and often to a **public** GitHub repo (required to win Spacetime, and judges verify code).

---

## 1. The event: HackUTD 2026 "Zero Day"

- University of Texas at Dallas, ECSW building, Richardson TX. 24-hour hackathon, ~1,200 hackers, 200+ projects expected.
- **Hacking started:** Sat Nov 7, 12:00 PM CT.
- **Initial Devpost registration deadline: Sat Nov 7, 11:00 PM CT.** Must complete the final "Submit" step on Devpost (placeholder project/video/repo is fine). Missing this = not registered.
- **Final submission: Sun Nov 8, 12:00 PM (noon) CT.** No edits after that.
- **Judging: Sun 1:00-4:00 PM** in ECSW/ECSS. Expo/table style: judges walk to your table (HackUTD uses its "Jury" system). You will pitch the same project repeatedly to different judges. Must be present.
- **Closing ceremony: Sun 5:00 PM.**
- Devpost: https://hackutd-zeroday.devpost.com/

### Submission requirements (Devpost)
- Project title + description
- Code repository (public GitHub) or zip
- Challenges/tracks selected
- **Demo video: ONLY a demo, max 2 minutes**, public link (YouTube/Drive)
- Recommended: thumbnail + screenshots/GIFs

### Track rules
- Up to **3 sponsor/company tracks + 1 HackUTD track** (Best Hardware, Best Design, or Virality). Any number of [MLH] tracks. Every project is auto-entered in the General track.

### General judging criteria (all projects)
1. **Innovation & Creativity**: unique idea or unexpected use of tech
2. **Technical Complexity**: algorithms, integrations, hardware
3. **Completeness**: works as intended, no major bugs
4. **Design**: user-friendly, visually appealing, intuitive
5. **Impact**: real problem, real-world use
6. **Presentation**: clearly explains problem, solution, technical choices

---

## 2. Tracks we are entering

| Track | Prompt | Prizes | How MinMax hits it |
|---|---|---|---|
| **PNC: 360° Financial Health Navigator** | "How could AI help someone see their whole financial picture, make sense of it & feel confident about their next move?" Account types listed: checking, savings, CDs & IRAs, loans, credit cards, mortgages. Suggested answers: conversational coach, 3+ health indicators, forecast balances & obligations, "what if" simulator, or something new. | PS5 Slim / Ninja CREAMi / AirPods Pro 3 | Whole picture across accounts + payday forecast + 3 health indicators + what-if slider + AI coach that explains and proposes next moves. **Strongest fit.** |
| **Capital One: Best Use of Nessie** | "How will you reimagine banking?" Use Nessie (Capital One's mock banking API). | $300 gift cards per winning team member | Nessie is our bank: accounts, bills, paychecks, purchases come FROM Nessie, and approved actions are WRITTEN BACK (transfers, bill date changes). Most teams only read Nessie. We read AND write. |
| **Spacetime (SpacetimeDB) main track** | "Build your project on Spacetime." **Rule: Spacetime must power the app's primary functionality, not just chat or player movement.** Public GitHub required to win. | $2,048 / $1,024 / $512 | SpacetimeDB is the ENTIRE backend: all financial state, the agent job queue + live agent progress, approvals, prices. Every screen is a live subscription. Honest assessment: decent but not ideal fit (single-user finance app); treat as a long shot and still do it well. |
| **HackUTD: Best Design** | Best design | LEGO set | Clean, mobile-first, calm UI. Judges score "ease of use". |
| **[MLH] Best Use of Gemini API** (doesn't count toward limit) | Use Gemini | MLH swag | Coach agent + receipt scanning use Gemini. |

### Spacetime side quest: ScrabbleBot tournament (optional, separate prize pool)
- Write a bot for Spacetime's Scrabble-style **auction** game. Live tournament **Sat 10:45 PM**. Prizes $1,024 / $512 / $256.
- **Before building it: confirm at the Spacetime booth whether it uses one of our Devpost sponsor slots.** If it does, discuss with the builder (probably skip, or drop Spacetime main).
- Only start it after Checkpoint 1 (section 10) is done. Budget ~1.5-2 hours.
- Repo: `clockworklabs/scrabblebot`. Steps: on scrabblebot.spacetimedb.com link identity at `/account`, create team at `/team/new`, generate bot token at `/team` (shown once!), then in `bot-starter`: `npm install`, `npm run generate`, run with `BOT_NAME` and `BOT_TOKEN`. Edit only `src/strategy.ts`: `decideBid(ctx)` and `chooseWord(ctx)`.
- Game: one letter auctioned per round, 1-second sealed bids, **Vickrey (second-price) by default**, so bid your true value. Start with 100 currency. Word reward = base Scrabble score × length multiplier (1.0× at ≤3 letters up to 3.0× at 7+). Rewards add to both balance and rank score. 98-tile bag, no blanks. Bots only see their own rack. Lobby starts at 6 bots or after 60s (sim bots fill). Tournament: Swiss → top cut → single elim → Bo3 finals.
- Strategy: value letters by usefulness given current rack (vowels/common letters, Q only with U), favor long words for the multiplier but don't hold letters until the bag empties; need a word list.

### Free credit
- Spacetime Maincloud: **100,000 TeV (~$38) free, code `HACKUTD2026`** (scan the QR on Spacetime's leaflet; one per GitHub account). Use it to deploy so judges' phones can connect.

---

## 3. The product: MinMax

**Name changed Sat ~8:20 PM from "Minimum" to "MinMax". Slogan: "Minimum effort, maximum savings."** Code/db/repo identifiers stay `minimum`; everything users see says MinMax.

### One-liner (10-second pitch)
> "63% of Americans live paycheck to paycheck. MinMax warns you two weeks before you'll run short, then its AI finds the cheapest gas, groceries and bill timing to close the gap, without lending you a dime."

### Track-specific openers (judges care about their own track)
- **PNC:** "Your Low Cash Mode gives customers 24 hours *after* they go negative. MinMax gives them two weeks *before*."
- **Capital One:** "Most teams read Nessie. We write to it. Agents execute real banking actions after your one-tap approval."
- **Spacetime:** "Spacetime is MinMax's entire backend. Your bank data, the AI agents' live work, and your approvals all flow through it, so your phone, laptop and agents always see the same truth."

### Who it's for (persona)
**"Bill"**: DFW parent, paid hourly every two weeks, commutes by car, feeds a family of five. Gas and groceries are the biggest costs that change week to week. The last week before payday is when overdrafts and payday-rate cash advances happen. (Persona is illustrative; don't claim this is a real person.)

Narrow by **situation**, not ethnicity. Do NOT target a specific ethnic group: PNC is a bank bound by fair-lending rules, and it reads as stereotyping. Serve underserved communities through **access features**: plain language, Spanish toggle, mobile-first, works on a cheap phone.

### Why it exists (the builder's own inspiration, use in pitch)
Watching the gas price in Texas climb past $3.50 and knowing that for many families it's not an annoyance, it's a crisis. Same with groceries for big families. (The builder should add one real personal sentence; never invent experiences for them.)

### Data points (verified, cite them)
- **63% of Americans live paycheck to paycheck** (CNBC/SurveyMonkey Money Survey, July 2026).
- **Texas average regular gas: $3.58, 94¢ higher than a year ago** (AAA Texas, Nov 5, 2026). ≈ **$14 more per 15-gallon fill-up**, ≈ $56/month if filling weekly.
- USDA projected food-at-home prices up 2.5% in 2026 (Feb 2026 forecast); beef/veal +5.5%.
- CFPB (Dec 2023): overdraft/NSF fees fall hardest on lower-income households; those charged are more likely economically disadvantaged, including non-white consumers. 34% of households under $65K paid a fee vs 10% at $175K.
- Cash advance / earned-wage apps: Center for Responsible Lending found **average APR of 367%** for 7-14 day advances; typical users earn under $50K (GAO) (AP, Apr 2024).
- PNC's own overdraft item fee: **$36** (capped one per day under Low Cash Mode). PNC Low Cash Mode: alerts + **at least 24 hours "Extra Time"** to restore a negative balance + Payment Control. It is REACTIVE.

### Competitive gap (the differentiation)
| Product | What it does | Gap MinMax fills |
|---|---|---|
| GasBuddy | Crowdsourced gas prices | Doesn't know your finances; ignores drive cost |
| Flipp / Ibotta / Basket | Grocery deals, cashback | Deals without budget context |
| Rocket Money / Monarch / Copilot | Budget tracking | Backward-looking ("you spent X") |
| EarnIn / Dave / Brigit | Close the gap by **lending** | ~367% APR equivalent |
| PNC Low Cash Mode | 24h to fix a negative balance | Kicks in **after** you're short |

**MinMax = prevention, not penalties. Cut costs, don't borrow. Acts for you, with your approval.**

### What the app does
1. **See it:** one view of all accounts (Nessie checking/savings/credit card + auto loan; plus manually-seeded IRA/CD in Spacetime since Nessie lacks them) and all upcoming bills.
2. **Forecast it:** day-by-day balance timeline to the next payday. "You'll be **$43 short on Nov 17**, 3 days before payday."
3. **Understand it:** 3+ health indicators (days of runway, credit utilization, overdraft risk, savings buffer) + a **"Why?"** button on every number/recommendation that explains it in plain language **using the user's own numbers** (English, Spanish if time).
4. **Close the gap:** AI agents find the cheapest fix (moving a bill until after payday, store-brand/cheaper-store grocery swaps, cheaper gas by **net** savings after drive cost), stream their work live, and execute it in Nessie after the user's **one-tap approval**. Lead the result with **fees avoided**: "Avoid a $36 overdraft fee + save $23.93 on groceries + $3.48 on gas."

### The three wow moments (+ build priority)
1. **"Close the gap"** (MUST HAVE): red forecast → tap "Close the gap" → agent steps stream live on screen ("Checking bills you can move... Found: car insurance can move to Nov 21...") → plan appears with savings and "Why?" → approve on **phone** → executed in Nessie → forecast line animates red→green on the **laptop**.
2. **MinMax reaches out first** (SHOULD): push notification to phone at the table: "Heads up: you'll be $43 short on Nov 17. I found a fix. Tap to review." Shows prevention instead of describing it. (Phone call via a voice API only Sunday morning if everything else works.)
3. **Scan a real receipt** (SHOULD): photo of any grocery receipt (ideally a judge's) → Gemini vision extracts items → "These 6 items are $14.20 cheaper as store brand / at Aldi" → forecast updates. Real-world input = memorable.
4. **"What if" slider/toggles** (SHOULD, cheap if forecast engine is clean): toggles like "Fill up at Murphy USA instead", "Pay car insurance on the 21st" instantly move the balance line. PNC literally suggested a what-if simulator.
5. **"¿Por qué?" in Spanish** (NICE): ask in Spanish, get a plain answer with real numbers.
6. **Live price update** (NICE): a new gas price reported from a second device/judge's phone (QR link) → plan & savings recalc live everywhere.

---

## 4. Architecture

> **Nessie is the bank. Spacetime is the live brain. The agents are the hands.**

```
┌──────────── React + Vite + TypeScript (mobile-first) ────────────┐
│ Dashboard · Forecast timeline · Health indicators · Plan/approve │
│ · Why? explainers · What-if toggles · Receipt scan · (voice)     │
└───────────────▲──────────────────────────────┬───────────────────┘
       live subscriptions                  reducer calls
┌───────────────┴──────────────────────────────▼───────────────────┐
│ SpacetimeDB module (TypeScript): the ENTIRE backend              │
│ Tables: profile, account, bill, income, scheduled_spend, price,  │
│   plan_job, agent_step, plan_action, (receipt_item)              │
│ Reducers: user actions + worker actions, with validation         │
│ Seed/demo data on init (fallback for everything)                 │
└───────────────▲──────────────────────────────┬───────────────────┘
       subscribes to jobs / approvals     writes steps, results, synced data
┌───────────────┴──────────────────────────────▼───────────────────┐
│ Agent worker (Node + TypeScript, separate process, a Spacetime   │
│ client). Holds secrets (Nessie key, Gemini key). Never in browser│
│  • Sync: Nessie → Spacetime (accounts, bills, deposits, purchases)│
│  • Orchestrator: claims plan_job, runs agents, streams agent_step │
│     1. Forecast agent: deterministic engine (NO LLM math)         │
│     2. Savings agent: tools over bills/prices/grocery swaps       │
│     3. Coach agent: Gemini → plain-language "Why?" + Spanish      │
│  • Executor: approved plan_action → Nessie write → mark executed  │
└───────────────▲──────────────────────────────────────────────────┘
                │ HTTP (key in query param)
          Nessie API (Capital One mock bank)  ·  Gemini API
```

### Key principles (also pitch talking points)
- **The AI never does math.** All money numbers come from a deterministic forecast engine (`shared/forecast.ts`), used by the client (instant what-if) AND the worker (planning). The LLM only plans wording, ranks, explains, translates. Answer to "what if it hallucinates?": it can't change numbers.
- **Human-in-the-loop.** Agents never move money without explicit approval, within guardrails (e.g. max amount per action, no paying bills early that would cause a shortfall). Do NOT build autonomous purchasing (rejected: scary for paycheck-to-paycheck users, PNC judges will object, can't really buy things anyway).
- **Secrets only in the worker.** Nessie key and Gemini key never ship to the browser.
- **Agents are just Spacetime clients.** The UI writes a `plan_job`; the worker subscribes, claims it, writes `agent_step` rows as it works (UI streams them live), writes `plan_action` rows, waits for approval rows, executes in Nessie, writes results back. This is the Spacetime "agents love it" story.

### Suggested repo layout
```
minimum/
  CLAUDE.md                 ← this file
  spacetimedb/              ← Spacetime module (from `spacetime dev --template basic-ts`)
    src/index.ts
  client/                   ← React + Vite app (generated bindings in src/module_bindings/)
  worker/                   ← Node TS agent worker
  shared/forecast.ts        ← deterministic engine (+ tests)
  scripts/seed-nessie.ts    ← creates the demo persona in Nessie, prints IDs
  .env.example              ← NESSIE_KEY, GEMINI_API_KEY, SPACETIME_URI, DB name
```

---

## 5. SpacetimeDB: what it is (plain English) and how to use it

- Replaces the backend server + API + database. You write **tables** (data), **reducers** (functions that change data, run inside the DB, transactional: all-or-nothing), and clients **subscribe** to queries and get every change pushed in real time. Built by Clockwork Labs (game studio, ~40 people, a16z-backed) to run the MMO *BitCraft*; 2.0 brought it to web apps.
- Not for heavy compute or LLM calls → that's the worker.
- Getting started (from the official TypeScript quickstart): `spacetime dev --template basic-ts` (starts local server, publishes module, generates client bindings into `src/module_bindings/`). Publish: `spacetime publish <DATABASE_NAME>`. Other: `spacetime sql`, `spacetime logs`, `spacetime call`. Deploy to **Maincloud** for the demo (judges' phones can't reach localhost; venue Wi-Fi may be bad, so bring a phone hotspot).
- Module syntax seen in official docs (VERIFY details like column modifiers, lifecycle reducers, errors):
  ```ts
  import { schema, table, t } from 'spacetimedb/server';
  const spacetimedb = schema({
    person: table({ public: true }, { name: t.string() }),
  });
  export default spacetimedb;
  export const add = spacetimedb.reducer({ name: t.string() }, (ctx, { name }) => {
    ctx.db.person.insert({ name });
  });
  ```
- Docs: https://spacetimedb.com/docs, TypeScript quickstart https://spacetimedb.com/docs/quickstarts/typescript, Tables https://spacetimedb.com/docs/tables, Reducers https://spacetimedb.com/docs/functions/reducers, Procedures https://spacetimedb.com/docs/procedures, LLM-friendly docs https://spacetimedb.com/llms.txt. SpacetimeDB also ships an MCP server / agent plugin (see GitHub releases), so use it if available.
- **Privacy:** financial tables should be visible only to their owner. Check the docs for table visibility / **views** (the docs list "tables, reducers, procedures, and views"). If that costs too much time, use public tables filtered by owner for the MVP and be honest in the pitch ("in production these are private views").

### Data model (adapt to real syntax)
- `profile`: identity (PK), display_name, language ('en'|'es'), payday_interval_days, next_payday (date string), role ('user'|'worker')
- `account`: id (PK autoInc), owner identity, nessie_id (optional), kind ('checking'|'savings'|'credit_card'|'auto_loan'|'ira'|'cd'), nickname, balance (cents, i64), credit_limit (cents, optional; Nessie has no credit limit, so store it here), apr (optional), source ('nessie'|'manual')
- `bill`: id, owner, nessie_bill_id (optional), payee, category, amount_cents, due_date, movable (bool), latest_safe_date (optional)
- `income`: id, owner, amount_cents, next_date, interval_days
- `scheduled_spend`: id, owner, category ('groceries'|'gas'), amount_cents, date (projected variable spending)
- `price`: id, kind ('gas'|'grocery'), place, item, price_cents, lat, lng, updated_at, reporter identity
- `plan_job`: id, owner, status ('pending'|'running'|'ready'|'executing'|'done'|'failed'), gap_cents, gap_date, created_at, claimed_by
- `agent_step`: id, job_id, agent ('forecast'|'savings'|'coach'), message, created_at
- `plan_action`: id, job_id, owner, kind ('move_bill'|'grocery_swap'|'gas_switch'|'transfer'), title, detail, savings_cents, fee_avoided_cents, why_en, why_es, status ('proposed'|'approved'|'rejected'|'executed'|'failed'), nessie_ref
- (optional) `receipt_item`: id, owner, name, price_cents, cheaper_alt, alt_price_cents

### Reducers
- User: `upsert_profile`, `request_plan` (creates plan_job; reject if one is already running), `approve_action` / `approve_all` / `reject_action` (only the owner), `report_price` (validate: plausible range e.g. gas $1.50-$7.00, rate-limit per reporter, flag outliers vs nearby median).
- Worker-only (check `ctx.sender` is a registered worker identity): `sync_account`, `sync_bill`, `sync_income`, `claim_job`, `add_step`, `add_action`, `set_job_status`, `mark_action_executed`.
- Init: seed demo prices (gas stations + grocery items near Richardson TX) and manual accounts so the app works with zero external APIs.

---

## 6. Nessie (Capital One mock bank API)

- Base URL: `http://api.nessieisreal.com` (plain HTTP), API key as `?key=...` query param. Get the key from Capital One's booth / Hackerpack / Nessie site. Keep in worker `.env` only.
- Resources: customers, accounts (types: Checking, Savings, Credit Card), merchants, purchases, deposits, withdrawals, transfers, bills (status pending/recurring/completed/cancelled, `payment_date`, `recurring_date` day 1-31, `payment_amount`, `payee`), loans (home/auto/small business, `monthly_payment`, `amount`, `credit_score`).
- Endpoints from memory (VERIFY against Nessie docs before coding):
  - `POST /customers` {first_name, last_name, address:{street_number, street_name, city, state, zip}}
  - `POST /customers/{id}/accounts` {type, nickname, rewards, balance}
  - `POST /merchants` {name, category, address, geocode:{lat,lng}}
  - `POST /accounts/{id}/purchases` {merchant_id, medium:"balance", purchase_date, amount, description}
  - `POST /accounts/{id}/deposits` {medium:"balance", transaction_date, amount, description}
  - `POST /accounts/{id}/bills` {status, payee, nickname, payment_date, recurring_date, payment_amount}
  - `PUT /bills/{id}` (used to move a bill's payment date)
  - `POST /accounts/{id}/transfers` {medium:"balance", payee_id, amount, transaction_date, description}
  - `POST /accounts/{id}/loans` {type, status, credit_score, monthly_payment, amount, description}
  - GETs: `/customers/{id}/accounts`, `/accounts/{id}/bills|purchases|deposits|loans`, `/merchants`
- Nessie may auto-adjust balances when purchases/deposits are created. After seeding, re-read balances and reconcile with the persona numbers below (or create the customer fresh with adjusted starting balances).
- Known gaps: no credit limit (store in Spacetime), no CDs/IRAs (seed manually in Spacetime and say "MinMax combines your bank data with your other accounts").
- If a PNC judge asks why Capital One's API: "Nessie is our bank sandbox; MinMax is bank-agnostic and would connect to PNC the same way."
- **Time box Nessie setup to ~1-1.5 hours.** If it fights back, use seeded data in Spacetime and drop the Capital One track.

---

## 7. Demo persona data (designed to produce exactly a $43 shortfall)

Today = **Sat Nov 7, 2026**. Biweekly payday Fridays: **Nov 6 (just paid), Nov 20, Dec 4**. Net paycheck **$1,720**.

Accounts:
- Checking (Nessie): **$1,089** as of Nov 7
- Savings (Nessie): **$40**
- Credit card (Nessie): balance **$1,840**, limit **$2,500** (stored in Spacetime) → utilization 73.6%, APR 27.9%
- Auto loan (Nessie loan): **$14,200** remaining, **$389/mo**
- Roth IRA (manual, Spacetime): **$650**
- Renter (no mortgage)

Upcoming obligations from checking (bills + projected variable spend):
| Date | Item | Amount | Running balance |
|---|---|---|---|
| Nov 7 | start | | 1,089 |
| Nov 8 | Groceries (H-E-B) | -145 | 944 |
| Nov 9 | Gas | -54 | 890 |
| Nov 10 | Phone | -85 | 805 |
| Nov 12 | Electricity | -142 | 663 |
| Nov 14 | Car insurance (**movable**) | -118 | 545 |
| Nov 15 | Groceries | -145 | 400 |
| Nov 16 | Gas | -54 | 346 |
| **Nov 17** | **Car payment** | **-389** | **-43 ← shortfall** |
| Nov 20 | Paycheck | +1,720 | 1,677 |
| Nov 22 | Groceries | -145 | 1,532 |
| Nov 23 | Gas | -54 | 1,478 |
| Nov 25 | Internet | -65 | 1,413 |
| Nov 29 | Groceries | -145 | 1,268 |
| Nov 30 | Gas | -54 | 1,214 |
| Dec 1 | Rent | -1,100 | 114 |
| Dec 4 | Paycheck | +1,720 | 1,834 |

Health indicators at start: **days of runway = 10** (Nov 7 → Nov 17), **credit utilization 73.6%** (high), **overdraft risk: high**, **savings buffer ≈ $40** (< 1 day of expenses).

Expected "Close the gap" plan (deterministic engine must reproduce these numbers):
1. **Move car insurance $118 from Nov 14 → Nov 21** (after payday). Nov 17 balance: -43 → **+75**. Avoids the **$36 overdraft fee**.
2. **Shop at Aldi on Nov 15** for the 6 usual items: $53.48 vs $77.47 at H-E-B, net of $0.06 drive = **$23.93** saved → +98.93. (H-E-B store brand alone = $18; Walmart $20.64; Kroger $16.38.)
3. **Gas on Nov 16 at Murphy USA** ($3.35 vs Shell $3.59), **net** of 1.0 extra mile = **$3.48** → **+$102.41**. Costco is cheapest per gallon ($3.29) but the 13.2-mile round trip costs $1.74, so it nets only $2.77.
Headline: "Avoid a $36 overdraft fee and end the pay period +$102 instead of -$43." (Numbers come from `shared/forecast.ts`; `npm test` locks them.) Never inflate savings; judges will do the math.

Gas net-savings formula: `net = (usual_price - alt_price) × gallons - (extra_round_trip_miles / mpg) × alt_price`. Reject stations where net ≤ $1. (GasBuddy will send you 6 miles to save 8¢; MinMax won't. Good detail to mention.)

Seed realistic merchants near UTD/Richardson (H-E-B, Walmart, Aldi, Kroger, Shell, QuikTrip, Murphy USA, Exxon) with approximate coordinates, plus ~4 weeks of historical gas/grocery purchases and past paycheck deposits in Nessie so "where your money goes" looks real.

---

## 8. Agents (keep to 3; don't over-engineer)

Orchestrator in the worker: claim `plan_job` → run agents in order → stream `agent_step` rows → write `plan_action`s → job `ready` → wait for approvals → execute → `done`.

1. **Forecast agent (deterministic, no LLM):** compute daily balances to the payday after the shortfall, find first negative date and gap, compute indicators. Same code as client's what-if.
2. **Savings agent (tools + light LLM ranking at most):** candidate moves:
   - `move_bill`: movable bills due before the shortfall that can move to on/after payday (respect latest_safe_date).
   - `grocery_swap`: from upcoming grocery trips / scanned receipt, store-brand or cheaper-store alternatives (seeded price table).
   - `gas_switch`: cheapest station by **net** savings.
   - `transfer`: small savings→checking transfer only if it doesn't wreck the buffer (usually not suggested).
   Greedy: pick the smallest set of actions that closes the gap with a cushion; re-run the forecast to confirm.
3. **Coach agent (Gemini):** for each action, a 1-2 sentence plain-language "Why?" using the user's numbers, plus Spanish. Strict prompt: may only use numbers passed in; never invent figures. Minimal context (no account numbers).

Streamed step messages should feel alive, e.g. "Forecasting your next 14 days… You'll be $43 short on Nov 17." → "Checking which bills can safely move…" → "Car insurance can move to Nov 21 without a late fee." → "Comparing gas near you (net of drive cost)…" → "Writing it up in plain English…"

Execution (after approval): `move_bill` → Nessie `PUT /bills/{id}` new payment_date; `transfer` → Nessie transfer; grocery/gas → recorded as a commitment (and pin/directions in UI). Write `nessie_ref` back, mark executed, re-sync, forecast turns green.

---

## 9. Fallbacks (the demo must never die)

- Spacetime `init` seeds prices + manual accounts; a "demo persona" can be loaded entirely from Spacetime if Nessie is down. Once synced, the app runs from the Spacetime mirror even if Nessie goes offline (pitch it as resilience).
- LLM calls: ~8s timeout → cached/templated explanations keyed by action kind (pre-write EN + ES for the demo actions). Pre-cache the 3 demo questions.
- `DEMO_MODE` flag: if the worker is down, replay a canned agent run (steps + actions with realistic delays).
- Receipt scan fallback: a bundled sample receipt image + cached extraction.
- Deploy to Maincloud; bring a phone hotspot; record the demo video early Sunday as a backup to play if live fails.

## 10. Security (cheap wins + talking points)
- Synthetic data only; never store real bank credentials ("in production: read-only aggregator connection").
- Secrets (Nessie, Gemini) only in the worker `.env`; `.env` in `.gitignore`.
- Reducers validate `ctx.sender` (owner-only approvals; worker-only sync/agent reducers) and inputs (ranges, rate limits).
- Owner-scoped visibility for financial tables (views if time).
- LLM gets minimal context, no account numbers, cannot change numbers or move money.

---

## 11. Build plan and checkpoints (it was ~3:30 PM Sat at handoff)

**Must-win core (nothing else until this works):**
1. Spacetime module + schema + seed; client connects and renders live data.
2. Nessie seed script + worker sync into Spacetime.
3. Dashboard: accounts, health indicators, forecast timeline with red shortfall.
4. Close the gap: job → streamed agent steps → plan → approve on phone → Nessie execution → green. **Includes multi-store grocery basket comparison** (H-E-B / Aldi / Walmart / Kroger) so the grocery fix can be a store switch, not just store-brand swaps. Re-derive and update the section 7 plan numbers from the engine if they change.
5. Deployed to Maincloud; works from phone.

**Status (Sat ~6:45 PM):** 1, 2, 5 done (Maincloud db `minimum`, worker sync working, Bill seeded in Nessie). Engine (`shared/forecast.ts`) done with tests. Persona renamed to **Bill**. Hosting: app on Vercel, worker on Railway, nothing local at demo.

**Then, in order, only if time:** "Cheapest near you" tab (gas ranked by net cost incl. drive; usual grocery basket across 4 stores; monthly savings) → coach: "Why?" explainers + text chat (Gemini) → what-if toggles → push notification "reach out first" → voice coach (Vapi, optional layer on the text coach) → receipt scan (Gemini vision) → Spanish → live price report via QR.

**UI decisions:** welcome screen with "Continue as Bill (demo)" + animation instead of real login. Home = one big sentence-number ("$43 short on Nov 17"), tiny balance line (needed for the red→green moment), one "Close the gap" button; scroll: 4 health tiles (tap = Why?), accounts list, upcoming. Tabs: Home · Plan · Coach · Accounts (+ Prices).

**Design (locked Sat ~8 PM, references via Mobbin MCP):** Fuse's visual system (off-white bg, black type, huge bold numbers with greyed cents, thin line chart, 2x2 rounded tiles with small colorful icons, black pill buttons, top status toasts, smooth motion) + Cleo's AI patterns (chat bubbles, typing dots, tap-to-reply chips, action buttons inside AI bubbles; agent steps shown as AI bubbles). Static bottom tab bar with a soft glassy (frosted) look. Tone: calm and kind, never sassy. Readability: darker greys, >=16px body, big tap targets. Onboarding (UI only, no real auth; Sat ~8:40 PM): 1) Title: logo + "Minimum effort, maximum savings", black "Get started" pill + subtle "Log in" link (goes straight to Bill) -> 2) Create your account (name "Bill", demo email, password dots; looks real, nothing stored) -> 3) Connect your bank (Capital One/Nessie demo, "Read-only. I never see your password.") -> 4) "Here's what I do" (AI explains itself in calm bubbles) -> animated into Home. "Skip" on each screen. Parked: "What matters to you" preferences + notifications screen. Spanish: removed from onboarding; kept only as a small Settings switch. Inspired by, not copied: no third-party logos/illustrations.

**Cut entirely:** auth flows, real grocery/gas APIs, mobile native app, household/shared features, Photon, anything not in the demo.

| By | Checkpoint | If not met |
|---|---|---|
| ~5:30 PM Sat | Spacetime deployed + client live; Nessie seeded | Drop Capital One, use seeded data |
| 11:00 PM Sat | Dashboard + forecast + indicators; **Devpost registered (Submit step done!)** | Cut voice/Spanish/QR now |
| (optional) 8-10:45 PM | ScrabbleBot, only if 5:30 checkpoint met and slot question answered | Skip |
| ~4:00 AM Sun | Close the gap end-to-end incl. Nessie execution | Simplify to fewer agents / DEMO_MODE |
| 4-7 AM | Sleep 2-3 hours (the pitch matters) | |
| 10:00 AM Sun | **Feature freeze.** Polish UI, record ≤2-min demo video, write Devpost, make repo public | |
| 12:00 PM Sun | **Submitted.** Then rehearse | |

---

## 12. Demo and pitch

### ~2-minute table demo flow
1. **Story (15s):** "Bill's paid every two weeks, drives to work, feeds a family of five. Gas in Texas is 94 cents higher than last year…"
2. **Phone buzzes (wow):** "Heads up: you'll be $43 short on Nov 17. I found a fix."
3. **Forecast + indicators:** whole picture, red dip, runway 10 days, utilization 74%. Tap a "Why?".
4. **What-if:** toggle one option, watch the line move.
5. **Receipt (wow):** scan a judge's/sample receipt → cheaper swaps.
6. **Close the gap (wow):** agents stream live → approve on phone → executed in Nessie → laptop turns green. "Avoided a $36 overdraft fee, ended +$102, without borrowing a dime."
7. **Close:** "Low Cash Mode gives 24 hours after. MinMax gives two weeks before."

Show product in the first 30 seconds; no architecture slides first. Have a 30-second version. Rehearse 2-3 times. Have one architecture diagram ready for technical judges.

### Likely judge questions and answers
- *How much does this really save?* Lead with fees avoided ($36 overdraft) + honest small savings; show the math.
- *Why not GasBuddy?* We don't compete on price data (production would license a feed); we connect prices to your forecast and count net savings.
- *Why Spacetime instead of a normal backend?* It's the whole backend; agents are live clients; approvals and agent progress sync across devices instantly with transactional rules, no glue code.
- *What if the AI hallucinates / moves money wrongly?* AI never does math; numbers come from a deterministic engine; nothing moves without approval and guardrails.
- *Capital One API in a PNC project?* Nessie is the sandbox; MinMax is bank-agnostic.
- *Your data?* Keys server-side only, owner-scoped data, minimal LLM context, synthetic data.
- *Who are your users / did you talk to any?* Builder should ask 3-5 people at the event "Have you ever been short before payday? What did you do?" and quote real answers only.

### Devpost checklist
Title, tagline (10-sec pitch), inspiration (real personal sentence + stats with sources), what it does, how we built it (architecture + "AI never does math"), challenges, accomplishments, what's next (real bank aggregator, SMS channel, more languages, household sharing), built with, tracks: **Spacetime, PNC, Capital One (Nessie), Best Design, MLH Gemini**. Public repo. ≤2-minute demo-only video.

---

## 13. Decisions already made (do not re-open)
- Idea: **MinMax** (originally "Minimum"), paycheck-to-paycheck financial health navigator focused on cost of living (gas, groceries, bills) and prevention.
- Tracks: Spacetime main + PNC + Capital One/Nessie; HackUTD Best Design; MLH Gemini.
- Spacetime is the full backend; we accept the Spacetime main prize is a long shot and do it well anyway.
- Human-in-the-loop actions, not autonomous buying.
- Education = just-in-time "Why?" with the user's numbers, not a course library.
- Target by situation (hourly, paycheck to paycheck, families), not ethnicity; Spanish + plain language for access.
- **Rejected pivots (do not suggest again):** household "double-spend"/shared reservations, family "trip mode" shared cart, digital lending circles/tandas, crowdsourced prices as the core feature, ethnic-group targeting, autonomous purchasing agent.

## 14. Sources
- HackUTD Devpost (rules, criteria, deadlines): https://hackutd-zeroday.devpost.com/
- HackUTD site/schedule: https://zeroday.hackutd.co/
- CNBC/SurveyMonkey Money Survey July 2026: https://www.surveymonkey.com/curiosity/cnbc-money-survey-affordability-july-2026/
- AAA Texas gas prices Nov 5 2026: https://www.newschannel6now.com/2026/11/05/aaa-texas-reports-gas-prices-drop-alongside-crude-oil-costs/
- USDA food price outlook (Grocery Dive): https://www.grocerydive.com/news/food-at-home-prices-increase-2026-usda/813359/
- CFPB overdraft report (American Banker): https://www.americanbanker.com/news/cfpb-report-finds-overdraft-nsf-services-are-used-as-a-type-of-credit
- Cash advance app costs (AP/KUTV): https://kutv.com/news/eye-on-your-money/these-apps-allow-workers-to-get-paid-between-paychecks-experts-say-there-are-steep-costs-loans-payday-apps
- PNC Low Cash Mode: https://www.pnc.com/en/personal-banking/banking/services/low-cash-mode.html
- SpacetimeDB docs: https://spacetimedb.com/docs · TS quickstart: https://spacetimedb.com/docs/quickstarts/typescript · LLM docs: https://spacetimedb.com/llms.txt
- Nessie usage reference (Drift project): https://www.mintlify.com/aadit2805/drift/api/nessie/accounts
- ScrabbleBot README: https://gh.r-mj.com/clockworklabs/scrabblebot
- Judges' advice: https://blog.jetbrains.com/ai/2026/06/how-to-win-a-hackathon-notes-from-the-judging-table/
