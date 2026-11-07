// Minimum: SpacetimeDB module. This is the ENTIRE backend.
//
// Plain-English map:
// - A "profile" is one person's finances (the demo persona, Maria).
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
    language: t.string(), // 'en' | 'es'
    asOfDate: t.string(), // the demo's "today"
    paydayIntervalDays: t.u32(),
    isDemo: t.bool(),
    homeLat: t.f64(),
    homeLng: t.f64(),
    vehicleMpg: t.f64(),
    usualGallons: t.f64(),
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
    whyEs: t.string(),
    status: t.string(), // 'proposed'|'approved'|'rejected'|'executed'|'failed'
    billId: t.option(t.u64()),
    newDate: t.option(t.string()),
    nessieRef: t.option(t.string()),
  }
);

const spacetimedb = schema({
  appConfig,
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
});
export default spacetimedb;

type Ctx = ReducerCtx<InferSchema<typeof spacetimedb>>;

// ---------- Helpers (not exported) ----------

const $ = (dollars: number): bigint => BigInt(Math.round(dollars * 100));

function demoProfileId(ctx: Ctx): bigint | undefined {
  for (const p of ctx.db.profile.iter()) if (p.isDemo) return p.id;
  return undefined;
}

function requireMember(ctx: Ctx) {
  const m = ctx.db.member.identity.find(ctx.sender);
  if (!m) throw new SenderError('Not a member of any profile');
  return m;
}

// Maria: numbers designed to produce exactly a $43 shortfall on Nov 17 (see CLAUDE.md section 7).
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
  gas('Costco', 3.29, 33.0280, -96.8050);

  const groc = (item: string, nameBrand: number, storeBrand: number) => {
    for (const [variant, dollars] of [['name_brand', nameBrand], ['store_brand', storeBrand]] as const) {
      ctx.db.price.insert({
        id: 0n, kind: 'grocery', place: 'H-E-B', item, variant, priceCents: $(dollars),
        lat: 32.9960, lng: -96.7620, updatedAt: ctx.timestamp, reporter: undefined,
      });
    }
  };
  groc('Cereal, 2-pack', 8.98, 5.48); // 3.50
  groc('Ground beef, 3 lb', 16.47, 13.47); // 3.00
  groc('Milk, 2 gallons', 7.58, 5.58); // 2.00
  groc('Shredded cheese, 2 lb', 9.98, 6.98); // 3.00
  groc('Diapers, 80 ct', 27.99, 21.99); // 6.00
  groc('Pasta and sauce', 6.47, 5.97); // 0.50  => total 18.00
}

function wipeProfileData(ctx: Ctx, profileId: bigint) {
  for (const r of [...ctx.db.account.profileId.filter(profileId)]) ctx.db.account.id.delete(r.id);
  for (const r of [...ctx.db.bill.profileId.filter(profileId)]) ctx.db.bill.id.delete(r.id);
  for (const r of [...ctx.db.income.profileId.filter(profileId)]) ctx.db.income.id.delete(r.id);
  for (const r of [...ctx.db.scheduledSpend.profileId.filter(profileId)]) ctx.db.scheduledSpend.id.delete(r.id);
  for (const r of [...ctx.db.planJob.profileId.filter(profileId)]) ctx.db.planJob.id.delete(r.id);
  for (const r of [...ctx.db.agentStep.profileId.filter(profileId)]) ctx.db.agentStep.id.delete(r.id);
  for (const r of [...ctx.db.planAction.profileId.filter(profileId)]) ctx.db.planAction.id.delete(r.id);
}

// ---------- Lifecycle ----------

export const init = spacetimedb.init(ctx => {
  ctx.db.appConfig.insert({ id: 0, owner: ctx.sender });
  const p = ctx.db.profile.insert({
    id: 0n,
    displayName: 'Maria',
    language: 'en',
    asOfDate: '2026-11-07',
    paydayIntervalDays: 14,
    isDemo: true,
    homeLat: 32.9857, // near UTD, Richardson TX
    homeLng: -96.7502,
    vehicleMpg: 25,
    usualGallons: 15,
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

export const setLanguage = spacetimedb.reducer({ language: t.string() }, (ctx, { language }) => {
  if (language !== 'en' && language !== 'es') throw new SenderError('Language must be en or es');
  const m = requireMember(ctx);
  const p = ctx.db.profile.id.find(m.profileId);
  if (p) ctx.db.profile.id.update({ ...p, language });
});

// Restores Maria's starting numbers between judge demos.
export const resetDemo = spacetimedb.reducer(ctx => {
  const m = requireMember(ctx);
  const p = ctx.db.profile.id.find(m.profileId);
  if (!p || !p.isDemo) throw new SenderError('Only the demo profile can be reset');
  wipeProfileData(ctx, p.id);
  seedDemoFinances(ctx, p.id);
});
