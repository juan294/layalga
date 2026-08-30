# Phase 0: AgentCore Runtime TypeScript spike

Timebox: 6 hours of work on 2026-08-30. Outcome is recorded either way.
Authorization: D3 (resources named `layalga-*`, profile `archy`, us-east-1).

## Goal

Prove or disprove, with the real Strands TypeScript SDK on AgentCore Runtime:
deploy a Node 22 zip, trigger a hook interrupt, persist the session in
Postgres, resume the interrupt from a different runtime session (a fresh
microVM), and see the gated tool execute exactly once.

## Preconditions

- `.env.local` holds `SUPABASE_DB_PASSWORD`, `SUPABASE_PROJECT_REF`.
- Docker daemon running (for the local Supabase stack used in step 2).
- `aws sts get-caller-identity --profile archy` succeeds.

## Tasks

- [x] 0.1 Create `spike/agentcore/` with its own `package.json` (`"type": "module"`, `engines.node ">=22"`), `tsconfig.json` (ES2022, module esnext, bundler resolution, strict), and dependencies at the pinned versions: `@strands-agents/sdk`, `bedrock-agentcore`, `zod`, `postgres`, `esbuild`, `tsx`, `@aws-sdk/client-bedrock-agentcore`. The root has no `package.json` (D13).
- [x] 0.2 Migration `supabase/migrations/20260830000000_agent_sessions.sql` creating `agent_sessions(key text primary key, session_id text not null, data bytea not null, updated_at timestamptz not null default now())` plus index on `session_id`, RLS enabled. Apply locally (`supabase start`, `supabase db reset`) and then to the remote project (`supabase link --project-ref hyyrnpyidipkuhakeiyb`, `supabase db push`). This is the only Phase 0 schema and Phase 1 keeps it.
- [x] 0.3 `spike/agentcore/src/postgres-storage.ts`: Strands `Storage` over `agent_sessions` (pseudocode below).
- [x] 0.4 `spike/agentcore/src/agent.ts`: `buildAgent(sessionId)` with `BedrockModel({ region: 'us-east-1', modelId: process.env.BEDROCK_MODEL_ID })`, one tool `place_hold` that inserts a row into a scratch table `spike_holds(id, label, created_at)` (created in the same migration, dropped in Phase 1), and a `BeforeToolCallEvent` hook that interrupts with name `host_decision` when `toolUse.name === 'place_hold'`.
- [x] 0.5 `spike/agentcore/src/app.ts`: `BedrockAgentCoreApp` entrypoint accepting `{ task: 'start', sessionId, prompt }` and `{ task: 'resume', sessionId, responses }`, returning `{ stopReason, interrupts, holdsAfter }`.
- [x] 0.6 `spike/agentcore/scripts/bundle.sh`: `esbuild src/app.ts --bundle --platform=node --target=node22 --format=esm --outfile=dist/app.js` (if the ESM bundle fails on `require` shims, fall back to `--format=cjs` and record it), then `zip -j dist/deployment_package.zip dist/app.js` plus a minimal `package.json` with `engines.node ">=22"`.
- [x] 0.7 Infra by CLI: S3 bucket `layalga-agent-bundles-106403001709`; IAM role `layalga-agentcore-runtime` with the trust policy and the direct-deploy execution policy from `infra/iam/agentcore-runtime-*.json` (account 106403001709, region us-east-1, agent name `layalga_agent`); upload the zip; `create-agent-runtime --agent-runtime-name layalga_agent` with `codeConfiguration { runtime: NODE_22, entryPoint: ["app.js"] }`, `serverProtocol HTTP`, `networkMode PUBLIC`, `lifecycleConfiguration { idleRuntimeSessionTimeout: 300, maxLifetime: 1800 }`, environment variables `DATABASE_URL`, `BEDROCK_MODEL_ID`. Record the runtime ARN in `.env.local` as `AGENTCORE_RUNTIME_ARN`.
- [x] 0.8 `spike/agentcore/scripts/spike.ts` (the checkable artifact): run the three-step protocol below against the deployed runtime and print PASS or FAIL per assertion.
- [x] 0.9 Write `docs/decisions/0002-agent-runtime.md` with the verdict, the exact commands, timings, and any deviation (bundle format, saveLatestOn strategy). Status Accepted.
- [x] 0.10 If FAIL or the timebox expires: verdict is `local` (D8), the runtime is deleted (`delete-agent-runtime`), the bucket and role stay for a later retry, and `AGENT_RUNTIME=local` becomes the production setting in Phase 5.

