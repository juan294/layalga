# Phase 3. Recover the exact completed invitation link

**Finding** FE-H1, with the capture-run portion of BE-M1  
**Entry gate** Accepted Phase 2 and current invitation and link lifecycle tests

## Durable capture and stable links

Add nullable capture linkage and recovery metadata on invitations. Use a unique capture run ID for new agent captures, with an FK to the retained run, and store the recovery scheme version, random generation and canonical link locale. Enforce all-or-none recovery metadata. Keep legacy rows and direct fixture writes valid. Use the existing app-only roles and express grants in migration tests. Keep the public lookup by hash and its expiry, withdrawal and revoke guards. [Invitation lookup](../../../src/core/booking/invitations.ts#L236), [Run retention](../../../supabase/migrations/20261015084815_drop_demo_schema.sql#L43), [Fixture inserts](../../../src/test-support/fixture-household.ts#L235).

At capture, allocate the invitation ID before token issuance. Derive the opaque token with HMAC-SHA256 under `LINK_TOKEN_SECRET`, using a dedicated versioned purpose string, the invitation UUID and a fresh random generation. Use the existing token hashing service to store its validation hash. Compare the recomputed hash with the stored value before returning the URL. Keep the generation, version and locale stable for normal reads. The server reconstructs new-format links only after authorization. No bearer value is written to general storage, run data, audit, logs, prompts or memory. Freeze the URL language at issuance so a later party locale update does not change the link. Explicit rotation changes generation and validation hash together.

Bind capture to its persisted run in the same transaction as party and invitation writes. Verify trusted run and relationship identities, serialize same-run writers using the current run row, and return the associated invitation on a replay. The database unique key is the final invariant. Keep audit event names and memory outcome behavior, but treat the audit as timeline evidence for new captures. A retry after an invitation commit where timeline writing failed returns the existing capture and can complete its record. Preserve the queue's policy for who may retry the run. This is a capture write boundary, independent of the broader session snapshot lease finding. [Tool retry and audit](../../../src/agent/tools/capture-invitation.ts#L70), [Run claim](../../../src/agent/run-task.ts#L234), [Retry semantics](../../../src/agent/run-task.ts#L705).

```text
@ captureForRun(runId, host, choice, details) -> invitationId
ctx: trusted claimed run, invitation transaction
do:
  1. lock and validate the authoritative run and host
  2. lookup the invitation already bound to this run
  3. validate and use the party choice when a write is needed
  4. write the invitation, hash, recovery metadata and run link atomically
br: an existing matching capture -> return its recorded identity
fail: invalid run authority or conflicting association -> no invitation write
```

## Host access and legacy treatment

Share one host-only completion component between the dashboard and the run status route. The dashboard adds a newest-first, paginated list of that host's capture runs so a reload can recover progress or a completed link. The list and shared polling API contain status, time and identity references only. Keep the existing guest run status API shape and co-host status behavior. Show the link control only for the original authenticated host. Resolve authority again in each reveal or replace Server Action and enforce it in the invitation query.

Require the exact completed capture task, same home, original host, expected capture session and matching durable invitation row. If the old payload was scrubbed, the durable run identity and invitation association must still prove these fields. For legacy captures only, resolve from the exact host-scoped run and one distinct matching audit-linked invitation. Multiple distinct matches, missing retained evidence, or contradictory payload information are unavailable. Prefer a durable match when it exists. Status, telemetry and host history must never embed a guest bearer URL. Render it only in the authorized reveal result after the host acts. [Current proof](../../../src/app/%5Blocale%5D/%28host%29/actions.ts#L84), [Shared run shape](../../../src/app/api/runs/run-data.ts#L19), [Status poller](../../../src/components/runs/run-status-poller.tsx#L76).

For a valid legacy capture, explain that revealing its original link is impossible with the retained hash. Offer a separate confirmation to issue a replacement that invalidates the prior URL and affected email capabilities. Recheck auth, active state and legacy scheme under an invitation row lock. The first confirmed request writes a new generation, hash and canonical locale and preserves the existing active expiration, including any stay extension. A repeat or concurrent confirmation returns the already-issued replacement if still valid. Cancelled, expired or revoked links cannot be revived through recovery. Keep the original link untouched until a confirmed replacement succeeds. [Legacy rotation](../../../src/core/booking/invitations.ts#L188), [Email capability binding](../../security/data-lifecycle.md#guest-contact-consent-and-return-capabilities).

```text
@ revealCaptureLink(host, runId, replaceConfirmed) -> result
ctx: web session, exact completed capture and active invitation
do:
  1. validate host, run, household and invitation association
  2. check cancellation, revocation, expiration and generation
  3. derive and verify the current token when recovery metadata exists
  4. issue once under lock only when a valid legacy replacement is confirmed
br: active legacy without confirmation -> show replace prompt
fail: unresolved association or invalid metadata -> unavailable with recovery guidance
```

Apply the additive migration before enabling the new writer. The authorized rollout serves the new reader and reveal action before AgentCore starts issuing recoverable links. Old guest hash readers still work. Once recoverable links are issued, retain the new web reveal behavior as the rollback minimum for host capture. A rollback that would restore rotate-on-reveal must pause host capture and reveal or forward-fix, since it could invalidate shared capability URLs. Preserve active guest lookup. Drain and verify new capture writes before reverting any worker that lacks durable run replay.

## Stuck states and recovery

| State and who sees it                                                                        | What ends it                                                                                                                                                                                                                                                                                                     | Required evidence                                                                                                                                           |
| -------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Host follows status before capture completes or reloads the dashboard                        | Poll the same run and enable reveal on completion. The dashboard lists the same run again.                                                                                                                                                                                                                       | Browser opens queued status, reloads and copies the exact completed link.                                                                                   |
| Capture failed before terminal completion, including after its invitation write              | Status says the link is unavailable until capture finishes. The same host can retry the original run when retryable using stored allowed fields and the existing retry limit. On exhaustion, show the run reference and direct the host to review the existing capture before creating a replacement invitation. | Fault-injection test after DB commit proves retry uses one invitation. Browser verifies retry or visible terminal guidance and no reveal from a failed run. |
| Host reveals an active legacy link                                                           | Explain replacement and let the host confirm or back out. With no confirmation, leave the existing link usable.                                                                                                                                                                                                  | Verify both paths and concurrent replacement under a row lock.                                                                                              |
| Host opens an expired, revoked or cancelled invitation                                       | Show why the link is unavailable and link to the host capture area for a new invitation if the visit is still intended.                                                                                                                                                                                          | Clock and withdrawal tests assert no token appears and a fresh capture remains possible.                                                                    |
| Host sees missing legacy evidence, duplicate legacy audit matches, or recovery hash mismatch | Show a generic unavailable state with run reference. Tell the host to keep an already shared valid link or review the guest before creating a new invite. Surface only a sanitized reason to operators.                                                                                                          | Verify no state change, no unauthorized disclosures, and localized next-step text in each fixture case.                                                     |
| A different host, another household, a guest or a signed-out visitor tries recovery          | Show no bearer or link recovery details. Preserve ordinary same-home status visibility. A signed-out creator can sign in and reopen the run from the host dashboard.                                                                                                                                             | Test direct actions and page visibility for all roles and then recover as the original host.                                                                |
| Reveal request fails or the browser denies copying                                           | Offer Retry on the same invitation after a transient action failure. Keep the visible URL selectable for manual copy when the clipboard is unavailable.                                                                                                                                                          | Simulate one action failure and a rejected clipboard request. Assert recovery without a token rotation.                                                     |

## Acceptance

**Automated**

- Integration tests on both legacy rows and new captures prove repeat reads, parallel reveals, reload and locale changes preserve token, expiry and canonical URL. Assert normal reveal changes zero invitation or contact fields. Assert explicit legacy replacement invalidates the old link and dependent fingerprint while retaining the intended expiration window. Exercise same-run fault and concurrency with one invitation and party write. Extend `src/core/booking/invitations.integration.test.ts`, `src/agent/tools/capture-invitation.test.ts` and `src/app/api/runs/run-data.test.ts`.
- Add host action tests for exact authorization, completed versus nonterminal status, scrubbed payload, missing or ambiguous legacy proof, account switch, revocation and integrity mismatch. Verify no raw bearer in DB, tool output, run or public API response, HTML before reveal, audit or captured sanitized logs. Keep guest link, availability, cancellation, reminder and account tests green.
- Extend `tests/e2e/host-view.spec.ts` with two browser contexts. Copy from progress, leave, reopen on the dashboard, and compare both URLs. Open the original link in a fresh guest context and reach the same synthetic invitation. Verify legacy confirmation, keyboard copy and mobile status in English and Spanish. Run all common gates and update the host manual and token lifecycle documentation.

**Manual**

In the isolated app, use the dashboard and direct status page on desktop and a narrow screen. Confirm focus and status feedback make Copy, processing, failure and legacy replacement understandable. Confirm the replacement warning appears before a click can invalidate the existing link.

## Owned work and consumer sweep

One integration owner. Schema, token lifecycle, authority and the two UI entry points share one recovery result contract. No independent implementation unit is batch-eligible before that contract is implemented and reviewed.

```sh
git grep -l -E 'reissueInvitationLink\(|revealCapturedInvitationAction|findInvitationByToken\(|hashLinkToken\(|issueLinkToken\(|link_token_revoked_at|link_token_expires_at' -- src tests scripts supabase .design-sync
```

- **Phase 3 edits.** Core invitations and schema, capture tool and its tests, capture memory/readback if they consume the persisted association, host actions and tests, status and dashboard pages, capture form and frontend-boundaries tests, shim, messages, host specs and release probe fixtures. Audit all production callers of `reissueInvitationLink`. Only the host reveal action currently calls it outside tests. Keep existing low-level rotation tests and cover the new guarded path.
- **Phase 3 compatibility checks.** Public run lookup, guest invitation, party claim, guest contact authority, contact and outbox, account email preferences, cancellation, retention, guest account integration, fixture helper and its integration tests. These operate on validation hashes or invitation IDs and keep that contract. Historical expiry, secure identity, retention, stay access, guest delivery and demo-retirement migrations stay intact. Test current migration replay and verify existing links and guest capabilities against the new reader.
