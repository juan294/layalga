import { expect, type Page } from "@playwright/test";
import { createTranslator } from "next-intl";

import en from "../../messages/en.json" with { type: "json" };
import es from "../../messages/es.json" with { type: "json" };
import {
  assistantFixtures,
  authCall,
  codeFlow,
  exchangeCode,
  FIXTURE_CALLBACK,
  refreshClient,
  startAuthorization,
} from "../../src/test-support/assistant-oauth";
import { localAdmin } from "../../src/test-support/local-supabase";
import { test as base } from "./helpers/household";
import { createFixtureRequester } from "./helpers/requester";
import { expectTouchSafe } from "./helpers/touch-targets";

// A real OAuth server on the local stack, with synthetic registered clients.
const test = base.extend<{
  assistants: ReturnType<typeof assistantFixtures>;
  /** What reached the assistant's own domain, which no test leaves the machine for. */
  arrivals: URL[];
}>({
  assistants: async ({ household }, provide) => {
    const admin = localAdmin();
    const fixtures = assistantFixtures(household.db, admin);
    try {
      await provide(fixtures);
    } finally {
      await fixtures.cleanup();
      await admin.end({ timeout: 5 });
    }
  },
  arrivals: async ({ context }, provide) => {
    const arrivals: URL[] = [];
    await context.route("https://claude.ai/**", (route) => {
      arrivals.push(new URL(route.request().url()));
      return route.fulfill({ contentType: "text/html", body: "Assistant" });
    });
    await provide(arrivals);
  },
});
test.use({ householdOptions: { parties: [] } });
test.setTimeout(120_000);

const t = en.Assistants;
const consentPath = (id: string, locale = "en") =>
  `/${locale}/oauth/consent?authorization_id=${id}`;

function cspViolations(page: Page) {
  const found: string[] = [];
  page.on("console", (message) => {
    if (/content security policy/i.test(message.text()))
      found.push(message.text());
  });
  return found;
}

/** A long address or name must wrap inside the sheet. */
async function expectInsideSheet(page: Page, state: string) {
  const sheet = await page.locator("main article").evaluate((node) => ({
    content: node.scrollWidth,
    width: node.clientWidth,
  }));
  expect(sheet.content, state).toBeLessThanOrEqual(sheet.width);
}

const continueButton = (page: Page) => page.getByTestId("assistant-continue");
const decision = (page: Page, answer: "allow" | "deny") =>
  page.getByTestId(`assistant-${answer}`);

/** Where Google sign-in would return to. Google itself is never opened. */
async function signInTarget(page: Page, label: string) {
  let prepared: { next: string } | undefined;
  await page.route("**/auth/prepare", (route) => {
    prepared = route.request().postDataJSON() as { next: string };
    return route.abort();
  });
  await page.getByRole("button", { name: label }).click();
  await expect.poll(() => prepared).toBeDefined();
  await page.unroute("**/auth/prepare");
  return prepared!.next;
}

async function openReview(page: Page, id: string) {
  await page.goto(consentPath(id));
  await continueButton(page).click();
  await expect(decision(page, "allow")).toBeEnabled();
}

