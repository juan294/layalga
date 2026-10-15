import { expect, test } from "@playwright/test";

import { clickAndWaitForPost, expectRunStatus } from "./helpers/async-actions";
import { openHousehold, type OpenHousehold } from "./helpers/household";

test.setTimeout(90_000);

let current: OpenHousehold | undefined;

test.afterEach(async () => {
  const household = current;
  current = undefined;
  await household?.close();
});

test("the host capture poller keeps its visible card and status pulse", async ({
  context,
  page,
}) => {
  current = await openHousehold();
  await current.signIn(context);
  await page.goto("/en");
  await page
    .getByTestId("host-capture-message")
    .fill(
      `Oye, los Vega quieren venir a la casa un finde, son Marta y Xuan con los dos crios. [${current.household.homeName}]`,
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
