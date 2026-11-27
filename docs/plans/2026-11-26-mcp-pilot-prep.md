# Read-only MCP: pilot preparation addendum

Addendum to [the read-only MCP plan](2026-11-25-read-only-mcp.md), section "Open compatibility points for the pilot". Base: `develop` `dfcee3c`, branch `feat/mcp-pilot-prep`, worktree `/Users/juan/code/layalga-mcp-pilot-prep`. Owner decision of 2026-11-26 ("go ahead with your recommendations"): local work only. This addendum authorizes no push, merge, release, hosted read or setting (G0 to G7), production database access, client registration or workflow change. The hosted OAuth server stays off and `ASSISTANT_ACCESS` stays `none` outside tests.

## Outcome

Pilot checks P2 and P4 read their values from the `[MCP_REQUEST]` log line, and gate G6 has a reviewed command that creates and removes the synthetic pilot household. G6 then has no open entry condition.

## 1. Request log fields for P2 and P4

`serveMcp` (`src/mcp/server.ts`) adds three fields to the one line per request. Each value comes from a fixed set, because the caller chooses the header text.

| Field      | Values                                                                                                                  | Source                                                                                                                                |
| ---------- | ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `origin`   | `absent`, `own`, `claude`, `chatgpt`, `other`                                                                           | The `Origin` header compared with the `APP_URL` origin and the two assistant origins. `other` is always refused with outcome `origin` |
| `protocol` | One of the versions the endpoint serves (the SDK's `SUPPORTED_PROTOCOL_VERSIONS` and `2026-07-28`), `absent` or `other` | The `MCP-Protocol-Version` header. A 2025-era `initialize` sends none, so it logs `absent`; later calls carry the negotiated version  |
| `userMs`   | Whole milliseconds, only when the request reached Auth `GET /user`                                                      | The resolver times its `/user` call, including a timeout or failure, and reports it through a callback in its dependencies            |

`ms` stays the whole request. No other field changes. `McpDeps.resolve` gets a second argument, the callback that receives `userMs`; the route passes it to `resolveAssistant` as `onUserCheck`.

Tests first: unit tests for each class and version, for `userMs` present only after `/user` (with a stubbed clock of `performance.now`), and one test that sends canary text in `Origin`, `MCP-Protocol-Version`, the method, the tool name and the arguments and finds none of it in any log line. The resolver test checks that a timed-out `/user` call still reports its time.

## 2. Pilot household command (G6)

`pnpm run pilot:household -- <create|remove> ...` (`scripts/pilot-household.ts`).

Household: one home with a client-chosen UUID `<id>`, internal name `Pilot household <id>` (the marker), timezone `Europe/Madrid`; the three synthetic fixture rooms (`FIXTURE_ROOMS`: two available, one withheld); one host row `Pilot host` with no Auth user and no `host_identity_claims` row, so nobody can sign in as its host; a published listing `Pilot household <first 6 hex of id, upper case>`. No party, invitation or person's name or email. Everything is written in one transaction. The guest's dedicated Google account is not created by the command.

Consequence: nobody can confirm or decline a stay request on this household. A request that the pilot guest sends stays pending, which is enough for `read_request_status`. This is a property of "no host identity that can sign in", not a new decision.

Guards:

| Guard                                                                                                                                                                                                                                  | create                                                                                                                                                    | remove                                                                                                                                            |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--target local\|production` is required                                                                                                                                                                                               | yes                                                                                                                                                       | yes                                                                                                                                               |
| Acknowledgement                                                                                                                                                                                                                        | `--acknowledge "WRITE PILOT HOUSEHOLD"`                                                                                                                   | `--acknowledge "REMOVE PILOT HOUSEHOLD"`                                                                                                          |
| `local`: `DATABASE_URL` host is loopback                                                                                                                                                                                               | yes                                                                                                                                                       | yes                                                                                                                                               |
| `production`: `--project-ref <ref>`, `DATABASE_URL` names that project (the rule of `memory:forget-orphans --apply`, moved to `release-helpers.ts`, checked on the host and user that postgres.js reads) and connects as `layalga_web` | yes                                                                                                                                                       | yes                                                                                                                                               |
| `--records <dir>` is required; the record `pilot-household-<id>.json` (mode 0600) is the command's marker                                                                                                                              | Written as `pending` before the transaction, then `created`. Refuses when the folder holds a record that is not `removed` (one pilot household at a time) | Refuses before any database connection when the record is missing, belongs to another target or project, or is already `removed`                  |
| Real household `00000000-0000-4000-8000-000000000001`                                                                                                                                                                                  | Never written                                                                                                                                             | Refused as an id                                                                                                                                  |
| Database rows                                                                                                                                                                                                                          | Insert only, under the new home                                                                                                                           | Deletes only `where id = <id> and name = <marker>` through `removeFixtureHousehold`, then proves the home is gone, and marks the record `removed` |

`remove --home <id>` is the only removal input. A record that stayed `pending` after a failed transaction removes nothing and is then marked `removed`. The command connects with the role that `DATABASE_URL` names; for production it requires the non-owner web runtime login `layalga_web`, which already holds the needed rights for the release probes. Removal reports how many stay requests it deleted, because any signed-in guest can find the listing and send one.

Lifetime: the record carries `removeBy`, 14 days after creation. The data lifecycle document states that the pilot household exists from G6 until the pilot ends, at most those 14 days, and is removed with `remove`, also as part of the G6 rollback. There is no automatic removal.

Tests first: unit tests for the argument and target guards and the record rules; an integration test on the local stack that creates the household, finds it with `find_households`, searches it with `search_stays` (the same tool functions the endpoint calls), checks that the real household's rows are unchanged, removes it and finds nothing left. The CLI itself runs once on the task stack for evidence.

## 3. Documents

Runbook: P2 and P4 read the new fields; G6 runs `create` before the row is enabled and `remove` in its rollback, and its open entry condition goes. The runbook names the owner authorization for each production run of the command. Notes: a new section with deviations, review and evidence. CHANGELOG Unreleased, the data lifecycle document and the docs index.

## Release-system impact

No check joins the release critical path. The command is an owner-run activation step (Class B, rollback of a hosted change); its tests run in the existing CI jobs.

## Verification

Red, green, independent review, repair, simplify, then once in order on the task stack `layalga-pilot`: bootstrap, typecheck, lint, `pnpm run test`, coverage, `test:integration`, `agent:bundle`, E2E, local release probes, build without the public Supabase variables, the smoke on port 3049, `test:migration:rooms`, and the pilot command on the stack.
