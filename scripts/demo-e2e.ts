import assert from "node:assert/strict";

import { chromium, type APIResponse, type Page } from "@playwright/test";
import postgres from "postgres";

import { DEMO_SEED } from "./seed-demo";
import {
  assertDemoSnapshot,
  isDirectExecution,
  parseReleaseCliOptions,
  requiredEnvironment,
  safeErrorMessage,
  type DemoSnapshot,
  type ReleaseCliOptions,
} from "./release-helpers";

export interface DemoE2EOptions extends ReleaseCliOptions {
  runMarker?: string;
}

export interface DemoE2EEvidence {
  baseUrl: string;
  invitationsCaptured: 2;
  visits: number;
  escalatedVisits: number;
  notifications: number;
  hostEscalations: number;
  approvedDecisions: number;
  rawMessages: readonly [string, string];
}

export async function runDemoE2E(
  options: DemoE2EOptions,
): Promise<DemoE2EEvidence> {
  const databaseUrl = requiredEnvironment("DATABASE_URL");
  const sql = postgres(databaseUrl, { prepare: false, max: 2 });
  const browser = await chromium.launch({ headless: !options.headed });
  const context = await browser.newContext({ baseURL: options.baseUrl });
  const page = await context.newPage();
  const marker = options.runMarker ? ` [${options.runMarker}]` : "";
  const rawMessages = [
    `${DEMO_SEED.parties[0].invitation.rawMessage}${marker}`,
    `${DEMO_SEED.parties[1].invitation.rawMessage}${marker}`,
  ] as const;

  try {
    await enterHost(page, options.baseUrl, DEMO_SEED.hosts[0].id, "en");
    const firstReset = await resetDemo(page, options.baseUrl);
    const secondReset = await resetDemo(page, options.baseUrl);
    assert.deepEqual(
      secondReset,
      firstReset,
      "two consecutive demo resets must return the same seeded identity",
    );

    await enterHost(page, options.baseUrl, DEMO_SEED.hosts[0].id, "es");
    const vegaLink = await captureInvitation(page, rawMessages[0]);
    await submitGuest(page, vegaLink, {
      from: "2026-09-18",
      to: "2026-09-21",
      nights: 3,
      expectedRunStatus: "completed",
    });

    await enterHost(page, options.baseUrl, DEMO_SEED.hosts[1].id, "en");
    const oterosLink = await captureInvitation(page, rawMessages[1]);
    await submitGuest(page, oterosLink, {
      from: "2026-09-19",
      to: "2026-09-21",
      nights: 2,
      expectedRunStatus: "interrupted",
    });

    await enterHost(page, options.baseUrl, DEMO_SEED.hosts[0].id, "en");
    const decision = page.getByTestId("pending-decision");
    await decision.waitFor();
    assert.equal(await decision.count(), 1, "expected one host decision");
    await page.getByTestId("approve-decision").click();
    await waitForCount(page, "[data-testid='pending-decision']", 0);

    await warpClock(page, options.baseUrl, DEMO_SEED.clock.chase);
    const finalClock = await warpClock(
      page,
      options.baseUrl,
      DEMO_SEED.clock.escalation,
    );
    assert.equal(
      finalClock.notifications.length,
      4,
      "public clock response must expose four total notifications",
    );

    const snapshot = await loadSnapshot(sql);
    assertDemoSnapshot(snapshot);
    const hostEscalations = snapshot.notifications.filter(
      (notification) =>
        notification.recipient_kind === "host" &&
        notification.kind === "reconfirm_escalation",
    ).length;
    assert.equal(
      new Set(
        snapshot.notifications
          .filter(
            (notification) =>
              notification.recipient_kind === "host" &&
              notification.kind === "reconfirm_escalation",
          )
          .map((notification) => notification.recipient_id),
      ).size,
      2,
      "expected escalation notifications for two distinct hosts",
    );

    return {
      baseUrl: options.baseUrl,
      invitationsCaptured: 2,
      visits: snapshot.visits.length,
      escalatedVisits: snapshot.visits.filter(
        (visit) => visit.status === "escalated",
      ).length,
      notifications: snapshot.notifications.length,
      hostEscalations,
      approvedDecisions: snapshot.decisions.filter(
        (decisionRow) => decisionRow.status === "approved",
      ).length,
      rawMessages,
    };
  } finally {
    await context.close();
    await browser.close();
    await sql.end({ timeout: 5 });
  }
}

