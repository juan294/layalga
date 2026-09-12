# Guest email production readiness

Status: the guest-email schema and application shipped with v1.0.0 and remain deployed through the v1.3.9 release. The guest-email IAM policy is prepared, not applied. Local verification uses an injected sender and makes no real guest sends. Production activation still requires separate authorization and a consenting real-recipient proof.

Guest reminders reuse the existing Amazon SES identity `thecreativetoken.com`, sender `noreply@layalga.thecreativetoken.com`, and `us-east-1` region. The agent runtime receives no email permission or contact-table access. The existing `infra/iam/web-ses-policy.json` restricts recipients to the two hosts. The separate `infra/iam/web-ses-guest-policy.json` permits only `ses:SendEmail` for the same identity and sender; application verification, consent, source checks and synthetic-home guards control guest eligibility.

## Before production activation

1. Confirm the live application remains on a release containing migrations `20260905000100` through `20260905000700`, and verify the guest-table grants through the administrative database path. Keep feature/develop Vercel previews disabled.
2. Obtain guest-email IAM application and real-recipient test authorization. A product release or GitHub merge does not authorize either operation or a real guest send.
3. Preserve the existing separate non-owner web and agent database credentials. Do not reapply or modify the shipped guest-delivery migrations merely to activate the sender.
4. Review and attach the prepared guest SES policy to the existing `layalga-web` IAM user. Do not attach it to the AgentCore runtime role. Retain the exact identity ARN and sender condition.
5. Use the existing `EMAIL=ses`, `SES_FROM_ADDRESS`, and `SES_REGION` settings. `LINK_TOKEN_SECRET` signs purpose-separated, expiring guest capabilities and must remain server-only. Do not rotate original invitation links to generate reminder emails.
6. If activation requires an application or configuration release, use the existing exact-candidate release playbook. Run the existing synthetic probes; synthetic households deliberately do not send guest email.
7. With separate consent to a real test email, verify an account-free address, a verified Google claimant, opt-out, and a reminder return journey against a non-demo test household. Verify the actual inbox and provider outcome; an SES message ID establishes acceptance, not inbox delivery. Clean up only the test-owned records.

## Evidence and limits

Automated local tests cover verification, capability expiry/revocation, authority, consent withdrawal, claim leases/retries, obsolete reminder suppression and synthetic guards. The host view distinguishes no address, unverified or disabled contact, unavailable invitation access, a ready contact, queued work, service acceptance, failure and an unknown send outcome. Guest silence remains a separate visit fact.

Each external send first records authorization under the same household lock used for cancellation and contact changes. Withdrawal prevents later authorizations; it cannot recall an already authorized, in-flight email. Provider acceptance is retained independently of subsequent opt-out. If a worker disappears after authorization without recording a provider outcome, the attempt becomes unknown and is not automatically retried. Expired claims that never reached authorization can be reclaimed. These controls do not promise exactly-once inbox delivery.

The IAM application and real-recipient delivery proof remain pending external actions. No migration or general product rollout is pending. Do not describe the local fake sender or host-only SES acceptance as guest delivery proof. See [the release playbook](e2e-pro-playbook.md) and [runtime identity runbook](runtime-database-and-identity.md).
