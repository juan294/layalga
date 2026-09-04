import assert from "node:assert/strict";

import { chromium, type APIResponse, type Page } from "@playwright/test";
import postgres from "postgres";

import { DEMO_SEED } from "./seed-demo";
import {
  assertDemoSnapshot,
  isDirectExecution,
  markerSuffix,
  parseReleaseCliOptions,
  requiredEnvironment,
  safeErrorMessage,
  type DemoSnapshot,
  type ReleaseCliOptions,
} from "./release-helpers";

/** Upper bound for one agent run to surface in the browser, cold start included. */
const RUN_WAIT_TIMEOUT_MS = 120_000;

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
  emailPings: {
    pendingDecisionSent: number;
    escalationSent: number;
  };
  rawMessages: readonly [string, string];
  roomCoordination: {
    proposalCreated: true;
    privateBlockApplied: true;
    blockedRoomHidden: true;
    withheldRoomOpened: true;
    selectedRoomIds: readonly [string, string];
    overflowInterrupted: true;
    overflowApproved: true;
    overflowAppliedOnce: true;
    calendarFeedRead: true;
    calendarPrivateDataAbsent: true;
    calendarEventCount: number;
  };
}

export async function runDemoE2E(
  options: DemoE2EOptions,
): Promise<DemoE2EEvidence> {
  const databaseUrl = requiredEnvironment("DATABASE_URL");
  const sql = postgres(databaseUrl, { prepare: false, max: 2 });
  const browser = await chromium.launch({ headless: !options.headed });
  const context = await browser.newContext({ baseURL: options.baseUrl });
  const page = await context.newPage();
  // Runs on the AgentCore runtime with a real model take a cold start plus
  // model latency; Playwright's 30 s default wait is shorter than that.
  page.setDefaultTimeout(RUN_WAIT_TIMEOUT_MS);
  const marker = options.runMarker ? markerSuffix(options.runMarker) : "";
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

    const roomCoordination = await runRoomCoordinationProof(
      page,
      options.baseUrl,
      sql,
    );
    await resetDemo(page, options.baseUrl);
    await enterHost(page, options.baseUrl, DEMO_SEED.hosts[0].id, "en");
    await openWithheldRoom(page, DEMO_SEED.roomProof.hospitalityOpening);

    await enterHost(page, options.baseUrl, DEMO_SEED.hosts[0].id, "es");
    const vegaLink = await captureInvitation(page, rawMessages[0]);
    await submitGuest(page, vegaLink, {
      from: "2026-09-18",
      to: "2026-09-21",
      nights: 3,
      expectedRunStatus: "completed",
    });

    await enterHost(page, options.baseUrl, DEMO_SEED.hosts[0].id, "en");
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
    await approvePendingDecision(page, "en");

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

    const emailPings = await loadSentEmailPingCounts(sql);
    if (options.expectEmail) {
      assert.equal(
        emailPings.pendingDecisionSent,
        2,
        "expected one sent pending-decision ping per host",
      );
      assert.equal(
        emailPings.escalationSent,
        2,
        "expected one sent escalation ping per host",
      );
    } else {
      assert.equal(
        emailPings.pendingDecisionSent,
        0,
        "expected no email pings when EMAIL is not ses",
      );
      assert.equal(
        emailPings.escalationSent,
        0,
        "expected no email pings when EMAIL is not ses",
      );
    }

    const hospitalityEvidence = {
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
      emailPings,
      rawMessages,
    } as const;

    return { ...hospitalityEvidence, roomCoordination };
  } finally {
    await context.close();
    await browser.close();
    await sql.end({ timeout: 5 });
  }
}

