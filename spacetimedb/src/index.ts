// Daylight: SpacetimeDB module. This is the ENTIRE backend.
//
// Plain-English map:
// - A "profile" is one person's finances (the demo persona, George).
// - Every device that connects becomes a "member" of a profile, so phone and
//   laptop see the same money and the same live agent work.
// - Money tables are PRIVATE. Clients only see their own profile's rows through
//   per-user VIEWS (my_accounts, my_bills, ...). Prices are public (shared data).
// - Money is always integer cents (i64 -> bigint). Dates are 'YYYY-MM-DD' strings.

import { schema, table, t, SenderError, type InferSchema, type ReducerCtx } from 'spacetimedb/server';

// ---------- Tables ----------

const appConfig = table(
  { name: 'app_config' },
  {
    id: t.u32().primaryKey(), // always 0
    owner: t.identity(), // database publisher; the agent worker runs as this identity
  }
);

const profile = table(
  { name: 'profile' },
  {
    id: t.u64().primaryKey().autoInc(),
    displayName: t.string(),
    language: t.string(), // legacy, unused (always 'en'); kept so the live DB needs no wipe
    asOfDate: t.string(), // the demo's "today"
    paydayIntervalDays: t.u32(),
    isDemo: t.bool(),
    homeLat: t.f64(),
    homeLng: t.f64(),
    vehicleMpg: t.f64(),
    usualGallons: t.f64(),
    lastNessieSync: t.option(t.timestamp()).default(undefined), // shown in UI: "Synced from your bank 2 min ago"
    needsNessieReset: t.bool().default(false), // set by reset_demo; worker restores bill dates in Nessie
  }
);

// Agent workers are ordinary Spacetime clients. They register with a shared secret
// that only the database owner can set (via `spacetime call ... set_worker_secret`).
const worker = table(
  { name: 'worker' },
  {
    identity: t.identity().primaryKey(),
    registeredAt: t.timestamp(),
  }
);

const workerSecret = table(
  { name: 'worker_secret' },
  {
    id: t.u32().primaryKey(), // always 0
    secret: t.string(),
  }
);

const member = table(
  { name: 'member' },
  {
    identity: t.identity().primaryKey(),
    profileId: t.u64().index('btree'),
    joinedAt: t.timestamp(),
  }
);

const account = table(
  { name: 'account' },
  {
    id: t.u64().primaryKey().autoInc(),
    profileId: t.u64().index('btree'),
    nessieId: t.option(t.string()),
    kind: t.string(), // 'checking'|'savings'|'credit_card'|'auto_loan'|'ira'|'cd'
    nickname: t.string(),
    balanceCents: t.i64(),
    creditLimitCents: t.option(t.i64()),
    apr: t.option(t.f64()),
    source: t.string(), // 'nessie'|'manual'
  }
);

const bill = table(
  { name: 'bill' },
  {
    id: t.u64().primaryKey().autoInc(),
    profileId: t.u64().index('btree'),
    nessieBillId: t.option(t.string()),
    payee: t.string(),
    category: t.string(),
    amountCents: t.i64(),
    dueDate: t.string(),
    movable: t.bool(),
    latestSafeDate: t.option(t.string()),
  }
);

const income = table(
  { name: 'income' },
  {
    id: t.u64().primaryKey().autoInc(),
    profileId: t.u64().index('btree'),
    source: t.string(),
    amountCents: t.i64(),
    nextDate: t.string(),
    intervalDays: t.u32(),
  }
);

const scheduledSpend = table(
  { name: 'scheduled_spend' },
  {
    id: t.u64().primaryKey().autoInc(),
    profileId: t.u64().index('btree'),
    category: t.string(), // 'groceries'|'gas'
    place: t.string(),
    amountCents: t.i64(),
    date: t.string(),
  }
);

const price = table(
  { name: 'price', public: true },
  {
    id: t.u64().primaryKey().autoInc(),
    kind: t.string(), // 'gas'|'grocery'
    place: t.string(),
    item: t.string(), // 'regular' for gas; product name for grocery
    variant: t.string(), // grocery: 'name_brand'|'store_brand'; gas: ''
    priceCents: t.i64(), // gas: cents per gallon (x10 precision not needed)
    lat: t.f64(),
    lng: t.f64(),
    updatedAt: t.timestamp(),
    reporter: t.option(t.identity()),
  }
);

