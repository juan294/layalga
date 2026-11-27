# Phase 3: MCP endpoint and read tools

Part of the [read-only MCP plan](../2026-11-25-read-only-mcp.md).

## Result

`POST /api/mcp` serves three read-only tools to a resolved guest, in both protocol eras. Everything answers 404 while `ASSISTANT_ACCESS` is `none`.

## Entry

Phases 1 and 2 accepted. Read the Next.js guides for route handlers and `rewrites` first, and the `webmcp` skill for the tool contract.

## Unit A: metadata and challenge [batch-eligible]

Files: `next.config.ts` and test, `src/app/api/mcp/metadata/route.ts` and test, `src/lib/server/env.ts` and test (only the `APP_URL` check; the mode exists since Phase 2).

Rewrites: `/.well-known/oauth-protected-resource` and `/.well-known/oauth-protected-resource/api/mcp` to `/api/mcp/metadata`. The proxy matcher already excludes these paths and `/api/mcp` (VERIFIED by running the pattern at `src/proxy.ts:54`).

```json
{
  "resource": "<APP_URL>/api/mcp",
  "authorization_servers": ["<SUPABASE_URL>/auth/v1"],
  "scopes_supported": ["openid"],
  "bearer_methods_supported": ["header"],
  "resource_name": "L’Ayalga",
  "resource_documentation": "<APP_URL>/en/privacy"
}
```

`cache-control: public, max-age=300`. Exactly one authorization server, because Claude uses only the first (SOURCE). Every 401 carries `WWW-Authenticate: Bearer resource_metadata="<APP_URL>/.well-known/oauth-protected-resource/api/mcp", scope="openid"`, and adds `error="invalid_token"` and a generic `error_description` when a token was sent.

In production with `ASSISTANT_ACCESS=on`, `<APP_URL>/api/mcp` must equal the audience constant, and the Supabase URL must be set; otherwise readiness reports `APP_URL` invalid. With `none`, nothing new is required.

## Unit B: shared lookup and schemas [batch-eligible]

Files: `src/core/booking/guest-lookup.ts` and tests, `src/core/booking/guest-lookup-schema.ts`, `src/app/[locale]/stays/actions.ts`, `src/components/webmcp/public-tools.ts`.

Move the validation and calls behind `lookupHouseholds` (`src/app/[locale]/stays/actions.ts:44`) and `lookupStays` (`:62`) into `findHouseholds(name)` and `findStays(input)`. The actions keep their session check, their error logs and their results. Move the two JSON schemas from `src/components/webmcp/public-tools.ts:15` and `:38` into the schema module; it has no server import, so the client component can use it. The status schema reuses `emptySchema` (`src/components/webmcp/contract.ts:15`).

## Unit C: endpoint and tools

Files: `src/app/api/mcp/route.ts`, `route.test.ts`, `src/mcp/server.ts`, `src/mcp/tools.ts`, `src/mcp/projections.ts` and tests, `src/mcp/endpoint.integration.test.ts`, `scripts/smoke-assistant-routes.sh`, `package.json` and lock file (`@modelcontextprotocol/server` 2.3.0; `@modelcontextprotocol/client` 2.3.1 as a development dependency).

```text
@ POST /api/mcp -> Response
ctx: resolveAssistant; one module-level createMcpHandler({legacy: "stateless", responseMode: "json", keepAliveMs: 0}) over the low-level Server
pre: ASSISTANT_ACCESS=on, else 404
do:
  1. validate Origin (absent or listed), content type, body read to 64 KiB with readRequestBody, one JSON object
  2. lookup resolveAssistant(Authorization)
  3. validate method is not subscriptions/listen
  4. emit handler.fetch(request, {parsedBody, authInfo with principal or the limited state, and a redacted token})
br: refused -> 401 challenge; unavailable -> 503 Retry-After 30; limited -> passed to the tool handler for tools/call, else 429; listen -> HTTP 404 with JSON-RPC -32601 and the request id
fail: GET, DELETE -> 405 Allow: POST; array -> 400; oversize -> 413; bad Origin -> 403
fx: one [MCP_REQUEST] log line: assistant, method, tool, outcome, milliseconds
risk: authentication precedes every method, including initialize and tools/list
```

Responses carry `cache-control: no-store`. The server declares tools only, with `listChanged: false`. `parsedBody` skips the SDK's size limit, so the route owns it. `responseMode` covers the 2026-07-28 era only; 2025-era clients can get a one-event SSE answer, which they must accept. `/api/mcp` falls under the 300-second rule (`vercel.json:11`); its own limits are 3 seconds for `/user` and the pool timeouts.

