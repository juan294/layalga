# ChatGPT and Claude access to guest booking

Proposed plan for owner review. Planning baseline: 2026-11-24, branch `chore/post-v2.5.1`. No implementation is authorized by this document. Claims marked VERIFIED were read in source on that date; INFERRED claims need the Phase 1 spike.

Phase 1 ran locally on 2026-11-25 and recommends Supabase Auth under four conditions: [spike result](../research/2026-11-25-external-agent-oauth-spike.md). It confirmed the risk in "Prerequisite security change". The owner accepted that choice on 2026-11-25 and authorized Phase 2, starting with the token rejection as a separate change. The OAuth server stays disabled until its four conditions hold. Phase 2 has a [detailed specification](2026-11-25-read-only-mcp.md), proposed for owner review.

## Outcome

A guest who talks to ChatGPT or Claude can find a listed household, compare dates and rooms, prepare a request and read the hosts' answer. The guest signs in with Google before any lookup. A human presses Send on an L'Ayalga page. A host still makes the only booking decision. This extends the [guest booking channels contract](../architecture/guest-booking-channels.md); the website, conversation and WebMCP tools keep their behavior.

## What can be reused

VERIFIED: the booking core does not depend on a browser. Discovery and search take plain input (`src/core/booking/public-listings.ts:37`, `src/core/booking/public-stay-search.ts:103`). Submission takes an explicit `{ userId, email }` and is replay-safe through its idempotency key and payload hash (`src/core/booking/stay-requests.ts:114`). Submission rechecks inventory and caps pending requests for each guest and household.

Three parts depend on the browser and need new work:

| Part     | Current state                                                                                                                                | Needed                                                                                                             |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Identity | `verifiedRequester()` reads the cookie session and requires a confirmed email and a Google identity (`src/lib/auth/verified-requester.ts:4`) | A bearer-token resolver that checks signature, issuer, expiry, audience and client, and proves the Google identity |
| Draft    | The encryption key joins a browser cookie and the user; it expires after 15 minutes (`src/lib/auth/stay-request-draft.ts`)                   | A server-stored draft that the owner opens by ID. The agent cannot change its terms after it exists                |
| Consent  | The Send button and the overflow checkbox are in the page. In the core, overflow consent is a boolean that a model could set                 | The guest reviews and sends on an L'Ayalga page                                                                    |

There is no request rate limit on discovery or search. The MCP endpoint needs one for each account and client before publication.

## Prerequisite security change

INFERRED, high severity if it is skipped: `auth.getUser()` validates the user, and the host pages trust the result (`src/lib/auth/current-user.ts`, `src/lib/auth/current-host.ts`). Nothing checks `client_id`. If the OAuth server issues Supabase access tokens, a third-party client that holds a host's token could place it in a session cookie and reach host pages. This is not reachable today because the OAuth server is off in `supabase/config.toml:376`; the hosted setting is UNVERIFIED. Web authentication must reject tokens that carry `client_id` before the OAuth server is enabled anywhere. The spike must also show what such a token can do directly against the Supabase Auth and Data APIs.

## External requirements

A delegated research pass read these primary documents on 2026-11-24; the coordinator did not re-read them:

- The [MCP authorization specification](https://modelcontextprotocol.io/specification/latest/basic/authorization) requires protected resource metadata (RFC 9728) and audience validation. Clients send a resource indicator. Client ID metadata documents are preferred; dynamic registration is deprecated.
- [OpenAI](https://developers.openai.com/plugins/build/auth) and [Claude](https://claude.com/docs/connectors/building/authentication.md) both need S256 PKCE and accept dynamic registration as the alternative to client ID metadata documents.
- [Supabase Auth as an OAuth 2.1 server](https://supabase.com/docs/guides/auth/oauth-server/getting-started) is in beta. It needs our consent page and has no custom scopes. Its source sets the token audience from the user; an access token hook can change it. Issue [#2952](https://github.com/supabase/auth/issues/2952) reports a low default registration limit that could be shared by all users of one AI product.
- [OpenAI's help page](https://help.openai.com/en/articles/12584461-developer-mode-and-mcp-apps-in-chatgpt) limits write actions in custom connectors to Business, Enterprise and Edu plans. Ordinary ChatGPT guests therefore need a published plugin, and [its review](https://developers.openai.com/plugins/deploy/app-review.md) asks for a demo sign-in without multi-factor authentication. Regional and Claude plan limits are UNVERIFIED.

## Phases

1. **Spike, local only.** Enable the OAuth server on a disposable local stack. Prove or reject: audience through the hook, registration by both clients' rules, the `client_id` rejection, and the token's direct API power. Exit: a written choice of authorization server. Stop here if Supabase fails.
2. **Read-only MCP.** Add `/api/mcp` (outside the proxy matcher and inside the 300-second function rule), protected resource metadata, consent page, bearer resolver, rate limit, and the tools for find, search and status. Reuse the WebMCP schemas. Tests: wrong audience, expired token, a token in a cookie, a non-Google account, another guest's receipt, rate limit.
3. **Prepare and send.** Add server-stored drafts and a prepare tool that returns a review link. The guest signs in, reads the exact terms, accepts any overflow and presses Send. Tests: altered terms, another account, expiry, replay, stale rooms, host ping still sent.
4. **Pilot and publication.** Real client tests with a synthetic published household, privacy notice update, then directory submissions. Each remote step needs its own authorization.

Each phase follows the local gate in `CLAUDE.md` and stops for acceptance. Preview deployments are disabled, so remote client tests need a production release or a local tunnel approved by the owner.

## Owner decisions

| Decision                | Recommendation                                                | Decisive tradeoff                                                                               |
| ----------------------- | ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Authorization server    | Supabase Auth, subject to the Phase 1 spike                   | One identity store and little code; a dedicated provider gives scopes and a true audience today |
| Final send              | L'Ayalga review page                                          | Provable human consent costs the guest one extra tap                                            |
| Rollout order           | Claude connector pilot, then both directories                 | Ordinary ChatGPT guests wait for review                                                         |
| Reviewer access         | Synthetic household and a dedicated Google account            | Adds test data to production, outside the real home                                             |
| Data sent to AI vendors | Listing, dates, room terms and status only; no notes or email | Less conversational detail                                                                      |