const planJob = table(
  { name: 'plan_job' },
  {
    id: t.u64().primaryKey().autoInc(),
    profileId: t.u64().index('btree'),
    status: t.string(), // 'pending'|'running'|'ready'|'executing'|'done'|'failed'
    gapCents: t.i64(),
    gapDate: t.string(),
    createdAt: t.timestamp(),
    claimedBy: t.option(t.identity()),
  }
);

const agentStep = table(
  { name: 'agent_step' },
  {
    id: t.u64().primaryKey().autoInc(),
    jobId: t.u64().index('btree'),
    profileId: t.u64().index('btree'),
    agent: t.string(), // 'forecast'|'savings'|'coach'|'executor'
    message: t.string(),
    createdAt: t.timestamp(),
  }
);

const planAction = table(
  { name: 'plan_action' },
  {
    id: t.u64().primaryKey().autoInc(),
    jobId: t.u64().index('btree'),
    profileId: t.u64().index('btree'),
    kind: t.string(), // 'move_bill'|'grocery_swap'|'gas_switch'|'transfer'
    title: t.string(),
    detail: t.string(),
    savingsCents: t.i64(),
    feeAvoidedCents: t.i64(),
    whyEn: t.string(),
    whyEs: t.string(), // legacy, unused (always empty)
    status: t.string(), // 'proposed'|'approved'|'rejected'|'executed'|'failed'
    billId: t.option(t.u64()),
    newDate: t.option(t.string()),
    nessieRef: t.option(t.string()),
    // grocery_swap / gas_switch: which projected trip changes, by how much, and where to go instead
    spendId: t.option(t.u64()).default(undefined),
    spendDeltaCents: t.option(t.i64()).default(undefined),
    newPlace: t.option(t.string()).default(undefined),
    sortOrder: t.u32().default(0),
  }
);

// Past purchases (from the bank, or from scanned receipts). The Spending agent reasons over these.
const transaction = table(
  { name: 'transaction' },
  {
    id: t.u64().primaryKey().autoInc(),
    profileId: t.u64().index('btree'),
    nessieId: t.string().unique(),
    merchant: t.string(),
    category: t.string(),
    amountCents: t.i64(),
    date: t.string(),
    description: t.string(),
    source: t.string(), // 'bank' | 'receipt'
  }
);

// Coach chat: the user asks, the worker answers with Gemini grounded in engine numbers.
const coachMessage = table(
  { name: 'coach_message' },
  {
    id: t.u64().primaryKey().autoInc(),
    profileId: t.u64().index('btree'),
    role: t.string(), // 'user' | 'coach'
    text: t.string(),
    language: t.string(), // legacy, unused (always 'en')
    status: t.string(), // user: 'pending' | 'answered'; coach: 'final'
    createdAt: t.timestamp(),
  }
);

const spacetimedb = schema({
  appConfig,
  worker,
  workerSecret,
  profile,
  member,
  account,
  bill,
  income,
  scheduledSpend,
  price,
  planJob,
  agentStep,
  planAction,
  coachMessage,
  transaction,
});
export default spacetimedb;

type Ctx = ReducerCtx<InferSchema<typeof spacetimedb>>;

// ---------- Helpers (not exported) ----------

const $ = (dollars: number): bigint => BigInt(Math.round(dollars * 100));

function demoProfileId(ctx: Ctx): bigint | undefined {
  for (const p of ctx.db.profile.iter()) if (p.isDemo) return p.id;
  return undefined;
}

function requireWorker(ctx: Ctx) {
  if (!ctx.db.worker.identity.find(ctx.sender)) throw new SenderError('Only a registered worker can do this');
}

function requireDemoProfile(ctx: Ctx): bigint {
  const pid = demoProfileId(ctx);
  if (pid === undefined) throw new SenderError('No demo profile');
  return pid;
}

function requireMember(ctx: Ctx) {
  const m = ctx.db.member.identity.find(ctx.sender);
  if (!m) throw new SenderError('Not a member of any profile');
  return m;
}

