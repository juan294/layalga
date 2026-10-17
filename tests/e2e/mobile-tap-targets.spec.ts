import { clickAndWaitForPost, expectRunStatus } from "./helpers/async-actions";
import { expect } from "@playwright/test";
import type { Page } from "@playwright/test";

import { findFixtureGuest } from "../../src/test-support/fixture-household";
import { test } from "./helpers/household";

/* The mobile-webkit project runs this at the iPhone 13 profile (390px), so the
   measurements below are real WebKit layout rather than a harness estimate.
   That matters: a native menulist select reports the CSS min-height the sheet
   asked for while laying out at its own intrinsic height, so this class of
   defect is only visible once rendered. */
const minimumTarget = 44;

type Audit = {
  scrollWidth: number;
  clientWidth: number;
  undersized: {
    tag: string;
    testId: string;
    className: string;
    height: number;
    text: string;
  }[];
};

async function auditViewport(page: Page): Promise<Audit> {
  return page.evaluate((minimum) => {
    const root = document.documentElement;
    const interactive = document.querySelectorAll(
      "a, button, input, select, textarea, summary, [role=button]",
    );
    const undersized: Audit["undersized"] = [];

    interactive.forEach((element) => {
      const box = element.getBoundingClientRect();
      if (box.width === 0 && box.height === 0) return;

      const input = element as HTMLInputElement;
      if (input.type === "hidden") return;

      // The locale switcher is a deliberate compact control on
      // --interactive-target-compact, not an oversight.
      if (element.closest(".locale-switcher")) return;

      // A native checkbox or radio cannot be resized without losing its
      // control rendering; it is tappable through its wrapping label, so the
      // label is the target that has to clear the minimum.
      if (input.type === "checkbox" || input.type === "radio") {
        const label = element.closest("label");
        if (label && label.getBoundingClientRect().height >= minimum) return;
      }

      if (box.height + 1 < minimum) {
        undersized.push({
          tag: element.tagName,
          testId: element.getAttribute("data-testid") ?? "",
          className: String((element as HTMLElement).className ?? "").slice(
            0,
            60,
          ),
          height: Math.round(box.height),
          text: (element.textContent ?? "").trim().slice(0, 40),
        });
      }
    });

    return {
      scrollWidth: root.scrollWidth,
      clientWidth: root.clientWidth,
      undersized,
    };
  }, minimumTarget);
}

async function expectTouchSafe(page: Page, route: string) {
  const audit = await auditViewport(page);

  expect(
    audit.undersized,
    `${route}: controls under ${minimumTarget}px`,
  ).toEqual([]);

  expect(
    audit.scrollWidth,
    `${route}: page scrolls horizontally at ${audit.clientWidth}px`,
  ).toBeLessThanOrEqual(audit.clientWidth);
}

test.setTimeout(120_000);

test("@mobile every surface stays touch-safe at 390px", async ({
  context,
  household,
  page,
}) => {
  await household.signIn(context);

  await page.goto(`/en/g/${findFixtureGuest(household, "The Parkers").token}`);
  await expect(page.getByTestId("guest-status")).toBeVisible();
  await expectTouchSafe(page, "guest ledger");

  // Submitting leaves a pending decision, which is what makes the host
  // dashboard render its decision controls and the run status page reachable.
  await expect(
    page.locator('form[data-webmcp-guest-search][data-hydrated="true"]'),
  ).toBeVisible();
  await clickAndWaitForPost(page, "find-options");
  await expect(page.getByTestId("guest-room-option").first()).toBeVisible();
  await page.getByTestId("guest-option").first().check();
  await page.getByTestId("guest-submit").click();
  await expectRunStatus(page, "interrupted");

  await page.goto("/en");
  const approve = page.getByTestId("approve-decision");
  await expect(approve).toBeVisible();
  await expectTouchSafe(page, "host dashboard");

  await Promise.all([
    page.waitForURL(/\/en\/runs\/[0-9a-f-]+\/status/, { timeout: 30_000 }),
    approve.click(),
  ]);
  await expect(page.getByTestId("run-status")).toBeVisible();
  await expectTouchSafe(page, "run status");
});

test("@mobile the account chip stays inside the header with a very long email", async ({
  context,
  household,
  page,
}) => {
  const { userId } = await household.signIn(context);
  const email = `${"a".repeat(60 - "@fixture.test".length)}@fixture.test`;
  expect(email).toHaveLength(60);
  await household.db`update auth.users set email = ${email} where id = ${userId}`;

  await page.goto("/en");
  const chip = page.getByTestId("account-chip");
  await expect(chip).toContainText("aaaa");

  const layout = await page.evaluate(() => {
    const root = document.documentElement;
    const header = document
      .querySelector(".site-header")!
      .getBoundingClientRect();
    const chipBox = document
      .querySelector('[data-testid="account-chip"]')!
      .getBoundingClientRect();
    return {
      scrollWidth: root.scrollWidth,
      clientWidth: root.clientWidth,
      header: { left: header.left, right: header.right, bottom: header.bottom },
      chip: {
        left: chipBox.left,
        right: chipBox.right,
        bottom: chipBox.bottom,
      },
    };
  });

  expect(layout.scrollWidth).toBeLessThanOrEqual(layout.clientWidth);
  expect(layout.chip.left).toBeGreaterThanOrEqual(layout.header.left);
  expect(layout.chip.right).toBeLessThanOrEqual(layout.header.right);
  expect(layout.chip.bottom).toBeLessThanOrEqual(layout.header.bottom);
  await expect(chip).toHaveAttribute("title", email);
});
