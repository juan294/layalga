import { randomUUID } from "node:crypto";
import { expect } from "@playwright/test";
import en from "../../messages/en.json" with { type: "json" };
import es from "../../messages/es.json" with { type: "json" };
import { test } from "./helpers/household";

test.use({ householdOptions: { parties: [] } });
test.setTimeout(90_000);

test("a guest can reach discovery and refine a search with JavaScript disabled", async ({
  browser,
  baseURL,
}) => {
  const context = await browser.newContext({
    baseURL,
    javaScriptEnabled: false,
  });
  try {
    const guest = await context.newPage();
    await guest.goto("/en/sign-in");
    await guest.getByRole("link", { name: en.SignIn.findStays }).click();
    await guest.getByLabel(en.PublicStays.householdName).fill(randomUUID());
    await guest
      .getByRole("button", { name: en.PublicStays.search, exact: true })
      .click();
    await expect(guest.getByRole("status")).toHaveText(en.PublicStays.noMatch);
    await expect(guest.getByLabel(en.PublicStays.householdName)).toBeEditable();
  } finally {
    await context.close();
  }
});

for (const [locale, messages] of [
  ["en", en],
  ["es", es],
] as const) {
  for (const device of ["desktop", "@mobile"] as const) {
    test(`${device} ${locale} stranger compares two-week stays after the host lists the home`, async ({
      baseURL,
      browser,
      household,
      page,
    }) => {
      const listing = messages.HostPublicListing;
      const stays = messages.PublicStays;
      const name = `L’Ayalga ${randomUUID().slice(0, 8)}`;
      const july = `${new Date().getUTCFullYear() + 1}-07`;
      // The first option overlaps this single-night closure. The second starts
      // on the reopening date, so the guest can compare different room choices.
      await household.db`
        insert into public.room_availability_overrides
          (home_id,room_id,stay,action,created_by_host_id,idempotency_key,request_hash)
        values (${household.homeId},${household.roomIds[0]!},
          daterange(${july + "-01"}::date,${july + "-02"}::date,'[)'),'close',
          ${household.hostIds[0]!},${randomUUID()},'public-browse-e2e')
      `;
      const hostContext = await browser.newContext({ baseURL });
      try {
        await household.signIn(hostContext);
        const host = await hostContext.newPage();
        await host.goto(`/${locale}/settings`);
        await host.getByLabel(listing.name).fill(name);
        await host
          .getByRole("button", { name: listing.publish, exact: true })
          .click();
        const unpublish = host.getByRole("button", {
          name: listing.unpublish,
          exact: true,
        });
        await expect(unpublish).toBeVisible();

        // This is the project's device-specific, anonymous browser context.
        await page.goto(`/${locale}/sign-in`);
        await page
          .getByRole("link", { name: messages.SignIn.findStays })
          .click();
        await page.getByLabel(stays.householdName).fill(name.replace("’", "'"));
        await page
          .getByRole("button", { name: stays.search, exact: true })
          .click();
        await page.getByRole("link", { name, exact: true }).click();
        await expect(
          page.getByRole("heading", { name, exact: true }),
        ).toBeVisible();
        await page.getByLabel(stays.from).fill(july + "-01");
        await page.getByLabel(stays.to).fill(july + "-16");
        await page.getByLabel(stays.nights).fill("14");
        await page.getByLabel(stays.adults).fill("2");
        await page.getByRole("button", { name: stays.check }).click();
        const results = page.getByRole("region", { name: stays.matches });
        const options = results.locator("details");
        await expect(options).toHaveCount(2);
        const first = options.nth(0),
          second = options.nth(1);
        await first.locator("summary").click();
        await second.locator("summary").click();
        await expect(
          first.getByText(stays.checkout.replace("{date}", july + "-15")),
        ).toBeVisible();
        await expect(
          second.getByText(stays.checkout.replace("{date}", july + "-16")),
        ).toBeVisible();
        await expect(first.getByRole("listitem")).toHaveCount(1);
        await expect(
          first.getByText("Garage Room", { exact: true }),
        ).toBeVisible();
        await expect(first.getByText(/One sofa bed/)).toBeVisible();
        await expect(second.getByRole("listitem")).toHaveCount(2);
        await expect(
          second.getByText("Guest Room", { exact: true }),
        ).toBeVisible();
        await expect(second.getByText(/One double bed/)).toBeVisible();
        await expect(second.getByText(stays.recommended)).toBeVisible();

        await expect(first.getByText(stays.review)).toBeVisible();
        await expect(second.getByText(stays.review)).toBeVisible();
        await results.screenshot({
          path: test.info().outputPath("stay-comparison.png"),
        });

        await unpublish.click();
        await expect(
          host.getByRole("button", { name: listing.publish, exact: true }),
        ).toBeVisible();
        await page.reload();
        await expect(
          page.getByRole("heading", { name: stays.not_found }),
        ).toBeVisible();
        await expect(
          page.getByRole("region", { name: stays.matches }),
        ).toHaveCount(0);
        await page.getByRole("link", { name: stays.find }).click();
        await page.getByLabel(stays.householdName).fill(name);
        await page
          .getByRole("button", { name: stays.search, exact: true })
          .click();
        await expect(page.getByRole("status")).toHaveText(stays.noMatch);
      } finally {
        await hostContext.close();
      }
    });
  }
}