// George: numbers designed to produce exactly a $43 shortfall on Nov 17 (see CLAUDE.md section 7).
function seedDemoFinances(ctx: Ctx, profileId: bigint) {
  const acct = (kind: string, nickname: string, dollars: number, extra: { limit?: number; apr?: number; source?: string } = {}) =>
    ctx.db.account.insert({
      id: 0n,
      profileId,
      nessieId: undefined,
      kind,
      nickname,
      balanceCents: $(dollars),
      creditLimitCents: extra.limit === undefined ? undefined : $(extra.limit),
      apr: extra.apr,
      source: extra.source ?? 'nessie',
    });
  acct('checking', 'Everyday Checking', 1089);
  acct('savings', 'Rainy Day Savings', 40);
  acct('credit_card', 'Credit Card', 1840, { limit: 2500, apr: 27.9 });
  acct('auto_loan', 'Auto Loan', 14200, { apr: 7.4 });
  acct('ira', 'Roth IRA', 650, { source: 'manual' });
  acct('cd', '6-month CD (matures Mar 2027)', 300, { apr: 4.1, source: 'manual' });

  const billRow = (payee: string, category: string, dollars: number, dueDate: string, movable = false, latestSafeDate?: string) =>
    ctx.db.bill.insert({
      id: 0n,
      profileId,
      nessieBillId: undefined,
      payee,
      category,
      amountCents: $(dollars),
      dueDate,
      movable,
      latestSafeDate,
    });
  billRow('Phone', 'phone', 85, '2026-11-10');
  billRow('Electricity', 'utilities', 142, '2026-11-12');
  billRow('Car insurance', 'insurance', 118, '2026-11-14', true, '2026-11-21');
  billRow('Car payment', 'auto_loan', 389, '2026-11-17');
  billRow('Internet', 'internet', 65, '2026-11-25');
  billRow('Rent', 'rent', 1100, '2026-12-01');

  ctx.db.income.insert({
    id: 0n,
    profileId,
    source: 'Paycheck',
    amountCents: $(1720),
    nextDate: '2026-11-20',
    intervalDays: 14,
  });

  const spend = (category: string, place: string, dollars: number, date: string) =>
    ctx.db.scheduledSpend.insert({ id: 0n, profileId, category, place, amountCents: $(dollars), date });
  for (const d of ['2026-11-08', '2026-11-15', '2026-11-22', '2026-11-29']) spend('groceries', 'H-E-B', 145, d);
  for (const d of ['2026-11-09', '2026-11-16', '2026-11-23', '2026-11-30']) spend('gas', 'Shell', 54, d);
}

// Prices near UTD / Richardson TX (approximate coordinates).
// Gas: usual station Shell $3.59. Murphy USA nets ~$3 after drive cost;
// Costco is cheaper per gallon but the drive eats the savings (the "GasBuddy trap").
// Grocery: 6 store-brand swaps on the usual H-E-B basket that sum to exactly $18.00.
function seedPrices(ctx: Ctx) {
  const gas = (place: string, dollars: number, lat: number, lng: number) =>
    ctx.db.price.insert({
      id: 0n, kind: 'gas', place, item: 'regular', variant: '', priceCents: $(dollars),
      lat, lng, updatedAt: ctx.timestamp, reporter: undefined,
    });
  gas('Shell', 3.59, 32.9925, -96.7520);
  gas('Exxon', 3.62, 32.9860, -96.7445);
  gas('QuikTrip', 3.39, 33.0050, -96.7700);
  gas('Murphy USA', 3.35, 32.9980, -96.7585);
  gas('Costco', 3.29, 33.0700, -96.8200);

  // George's usual items at 4 stores. Keep in sync with GROCERY_TABLE in shared/demo-fixture.ts.
  // Usual (H-E-B name brand) = $77.47. Aldi $53.48 (net $23.93 after drive) wins; H-E-B store brand saves $18.
  const stores = {
    'H-E-B': [32.9960, -96.7620],
    Aldi: [32.9800, -96.7700],
    'Walmart Supercenter': [32.9680, -96.7000],
    Kroger: [32.9480, -96.7150],
  } as const;
  const row = (place: keyof typeof stores, item: string, variant: string, dollars: number) =>
    ctx.db.price.insert({
      id: 0n, kind: 'grocery', place, item, variant, priceCents: $(dollars),
      lat: stores[place][0], lng: stores[place][1], updatedAt: ctx.timestamp, reporter: undefined,
    });
  const table: Array<[string, number, number, number, number, number]> = [
    // item, H-E-B name, H-E-B store, Aldi, Walmart, Kroger
    ['Cereal, 2-pack', 8.98, 5.48, 4.49, 5.12, 5.29],
    ['Ground beef, 3 lb', 16.47, 13.47, 12.99, 13.24, 13.99],
    ['Milk, 2 gallons', 7.58, 5.58, 5.18, 5.36, 5.78],
    ['Shredded cheese, 2 lb', 9.98, 6.98, 5.98, 6.48, 6.98],
    ['Diapers, 80 ct', 27.99, 21.99, 19.99, 20.97, 22.49],
    ['Pasta and sauce', 6.47, 5.97, 4.85, 5.04, 5.89],
  ];
  for (const [item, hebName, hebStore, aldi, walmart, kroger] of table) {
    row('H-E-B', item, 'name_brand', hebName);
    row('H-E-B', item, 'store_brand', hebStore);
    row('Aldi', item, 'store_brand', aldi);
    row('Walmart Supercenter', item, 'store_brand', walmart);
    row('Kroger', item, 'store_brand', kroger);
  }
}

