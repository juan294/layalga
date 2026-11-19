# Invitation identity and link recovery implementation

Juan approved all three phases of 2026-11-18-invitation-identity-and-link-recovery.md, a local merge to develop and cleanup of the implementation worktree. The starting commit was `03df6fe`. Implementation branch `feat/invitation-identity-recovery` used `/Users/juan/code/layalga-invitation-recovery`. The project had no rpi-implement overlay.

## Phase 1. Explicit party choice

Accepted on the bridge schema. The application source and tests correspond to Git tree `a3475a9cb4f649bd64ad5d4e45ae89955ad7c222`. The fixture database ran PostgreSQL 17.12 with all 31 baseline migrations through 20261015084815, including parties_home_id_family_name_key. Local tests used the postgres fixture owner and real local Supabase Auth. The local worker used the scripted model. AgentCore handler checks used local adapters and fixtures.

The old parser rejected v2. The actual old handler claimed an unsupported stored v2 payload and recorded a terminal failure after one attempt with zero invitations. A transport failure kept the run queued. The revised worker handled both discriminators. Parser and memory tests failed before the bridge changes and passed afterwards.

Independent review found four gaps. The bridge envelope now lets the old runtime reach its stored-task parser. New and legacy captures ignore unverified recall. The release memory assertion checks the selected party. The real legacy reveal action and both localized validation paths have coverage. The simplify pass reused the typed outcome, serialized replay input once and corrected the memory comments. The initial full gate exposed two stale SQL mock scenarios. They now exercise explicit returning selection and the bridge collision.

The mobile check found a 25 px selector. A 390 px visual review found clipped dates, a selection reset and stale error state. The revised form uses the household touch-select style and wraps the history underneath. English and Spanish keyboard rechecks confirmed that correction cleared the alert and preserved the draft and selection.

Bootstrap, typecheck, lint, 678 unit tests with coverage, all 874 tests, production build, 39 browser tests across Chromium and mobile WebKit, and nine local release probes passed. Statement coverage was 54.46%. The Next.js advisory interrupted initial commands. The same commands passed on retry. The Phase 1 local evidence is in the phase1-accepted and visual/rechecked directories under the disposable stack receipt directory. The stack remains assigned to this implementation for Phase 2.

## Deviations

- Phase 1 expected the old worker to terminate an unsupported task. Its outer request parser rejected v2 before claim. The dispatch envelope uses a legacy-compatible initialization hint. Both worker versions still read the authoritative stored task. This preserves version refusal and transport retry semantics.
- Phase 1 keeps per-host queue serialization and isolates conversation snapshots by capture run. This prevents unrelated invitations from inheriting conversational context.

## Phase 2. Allow shared names

Accepted on source tree `8cb56525050e57fde4d14a23aba5fa71bf39f473`. The bridge commit is `8f84585`. Concurrent New captures failed before migration 20261118000100. After removing the single household name constraint, the same submissions produced distinct parties. A pre-migration fixture kept its party, user binding, invitation hash and expiry, visit, note, memory audit and snapshot. Grants and all other indexes and constraints matched. Fresh replay on the same disposable stack applied all 32 migrations. The CLI replaced the database container and volume during reset. The ownership record includes both inventories and the verified workdir, mounts, network and consumers.

The role tests exercised anon and authenticated access restrictions and checked web and agent grants. Two guest accounts claimed their respective same-name parties and could act only on their own visits. The localized host guide and release playbook describe the historical review and bridge rollback boundary. The preflight rehearsal covered missing and stale runtime evidence. The live web and AgentCore identities must be verified when a release is authorized.

Independent review approved the implementation and the final rollback regression. Its old fixture forced failure with duplicate names. The revised fixture inserts a valid room, then triggers the existing positive-bed check and verifies the household rolls back. The full gate's original failure and the passing rerun are retained in phase2 and phase2-accepted. The simplify review found no further change.

Bootstrap, typecheck, lint, 682 unit tests with coverage (54.61% statements), all 881 tests, production build, 39 browser tests and nine local release probes passed. Coverage, browser and probe inputs were unchanged by the final integration-test-only repair. The visual charter confirmed two Rivera records with distinguishable dates and two real local guest sessions with separate histories and cancellation controls. The stack remains assigned to Phase 3.

## Phase 3. Recover the exact completed invitation link

The final application candidate is Git tree `7fde4bf3688ccfc1831ef4006e8d3b7d4986e7d6`, based on `6d51a60`. Fresh local Supabase replay applied all 33 migrations through 20261118000200. The fixture owner drove the tests on PostgreSQL 17.12. The role rehearsal performed a leased capture as layalga_agent_runtime and a completed reveal as layalga_web_runtime. It also checked the all-or-none metadata constraint and private column grants.

The new writer locks the exact claimed run, verifies household, host, task and selected party, and binds the invitation before the transaction commits. Concurrent writes and a replay after a missing capture audit return one party and invitation. The fault-injection regression made the actual audit insert fail after commit. Before repair the SDK could mark the run complete. The repaired worker fails the run, and the host's bounded retry restores the audit for the original invitation. The derivation is versioned and uses an independent random generation and fixed issuance locale. The guest reader continues to verify the stored hash.

The final independent review confirmed the retained v2 choice uses the same strict parser as enqueue, legacy rows with contradictory choices fail closed, and the fresh guest browser verifies the expected family and active invitation.

The creator explicitly reveals the link from progress or paginated dashboard history. Legacy replacement requires confirmation and preserves the active expiry, including a stay extension. Integration checks cover competing confirmations, repeat reveals, retained and scrubbed run data, old and current guest email capabilities, integrity mismatch, ambiguous audit matches, cancellation, expiry and revocation. The release playbook records the web-first cutover and rollback minimum.

Browser tests and a visual charter covered creator and other-host visibility, dashboard reopening, fresh guest access, transient failure, denied clipboard access, legacy confirmation and cancellation, English desktop and Spanish at 390 px. The warning controls now have an 8 px gap when they wrap. A request-log regression removed guest capability URLs from the Next.js incoming request log. The desktop and mobile checks used real local Supabase Auth sessions.

Bootstrap, typecheck, lint, 692 unit tests with coverage (53.60% statements), all 895 tests, production build, 42 Chromium and mobile WebKit tests, and nine local release probes passed. Next.js stopped initial build and dev commands with the advisory on the pinned version. Their supported retries passed with the same dependency lock. The AgentCore deployment package built locally with SHA-256 `5ded88b73db47f0c78645dd43dc7bf843371258cbb07719d02769d5b5adb41dd`. The local gate used scripted execution. Provider execution and deployment remain release-time checks.

## Local acceptance and cleanup

All three phases passed independent review and local acceptance. SE-H1 and FE-H1 are resolved for new captures. BE-M1 is addressed at the capture write and retry boundary. Historical identity repair, dependency upgrades and production rollout remain outside the approved scope.

The coordinator disposed of project `layalga_invite_8frycro7` on Docker context `desktop-linux` after checking its recorded daemon, workdir, resource IDs, consumers and listeners. Post-cleanup inspection confirmed the four containers, network and database volume were removed. The temporary local evidence directory is `/private/tmp/layalga-invitation-gates-8frycro7`. It contains the ownership receipt, screenshots, final gate logs and AgentCore package.