test("a guest approves Claude, sees it listed and disconnects it", async ({
  page,
  context,
  baseURL,
  requester,
  assistants,
  arrivals,
}) => {
  const violations = cspViolations(page);
  const client = await assistants.client({ name: "Self-asserted name" });
  const { authorizationId, verifier } = await startAuthorization(client);

  // The address that hosted Auth opens has no locale.
  const entry = await page.request.get(
    `/oauth/consent?authorization_id=${authorizationId}`,
    { maxRedirects: 0, headers: { "accept-language": "es" } },
  );
  expect(entry.status()).toBe(307);
  expect(new URL(entry.headers().location!, baseURL).href).toBe(
    new URL(consentPath(authorizationId, "es"), baseURL).href,
  );

  await page.goto(consentPath(authorizationId));
  await expect(page.getByTestId("google-sign-in")).toBeVisible();
  await expect(continueButton(page)).toHaveCount(0);

  await requester.signIn(context);
  await page.goto(consentPath(authorizationId));
  const main = page.getByRole("main");
  await expect(main).toContainText(requester.email);
  await expect(main).toContainText(t.states.start.body);
  await continueButton(page).click();
  await expect(
    page.getByRole("heading", {
      name: "Claude asks to connect to your account",
    }),
  ).toBeFocused();
  await expect(main).toContainText("claude.ai");
  await expect(main).toContainText(requester.email);
  await expect(main).toContainText("Anthropic receives these answers.");
  await expect(main).not.toContainText("Self-asserted name");
  expect(arrivals).toEqual([]);

  await decision(page, "allow").click();
  await page.waitForURL("https://claude.ai/**");
  expect(arrivals).toHaveLength(1);
  const [arrival] = arrivals;
  expect(`${arrival!.origin}${arrival!.pathname}`).toBe(FIXTURE_CALLBACK);
  expect(arrival!.searchParams.get("state")).toBe("fixture");
  const token = await exchangeCode(
    arrival!.searchParams.get("code")!,
    client,
    verifier,
  );
  expect(token.status).toBe(200);
  expect(violations).toEqual([]);

  // The same request cannot be used again.
  await page.goto(consentPath(authorizationId));
  await continueButton(page).click();
  await expect(main).toContainText(t.states.ended.title);

  await page.goto("/en/stays");
  await page
    .getByRole("navigation", { name: en.Brand.bookingNavigation })
    .getByRole("link", { name: t.navigation })
    .click();
  await expect(page).toHaveURL(/\/en\/assistants$/);
  const row = page.getByRole("listitem").filter({ hasText: "Claude" });
  await expect(row.first()).toContainText("Connected on");
  await page.getByRole("button", { name: "Disconnect Claude" }).click();
  const result = main.getByRole("status");
  await expect(result).toHaveText("Disconnected: Claude.");
  await expect(result).toBeFocused();
  await expect(main).toContainText(t.list.empty);
  await expect(page.getByTestId("assistant-disconnect")).toHaveCount(0);
  expect((await refreshClient(client, token.body.refresh_token)).status).toBe(
    400,
  );
});

test("a refusal returns to Claude without a code", async ({
  page,
  context,
  requester,
  assistants,
  arrivals,
}) => {
  const violations = cspViolations(page);
  const { authorizationId } = await startAuthorization(
    await assistants.client(),
  );
  await requester.signIn(context);
  await openReview(page, authorizationId);
  await decision(page, "deny").click();
  await page.waitForURL("https://claude.ai/**");
  expect(arrivals).toHaveLength(1);
  expect(arrivals[0]!.searchParams.get("error")).toBe("access_denied");
  expect(arrivals[0]!.searchParams.has("code")).toBe(false);
  expect(violations).toEqual([]);
  await page.goto("/en/assistants");
  await expect(page.getByRole("main")).toContainText(t.list.empty);
});

test("the guest can follow a link when the browser does not navigate", async ({
  page,
  context,
  requester,
  assistants,
}) => {
  const { authorizationId } = await startAuthorization(
    await assistants.client(),
  );
  let blocked = true;
  let visits = 0;
  await context.route("https://claude.ai/**", (route) => {
    visits++;
    // 204 leaves the browser on the page.
    return route.fulfill(
      blocked ? { status: 204 } : { contentType: "text/html", body: "ok" },
    );
  });
  await requester.signIn(context);
  await openReview(page, authorizationId);
  await decision(page, "allow").click();
  const link = page.getByRole("link", { name: "Return to Claude" });
  await expect(link).toBeVisible();
  await expect.poll(() => visits).toBe(1);
  await expect(page).toHaveURL(new RegExp(authorizationId));
  blocked = false;
  await link.click();
  await page.waitForURL("https://claude.ai/**");
  expect(new URL(page.url()).searchParams.get("code")).toBeTruthy();
});