function wipeProfileData(ctx: Ctx, profileId: bigint) {
  for (const r of [...ctx.db.account.profileId.filter(profileId)]) ctx.db.account.id.delete(r.id);
  for (const r of [...ctx.db.bill.profileId.filter(profileId)]) ctx.db.bill.id.delete(r.id);
  for (const r of [...ctx.db.income.profileId.filter(profileId)]) ctx.db.income.id.delete(r.id);
  for (const r of [...ctx.db.scheduledSpend.profileId.filter(profileId)]) ctx.db.scheduledSpend.id.delete(r.id);
  for (const r of [...ctx.db.planJob.profileId.filter(profileId)]) ctx.db.planJob.id.delete(r.id);
  for (const r of [...ctx.db.agentStep.profileId.filter(profileId)]) ctx.db.agentStep.id.delete(r.id);
  for (const r of [...ctx.db.planAction.profileId.filter(profileId)]) ctx.db.planAction.id.delete(r.id);
  for (const r of [...ctx.db.coachMessage.profileId.filter(profileId)]) ctx.db.coachMessage.id.delete(r.id);
}

// ---------- Lifecycle ----------

export const init = spacetimedb.init(ctx => {
  ctx.db.appConfig.insert({ id: 0, owner: ctx.sender });
  const p = ctx.db.profile.insert({
    id: 0n,
    displayName: 'George',
    language: 'en',
    asOfDate: '2026-11-07',
    paydayIntervalDays: 14,
    isDemo: true,
    homeLat: 32.9857, // near UTD, Richardson TX
    homeLng: -96.7502,
    vehicleMpg: 25,
    usualGallons: 15,
    lastNessieSync: undefined,
    needsNessieReset: false,
  });
  seedDemoFinances(ctx, p.id);
  seedPrices(ctx);
});

// Every device that connects joins the demo profile, so phone + laptop share one picture.
export const onConnect = spacetimedb.clientConnected(ctx => {
  if (ctx.db.member.identity.find(ctx.sender)) return;
  const pid = demoProfileId(ctx);
  if (pid === undefined) return;
  ctx.db.member.insert({ identity: ctx.sender, profileId: pid, joinedAt: ctx.timestamp });
});

// ---------- Per-user views (owner-only visibility) ----------

export const myProfile = spacetimedb.view({ name: 'my_profile', public: true }, t.array(profile.rowType), ctx => {
  const m = ctx.db.member.identity.find(ctx.sender);
  if (!m) return [];
  const p = ctx.db.profile.id.find(m.profileId);
  return p ? [p] : [];
});

export const myAccounts = spacetimedb.view({ name: 'my_accounts', public: true }, t.array(account.rowType), ctx => {
  const m = ctx.db.member.identity.find(ctx.sender);
  return m ? [...ctx.db.account.profileId.filter(m.profileId)] : [];
});

export const myBills = spacetimedb.view({ name: 'my_bills', public: true }, t.array(bill.rowType), ctx => {
  const m = ctx.db.member.identity.find(ctx.sender);
  return m ? [...ctx.db.bill.profileId.filter(m.profileId)] : [];
});

export const myIncome = spacetimedb.view({ name: 'my_income', public: true }, t.array(income.rowType), ctx => {
  const m = ctx.db.member.identity.find(ctx.sender);
  return m ? [...ctx.db.income.profileId.filter(m.profileId)] : [];
});

export const mySpend = spacetimedb.view({ name: 'my_spend', public: true }, t.array(scheduledSpend.rowType), ctx => {
  const m = ctx.db.member.identity.find(ctx.sender);
  return m ? [...ctx.db.scheduledSpend.profileId.filter(m.profileId)] : [];
});