async function runRoomCoordinationProof(
  page: Page,
  baseUrl: string,
  sql: postgres.Sql,
): Promise<DemoE2EEvidence["roomCoordination"]> {
  const proof = DEMO_SEED.roomProof;
  const guestLink = new URL(DEMO_SEED.parties[0].guestLink, baseUrl).toString();

  await enterHost(page, baseUrl, DEMO_SEED.hosts[0].id, "en");
  await requestRoomProposal(page, proof.privateBlock.request, "en");
  const proposals = await sql<
    { id: string; status: string; room_ids: string[] }[]
  >`
    select proposal.id, proposal.status,
      array_agg(link.room_id::text order by link.room_id) as room_ids
    from public.room_action_proposals proposal
    join public.room_action_proposal_rooms link
      on link.proposal_id = proposal.id
    where proposal.home_id = ${DEMO_SEED.home.id}
    group by proposal.id
    order by proposal.created_at, proposal.id
  `;
  assert.equal(proposals.length, 1, "host message must create one proposal");
  assert.equal(proposals[0]?.status, "pending");
  assert.deepEqual(proposals[0]?.room_ids, [proof.privateBlock.roomId]);

  await applyFirstRoomProposal(page);
  const [appliedBlock] = await sql<
    { proposal_status: string; block_status: string; room_id: string }[]
  >`
    select proposal.status as proposal_status, block.status as block_status,
      occupancy.room_id::text as room_id
    from public.room_action_proposals proposal
    join public.private_room_blocks block
      on block.home_id = proposal.home_id
     and block.idempotency_key = 'proposal:' || proposal.id::text
    join public.visit_rooms occupancy
      on occupancy.private_block_id = block.id
    where proposal.id = ${proposals[0]!.id}
  `;
  assert.deepEqual(appliedBlock, {
    proposal_status: "applied",
    block_status: "active",
    room_id: proof.privateBlock.roomId,
  });

  const blockedRoomIds = await findGuestRoomIds(page, guestLink, {
    from: proof.privateBlock.from,
    to: proof.privateBlock.to,
    nights: 2,
    adults: 2,
    children: 0,
    pets: 0,
  });
  assert.ok(
    !blockedRoomIds.includes(proof.privateBlock.roomId),
    `an applied private block must remove its room from guest options; visible rooms: ${blockedRoomIds.join(", ")}`,
  );

  await enterHost(page, baseUrl, DEMO_SEED.hosts[0].id, "en");
  await openWithheldRoom(page, proof.openedStay);
  const [openedOverride] = await sql<{ action: string; room_id: string }[]>`
    select action, room_id::text from public.room_availability_overrides
    where home_id = ${DEMO_SEED.home.id}
      and room_id = ${proof.openedStay.roomId}
  `;
  assert.deepEqual(openedOverride, {
    action: "open",
    room_id: proof.openedStay.roomId,
  });

  const openedRoomIds = await findGuestRoomIds(page, guestLink, {
    ...proof.openedStay,
    adults: proof.overflowGuest.adults,
    children: proof.overflowGuest.children,
    pets: proof.overflowGuest.pets,
  });
  assert.ok(
    openedRoomIds.includes(proof.openedStay.roomId),
    `the date-scoped opening must expose the withheld synthetic room; visible rooms: ${openedRoomIds.join(", ")}`,
  );
  await selectExactRoomsAndSubmit(page, proof.overflowGuest.selectedRoomIds);
  await waitForRunStatus(page, "interrupted");

  await enterHost(page, baseUrl, DEMO_SEED.hosts[0].id, "en");
  const decision = page.getByTestId("pending-decision");
  await decision.waitFor();
  assert.equal(await decision.count(), 1, "expected one overflow decision");
  assert.match(
    (await decision.textContent()) ?? "",
    /One double air mattress/,
    "the host must see the exact overflow arrangement",
  );
  await approvePendingDecision(page, "en");

  const [overflowResult] = await sql<
    {
      decision_status: string;
      applied_run_id: string | null;
      room_ids: string[];
      application_count: number;
    }[]
  >`
    select decision.status as decision_status,
      decision.applied_run_id::text,
      array_agg(occupancy.room_id::text order by occupancy.room_id) as room_ids,
      (
        select count(*)::integer from public.audit_events audit
        where audit.home_id = decision.home_id
          and audit.kind = 'decision_applied'
          and audit.payload->>'pendingDecisionId' = decision.id::text
      ) as application_count
    from public.pending_decisions decision
    join public.visits visit
      on visit.home_id = decision.home_id
     and visit.stay = daterange(
       ${proof.openedStay.from}::date,
       ${proof.openedStay.to}::date,
       '[)'
     )
    join public.visit_rooms occupancy on occupancy.visit_id = visit.id
    where decision.home_id = ${DEMO_SEED.home.id}
    group by decision.id
  `;
  assert.equal(overflowResult?.decision_status, "approved");
  assert.ok(overflowResult?.applied_run_id, "approved decision must resume");
  assert.deepEqual(
    overflowResult?.room_ids,
    [...proof.overflowGuest.selectedRoomIds].sort(),
    "the resumed visit must keep the guest's exact room IDs",
  );
  assert.equal(
    overflowResult?.application_count,
    1,
    "overflow approval must apply exactly once",
  );

  const calendarRead = await issueAndReadCalendar(page);
  const parsedCalendar = parseICalendar(calendarRead.body);
  const calendarEventCount = parsedCalendar.events.length;
  assert.equal(
    calendarEventCount,
    2,
    "calendar must contain the block and visit",
  );
  assertCalendarPrivacy(calendarRead.body, [
    calendarRead.token,
    proof.privateBlock.privateMarker,
    proof.privateBlock.request,
    proof.openedStay.privateMarker,
    ...DEMO_SEED.hosts.flatMap((host) => [host.displayName, ...host.emails]),
    ...DEMO_SEED.parties.flatMap((party) => [
      party.familyName,
      party.guestLink.split("/").at(-1) ?? "",
      party.invitation.rawMessage,
      ...party.invitation.specialRequests,
      ...party.invitation.roomAllocation,
    ]),
    ...DEMO_SEED.rooms.map((room) => room.name),
  ]);

  return {
    proposalCreated: true,
    privateBlockApplied: true,
    blockedRoomHidden: true,
    withheldRoomOpened: true,
    selectedRoomIds: proof.overflowGuest.selectedRoomIds,
    overflowInterrupted: true,
    overflowApproved: true,
    overflowAppliedOnce: true,
    calendarFeedRead: true,
    calendarPrivateDataAbsent: true,
    calendarEventCount,
  };
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

export async function captureInvitation(
  page: Page,
  rawMessage: string,
): Promise<string> {
  await page.getByTestId("host-capture-message").fill(rawMessage);
  await page.getByTestId("host-capture-submit").click();
  await page.getByTestId("capture-queued").waitFor();
  const reveal = page.getByTestId("capture-reveal");
  await reveal.waitFor();
  await reveal.click();
  const guestLink = page.getByTestId("guest-link");
  await guestLink.waitFor();
  const href = await guestLink.getAttribute("href");
  assert.ok(href, "capture did not return a guest link");
  return new URL(href, page.url()).toString();
}

export async function approvePendingDecision(
  page: Page,
  locale: "en" | "es",
): Promise<void> {
  await page.getByTestId("approve-decision").click();
  await page.waitForURL(new RegExp(`/${locale}/runs/[0-9a-f-]+/status`));
  await waitForRunStatus(page, "completed");
  await page.getByTestId("run-return").click();
  await page.waitForURL(new RegExp(`/${locale}/?(?:[?#].*)?$`));
  await waitForCount(page, "[data-testid='pending-decision']", 0);
}

async function requestRoomProposal(
  page: Page,
  rawMessage: string,
  locale: "en" | "es",
): Promise<void> {
  const form = page.locator("form[data-agent-room-request]");
  await form.locator("textarea[name='rawMessage']").fill(rawMessage);
  await form.locator("button[type='submit']").click();
  await page.waitForURL(new RegExp(`/${locale}/runs/[0-9a-f-]+/status`));
  await waitForRunStatus(page, "completed");
  await page.getByTestId("run-return").click();
  await page.waitForURL(new RegExp(`/${locale}/?(?:[?#].*)?$`));
  await page
    .locator("input[name='proposalId']")
    .first()
    .waitFor({ state: "attached" });
}

async function applyFirstRoomProposal(page: Page): Promise<void> {
  const proposalForms = page.locator("form:has(input[name='proposalId'])");
  assert.equal(await proposalForms.count(), 2, "expected one proposal row");
  await proposalForms.first().locator("button[type='submit']").click();
  await waitForCount(page, "input[name='proposalId']", 0);
}

async function openWithheldRoom(
  page: Page,
  opening: {
    roomId: string;
    from: string;
    to: string;
    privateMarker: string;
  },
): Promise<void> {
  const form = page.locator("form[data-webmcp-room-control]");
  await form.locator("select[name='roomId']").selectOption(opening.roomId);
  await form.locator("select[name='action']").selectOption("open");
  await form.locator("input[name='from']").fill(opening.from);
  await form.locator("input[name='to']").fill(opening.to);
  await form
    .locator("textarea[name='privateNote']")
    .fill(opening.privateMarker);
  await form.locator("button[type='submit']").click();
  await page
    .locator("li", { hasText: opening.privateMarker })
    .first()
    .waitFor();
}

async function findGuestRoomIds(
  page: Page,
  guestLink: string,
  search: {
    from: string;
    to: string;
    nights: number;
    adults: number;
    children: number;
    pets: number;
  },
): Promise<string[]> {
  await page.goto(guestLink);
  await waitForGuestSearchHydration(page);
  await page.locator("input[name='from']").fill(search.from);
  await page.locator("input[name='to']").fill(search.to);
  await page.locator("input[name='nights']").fill(String(search.nights));
  await page.locator("input[name='adults']").fill(String(search.adults));
  await page.locator("input[name='children']").fill(String(search.children));
  await page.locator("input[name='pets']").fill(String(search.pets));
  const [response] = await Promise.all([
    page.waitForResponse(
      (candidate) =>
        candidate.request().method() === "POST" &&
        candidate.url().includes("/g/"),
    ),
    page.getByTestId("find-options").click(),
  ]);
  assert.ok(response.ok(), `room search failed with HTTP ${response.status()}`);
  await page.getByTestId("guest-option").first().waitFor();
  return page
    .getByTestId("guest-room-option")
    .evaluateAll((inputs) =>
      inputs.map((input) => (input as HTMLInputElement).value),
    );
}

async function selectExactRoomsAndSubmit(
  page: Page,
  roomIds: readonly string[],
): Promise<void> {
  const options = page.getByTestId("guest-room-option");
  for (let index = 0; index < (await options.count()); index += 1) {
    const option = options.nth(index);
    if (await option.isChecked()) await option.uncheck();
  }
  for (const roomId of roomIds) {
    await page.locator(`input[name='roomIds'][value='${roomId}']`).check();
  }
  const overflowConsent = page.locator("input[name='overflowConsent']");
  await overflowConsent.waitFor();
  await overflowConsent.check();
  await page.getByTestId("guest-submit").click();
  await page.waitForURL(/\/runs\/[0-9a-f-]+\/status/);
  await page.getByTestId("run-status").waitFor();
}

async function issueAndReadCalendar(
  page: Page,
): Promise<{ body: string; token: string }> {
  const form = page.locator("form:has(input[name='label'])");
  await form
    .locator("input[name='label']")
    .fill(DEMO_SEED.roomProof.calendarFeedLabel);
  await form.locator("button[type='submit']").click();
  const subscription = page.locator("[role='status'] code");
  await subscription.waitFor();
  const feedUrl = (await subscription.textContent())?.trim();
  assert.ok(feedUrl, "calendar issue did not reveal a subscription URL");
  const token = new URL(feedUrl).pathname.split("/").at(-1);
  assert.ok(token, "calendar issue did not reveal a bearer token");
  const response = await page.request.get(feedUrl);
  const body = await response.text();
  assert.ok(
    response.ok(),
    `calendar read failed with HTTP ${response.status()}: ${body.slice(0, 500)}`,
  );
  assert.match(body, /^BEGIN:VCALENDAR\r?$/m);
  return { body, token };
}

export function assertCalendarPrivacy(
  body: string,
  forbiddenValues: readonly string[],
): void {
  const parsed = parseICalendar(body);
  const searchable = `${parsed.unfolded}\n${parsed.decodedText}`;
  for (const value of forbiddenValues) {
    if (!value) continue;
    assert.ok(
      !searchable.includes(value),
      `calendar output exposed forbidden value: ${value}`,
    );
  }
}

export function parseICalendar(body: string): {
  unfolded: string;
  decodedText: string;
  events: ReadonlyArray<Readonly<Record<string, string>>>;
} {
  assert.ok(body.endsWith("\r\n"), "calendar must end with CRLF");
  assert.ok(
    !body.replaceAll("\r\n", "").includes("\n"),
    "calendar must not contain bare line feeds",
  );
  const unfolded = body.replace(/\r\n[ \t]/g, "");
  const lines = unfolded.split("\r\n");
  assert.equal(lines.pop(), "", "calendar must have one terminal CRLF");
  assert.equal(lines[0], "BEGIN:VCALENDAR");
  assert.equal(lines.at(-1), "END:VCALENDAR");

  const events: Array<Record<string, string>> = [];
  let event: Record<string, string> | undefined;
  const decodedValues: string[] = [];
  for (const line of lines.slice(1, -1)) {
    if (line === "BEGIN:VEVENT") {
      assert.equal(event, undefined, "calendar events must not be nested");
      event = {};
      continue;
    }
    if (line === "END:VEVENT") {
      assert.ok(event, "calendar event end is missing its beginning");
      for (const required of ["UID", "DTSTART", "DTEND", "SUMMARY", "STATUS"]) {
        assert.ok(event[required], `calendar event is missing ${required}`);
      }
      events.push(event);
      event = undefined;
      continue;
    }

    const separator = line.indexOf(":");
    assert.ok(separator > 0, `calendar property is invalid: ${line}`);
    const property = line.slice(0, separator).split(";", 1)[0]!.toUpperCase();
    const value = line.slice(separator + 1);
    decodedValues.push(unescapeICalendarText(value));
    if (event) event[property] = value;
  }
  assert.equal(event, undefined, "calendar event is not closed");
  return { unfolded, decodedText: decodedValues.join("\n"), events };
}

function unescapeICalendarText(value: string): string {
  return value.replace(/\\([\\,;nN])/g, (_match, escaped: string) =>
    escaped === "n" || escaped === "N" ? "\n" : escaped,
  );
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
  await waitForGuestSearchHydration(page);
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
  await waitForRunStatus(page, stay.expectedRunStatus);
}

async function waitForGuestSearchHydration(page: Page): Promise<void> {
  await page
    .locator('form[data-webmcp-guest-search][data-hydrated="true"]')
    .waitFor();
}

async function waitForRunStatus(
  page: Page,
  expectedStatus: "completed" | "interrupted",
): Promise<void> {
  await page.waitForFunction(
    (expected) =>
      document
        .querySelector("[data-testid='run-status']")
        ?.getAttribute("data-status") === expected,
    expectedStatus,
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

async function loadSentEmailPingCounts(
  sql: postgres.Sql,
): Promise<DemoE2EEvidence["emailPings"]> {
  const rows = await sql<{ kind: string; sent: number }[]>`
    select kind, count(*) filter (where status = 'sent')::integer as sent
    from public.host_email_pings
    where home_id = ${DEMO_SEED.home.id}
    group by kind
  `;
  const byKind = new Map(rows.map((row) => [row.kind, row.sent]));
  return {
    pendingDecisionSent: byKind.get("pending_decision") ?? 0,
    escalationSent: byKind.get("reconfirm_escalation") ?? 0,
  };
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
