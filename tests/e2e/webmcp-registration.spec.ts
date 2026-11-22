import en from "../../messages/en.json" with { type: "json" };
import type { PublicStayOption } from "../../src/core/booking/public-stay-search";
import { createFixtureRequester } from "./helpers/requester";
import { clickAndWaitForPost } from "./helpers/async-actions";
import { expect, type Page } from "@playwright/test";

import { fixtureStay } from "../../src/test-support/fixture-household";
import { findFixtureGuest } from "../../src/test-support/fixture-household";
import { test } from "./helpers/household";

test.setTimeout(90_000);

test.beforeEach(async ({ page }) => {
  await installWebMcpTestDouble(page);
});

test("registers host WebMCP tools and prepares visible forms without a browser implementation", async ({
  context,
  household,
  page,
}) => {
  await household.signIn(context);
  // The room-control WebMCP tools register on the Room ledger form, which
  // now lives at its own route -- see the hub-and-spoke host restructure.
  await page.goto("/en/rooms");
  const [blockFrom, blockTo] = fixtureStay(new Date(), 7, 2);

  await expectRegisteredTools(page, [
    "layalga.host.prepare_private_block",
    "layalga.host.prepare_room_control",
    "layalga.host.read_rooms",
  ]);
  const rooms = await executeWebMcpTool<
    { rooms: { id: string; guestLabel: string }[] },
    Record<string, never>
  >(page, "layalga.host.read_rooms", {});
  expect(rooms.rooms).toHaveLength(3);

  const room = rooms.rooms[0];
  expect(room).toBeDefined();
  await executeWebMcpTool(page, "layalga.host.prepare_private_block", {
    from: blockFrom,
    to: blockTo,
    roomIds: [room!.id],
    publicLabel: "Prepared family room use",
  });

  const blockForm = page.locator("form[data-webmcp-host-block]");
  await expect(blockForm.locator('input[name="from"]')).toHaveValue(blockFrom);
  await expect(blockForm.locator('input[name="to"]')).toHaveValue(blockTo);
  await expect(blockForm.locator('input[name="publicLabel"]')).toHaveValue(
    "Prepared family room use",
  );
  await expect(
    blockForm.locator(`input[name="roomIds"][value="${room!.id}"]`),
  ).toBeChecked();
  await expect(page.getByText("Prepared family room use")).toHaveCount(0);

  await executeWebMcpTool(page, "layalga.host.prepare_room_control", {
    from: blockFrom,
    to: blockTo,
    roomId: room!.id,
    action: "close",
  });
  const controlForm = page.locator("form[data-webmcp-room-control]");
  await expect(controlForm.locator('select[name="roomId"]')).toHaveValue(
    room!.id,
  );
  await expect(controlForm.locator('select[name="action"]')).toHaveValue(
    "close",
  );
  await expect(controlForm.locator('input[name="from"]')).toHaveValue(
    blockFrom,
  );
  await expect(controlForm.locator('input[name="to"]')).toHaveValue(blockTo);
});

test("registers guest WebMCP tools and prepares an exact visible room choice", async ({
  household,
  page,
}) => {
  const { token: vegaToken, preferredStay } = findFixtureGuest(
    household,
    "Familia Vega",
  );
  const [from, to] = preferredStay;
  await page.goto(`/en/g/${vegaToken}`);

  // Booking preparation stays unregistered until room options are visible.
  await expectRegisteredTools(page, [
    "layalga.guest.prepare_search",
    "layalga.guest.read_room_options",
  ]);
  await executeWebMcpTool(page, "layalga.guest.prepare_search", {
    from,
    to,
    nights: 3,
    adults: 2,
    children: 2,
    pets: 0,
  });
  const search = page.locator("form[data-webmcp-guest-search]");
  await expect(search.locator('input[name="from"]')).toHaveValue(from);
  await expect(search.locator('input[name="to"]')).toHaveValue(to);
  await expect(search.locator('input[name="children"]')).toHaveValue("2");
  await expect(page.getByTestId("guest-status")).toHaveAttribute(
    "data-status",
    "invited",
  );

  await clickAndWaitForPost(page, "find-options");
  await expect(page.getByTestId("guest-room-option").first()).toBeVisible();
  await expectRegisteredTools(page, [
    "layalga.guest.prepare_booking",
    "layalga.guest.prepare_search",
    "layalga.guest.read_room_options",
  ]);
  const result = await executeWebMcpTool<
    {
      options: {
        stay: [string, string];
        recommendedRoomIds: string[];
      }[];
    },
    Record<string, never>
  >(page, "layalga.guest.read_room_options", {});
  const option = result.options[0];
  expect(option?.recommendedRoomIds.length).toBeGreaterThan(1);
  await executeWebMcpTool(page, "layalga.guest.prepare_booking", {
    stay: option!.stay.join("|"),
    roomIds: option!.recommendedRoomIds,
    acceptOverflow: false,
  });

  await expect(
    page.locator('[data-testid="guest-room-option"]:checked'),
  ).toHaveCount(option!.recommendedRoomIds.length);
  await expect(page.getByTestId("guest-status")).toHaveAttribute(
    "data-status",
    "invited",
  );
  await expect(page).toHaveURL(new RegExp(`/en/g/${vegaToken}$`));
});

