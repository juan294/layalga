# Guest booking channels

A guest signs in with Google to find a listed household and initiate a stay. The website, its English and Spanish conversation and its WebMCP tools share the same guest-facing availability data. The booking database supplies the dates, rooms and outcome. The model can interpret scheduling language. Only an authenticated host can confirm the stay.

## Booking operations

| Operation                 | Input and authority                                                                                                                                                                       | Result and next action                                                                                                                                                                                |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Discover households       | Verified Google session and a published household name, 2–80 characters.                                                                                                                  | Published display names and opaque listing handles. Choose a match or refine the name.                                                                                                                |
| Search for a stay         | Verified Google session, listing handle, earliest check-in, latest checkout, nights, adults, children and pets. Dates use the household calendar.                                         | Feasible check-in and checkout dates, guest room labels, arrangements, capacities and room references. Every option requires host confirmation. The guest can change the window, group or preference. |
| Prepare a request         | With a verified Google session, choose one returned date pair with the exact room references, party, notes and requests. The guest explicitly accepts any overflow arrangement they need. | A short-lived browser-bound draft for an exact review. Changed terms require a fresh selection. Searching, selecting and signing in do not book a visit.                                              |
| Send the reviewed request | Verified Google account, exact reviewed terms and the draft’s submission key.                                                                                                             | A private pending receipt. Repeating the same submission recovers its receipt. The hosts see the request and inventory remains available.                                                             |
| Read the outcome          | Signed-in requester and their own receipt.                                                                                                                                                | Pending, confirmed, declined, withdrawn, expired or a prompt to choose again. A confirmed request links to the live visit and its current status.                                                     |
| Decide                    | An authenticated household host, the request, the version reviewed and confirm or decline.                                                                                                | Confirmation rechecks the exact stay and commits the booking and follow-up together. A decline closes the request. The guest can retrieve either outcome autonomously.                                |

## Browser tools

| Tool                                  | Scope and arguments                                                                                                                                                                                                                        |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `layalga.public.find_households`      | Signed-in discovery and listing pages. Takes `name`.                                                                                                                                                                                       |
| `layalga.public.search_stays`         | Signed-in discovery and listing pages. Takes `handle`, ISO dates `from` and `to`, and integer `nights`, `adults`, `children`, `pets`. The window is at most 90 days and the stay at most 30 nights.                                        |
| `layalga.public.prepare_stay_request` | Available when the household’s search form displays suitable options. Takes the displayed `from`, `to` and `roomRefs` from one option. Selects rooms in the visible form. The guest reviews overflow and sends using the visible controls. |
| `layalga.guest.read_request_status`   | Private receipt page. Takes an empty object. The server checks the signed-in requester and returns the request status and live visit status when applicable.                                                                               |

Tool registrations follow the current page and disappear on navigation. Browser-agent access needs a verified session in an open page and a compatible browser. If the session expires, the guest signs in again before continuing. Standard controls work without WebMCP. The remote assistant channel below uses the same lookups with the guest's delegated identity, and host decisions stay in the household interface.

## Example with a synthetic household

| Speaker  | Exchange                                                                                            |
| -------- | --------------------------------------------------------------------------------------------------- |
| Guest    | Signs in with Google.                                                                               |
| Guest    | “Two weeks in July at Casa Roble for two adults.”                                                   |
| L’Ayalga | Shows the available options with actual dates, such as July 1–15, and the rooms that fit that stay. |
| Guest    | Selects the dates and exact room and reviews the sleeping arrangement.                              |
| L’Ayalga | Shows the dates, rooms, party and any notes or special requests for a final review.                 |
| Guest    | “Send my request.”                                                                                  |
| L’Ayalga | **Awaiting host confirmation.** The request is available in the guest’s private history.            |
| Host     | Checks the household plans and confirms the reviewed stay.                                          |
| Guest    | “Did the hosts confirm?”                                                                            |
| L’Ayalga | Shows the confirmed booking and a link to the guest’s receipt.                                      |

## Remote assistant channel

A guest can connect Claude, and later ChatGPT, to read the same guest data from outside the browser. The channel is read-only and ships dark: `ASSISTANT_ACCESS` defaults to `none`, and then `/api/mcp`, its metadata, the consent page and the header link are off (`src/lib/server/env.ts:216`, `src/app/api/mcp/route.ts:26`). The **Connected assistants** page still works, so a guest can always disconnect. Hosted activation follows the gates in the [activation runbook](../release/assistant-access-activation.md); each gate needs its own owner authorization.

The endpoint is a stateless MCP server over HTTPS POST at `/api/mcp`, for the 2025-11-25 and 2026-07-28 protocol revisions. Supabase Auth is the authorization server. Only pre-registered clients in `public.assistant_clients`, each with one exact `https` callback, can connect; dynamic registration is off.

| Tool                  | Arguments                                                                               | Answer                                                                                                                                                                  |
| --------------------- | --------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `find_households`     | `name`                                                                                  | Published display names, listing handles and a website link for each household                                                                                          |
| `search_stays`        | `handle`, ISO dates `from` and `to`, and integer `nights`, `adults`, `children`, `pets` | Check-in and checkout dates, room terms under labels such as `r1`, the recommended rooms and a link to the same search on the website. Room references are not returned |
| `read_request_status` | None                                                                                    | The signed-in guest's own requests: household, dates, request status and visit status, with a link to the request history                                               |

No tool can send, change or withdraw a request; the guest does that on the website. Website links in answers have no language prefix, and the site picks the language from the browser. The tool answers come from `src/mcp/projections.ts`.

### Identity

| Check                                                                                                                                                                                                                                                                                                            | Where                                                        |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| The guest signs in with Google and approves the assistant on the consent page, which shows the assistant and the callback domain                                                                                                                                                                                 | `/{locale}/oauth/consent`                                    |
| The access token hook gives an allowed client's token the audience `https://layalga.thecreativetoken.com/api/mcp` and the role `layalga_assistant`, blanks email and phone, and removes the metadata claims. It refuses a disabled or unknown client, a changed callback, and a host or prepared host email      | `supabase/migrations/20261125000100_assistant_access.sql:48` |
| Each call checks the ES256 signature, issuer, expiry, audience and client, then the allowlist row, then the host rule, then calls Auth `GET /user` with a 3-second limit and no cache, so that a disconnect takes effect at once. The account must have a verified Google identity and must not belong to a host | `src/lib/auth/assistant-bearer.ts:103`                       |

Every identity refusal is a 401 with `invalid_token`. An outage of Auth, its keys or the database is a 503 with `Retry-After`, so a short fault does not end connections. Web sign-out leaves an assistant connected; the guest disconnects on the **Connected assistants** page.

### Limits

| Limit                       | Value                                                                                                                                                                                                           |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| One account with one client | 60 POST requests per minute and 1,000 per 24 hours from the first request. A tool call over the limit returns the status `rate_limited` with the wait in seconds; other methods get HTTP 429 with `Retry-After` |
| One client, all accounts    | 1,200 POST requests per minute, then HTTP 429. A request that the account windows refuse does not count here                                                                                                    |
| Body                        | 64 KiB (413); a JSON-RPC array is refused (400)                                                                                                                                                                 |
| `subscriptions/listen`      | Refused before dispatch                                                                                                                                                                                         |
| Origin                      | Absent, the site's own origin, `https://claude.ai` and `https://chatgpt.com` pass; others get 403                                                                                                               |

The counts are in PostgreSQL (`src/core/assistant-access/rate-limit.ts:3`) and run after the signature check and before the `/user` call. See the [data lifecycle](../security/data-lifecycle.md#connected-assistants) for what an assistant vendor receives.