export const myJobs = spacetimedb.view({ name: 'my_jobs', public: true }, t.array(planJob.rowType), ctx => {
  const m = ctx.db.member.identity.find(ctx.sender);
  return m ? [...ctx.db.planJob.profileId.filter(m.profileId)] : [];
});

export const mySteps = spacetimedb.view({ name: 'my_steps', public: true }, t.array(agentStep.rowType), ctx => {
  const m = ctx.db.member.identity.find(ctx.sender);
  return m ? [...ctx.db.agentStep.profileId.filter(m.profileId)] : [];
});

export const myActions = spacetimedb.view({ name: 'my_actions', public: true }, t.array(planAction.rowType), ctx => {
  const m = ctx.db.member.identity.find(ctx.sender);
  return m ? [...ctx.db.planAction.profileId.filter(m.profileId)] : [];
});

export const myCoach = spacetimedb.view({ name: 'my_coach', public: true }, t.array(coachMessage.rowType), ctx => {
  const m = ctx.db.member.identity.find(ctx.sender);
  return m ? [...ctx.db.coachMessage.profileId.filter(m.profileId)] : [];
});

export const myTransactions = spacetimedb.view({ name: 'my_transactions', public: true }, t.array(transaction.rowType), ctx => {
  const m = ctx.db.member.identity.find(ctx.sender);
  return m ? [...ctx.db.transaction.profileId.filter(m.profileId)] : [];
});

// ---------- User reducers ----------

const ACTIVE_JOB = new Set(['pending', 'running', 'ready', 'executing']);

export const requestPlan = spacetimedb.reducer(ctx => {
  const m = requireMember(ctx);
  for (const j of ctx.db.planJob.profileId.filter(m.profileId)) {
    if (ACTIVE_JOB.has(j.status)) throw new SenderError('A plan is already in progress');
  }
  ctx.db.planJob.insert({
    id: 0n,
    profileId: m.profileId,
    status: 'pending',
    gapCents: 0n,
    gapDate: '',
    createdAt: ctx.timestamp,
    claimedBy: undefined,
  });
});

function setActionStatus(ctx: Ctx, actionId: bigint, status: 'approved' | 'rejected') {
  const m = requireMember(ctx);
  const a = ctx.db.planAction.id.find(actionId);
  if (!a || a.profileId !== m.profileId) throw new SenderError('Action not found');
  if (a.status !== 'proposed') throw new SenderError(`Action is already ${a.status}`);
  ctx.db.planAction.id.update({ ...a, status });
  // If that settles every action (e.g. the last skip after an approved fix already ran), close the plan.
  const job = ctx.db.planJob.id.find(a.jobId);
  const settled = new Set(['executed', 'rejected', 'failed']);
  if (job && job.status === 'ready' && [...ctx.db.planAction.jobId.filter(a.jobId)].every(x => x.id === a.id ? settled.has(status) : settled.has(x.status))) {
    ctx.db.planJob.id.update({ ...job, status: 'done' });
  }
}

export const approveAction = spacetimedb.reducer({ actionId: t.u64() }, (ctx, { actionId }) =>
  setActionStatus(ctx, actionId, 'approved')
);

export const rejectAction = spacetimedb.reducer({ actionId: t.u64() }, (ctx, { actionId }) =>
  setActionStatus(ctx, actionId, 'rejected')
);

export const approveAll = spacetimedb.reducer({ jobId: t.u64() }, (ctx, { jobId }) => {
  const m = requireMember(ctx);
  const job = ctx.db.planJob.id.find(jobId);
  if (!job || job.profileId !== m.profileId) throw new SenderError('Plan not found');
  for (const a of [...ctx.db.planAction.jobId.filter(jobId)]) {
    if (a.status === 'proposed') ctx.db.planAction.id.update({ ...a, status: 'approved' });
  }
});


// Restores George's starting numbers between judge demos.
export const resetDemo = spacetimedb.reducer(ctx => {
  const m = requireMember(ctx);
  const p = ctx.db.profile.id.find(m.profileId);
  if (!p || !p.isDemo) throw new SenderError('Only the demo profile can be reset');
  wipeProfileData(ctx, p.id);
  seedDemoFinances(ctx, p.id);
  ctx.db.profile.id.update({ ...p, displayName: 'George', needsNessieReset: true, lastNessieSync: undefined });
  // Restore seeded prices (keeps nothing reported live by judges' phones from the last demo).
  for (const r of [...ctx.db.price.iter()]) ctx.db.price.id.delete(r.id);
  seedPrices(ctx);
});

