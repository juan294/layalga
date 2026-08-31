import { expect, test, type Page } from "@playwright/test";

import { seedDemo } from "../../scripts/seed-demo";
import { createDemoHostCookie } from "../../src/lib/auth/demo-session";

const vegaToken = "v".repeat(43);
const nelHostId = "00000000-0000-4000-8000-000000000201";

test.setTimeout(90_000);

test.beforeEach(async ({ page }) => {
  const databaseUrl = process.env.DATABASE_URL;
  const tokenSecret = process.env.LINK_TOKEN_SECRET;
  if (!databaseUrl || !tokenSecret) {
    throw new Error("E2E database settings are missing");
  }
  await seedDemo(databaseUrl, tokenSecret);
  await installWebMcpTestDouble(page);
});

test("registers host WebMCP tools and prepares visible forms without a browser implementation", async ({
  context,
  page,
}) => {
  await context.addCookies([
    {
      httpOnly: true,
      name: "layalga_demo_host",
      sameSite: "Lax",
      url: "http://127.0.0.1:3008",
      value: createDemoHostCookie(nelHostId),
    },
  ]);
  await page.goto("/en");

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
    from: "2026-09-25",
    to: "2026-09-27",
    roomIds: [room!.id],
    publicLabel: "Prepared family room use",
  });

  const blockForm = page.locator("form[data-webmcp-host-block]");
  await expect(blockForm.locator('input[name="from"]')).toHaveValue(
    "2026-09-25",
  );
  await expect(blockForm.locator('input[name="to"]')).toHaveValue("2026-09-27");
  await expect(blockForm.locator('input[name="publicLabel"]')).toHaveValue(
    "Prepared family room use",
  );
  await expect(
    blockForm.locator(`input[name="roomIds"][value="${room!.id}"]`),
  ).toBeChecked();
  await expect(page.getByText("Prepared family room use")).toHaveCount(0);

  await executeWebMcpTool(page, "layalga.host.prepare_room_control", {
    from: "2026-09-25",
    to: "2026-09-27",
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
    "2026-09-25",
  );
  await expect(controlForm.locator('input[name="to"]')).toHaveValue(
    "2026-09-27",
  );
});

test("registers guest WebMCP tools and prepares an exact visible room choice", async ({
  page,
}) => {
  await page.goto(`/en/g/${vegaToken}`);

  await expectRegisteredTools(page, [
    "layalga.guest.prepare_booking",
    "layalga.guest.prepare_search",
    "layalga.guest.read_room_options",
  ]);
  await executeWebMcpTool(page, "layalga.guest.prepare_search", {
    from: "2026-09-18",
    to: "2026-09-21",
    nights: 3,
    adults: 2,
    children: 2,
    pets: 0,
  });
  const search = page.locator("form[data-webmcp-guest-search]");
  await expect(search.locator('input[name="from"]')).toHaveValue("2026-09-18");
  await expect(search.locator('input[name="to"]')).toHaveValue("2026-09-21");
  await expect(search.locator('input[name="children"]')).toHaveValue("2");
  await expect(page.getByTestId("guest-status")).toHaveAttribute(
    "data-status",
    "invited",
  );

  await page.getByTestId("find-options").click();
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
