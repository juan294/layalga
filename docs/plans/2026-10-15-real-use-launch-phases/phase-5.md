# Phase 5: release 1, real-use launch

Parent: [plan](../2026-10-15-real-use-launch.md)

Production actions in a fixed order. Every numbered action that changes production needs explicit owner authorization at the time it runs. Follow `docs/release/e2e-pro-playbook.md` as updated in phase 4, including the release reconciliation merge.

## Entry conditions

- Phases 1 to 4 are merged into `develop`, and every plan-level automated check passed on the exact release candidate.
- The release PR from `develop` to `main` is prepared but not merged.

## Steps

| # | Action | Kind | Verification |
| --- | --- | --- | --- |
| 1 | Read-only preflight: repeat the household counts from the research (`homes`, parties, invitations, visits, runs, rooms) | read-only | Counts match the plan, or only show demo-reviewer activity on home `…0001`. Any visit or any other home stops the release and goes to the owner. |
| 2 | Google Cloud OAuth client: confirm publishing status "In production" and the authorized redirect URI `https://hyyrnpyidipkuhakeiyb.supabase.co/auth/v1/callback` | read-only, browser | Screenshot or page text recorded in the release notes |
| 3 | Disable the email provider in hosted Supabase Auth (Management API; dashboard through browser automation as fallback). Leave Google enabled and sign-up open, so new Google users can still be created | production config | `GET /auth/v1/settings` reports `email: false`, `google: true` |
| 4 | Remove `DEMO_MODE` and `DEMO_SESSION_SECRET` from Vercel production | production env | `vercel env ls production` no longer lists them. After the next deploy the live sign-in page shows the Google button |
| 5 | `pnpm run forget-synthetic-memory` against the production AgentCore Memory store | production data | Script reports the Vega and Parker records removed |
| 6 | `supabase db push --linked` (conversion migration) | production database | Read-only counts: home `…0001` `demo = false`; 0 parties, invitations and rooms; 2 hosts; 2 claims |
| 7 | Merge the release PR into `main` (Vercel deploys) and tag the release | production deploy | `/api/health` reports the release commit |
| 8 | Deploy the AgentCore bundle from the same commit (`scripts/deploy-agentcore.sh`) | production runtime | Runtime version recorded; `/api/health` runtime identity matches |
| 9 | Dispatch `production-probes.yml` with the release commit and `WRITE PROBE FIXTURE` | production probe | Run passes; run URL recorded in the playbook |
| 10 | Owner Google sign-in (Claude in Chrome on the owner's browser session, or the owner) | verification | Lands on the host dashboard of home `…0001` with zero rooms and the add-room path |

Steps 2 to 5 can run before the release PR merges: with `DEMO_MODE` removed, the old code already shows the Google button. Step 6 must precede step 7 under the playbook's migration-first rule. The conversion is safe for the old code: with `demo = false` the old demo branches stay inactive.

## Exit

- The live sign-in page shows Google only, and `/en/demo-enter` returns 404.
- Release record contains: commit, Vercel deployment, AgentCore runtime version, probe run URL, Supabase settings result and memory forget result.
- Phase 6 may start only after step 8's runtime version is recorded.