// ---------- Worker registration ----------

// Owner-only. Run once per database: spacetime call --server maincloud minimum set_worker_secret '"<secret>"'
export const setWorkerSecret = spacetimedb.reducer({ secret: t.string() }, (ctx, { secret }) => {
  const cfg = ctx.db.appConfig.id.find(0);
  if (!cfg || !cfg.owner.equals(ctx.sender)) throw new SenderError('Only the database owner can set the worker secret');
  if (secret.length < 16) throw new SenderError('Secret must be at least 16 characters');
  if (ctx.db.workerSecret.id.find(0)) ctx.db.workerSecret.id.update({ id: 0, secret });
  else ctx.db.workerSecret.insert({ id: 0, secret });
});

export const registerWorker = spacetimedb.reducer({ secret: t.string() }, (ctx, { secret }) => {
  const stored = ctx.db.workerSecret.id.find(0);
  if (!stored || stored.secret !== secret) throw new SenderError('Bad worker secret');
  if (!ctx.db.worker.identity.find(ctx.sender)) {
    ctx.db.worker.insert({ identity: ctx.sender, registeredAt: ctx.timestamp });
  }
});

// ---------- Worker reducers: Nessie -> Spacetime sync ----------
// Upserts match on the Nessie ID first, then link an unlinked seeded row of the same
// kind/payee, so Daylight-only fields (movable, latest_safe_date, credit limit) survive.

export const syncAccount = spacetimedb.reducer(
  { nessieId: t.string(), kind: t.string(), nickname: t.string(), balanceCents: t.i64() },
  (ctx, { nessieId, kind, nickname, balanceCents }) => {
    requireWorker(ctx);
    const pid = requireDemoProfile(ctx);
    const rows = [...ctx.db.account.profileId.filter(pid)];
    const existing =
      rows.find(a => a.nessieId === nessieId) ?? rows.find(a => a.kind === kind && a.nessieId === undefined);
    if (existing) {
      ctx.db.account.id.update({ ...existing, nessieId, nickname, balanceCents, source: 'nessie' });
    } else {
      ctx.db.account.insert({
        id: 0n, profileId: pid, nessieId, kind, nickname, balanceCents,
        creditLimitCents: undefined, apr: undefined, source: 'nessie',
      });
    }
  }
);

export const syncBill = spacetimedb.reducer(
  { nessieBillId: t.string(), payee: t.string(), amountCents: t.i64(), dueDate: t.string() },
  (ctx, { nessieBillId, payee, amountCents, dueDate }) => {
    requireWorker(ctx);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) throw new SenderError('dueDate must be YYYY-MM-DD');
    const pid = requireDemoProfile(ctx);
    const rows = [...ctx.db.bill.profileId.filter(pid)];
    const existing =
      rows.find(b => b.nessieBillId === nessieBillId) ??
      rows.find(b => b.payee === payee && b.nessieBillId === undefined);
    if (existing) {
      ctx.db.bill.id.update({ ...existing, nessieBillId, amountCents, dueDate });
    } else {
      ctx.db.bill.insert({
        id: 0n, profileId: pid, nessieBillId, payee, category: 'other', amountCents, dueDate,
        movable: false, latestSafeDate: undefined,
      });
    }
  }
);

export const markNessieSynced = spacetimedb.reducer(ctx => {
  requireWorker(ctx);
  const p = ctx.db.profile.id.find(requireDemoProfile(ctx));
  if (p) ctx.db.profile.id.update({ ...p, lastNessieSync: ctx.timestamp });
});

// ---------- Worker reducers: Close the gap (agent jobs) ----------
// Flow: user request_plan -> worker claim_job -> add_step* -> add_action* -> set_job_status('ready')
//       -> user approve_* -> worker executes in Nessie -> mark_action_executed (applies the change here)

const JOB_STATUSES = new Set(['pending', 'running', 'ready', 'executing', 'done', 'failed']);
const TERMINAL_ACTION = new Set(['executed', 'rejected', 'failed']);

function requireJob(ctx: Ctx, jobId: bigint) {
  const job = ctx.db.planJob.id.find(jobId);
  if (!job) throw new SenderError('Job not found');
  return job;
}