test("an earlier consent waits for the guest at every step", async ({
  page,
  context,
  requester,
  assistants,
  arrivals,
}) => {
  const client = await assistants.client();
  await requester.signIn(context);
  const first = await startAuthorization(client);
  await openReview(page, first.authorizationId);
  await decision(page, "allow").click();
  await page.waitForURL("https://claude.ai/**");
  expect(arrivals).toHaveLength(1);

  const { authorizationId } = await startAuthorization(client);
  await page.goto(consentPath(authorizationId));
  await expect(continueButton(page)).toBeEnabled();
  expect((await assistants.authorization(authorizationId)).hasCode).toBe(false);

  await continueButton(page).click();
  const link = page.getByRole("link", { name: "Go to Claude" });
  await expect(link).toBeVisible();
  expect((await assistants.authorization(authorizationId)).hasCode).toBe(true);
  // Nothing leaves the page without the guest.
  await page.waitForLoadState("networkidle");
  await expect(page).toHaveURL(new RegExp(authorizationId));
  expect(arrivals).toHaveLength(1);
  await link.click();
  await page.waitForURL("https://claude.ai/**");
  expect(arrivals).toHaveLength(2);
});

test("changing the language keeps the request", async ({
  page,
  context,
  requester,
  assistants,
}) => {
  const { authorizationId } = await startAuthorization(
    await assistants.client(),
  );
  await requester.signIn(context);
  await page.goto(`${consentPath(authorizationId)}&auth=failed`);
  await expect(page.getByRole("main")).toContainText(t.authFailed);
  await page.getByTestId("locale-switcher-trigger").click();
  await page.getByTestId("locale-switch-es").click();
  await expect(page).toHaveURL(
    new RegExp(`${consentPath(authorizationId, "es").replace("?", "\\?")}$`),
  );
  const main = page.getByRole("main");
  await expect(main).toContainText(es.Assistants.states.start.title);
  await continueButton(page).click();
  await expect(
    page.getByRole("heading", { name: "Claude pide conectarse a tu cuenta" }),
  ).toBeVisible();
});

test("sign-in problems keep the request", async ({
  page,
  context,
  baseURL,
  requester,
  assistants,
}) => {
  const { authorizationId } = await startAuthorization(
    await assistants.client(),
  );
  const path = consentPath(authorizationId);
  const prepare = await page.request.post("/auth/prepare", {
    data: { next: path },
    headers: { origin: new URL(baseURL!).origin },
  });
  expect(prepare.ok()).toBe(true);
  // Google reports a cancelled sign-in.
  await page.goto("/auth/callback?error=access_denied");
  await expect(page).toHaveURL(`${baseURL}${path}&auth=failed`);
  const main = page.getByRole("main");
  await expect(main).toContainText(t.authFailed);

  // The session ends while the decision is open.
  await requester.signIn(context);
  await openReview(page, authorizationId);
  await context.clearCookies({ name: /^sb-/ });
  await decision(page, "allow").click();
  await expect(main).toContainText(t.states.sign_in.title);
  expect(await signInTarget(page, t.signIn)).toBe(path);
  await requester.signIn(context);
  await openReview(page, authorizationId);
});

test("another account can complete a request that the first only opened", async ({
  page,
  context,
  household,
  requester,
  assistants,
  arrivals,
}) => {
  const { authorizationId } = await startAuthorization(
    await assistants.client(),
  );
  const other = await createFixtureRequester(household.db);
  try {
    await requester.signIn(context);
    await page.goto(consentPath(authorizationId));
    await expect(page.getByRole("main")).toContainText(requester.email);
    expect(await signInTarget(page, t.useAnother)).toBe(
      consentPath(authorizationId),
    );
    // The account changes behind the open page: Continue shows the new one first.
    await other.signIn(context);
    await continueButton(page).click();
    await expect(page.getByRole("main")).toContainText(t.accountChanged);
    await expect(page.getByRole("main")).toContainText(other.email);
    await expect(continueButton(page)).toBeEnabled();
    await continueButton(page).click();
    await expect(decision(page, "allow")).toBeEnabled();
    await expect(page.getByRole("main")).toContainText(other.email);

    // The request is now bound: the first account cannot answer it.
    await requester.signIn(context);
    await decision(page, "allow").click();
    await expect(page.getByRole("main")).toContainText(t.states.ended.title);
    expect(arrivals).toEqual([]);
  } finally {
    await other.cleanup();
  }
});

