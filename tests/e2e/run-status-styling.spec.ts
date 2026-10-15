import { expect } from "@playwright/test";

import { clickAndWaitForPost, expectRunStatus } from "./helpers/async-actions";
import { VEGA_CAPTURE_MESSAGE } from "../../src/test-support/fixture-household";
import { test } from "./helpers/household";

test.setTimeout(90_000);

test("the host capture poller keeps its visible card and status pulse", async ({
  context,
  household,
  page,
}) => {
  await household.signIn(context);
  await page.goto("/en");
  await page
    .getByTestId("host-capture-message")
    .fill(`${VEGA_CAPTURE_MESSAGE}${household.tag}`);
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