## Spike protocol (scripts/spike.ts)

```
sessionId = 'spike:' + randomUUID()
r1 = invoke(runtimeSessionId = uuid1, { task: 'start', sessionId, prompt: 'Place a hold labelled ALPHA.' })
assert r1.stopReason === 'interrupt' && r1.interrupts.length === 1 && r1.interrupts[0].name === 'host_decision'
row = sql`select data from agent_sessions where key like ${sessionId + '/%'} and key like '%snapshot_latest%'`
assert JSON.parse(row.data).data.interrupts.activated === true          // snapshot persisted with the interrupt
assert (await countHolds('ALPHA')) === 0                                  // tool did not run yet
sleep until runtime session uuid1 is stopped: call StopRuntimeSession(uuid1) explicitly
r2 = invoke(runtimeSessionId = uuid2, { task: 'resume', sessionId, responses: [{ interruptId: r1.interrupts[0].id, response: { approved: true, hostId: 'spike' } }] })
assert r2.stopReason === 'endTurn'
assert (await countHolds('ALPHA')) === 1                                  // executed exactly once, no model re-call needed
r3 = invoke(runtimeSessionId = uuid3, { task: 'start', sessionId: sessionId + ':b', prompt: 'Place a hold labelled BETA.' })
r4 = invoke(runtimeSessionId = uuid4, { task: 'resume', sessionId: sessionId + ':b', responses: [{ interruptId: r3.interrupts[0].id, response: { approved: false, hostId: 'spike', note: 'no' } }] })
assert (await countHolds('BETA')) === 0 && r4.stopReason === 'endTurn'     // decline cancels the tool
```

PASS requires all assertions, total wall time under 3 minutes for the four
invocations, and CloudWatch logs readable via `aws logs tail`.

## Pseudocode

```ts
// postgres-storage.ts
export class PostgresStorage implements Storage {
  constructor(private sql: postgres.Sql, private prefix = '') {}
  async write(key, data) { await sql`insert into agent_sessions (key, session_id, data) values (${k(key)}, ${sessionOf(key)}, ${data}) on conflict (key) do update set data = excluded.data, updated_at = now()` }
  async read(key) { const [r] = await sql`select data from agent_sessions where key = ${k(key)}`; return r ? new Uint8Array(r.data) : null }
  async delete(key) { await sql`delete from agent_sessions where key = ${k(key)}` }
  async list(prefix) { return (await sql`select key from agent_sessions where key like ${k(prefix) + '%'} order by key`).map(r => r.key) }
  namespace(p) { return new PostgresStorage(this.sql, this.prefix + normalizePrefix(p) + '/') }
}
// sessionOf(key) = first path segment; normalizeKey from '@strands-agents/sdk/storage'

// agent.ts
export function buildAgent(sessionId) {
  const session = new SessionManager({ sessionId, storage: new PostgresStorage(sql), saveLatestOn: 'message' })
  const agent = new Agent({ model, tools: [placeHold], sessionManager: session, printer: false })
  agent.addHook(BeforeToolCallEvent, (event) => {
    if (event.toolUse.name !== 'place_hold') return
    const d = event.interrupt<{ approved: boolean; hostId: string; note?: string }>({ name: 'host_decision', reason: { input: event.toolUse.input } })
    if (!d.approved) event.cancel = `Declined by host: ${d.note ?? ''}`
  })
  return agent
}

// app.ts
const app = new BedrockAgentCoreApp({ invocationHandler: { requestSchema: TaskSchema, process: async (req) => {
  const agent = buildAgent(req.sessionId)
  const result = req.task === 'start' ? await agent.invoke(req.prompt) : await agent.invoke(req.responses.map(r => ({ interruptResponse: r })))
  return { stopReason: result.stopReason, interrupts: (result.interrupts ?? []).map(i => i.toJSON()), holdsAfter: await countAll() }
} } })
app.run()
```

## Verification

- `node --import tsx spike/agentcore/scripts/spike.ts` prints PASS for every assertion.
- `aws logs tail /aws/bedrock-agentcore/runtimes/<id>-DEFAULT --since 10m --profile archy --region us-east-1` shows the four invocations.
- `bash scripts/verify-bootstrap.sh` still passes (no root `package.json`).

## Exit criteria

- `docs/decisions/0002-agent-runtime.md` committed with verdict `agentcore` or `local`.
- If `agentcore`: runtime ARN recorded, spike script passing.
- If `local`: runtime deleted, reasons and the failing assertion recorded.

STOP. Report the verdict and wait for confirmation before Phase 1.
