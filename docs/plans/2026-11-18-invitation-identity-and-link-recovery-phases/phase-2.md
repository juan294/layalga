# Phase 2. Allow unrelated parties to share a display name

**Finding** SE-H1  
**Entry gate** Accepted Phase 1 on the existing schema, with proof that the compatible web and AgentCore can process old queued tasks without resolving identity by name.

## Change

Add a migration that removes the actual `UNIQUE(home_id, family_name)` constraint identified in the current schema. Preserve the primary key, tenant indexes, foreign keys, auth binding, role grants and existing data. Accept same-name rows in the same home, without changes to case, legacy records or labels. Continue looking up returning parties by ID and home. The bridge collision message remains valid for the bridge schema. The upgraded schema must allow its New path to finish. No SQL name-based repair or migration backfill follows from removing a uniqueness constraint. A party with multiple historic visits can represent one returning family or a historical mix-up.

For an authorized future release, check the serving web commit and AgentCore DEFAULT version before the constraint change. Use the existing contract preflight and supplemental fixture evidence against the current worker and fallback. Treat an absent or old runtime proof as a reason to keep the constraint and present the bridge recovery instructions. An older writer can choose the first matching party after the constraint is gone. Keep the Phase 1 contract as the minimum rollback behavior even if the deployment is rolled back. A unique constraint cannot simply be restored after valid duplicates exist. [Baseline schema](../../../supabase/migrations/20260831000100_core.sql#L31), [Serving runtime preflight](../../../scripts/contract-preflight.ts#L21), [PostgreSQL uniqueness](https://www.postgresql.org/docs/current/ddl-constraints.html#DDL-CONSTRAINTS-UNIQUE-CONSTRAINTS).

## Stuck states and recovery

| State and who sees it                                      | What ends it                                                                                                                                                                                     | Required evidence                                                                                                                               |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Release operator cannot verify a compatible live writer    | Preflight reports the mismatched or missing web or runtime identity. Continue using the bridge until both are verified.                                                                          | Exercise present, missing and stale evidence in the local rollout rehearsal, including an old worker attempting a v2 task.                      |
| Host sees two indistinguishable names                      | Choose Returning only when they recognize its dated history. New remains available, and neither record auto-selects.                                                                             | Test two fixture parties with identical labels and different histories. Verify New still writes a distinct ID when history cannot disambiguate. |
| Host suspects a pre-existing account contains mixed visits | Phase uses no automatic splits. The host manual explains how to pause using the suspect returning selection and arrange an owner-reviewed assessment of the historical links, visits and memory. | Documentation review with synthetic legacy examples. Migration test proves all pre-existing IDs and claims survive.                             |

## Acceptance

**Automated**

- Migrate a disposable local database with pre-migration party, invitation, guest binding, visits and memory fixture data. Compare existing identities, link validity and relationship counts before and after. Exercise fresh migration replay too. Test that anonymous and unrelated authenticated roles cannot read private data or perform writes and the intended web and agent roles retain only their existing access.
- Extend `src/core/booking/invitations.integration.test.ts`, `src/lib/auth/guest-account.integration.test.ts` and the guest account action coverage. Create two unrelated parties with the exact same name in the same home using distinct capture UUIDs, including concurrent New submissions. Assert different party IDs, same display name, separate visit notes, successful separate claims, no ability to cancel the other party's visit, and selected returning capture reuses only the selected ID. Test unchanged link access as well as account access.
- Extend `tests/e2e/host-view.spec.ts` or add a focused booking spec for a same-name New capture followed by a distinct, explicit Returning choice. Keep the production probe fixture design scoped to tagged households and prove the same isolation locally. Run all common gates.

**Manual**

Open the local host capture panel with two synthetic same-name parties and confirm the dates help distinguish them. Sign in using two fixture guest sessions and visually verify their lists and cancellation controls correspond to their own visits.

## Owned work and consumer sweep

One implementation owner coordinates the constraint and exact role and fixture assertions. The release handoff depends on the final migration and verification evidence, so no independent unit is batch-eligible.

```sh
git grep -ilE 'insert[[:space:]]+into[[:space:]]+(public\.)?(parties|invitations)|insert\((parties|invitations)\)' -- src tests scripts supabase
git grep -niE 'unique.*family_name|on conflict.*family_name|parties_home_id_family_name' -- src scripts tests supabase
```

- **Phase 2 covered writes.** Core `src/core/booking/invitations.ts`, migration baseline and `src/core/db/schema.ts`, shared `src/test-support/fixture-household.ts`, `scripts/release-probes.ts`, and host E2E helpers that seed through the fixture module. New tests deliberately create equal labels. Update direct writers only if an assertion depends on old uniqueness. Check fixture cleanup by exact household ID.
- **Phase 2 compatibility suite.** Direct writers in `scripts/forget-orphaned-memory.integration.test.ts`, `scripts/verify-room-migration.ts`, agent interrupt/resume, record-capture-memory, reschedule, tenant scope, seed-due-chase-job, host memory and host outcomes, booking cancellation, guest clock, preferences, holds, invitations, calendar feed, retention, email outbox and guest delivery, policy settings, reconfirmation jobs, rooms schema and guest account. These seed by IDs or use unique synthetic labels and keep those contracts. The full gate exercises them.
- **Excluded from change.** Existing migration files and old fixture relationships stay intact. Calendar, booking, cancellation, OAuth claim, reminder data and memory retention keep their ID-based semantics. Inspect and run their regression suites. Historical repair, production inventory access and deployment remain separate.