for (const [name, options, redirectUri] of [
  [
    "a client called Claude with another callback",
    {
      name: "Claude",
      registered: "https://claude-ai.example/cb",
      allow: null,
    },
    "https://claude-ai.example/cb",
  ],
  [
    "a known client whose callback changed",
    {
      name: "Claude",
      registered: "https://claude.ai/api/mcp/other",
      allow: {},
    },
    "https://claude.ai/api/mcp/other",
  ],
  [
    "a disabled client",
    { name: "Claude", allow: { enabled: false } },
    undefined,
  ],
] as const)
  test(`${name} is refused without a redirect`, async ({
    page,
    context,
    requester,
    assistants,
    arrivals,
  }) => {
    const { authorizationId } = await startAuthorization(
      await assistants.client(options),
      { redirectUri },
    );
    await requester.signIn(context);
    await page.goto(consentPath(authorizationId));
    await continueButton(page).click();
    const main = page.getByRole("main");
    await expect(main).toContainText(t.states.not_allowed.title);
    await expect(main).not.toContainText("Claude");
    await expect(decision(page, "allow")).toHaveCount(0);
    await expect(main.getByRole("link", { name: t.findStay })).toHaveAttribute(
      "href",
      "/en/stays",
    );
    expect(page.url()).toContain(authorizationId);
    expect(arrivals).toEqual([]);
  });

test("an expired request ends", async ({
  page,
  context,
  requester,
  assistants,
}) => {
  const { authorizationId } = await startAuthorization(
    await assistants.client(),
  );
  await assistants.expire(authorizationId);
  await requester.signIn(context);
  await page.goto(consentPath(authorizationId));
  await continueButton(page).click();
  await expect(page.getByRole("main")).toContainText(t.states.ended.body);
});

for (const kind of ["bound", "prepared"])
  test(`a ${kind} host cannot connect an assistant and can choose another account`, async ({
    page,
    context,
    requester,
    assistants,
  }) => {
    await assistants.host(
      kind === "bound"
        ? { authUserId: requester.userId }
        : { preparedEmail: requester.email },
    );
    const { authorizationId } = await startAuthorization(
      await assistants.client(),
    );
    await requester.signIn(context);
    await page.goto(consentPath(authorizationId));
    await expect(page.getByRole("main")).toContainText(t.states.host.title);
    await expect(continueButton(page)).toHaveCount(0);
    // The website stays one link away.
    await expect(
      page.getByRole("link", { name: en.PublicStays.find }),
    ).toHaveAttribute("href", "/en/stays");
    expect(await signInTarget(page, t.useAnother)).toBe(
      consentPath(authorizationId),
    );
  });

test("a guest can sign out from consent and from the list behind it", async ({
  page,
  context,
  requester,
  assistants,
}) => {
  const { authorizationId } = await startAuthorization(
    await assistants.client(),
  );
  const signOut = page.getByRole("button", { name: en.Brand.signOut });
  await requester.signIn(context);
  await openReview(page, authorizationId);
  await signOut.click();
  await expect(page).toHaveURL(/\/en\/sign-in$/);

  await requester.signIn(context);
  await openReview(page, authorizationId);
  await page.getByRole("link", { name: t.manage }).click();
  await expect(page).toHaveURL(/\/en\/assistants$/);
  await signOut.click();
  await expect(page).toHaveURL(/\/en\/sign-in$/);
});

test("sign-out keeps the connection, and the list accepts only its own clients", async ({
  page,
  context,
  household,
  requester,
  assistants,
  arrivals,
}) => {
  const client = await assistants.client();
  const { authorizationId } = await startAuthorization(client);
  await requester.signIn(context);
  await openReview(page, authorizationId);
  await decision(page, "allow").click();
  await page.waitForURL("https://claude.ai/**");
  expect(arrivals).toHaveLength(1);

  await page.goto("/en/assistants");
  await page.getByRole("button", { name: en.Brand.signOut }).click();
  await expect(page).toHaveURL(/\/en\/sign-in$/);
  await page.goto("/en/assistants");
  await expect(page.getByTestId("google-sign-in")).toBeVisible();
  await expect(page.getByTestId("assistant-disconnect")).toHaveCount(0);

  const other = await createFixtureRequester(household.db);
  try {
    await other.signIn(context);
    await page.goto("/en/assistants");
    await expect(page.getByRole("main")).toContainText(t.list.empty);
  } finally {
    await other.cleanup();
  }

  // A guest who became a host keeps control of the connection.
  await assistants.host({ authUserId: requester.userId });
  await requester.signIn(context);
  await page.goto("/en/assistants");
  const button = page.getByRole("button", { name: "Disconnect Claude" });
  await expect(button).toBeVisible();
  const field = page.locator('input[name="clientId"]');
  await field.evaluate(
    (input: HTMLInputElement) =>
      (input.value = "00000000-0000-4000-8000-000000000009"),
  );
  await button.click();
  await expect(page.getByRole("main").getByRole("status")).toHaveText(
    t.list.gone,
  );
  await expect(button).toBeVisible();
  await page.reload();
  await button.click();
  await expect(page.getByRole("main")).toContainText(t.list.empty);
  const grants = await authCall("GET", "/auth/v1/user/oauth/grants", {
    token: await requester.accessToken(),
  });
  expect(grants.body).toEqual([]);
});

