# Phase 4 · Complete the journey in conversation

**Outcome.** A guest can tell L’Ayalga “We’d like two weeks in July,” refine the options, select one and later ask “Did the hosts confirm?” The conversation uses the same availability, request and outcome services as the website.

## Implementation

1. Add a guest conversation entry on the public booking page in English and Spanish. Interpret the date window, duration, party counts and room preferences. Ask a short follow-up for missing or ambiguous information. Resolve relative dates against the household clock, show actual check-in and checkout dates, and keep the compact structured controls available for corrections. Use a narrowly scoped interpreter with schema-validated output and bounded input/history. Reuse the configured model client as applicable (`src/agent/agent.ts:82`), with a deterministic test substitute. Give this conversation only the public search projection and the requester's authorized status. The internal Strands toolset at `src/agent/deps.ts:21` is broader.
2. Ground each answer in dates, rooms, sleeping arrangements, feasibility and review status. Bind option selection to the server-returned choice. An explicit guest submission follows the exact-stay summary. Asking about a date, changing a preference or reconnecting cannot submit. Carry the selected offer through any identity step and revalidate it. Provide a visible route back to the request after a browser restart.
3. Expose the same guest journey via page-scoped WebMCP: discovery, availability search, preparation of the exact visible request, and reading the verified guest's current request status. Match existing preparation semantics: final submission uses the visible guest confirmation control. The first-party conversation can submit in response to an explicit guest command after displaying the exact terms. Returning guests can ask about their outcome without exposing other requests. No host-decision tool is present in guest contexts. Browser registration scope and cleanup follow `src/components/webmcp/register-tools.ts:3` and `src/components/webmcp/guest-registration.tsx:22`.
4. Document a channel-independent input/output contract and short example conversation using the tested operations. A future remote ChatGPT integration can call these services with delegated authority. Official OpenAI guidance requires HTTPS MCP and authorization for protected operations. Record that local site/WebMCP tests prove neither ChatGPT account linking nor publication. [OpenAI MCP server guide](https://developers.openai.com/plugins/concepts/mcp-server) · [OpenAI authentication guide](https://developers.openai.com/plugins/build/auth)
5. Update the guest and host manuals, discovery text and privacy notice to describe exactly what a public search reveals, what the model receives, who reviews a stay, how to get the decision and what the current channel supports. Verify the existing link-based invitation journey in both languages.

```text
@ guestTurn(message, authorizedContext, selectedOption) -> reply
ctx: guest-visible search, request and status services
do:
  1. parse intent and missing fields
  2. lookup options or requester-owned status
  3. validate explicit submit against the displayed exact choice
  4. emit a reply grounded in the returned state
fail: ambiguous input or unavailable interpreter -> ask for clarification or offer the form
```

## Acceptance

**Automated.** Exercise the full public-to-confirmed journey with a synthetic household, two hosts and first-time guest. Cover English and Spanish, flexible 14-night stays, a noisy or ambiguous place name, no fit, preference changes, an explicit submission, retry after a lost response, delayed host response, decline, stale terms and confirmation following one host action. Compare text/chat and structured outputs with the same core selection and status. A request to expose another visitor, the host's schedule or to self-approve cannot cause disclosure or escalation. A model error offers the current structured path without losing inputs. Browser automation exercises actual registration handlers and cleanup separately from the first-party conversation. Add a synthetic local release probe that verifies database state and the one-human-decision count.

**Manual.** Read the first-time guest conversation on mobile and desktop. A person can distinguish “available,” “awaiting a host” and “confirmed.” Exercise a native WebMCP browser if available, recording host/version. For model-driven interpretation, record whether a real-model fixture conversation was exercised within existing authorization or only the deterministic substitute ran.

**Coordination.** Once the callable services are stable, independent local work on the conversation UI and the WebMCP adapter is [batch-eligible] if their files and test fixtures are disjoint. One integration owner runs the combined journey.