export const claimJob = spacetimedb.reducer({ jobId: t.u64() }, (ctx, { jobId }) => {
  requireWorker(ctx);
  const job = requireJob(ctx, jobId);
  if (job.status !== 'pending') throw new SenderError(`Job is ${job.status}`);
  ctx.db.planJob.id.update({ ...job, status: 'running', claimedBy: ctx.sender });
});

export const addStep = spacetimedb.reducer(
  { jobId: t.u64(), agent: t.string(), message: t.string() },
  (ctx, { jobId, agent, message }) => {
    requireWorker(ctx);
    const job = requireJob(ctx, jobId);
    ctx.db.agentStep.insert({ id: 0n, jobId, profileId: job.profileId, agent, message: message.slice(0, 500), createdAt: ctx.timestamp });
  }
);

export const addAction = spacetimedb.reducer(
  {
    jobId: t.u64(), kind: t.string(), title: t.string(), detail: t.string(),
    savingsCents: t.i64(), feeAvoidedCents: t.i64(), whyEn: t.string(),
    billId: t.option(t.u64()), newDate: t.option(t.string()),
    spendId: t.option(t.u64()), spendDeltaCents: t.option(t.i64()), newPlace: t.option(t.string()),
    sortOrder: t.u32(),
  },
  (ctx, a) => {
    requireWorker(ctx);
    const job = requireJob(ctx, a.jobId);
    if (job.status !== 'running') throw new SenderError('Job is not running');
    // Guardrails: an action may only touch rows owned by the job's profile, and never pay more.
    if (a.billId !== undefined) {
      const b = ctx.db.bill.id.find(a.billId);
      if (!b || b.profileId !== job.profileId) throw new SenderError('Bill not in this profile');
      if (b.latestSafeDate && a.newDate && a.newDate > b.latestSafeDate) throw new SenderError('Bill cannot move past its latest safe date');
    }
    if (a.spendId !== undefined) {
      const s = ctx.db.scheduledSpend.id.find(a.spendId);
      if (!s || s.profileId !== job.profileId) throw new SenderError('Spend not in this profile');
      if (a.spendDeltaCents !== undefined && a.spendDeltaCents > 0n) throw new SenderError('A fix cannot increase spending');
    }
    if (a.savingsCents < 0n || a.feeAvoidedCents < 0n) throw new SenderError('Savings cannot be negative');
    ctx.db.planAction.insert({
      id: 0n, jobId: a.jobId, profileId: job.profileId, kind: a.kind, title: a.title, detail: a.detail,
      savingsCents: a.savingsCents, feeAvoidedCents: a.feeAvoidedCents, whyEn: a.whyEn, whyEs: '',
      status: 'proposed', billId: a.billId, newDate: a.newDate, nessieRef: undefined,
      spendId: a.spendId, spendDeltaCents: a.spendDeltaCents, newPlace: a.newPlace, sortOrder: a.sortOrder,
    });
  }
);

export const setJobStatus = spacetimedb.reducer(
  { jobId: t.u64(), status: t.string(), gapCents: t.i64(), gapDate: t.string() },
  (ctx, { jobId, status, gapCents, gapDate }) => {
    requireWorker(ctx);
    if (!JOB_STATUSES.has(status)) throw new SenderError('Bad status');
    const job = requireJob(ctx, jobId);
    ctx.db.planJob.id.update({ ...job, status, gapCents, gapDate });
  }
);

// Called by the worker after it carried out an approved action (e.g. moved the bill in Nessie).
// Applies the effect to Spacetime in the same transaction, so every screen updates at once.
export const markActionExecuted = spacetimedb.reducer(
  { actionId: t.u64(), ok: t.bool(), nessieRef: t.option(t.string()) },
  (ctx, { actionId, ok, nessieRef }) => {
    requireWorker(ctx);
    const a = ctx.db.planAction.id.find(actionId);
    if (!a) throw new SenderError('Action not found');
    if (a.status !== 'approved') throw new SenderError(`Action is ${a.status}, not approved`);
    if (ok) {
      if (a.kind === 'move_bill' && a.billId !== undefined && a.newDate) {
        const b = ctx.db.bill.id.find(a.billId);
        if (b) ctx.db.bill.id.update({ ...b, dueDate: a.newDate });
      }
      if ((a.kind === 'grocery_swap' || a.kind === 'gas_switch') && a.spendId !== undefined) {
        const s = ctx.db.scheduledSpend.id.find(a.spendId);
        if (s) {
          const amount = s.amountCents + (a.spendDeltaCents ?? 0n);
          ctx.db.scheduledSpend.id.update({ ...s, amountCents: amount < 0n ? 0n : amount, place: a.newPlace ?? s.place });
        }
      }
    }
    ctx.db.planAction.id.update({ ...a, status: ok ? 'executed' : 'failed', nessieRef });
    // Close the job once every action is settled.
    const all = [...ctx.db.planAction.jobId.filter(a.jobId)];
    const job = ctx.db.planJob.id.find(a.jobId);
    if (job && all.every(x => x.id === a.id || TERMINAL_ACTION.has(x.status))) {
      ctx.db.planJob.id.update({ ...job, status: 'done' });
    }
  }
);

