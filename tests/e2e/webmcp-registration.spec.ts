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

  await expectRegisteredTools(page, [
    "layalga.guest.prepare_booking",
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
