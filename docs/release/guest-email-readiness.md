# Guest email production readiness

Status: implementation in the September 5 Everyday Agents completion branch. The guest-email IAM policy is prepared, not applied. Local verification uses an injected sender and makes no real guest sends. Production still requires its separately authorized release.

Guest reminders reuse the existing Amazon SES identity `thecreativetoken.com`, sender `noreply@layalga.thecreativetoken.com`, and `us-east-1` region. The agent runtime receives no email permission or contact-table access. The existing `infra/iam/web-ses-policy.json` restricts recipients to the two hosts. The separate `infra/iam/web-ses-guest-policy.json` permits only `ses:SendEmail` for the same identity and sender; application verification, consent, source checks and synthetic-home guards control guest eligibility.

## Before production activation

1. Pass the complete local checks and merge the reviewed implementation to develop. Inspect migration ordering and guest-table grants. Keep feature/develop Vercel previews disabled.
2. Obtain production rollout and IAM application authorization. The GitHub merge authorization does not authorize either operation or a real guest send.
3. Apply the guest-delivery migrations (`20260905000500_guest_delivery.sql`, `20260905000600_guest_delivery_attempts.sql` and `20260905000700_guest_delivery_recovery_indexes.sql`) through the administrative database path before deploying the matching web code. Preserve separate non-owner web and agent database credentials.
4. Review and attach the prepared guest SES policy to the existing `layalga-web` IAM user. Do not attach it to the AgentCore runtime role. Retain the exact identity ARN and sender condition.
5. Use the existing `EMAIL=ses`, `SES_FROM_ADDRESS`, and `SES_REGION` settings. `LINK_TOKEN_SECRET` signs purpose-separated, expiring guest capabilities and must remain server-only. Do not rotate original invitation links to generate reminder emails.
6. Release the reviewed candidate through the existing exact-candidate release playbook. Run the existing synthetic probes; synthetic households deliberately do not send guest email.
7. With separate consent to a real test email, verify an account-free address, a verified Google claimant, opt-out, and a reminder return journey against a non-demo test household. Verify the actual inbox and provider outcome; an SES message ID establishes acceptance, not inbox delivery. Clean up only the test-owned records.

## Evidence and limits

Automated local tests cover verification, capability expiry/revocation, authority, consent withdrawal, claim leases/retries, obsolete reminder suppression and synthetic guards. The host view distinguishes no address, unverified or disabled contact, unavailable invitation access, a ready contact, queued work, service acceptance, failure and an unknown send outcome. Guest silence remains a separate visit fact.

Each external send first records authorization under the same household lock used for cancellation and contact changes. Withdrawal prevents later authorizations; it cannot recall an already authorized, in-flight email. Provider acceptance is retained independently of subsequent opt-out. If a worker disappears after authorization without recording a provider outcome, the attempt becomes unknown and is not automatically retried. Expired claims that never reached authorization can be reclaimed. These controls do not promise exactly-once inbox delivery.

A production migration, IAM application, real recipient delivery and release are pending external actions. Do not describe the local fake sender as a production delivery proof. See [the release playbook](e2e-pro-playbook.md) and [runtime identity runbook](runtime-database-and-identity.md).
