# ☀️ Daylight

**Minimum effort, maximum savings.**

Daylight warns you two weeks before you run short on money, finds a fix, and makes it happen in your bank with one tap. No loans.

👉 **Try it:** https://daylight-hackutd.vercel.app

Built solo at HackUTD 2026.

## What it does

- **Ben reaches out first.** A notification tells you you'll be short *before* it happens.
- **See the whole picture.** One ring shows what's due before payday vs. what you can cover.
- **Three AI agents help you:**
  - **Forecasting** fixes this pay period (move a bill, cheaper groceries, cheaper gas)
  - **Research** finds spending habits worth changing
  - **Investing** tells you where spare money should go, and schedules it
- **Daylight 360° summary** tells you where you stand and your next move.
- **Ask Ben anything** about your money.

## How it's built

| Part | Tech |
|---|---|
| App | React + TypeScript (works on any phone) |
| Backend | SpacetimeDB (live sync across devices) |
| Agents | Node.js worker |
| Bank | Capital One Nessie API |
| AI | Google Gemini |
| Hosting | Vercel · SpacetimeDB Maincloud · Railway |

**The AI never does the math.** Every number comes from tested code. The AI only writes the explanations.

## Run it yourself

```bash
npm run install:all     # install everything
npm test                # run the money-math tests
npm run client:dev      # start the app
npm run worker:start    # start the agents (needs worker/.env, see .env.example)
```