async function installWebMcpTestDouble(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const registrations = new Map<
      string,
      { execute: (input: Record<string, unknown>) => Promise<unknown> }
    >();
    Object.defineProperty(window, "__layalgaWebMcpTools", {
      configurable: true,
      value: registrations,
    });
    Object.defineProperty(document, "modelContext", {
      configurable: true,
      value: {
        registerTool(
          tool: {
            name: string;
            execute: (input: Record<string, unknown>) => Promise<unknown>;
          },
          options?: { signal?: AbortSignal },
        ) {
          registrations.set(tool.name, tool);
          options?.signal?.addEventListener(
            "abort",
            () => {
              if (registrations.get(tool.name) === tool) {
                registrations.delete(tool.name);
              }
            },
            { once: true },
          );
        },
      },
    });
  });
}

async function expectRegisteredTools(
  page: Page,
  expected: string[],
): Promise<void> {
  await expect
    .poll(() =>
      page.evaluate(() =>
        [
          ...(
            window as typeof window & {
              __layalgaWebMcpTools: Map<string, unknown>;
            }
          ).__layalgaWebMcpTools.keys(),
        ].sort(),
      ),
    )
    .toEqual([...expected].sort());
}

async function executeWebMcpTool<
  Result = unknown,
  Input extends Record<string, unknown> = Record<string, unknown>,
>(page: Page, name: string, input: Input): Promise<Result> {
  return page.evaluate(
    async ({ toolName, toolInput }) => {
      const tools = (
        window as typeof window & {
          __layalgaWebMcpTools: Map<
            string,
            { execute: (input: Record<string, unknown>) => Promise<unknown> }
          >;
        }
      ).__layalgaWebMcpTools;
      const tool = tools.get(toolName);
      if (!tool) throw new Error(`WebMCP tool is not registered: ${toolName}`);
      return tool.execute(toolInput);
    },
    { toolName: name, toolInput: input },
  ) as Promise<Result>;
}

test("WebMCP accepts a verified guest for discovery and requires sign-in again after the session ends", async ({
  household,
  context,
  requester,
  page,
}) => {
  const name = `Public ${household.homeId}`;
  const [listing] = await household.db<{ handle: string }[]>`
    insert into public.household_public_listings (home_id, display_name, search_name, published)
    values (${household.homeId}, ${name}, ${name.toLowerCase()}, true) returning handle
  `;
  await page.goto(`/en/stays?q=${encodeURIComponent(name)}`);
  await expect(page.getByTestId("google-sign-in")).toBeVisible();
  await expectRegisteredTools(page, []);
  await expect(page.getByRole("link", { name, exact: true })).toHaveCount(0);
  await requester.signIn(context);
  await page.goto("/en/stays");
  await expectRegisteredTools(page, [
    "layalga.public.find_households",
    "layalga.public.search_stays",
  ]);
  const homes = await executeWebMcpTool(
    page,
    "layalga.public.find_households",
    { name },
  );
  expect(homes).toEqual({
    status: "success",
    listings: [{ handle: listing!.handle, displayName: name }],
    truncated: false,
  });
  const [from, to] = fixtureStay(new Date(), 30, 14);
  const input = {
    handle: listing!.handle,
    from,
    to,
    nights: 14,
    adults: 2,
    children: 0,
    pets: 0,
  };
  const result = await executeWebMcpTool(
    page,
    "layalga.public.search_stays",
    input,
  );
  expect(result).toMatchObject({
    status: "success",
    options: [{ stay: [from, to], rooms: expect.any(Array) }],
    truncated: false,
  });
  await context.clearCookies();
  expect(
    await executeWebMcpTool(page, "layalga.public.find_households", { name }),
  ).toMatchObject({
    status: "sign_in",
    listings: [],
    next: expect.stringMatching(/Google/),
  });
  expect(
    await executeWebMcpTool(page, "layalga.public.search_stays", input),
  ).toMatchObject({
    status: "sign_in",
    options: [],
    next: expect.stringMatching(/Google/),
  });
  await requester.signIn(context);
  await household.db`update public.household_public_listings set published=false where home_id=${household.homeId}`;
  expect(
    await executeWebMcpTool(page, "layalga.public.search_stays", input),
  ).toEqual({ status: "not_found", options: [], truncated: false });

  // This fixture still has a valid email session after its Google identity is removed.
  await household.db`delete from auth.identities where user_id=${requester.userId} and provider='google'`;
  await requester.signIn(context);
  await page.goto("/en/stays");
  await expect(page.getByTestId("google-sign-in")).toBeVisible();
  await expectRegisteredTools(page, []);
});