async function resetDemo(
  page: Page,
  baseUrl: string,
): Promise<{
  homeId: string;
  hostIds: string[];
  partyIds: string[];
  invitationIds: string[];
  now: string;
}> {
  return playwrightResponseJson(
    await page.request.post(`${baseUrl}/api/demo/reset`, {
      headers: { origin: new URL(baseUrl).origin },
      data: { homeId: DEMO_SEED.home.id },
    }),
    "demo reset",
  );
}

async function enterHost(
  page: Page,
  baseUrl: string,
  hostId: string,
  locale: "en" | "es",
): Promise<void> {
  const response = await page.request.post(`${baseUrl}/${locale}/demo-enter`, {
    form: { hostId },
  });
  assert.ok(
    response.ok(),
    `demo host entry failed with HTTP ${response.status()}`,
  );
  await page.goto(`${baseUrl}/${locale}`);
  await page.getByTestId("host-capture-form").waitFor();
}

async function captureInvitation(
  page: Page,
  rawMessage: string,
): Promise<string> {
  await page.getByTestId("host-capture-message").fill(rawMessage);
  await page.getByTestId("host-capture-submit").click();
  const guestLink = page.getByTestId("guest-link");
  await guestLink.waitFor();
  const href = await guestLink.getAttribute("href");
  assert.ok(href, "capture did not return a guest link");
  return new URL(href, page.url()).toString();
}

async function submitGuest(
  page: Page,
  guestLink: string,
  stay: {
    from: string;
    to: string;
    nights: number;
    expectedRunStatus: "completed" | "interrupted";
  },
): Promise<void> {
  await page.goto(guestLink);
  await page.locator("input[name='from']").fill(stay.from);
  await page.locator("input[name='to']").fill(stay.to);
  await page.locator("input[name='nights']").fill(String(stay.nights));
  await page.getByTestId("find-options").click();
  const option = page.getByTestId("guest-option").first();
  await option.waitFor();
  await option.check();
  await page.getByTestId("guest-submit").click();
  await page.waitForURL(/\/runs\/[0-9a-f-]+\/status/);
  await page.getByTestId("run-status").waitFor();
  await page.waitForFunction(
    (expected) =>
      document
        .querySelector("[data-testid='run-status']")
        ?.getAttribute("data-status") === expected,
    stay.expectedRunStatus,
  );
}

async function warpClock(
  page: Page,
  baseUrl: string,
  now: string,
): Promise<{
  notifications: { recipient_kind: "host" | "party"; kind: string }[];
}> {
  return playwrightResponseJson(
    await page.request.post(`${baseUrl}/api/demo/clock`, {
      headers: { origin: new URL(baseUrl).origin },
      data: { homeId: DEMO_SEED.home.id, now },
    }),
    `clock warp to ${now}`,
  );
}

async function playwrightResponseJson<T>(
  response: APIResponse,
  operation: string,
): Promise<T> {
  const body = await response.text();
  if (!response.ok()) {
    throw new Error(
      `${operation} failed with HTTP ${response.status()}: ${body.slice(0, 500)}`,
    );
  }
  return JSON.parse(body) as T;
}

async function loadSnapshot(sql: postgres.Sql): Promise<DemoSnapshot> {
  const [visits, notifications, decisions] = await Promise.all([
    sql<{ id: string; status: string }[]>`
      select id, status from public.visits
      where home_id = ${DEMO_SEED.home.id}
      order by created_at, id
    `,
    sql<
      { recipient_kind: "host" | "party"; recipient_id: string; kind: string }[]
    >`
      select recipient_kind, recipient_id, kind from public.notifications
      where home_id = ${DEMO_SEED.home.id}
      order by created_at, id
    `,
    sql<{ id: string; status: string }[]>`
      select id, status from public.pending_decisions
      where home_id = ${DEMO_SEED.home.id}
      order by created_at, id
    `,
  ]);
  return { visits, notifications, decisions };
}

async function waitForCount(
  page: Page,
  selector: string,
  count: number,
): Promise<void> {
  await page.waitForFunction(
    ({ selector: target, count: expected }) =>
      document.querySelectorAll(target).length === expected,
    { selector, count },
  );
}

async function main(): Promise<void> {
  const evidence = await runDemoE2E(
    parseReleaseCliOptions(process.argv.slice(2)),
  );
  console.log(JSON.stringify(evidence, null, 2));
}

if (isDirectExecution(import.meta.url, process.argv[1])) {
  main().catch((error: unknown) => {
    console.error(safeErrorMessage(error));
    process.exitCode = 1;
  });
}
