# Guest booking channels

A guest signs in with Google to find a listed household and initiate a stay. The website, its English and Spanish conversation and its WebMCP tools share the same guest-facing availability data. The booking database supplies the dates, rooms and outcome. The model can interpret scheduling language. Only an authenticated host can confirm the stay.

## Booking operations

| Operation | Input and authority | Result and next action |
| --- | --- | --- |
| Discover households | Verified Google session and a published household name, 2–80 characters. | Published display names and opaque listing handles. Choose a match or refine the name. |
| Search for a stay | Verified Google session, listing handle, earliest check-in, latest checkout, nights, adults, children and pets. Dates use the household calendar. | Feasible check-in and checkout dates, guest room labels, arrangements, capacities and room references. Every option requires host confirmation. The guest can change the window, group or preference. |
| Prepare a request | With a verified Google session, choose one returned date pair with the exact room references, party, notes and requests. The guest explicitly accepts any overflow arrangement they need. | A short-lived browser-bound draft for an exact review. Changed terms require a fresh selection. Searching, selecting and signing in do not book a visit. |
| Send the reviewed request | Verified Google account, exact reviewed terms and the draft’s submission key. | A private pending receipt. Repeating the same submission recovers its receipt. The hosts see the request and inventory remains available. |
| Read the outcome | Signed-in requester and their own receipt. | Pending, confirmed, declined, withdrawn, expired or a prompt to choose again. A confirmed request links to the live visit and its current status. |
| Decide | An authenticated household host, the request, the version reviewed and confirm or decline. | Confirmation rechecks the exact stay and commits the booking and follow-up together. A decline closes the request. The guest can retrieve either outcome autonomously. |

## Browser tools

| Tool | Scope and arguments |
| --- | --- |
| `layalga.public.find_households` | Signed-in discovery and listing pages. Takes `name`. |
| `layalga.public.search_stays` | Signed-in discovery and listing pages. Takes `handle`, ISO dates `from` and `to`, and integer `nights`, `adults`, `children`, `pets`. The window is at most 90 days and the stay at most 30 nights. |
| `layalga.public.prepare_stay_request` | Available when the household’s search form displays suitable options. Takes the displayed `from`, `to` and `roomRefs` from one option. Selects rooms in the visible form. The guest reviews overflow and sends using the visible controls. |
| `layalga.guest.read_request_status` | Private receipt page. Takes an empty object. The server checks the signed-in requester and returns the request status and live visit status when applicable. |

Tool registrations follow the current page and disappear on navigation. Browser-agent access needs a verified session in an open page and a compatible browser. If the session expires, the guest signs in again before continuing. Standard controls work without WebMCP. A future remote client can reuse the services with delegated guest identity, keeping host decisions in the household interface.

## Example with a synthetic household

| Speaker | Exchange |
| --- | --- |
| Guest | Signs in with Google. |
| Guest | “Two weeks in July at Casa Roble for two adults.” |
| L’Ayalga | Shows the available options with actual dates, such as July 1–15, and the rooms that fit that stay. |
| Guest | Selects the dates and exact room and reviews the sleeping arrangement. |
| L’Ayalga | Shows the dates, rooms, party and any notes or special requests for a final review. |
| Guest | “Send my request.” |
| L’Ayalga | **Awaiting host confirmation.** The request is available in the guest’s private history. |
| Host | Checks the household plans and confirms the reviewed stay. |
| Guest | “Did the hosts confirm?” |
| L’Ayalga | Shows the confirmed booking and a link to the guest’s receipt. |

## Connecting an external agent

The page tools use the guest’s Google-backed L’Ayalga session in the browser. For a future ChatGPT or Claude integration, the app description can be discoverable before account linking. The remote booking service requires a linked guest session for every operation, starting with household lookup and availability. The planned transport is an HTTPS MCP server. The remote server must check the token audience and scopes for each protected tool. Guest status, submission consent and host authority remain server-side. Client connection tests and directory publication are separate from the local booking workflow. [OpenAI MCP server guide](https://developers.openai.com/plugins/concepts/mcp-server) · [OpenAI authentication guide](https://developers.openai.com/plugins/build/auth)
