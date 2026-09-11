import { expect, test } from "@playwright/test";

import { DEMO_SEED, seedDemo } from "../../scripts/seed-demo";
import {
  createDemoHostCookie,
  DEMO_HOST_COOKIE,
} from "../../src/lib/auth/demo-session";
import { clickAndWaitForPost, expectRunStatus } from "./helpers/async-actions";

test.setTimeout(90_000);

test("the host capture poller keeps its visible card and status pulse", async ({
  context,
  page,
}) => {
  const databaseUrl = process.env.DATABASE_URL;
  const tokenSecret = process.env.LINK_TOKEN_SECRET;
  if (!databaseUrl || !tokenSecret) {
    throw new Error("E2E database settings are missing");
  }

  await seedDemo(databaseUrl, tokenSecret);
  await context.addCookies([
    {
      httpOnly: true,
      name: DEMO_HOST_COOKIE,
      sameSite: "Lax",
      url: process.env.E2E_BASE_URL ?? "http://127.0.0.1:3008",
      value: createDemoHostCookie(DEMO_SEED.hosts[0].id),
    },
  ]);
  await page.goto("/en");
  await page
    .getByTestId("host-capture-message")
    .fill(
      "Oye, los Vega quieren venir a la casa un finde de septiembre, son Marta y Xuan con los dos crios.",
    );
  await clickAndWaitForPost(page, "host-capture-submit");
  await expectRunStatus(page, "completed");

  const card = page.getByTestId("run-status");
  const cardStyle = await card.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      backgroundColor: style.backgroundColor,
      borderTopWidth: style.borderTopWidth,
    };
  });
  const pulseBackgroundColor = await page
    .getByTestId("run-status-pulse")
    .evaluate((element) => getComputedStyle(element).backgroundColor);

  expect(cardStyle.backgroundColor).not.toBe("rgba(0, 0, 0, 0)");
  expect(cardStyle.borderTopWidth).not.toBe("0px");
  expect(pulseBackgroundColor).not.toBe("rgba(0, 0, 0, 0)");
});
