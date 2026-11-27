/**
 * Pages that a server action, a form or a client navigation sends the
 * browser to. Browser tests wait 5 s for them, and a cold `next dev` compiles
 * the target inside that wait: 3.3 s for the run status page with no load and
 * more than 5 s on a busy runner (CI runs 45584306035, 45648368310,
 * 45782951693, 45873076064 and 45885929966). `tests/e2e/global-setup.ts`
 * requests each path once before the first test. A page without a session or
 * a known id still compiles. `redirect-targets.test.ts` fails when app code
 * adds a target that is missing here.
 */
export const REDIRECT_TARGETS = [
  {
    route: "/[locale]/runs/[id]/status",
    path: "/en/runs/00000000-0000-4000-8000-000000000000/status",
  },
  {
    route: "/[locale]/cancellation-complete",
    path: "/en/cancellation-complete",
  },
  { route: "/[locale]/guest/email-status", path: "/en/guest/email-status" },
  { route: "/[locale]/sign-in", path: "/en/sign-in" },
  { route: "/[locale]/assistants", path: "/en/assistants" },
  { route: "/[locale]/rooms", path: "/en/rooms" },
  { route: "/[locale]", path: "/en" },
  { route: "/[locale]/g/[token]", path: "/en/g/warm-up-not-a-token" },
  { route: "/[locale]/guest", path: "/en/guest" },
  { route: "/[locale]/guest/verify", path: "/en/guest/verify?invalid=1" },
  { route: "/[locale]/requests", path: "/en/requests" },
  {
    route: "/[locale]/requests/[id]",
    path: "/en/requests/00000000-0000-4000-8000-000000000000",
  },
  { route: "/[locale]/requests/review", path: "/en/requests/review" },
  { route: "/[locale]/stays", path: "/en/stays" },
  { route: "/[locale]/visits", path: "/en/visits" },
] as const;