test("public preparation and private receipt tools follow the exact visible selection and current account", async ({
  page,
  context,
  browser,
  baseURL,
  household,
}) => {
  const name = "Browser tool " + household.homeId;
  const [listing] = await household.db<{ handle: string }[]>`
    insert into public.household_public_listings(home_id,display_name,search_name,published)
    values (${household.homeId},${name},${name.toLowerCase()},true) returning handle`;
  const requester = await createFixtureRequester(household.db);
  try {
    const publicTools = [
      "layalga.public.find_households",
      "layalga.public.search_stays",
    ];
    const prepare = "layalga.public.prepare_stay_request";
    const status = "layalga.guest.read_request_status";
    await requester.signIn(context);
    await page.goto("/en/stays");
    await expectRegisteredTools(page, publicTools);
    const places = await executeWebMcpTool<{ listings: { handle: string }[] }>(
      page,
      publicTools[0]!,
      { name },
    );
    expect(places.listings).toEqual([
      { handle: listing!.handle, displayName: name },
    ]);
    const [from, to] = fixtureStay(new Date(), 70, 14);
    const query = {
      from,
      to,
      nights: "14",
      adults: "3",
      children: "0",
      pets: "0",
    };
    const result = await executeWebMcpTool<{ options: PublicStayOption[] }>(
      page,
      publicTools[1]!,
      {
        ...query,
        nights: 14,
        adults: 3,
        children: 0,
        pets: 0,
        handle: listing!.handle,
      },
    );
    const option = result.options[0]!;
    expect(option.stay).toEqual([from, to]);
    const overflowRoom = option.rooms.find(
      (room) => room.standardCapacity < 3 && room.maximumCapacity >= 3,
    )!;
    await page.goto(
      `/en/stays/${listing!.handle}?${new URLSearchParams(query)}`,
    );
    await expectRegisteredTools(page, [...publicTools, prepare]);
    const selection = { from, to, roomRefs: [overflowRoom.ref] };
    const openOptions = page.locator(
      "details[open] form[data-webmcp-public-option]",
    );
    const openBefore = await openOptions.count();
    await context.clearCookies();
    expect(await executeWebMcpTool(page, prepare, selection)).toMatchObject({
      status: "sign_in",
    });
    await expect(openOptions).toHaveCount(openBefore);
    await requester.signIn(context);
    expect(await executeWebMcpTool(page, prepare, selection)).toMatchObject({
      status: "prepared",
      requiresOverflowConsent: true,
    });
    const form = openOptions;
    await expect(form.locator('input[name="room"]:checked')).toHaveCount(1);
    await expect(form.locator('input[name="room"]:checked')).toHaveValue(
      overflowRoom.ref,
    );
    const consent = form.locator('input[name="overflow"]');
    await expect(consent).not.toBeChecked();
    const [before] =
      await household.db`select count(*)::int as n from public.stay_requests where home_id=${household.homeId}`;
    expect(before!.n).toBe(0);
    await form.getByLabel(en.StayRequests.notes).fill("Private travel detail");
    await consent.check();
    await form.getByRole("button", { name: en.StayRequests.review }).click();
    const send = page.getByRole("button", { name: en.StayRequests.send });
    await expect(send).toBeVisible();
    await expectRegisteredTools(page, []);
    await send.click();
    await expect(page.getByRole("status")).toHaveText(
      en.StayRequests.status.pending,
    );
    await expectRegisteredTools(page, [status]);
    expect(await executeWebMcpTool(page, status, {})).toEqual({
      status: "pending",
      visitStatus: null,
    });
    const stranger = await createFixtureRequester(household.db);
    try {
      await stranger.signIn(context);
      expect(await executeWebMcpTool(page, status, {})).toEqual({
        status: "not_found",
      });
      await context.clearCookies();
      expect(await executeWebMcpTool(page, status, {})).toEqual({
        status: "sign_in",
      });
    } finally {
      await stranger.cleanup();
    }
    await requester.signIn(context);
    const receiptId = new URL(page.url()).pathname.split("/").at(-1)!;
    const hostContext = await browser.newContext({ baseURL });
    try {
      await household.signIn(hostContext);
      const dashboard = await hostContext.newPage();
      await dashboard.goto("/en/review-stay/" + receiptId);
      const card = dashboard.locator("#stay-request-" + receiptId);
      await card
        .getByRole("button", { name: en.HostStayRequests.confirm })
        .click();
      await expect(card.getByRole("status")).toContainText(
        en.HostStayRequests.confirmed,
      );
      expect(await executeWebMcpTool(page, status, {})).toEqual({
        status: "confirmed",
        visitStatus: "confirmed",
      });
    } finally {
      await hostContext.close();
    }
    await page
      .getByRole("navigation", { name: en.Brand.bookingNavigation })
      .getByRole("link", { name: en.StayRequests.history, exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: en.StayRequests.history }),
    ).toBeVisible();
    await expectRegisteredTools(page, []);
  } finally {
    await requester.cleanup();
  }
});