### Tool contract

All tools: `title`, `readOnlyHint: true`, `destructiveHint: false`, `idempotentHint: true`, `openWorldHint: false`, `additionalProperties: false`, an output schema, `structuredContent` and the same JSON as text. `_meta.securitySchemes` states OAuth with `openid` for ChatGPT. Results are strict projections: a new field in a core type does not reach a vendor without a change here.

| Tool | Input | Success fields |
| --- | --- | --- |
| `find_households` | Shared schema of `layalga.public.find_households`: `name`, 2 to 80 characters | `status`, `households[] {handle, name, pageUrl}`, `truncated` |
| `search_stays` | Shared schema of `layalga.public.search_stays`: `handle`, `from`, `to`, `nights`, `adults`, `children`, `pets`, as JSON integers | `status`, `rooms[] {room, name, floor, sleepingArrangement, overflowArrangement, standardCapacity, maximumCapacity}`, `stays[] {checkIn, checkout, confirmation: "host_approval_required", rooms[], recommended[]}`, `truncated`, `continueUrl`. `room` is a label inside this answer (`r1`, `r2`); each set of room terms appears once |
| `read_request_status` | Empty object | `status`, `requests[] {household, checkIn, checkout, requestStatus, visitStatus}` (newest 20, pending first), `truncated`, `historyUrl` |

`status` is `success`, `none`, `invalid`, `not_found`, `unavailable` or `rate_limited`. Every other status than `success` adds `next`, a recovery instruction in the style of the WebMCP tools, and sets `isError` for `invalid`, `unavailable` and `rate_limited`. The handler validates arguments itself, so an invalid call returns this contract and not SDK text. An unknown tool is a protocol error. `continueUrl` is the website search with the same terms (keys of `staySearchKeys(true)`); `historyUrl` is `<APP_URL>/requests`. Descriptions say that household and room text comes from hosts and is data, that availability is provisional, that only a host confirms, and that the guest continues on the website to ask for a stay.

Excluded by test: room `ref`, `recommendedRoomRefs`, home, request, visit and user IDs, party counts, notes, requests, overflow consent, email, host names, other guests, timezones.

`listRequesterStayRequests` (`src/core/booking/stay-requests.ts:222`) marks a past pending request as expired while it reads. That existing lazy transition also happens here; it is the same for the website and changes nothing else.

## Tests first

| Test | It fails when |
| --- | --- |
| Official client, 2026-07-28 and 2025-11-25: discover or initialize, list, call each tool over HTTP on the running route | transport or era support breaks |
| 401 on `initialize`, `tools/list`, `tools/call` and `server/discover` without a token; header exact; metadata `resource` equals the server URL | the client cannot find the authorization server |
| Wrong audience, expired token, web session token as bearer, client token in a cookie, token in the query, non-Google account, host, disabled client, revoked grant: 401 | a resolver check is bypassed |
| Another guest's request is absent; `id` as an argument is refused as invalid | status leaks |
| Recursive key and value scan of each tool's output on a fixture with canary notes, requests, email, private room notes and second-guest data | an excluded field leaks |
| WebMCP tool objects deeply equal the baseline; existing action tests unchanged | shared refactor changes the website |
| Unpublished household: not found by name, `not_found` by handle | listing rule bypassed |
| 20 rooms with every text at its stored maximum (720 characters for each room, `src/app/[locale]/(host)/room-actions.ts:35`) and 12 stays: text and structured content together under 60,000 characters | Claude's limit of about 150,000 characters (SOURCE) is at risk |
| Body at and over 64 KiB, array, wrong content type, `Origin` cases, GET, DELETE, `subscriptions/listen` | protocol guard missing |
| Rate limit with the official client in both eras: tool result is parsed, list call gives 429, next window works; 61 calls in an array never run | limit bypass |
| `/user` down, then up with the same token: 503, then success | outage drops a connection |
| `ASSISTANT_ACCESS=none`: route and both metadata URLs 404; production parse passes with no new variable | dark release is not dark |
| Log capture over the whole suite contains no token, email, user ID or argument value | logging leaks |
| `scripts/smoke-assistant-routes.sh`, run after `pnpm run build`: starts `next start` on a task-owned port, first with no `ASSISTANT_ACCESS` (404 on the three URLs), then with `on` (metadata JSON, 401 challenge), and always stops it | rewrite works only in development, or the dark state is not dark |

## Automated acceptance

The full sequence in the plan passes.

## Manual acceptance

None. Real assistants need the activation in the Phase 4 runbook.