for (const tag of ["", "@mobile "])
  test(`${tag}consent and connected assistants are usable in both languages and themes`, async ({
    page,
    context,
    requester,
    assistants,
  }) => {
    await requester.signIn(context);
    const client = await assistants.client();
    const unknown = await assistants.client({
      name: "Claude ".repeat(20).trim(),
    });
    for (const id of [client, unknown])
      await codeFlow({ accessToken: await requester.accessToken() }, id);
    await assistants.forget(unknown);

    for (const locale of ["en", "es"] as const)
      for (const colorScheme of ["light", "dark"] as const) {
        await page.emulateMedia({ colorScheme });
        const messages = locale === "es" ? es : en;
        const say = createTranslator({
          locale,
          messages,
          namespace: "Assistants",
        });
        const { authorizationId } = await startAuthorization(
          await assistants.client(),
        );
        await page.goto(consentPath(authorizationId, locale));
        await expect(
          page.getByRole("button", { name: say("continue"), exact: true }),
        ).toBeEnabled();
        await expect(
          page.getByRole("button", { name: say("useAnother") }),
        ).toBeEnabled();
        await expectTouchSafe(page, `${locale} ${colorScheme} start`);
        await expectInsideSheet(page, `${locale} start`);

        await continueButton(page).focus();
        await page.keyboard.press("Enter");
        await expect(
          page.getByRole("heading", {
            name: say("states.review.title", { assistant: "Claude" }),
          }),
        ).toBeFocused();
        const allow = page.getByRole("button", {
          name: say("allow"),
          exact: true,
        });
        const deny = page.getByRole("button", {
          name: say("deny"),
          exact: true,
        });
        await expect(allow).toBeEnabled();
        const [one, two] = [
          await allow.boundingBox(),
          await deny.boundingBox(),
        ];
        expect(one!.width).toBeCloseTo(two!.width, 0);
        expect(one!.height).toBeCloseTo(two!.height, 0);
        await expectTouchSafe(page, `${locale} ${colorScheme} review`);
        await expectInsideSheet(page, `${locale} review`);
        await allow.focus();
        await expect(allow).toBeFocused();
        await expect(allow).toHaveCSS("outline-width", "3px");

        const refusedClient = await assistants.client({ allow: null });
        for (const [state, request] of [
          ["continue", (await startAuthorization(client)).authorizationId],
          [
            "not_allowed",
            (await startAuthorization(refusedClient)).authorizationId,
          ],
          ["ended", "a".repeat(32)],
        ] as const) {
          await page.goto(consentPath(request, locale));
          await continueButton(page).click();
          await expect(
            page.getByRole("heading", {
              name: say(`states.${state}.title`, { assistant: "Claude" }),
            }),
          ).toBeFocused();
          await expectTouchSafe(page, `${locale} ${colorScheme} ${state}`);
          await expectInsideSheet(page, `${locale} ${state}`);
        }

        await page.goto(`/${locale}/assistants`);
        await expect(
          page.getByRole("heading", { name: say("navigation"), level: 1 }),
        ).toBeVisible();
        await expect(
          page.getByRole("button", {
            name: say("list.disconnectNamed", { assistant: "Claude" }),
            exact: true,
          }),
        ).toBeEnabled();
        await expect(page.getByRole("main")).toContainText(
          `(${say("list.unrecognized")})`,
        );
        await expectTouchSafe(page, `${locale} ${colorScheme} assistants`);
        await expectInsideSheet(page, `${locale} assistants`);
      }
  });
