import { expect } from "@playwright/test";
import en from "../../messages/en.json" with { type: "json" };
import es from "../../messages/es.json" with { type: "json" };
import { test } from "./helpers/household";
import { createFixtureRequester } from "./helpers/requester";

test.use({ householdOptions: { parties: [] } });
test.setTimeout(120_000);

test("first-time guest reviews an exact stay, returns after cancelled login, sends once and retrieves a private receipt", async ({
  page,
  context,
  browser,
  baseURL,
  household,
}) => {
  const requester = await createFixtureRequester(household.db);
  const host = await browser.newContext({ baseURL });
  try {
    const [listed] =
      await household.db`insert into public.household_public_listings(home_id,display_name,search_name,published)
      values(${household.homeId},'Guest request test','guest request test',true) returning handle`;
    const july = `${new Date().getUTCFullYear() + 1}-07`;
    const url = `/en/stays/${listed!.handle}?from=${july}-01&to=${july}-15&nights=14&adults=2&children=0&pets=0`;
    await page.goto(url);
    await page.locator("details summary").first().click();
    const option = page.locator("details").first();
    await option.getByLabel(en.StayRequests.notes).fill("Arriving by train.");
    await option
      .getByLabel(en.StayRequests.requests)
      .fill("Can we bring our bikes?");
    await option.getByRole("button", { name: en.StayRequests.review }).click();
    await expect(
      page.getByRole("button", { name: en.StayRequests.signIn }),
    ).toBeVisible();
    await expect(
      page.getByText("Arriving by train.", { exact: false }),
    ).toBeVisible();
    expect(page.url()).not.toContain("train");
    const prepare = await page.request.post("/auth/prepare", {
      data: { next: "/en/requests/review" },
      headers: { origin: new URL(baseURL!).origin },
    });
    expect(prepare.ok()).toBe(true);
    await page.goto("/auth/callback?error=access_denied");
    await expect(page.getByText(en.StayRequests.authFailed)).toBeVisible();
    await requester.signIn(context);
    await page.goto("/en/requests/review");
    await expect(
      page.getByRole("button", { name: en.StayRequests.send }),
    ).toBeVisible();
    const [before] =
      await household.db`select count(*)::int as n from public.stay_requests where home_id=${household.homeId}`;
    expect(before!.n).toBe(0);
    await page.getByRole("button", { name: en.StayRequests.send }).click();
    await expect(page.getByRole("status")).toContainText(
      en.StayRequests.status.pending,
    );
    const path = new URL(page.url()).pathname;
    const id = path.split("/").at(-1)!;
    await expect(
      page.getByText("Can we bring our bikes?", { exact: false }),
    ).toBeVisible();
    const [counts] =
      await household.db`select (select count(*)::int from public.stay_requests where home_id=${household.homeId}) as requests,
      (select count(*)::int from public.invitations where home_id=${household.homeId}) as invitations,
      (select count(*)::int from public.visits where home_id=${household.homeId}) as visits,
      (select count(*)::int from public.visit_rooms where home_id=${household.homeId}) as occupancy`;
    expect(counts).toEqual({
      requests: 1,
      invitations: 0,
      visits: 0,
      occupancy: 0,
    });
    await page.goto(path.replace("/en/", "/es/"));
    await expect(page.getByRole("status")).toContainText(
      es.StayRequests.status.pending,
    );
    const terms = page.getByRole("region", { name: es.StayRequests.terms });
    await expect(terms).toContainText("2 adultos · 0 menores · 0 mascotas");
    await expect(terms).toContainText("Arriving by train.");
    await expect(terms).toContainText("Can we bring our bikes?");

    const hostPage = await host.newPage();
    const reviewLink = `/es/review-stay/${id}`;
    await hostPage.goto(reviewLink);
    await expect(hostPage.getByTestId("google-sign-in")).toBeVisible();
    await expect(hostPage.getByText(requester.email)).toHaveCount(0);
    await household.signIn(host);
    await hostPage.goto(reviewLink);
    await expect(hostPage).toHaveURL(new RegExp(`/es#stay-request-${id}$`));
    const hostCard = hostPage.locator(`#stay-request-${id}`);
    await expect(hostCard).toContainText(requester.email);
    await expect(hostCard).toContainText("2 adultos · 0 menores · 0 mascotas");
    await expect(hostCard).toContainText(es.HostStayRequests.notes);
    await expect(hostCard).toContainText("Arriving by train.");
    await expect(hostCard).toContainText("Can we bring our bikes?");
    await hostPage.goto("/en");
    await expect(hostCard).toContainText(requester.email);
    await expect(hostCard).toContainText(en.HostStayRequests.notes);
    await household.db`update public.household_public_listings set published=false where home_id=${household.homeId}`;
    // Returning with the same key after the result was lost finds the original receipt.
    await page.goto("/en/requests/review");
    await expect(page).toHaveURL(new RegExp(`${path}$`));
    await page.getByRole("button", { name: en.Brand.signOut }).click();
    await expect(page).toHaveURL(/\/en\/sign-in$/);
    await page.goto(path);
    await expect(
      page.getByRole("button", { name: en.StayRequests.signIn }),
    ).toBeVisible();
    await expect(
      page.getByText("Can we bring our bikes?", { exact: false }),
    ).toHaveCount(0);
    await requester.signIn(context);
    const returningGuest = await context.newPage();
    await returningGuest.goto("/en/requests");
    await returningGuest
      .getByRole("link", { name: /Guest request test/ })
      .click();
    await returningGuest
      .getByRole("button", { name: en.StayRequests.withdraw })
      .click();
    await expect(returningGuest.getByRole("status")).toHaveText(
      en.StayRequests.status.withdrawn,
    );
  } finally {
    await host.close();
    await requester.cleanup();
  }
});