// Rejecting the last open action also closes the job.
export const closeJobIfSettled = spacetimedb.reducer({ jobId: t.u64() }, (ctx, { jobId }) => {
  const m = requireMember(ctx);
  const job = requireJob(ctx, jobId);
  if (job.profileId !== m.profileId) throw new SenderError('Plan not found');
  const all = [...ctx.db.planAction.jobId.filter(jobId)];
  if (job.status === 'ready' && all.every(x => TERMINAL_ACTION.has(x.status))) {
    ctx.db.planJob.id.update({ ...job, status: 'done' });
  }
});

export const ackNessieReset = spacetimedb.reducer(ctx => {
  requireWorker(ctx);
  const p = ctx.db.profile.id.find(requireDemoProfile(ctx));
  if (p) ctx.db.profile.id.update({ ...p, needsNessieReset: false });
});

// ---------- Coach chat ----------

export const askCoach = spacetimedb.reducer({ text: t.string() }, (ctx, { text }) => {
  const m = requireMember(ctx);
  const q = text.trim();
  if (!q) throw new SenderError('Ask a question');
  if (q.length > 500) throw new SenderError('Please keep questions under 500 characters');
  // Rate limit: one open question at a time per profile.
  for (const msg of ctx.db.coachMessage.profileId.filter(m.profileId)) {
    if (msg.role === 'user' && msg.status === 'pending') throw new SenderError('The coach is still answering');
  }
  ctx.db.coachMessage.insert({ id: 0n, profileId: m.profileId, role: 'user', text: q, language: 'en', status: 'pending', createdAt: ctx.timestamp });
});

export const addCoachReply = spacetimedb.reducer({ replyTo: t.u64(), text: t.string() }, (ctx, { replyTo, text }) => {
  requireWorker(ctx);
  const q = ctx.db.coachMessage.id.find(replyTo);
  if (!q || q.role !== 'user') throw new SenderError('Question not found');
  ctx.db.coachMessage.id.update({ ...q, status: 'answered' });
  ctx.db.coachMessage.insert({
    id: 0n, profileId: q.profileId, role: 'coach', text: text.slice(0, 1200), language: 'en', status: 'final', createdAt: ctx.timestamp,
  });
});

export const clearCoach = spacetimedb.reducer(ctx => {
  const m = requireMember(ctx);
  for (const r of [...ctx.db.coachMessage.profileId.filter(m.profileId)]) ctx.db.coachMessage.id.delete(r.id);
});

// Onboarding: the name typed on "Create your account" becomes the profile's display name.
export const setDisplayName = spacetimedb.reducer({ name: t.string() }, (ctx, { name }) => {
  const m = requireMember(ctx);
  const clean = name.trim().replace(/\s+/g, ' ').slice(0, 24);
  if (!clean) throw new SenderError('Please enter a name');
  const p = ctx.db.profile.id.find(m.profileId);
  if (p) ctx.db.profile.id.update({ ...p, displayName: clean });
});

// ---------- Worker: purchase history sync ----------
export const syncTransaction = spacetimedb.reducer(
  { nessieId: t.string(), merchant: t.string(), category: t.string(), amountCents: t.i64(), date: t.string(), description: t.string() },
  (ctx, a) => {
    requireWorker(ctx);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(a.date)) throw new SenderError('date must be YYYY-MM-DD');
    if (ctx.db.transaction.nessieId.find(a.nessieId)) return; // already synced
    ctx.db.transaction.insert({ id: 0n, profileId: requireDemoProfile(ctx), ...a, source: 'bank' });
  }
);
