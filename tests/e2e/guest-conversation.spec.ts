import { randomUUID } from "node:crypto";
import { expect } from "@playwright/test";
import { closeDatabase } from "../../src/core/db/client";
import { searchPublicStays } from "../../src/core/booking/public-stay-search";
import { submitStayRequest } from "../../src/core/booking/stay-requests";
import { decideRequestedStay } from "../../src/core/booking/decide-stay-request";
import en from "../../messages/en.json" with { type: "json" };
import es from "../../messages/es.json" with { type: "json" };
import { evidencePath } from "./helpers/evidence";
import { test } from "./helpers/household";
import { createFixtureRequester } from "./helpers/requester";

test.use({ householdOptions: { parties: [], hosts: 2 } });

for (const [locale, copy, device] of [
  ["en", en, "desktop"],
  ["es", es, "@mobile"],
] as const) {
  test(`${device} ${locale} guest refines a two-week stay, sends the reviewed selection and asks for the host's answer after returning`, async ({
    page,
    context,
    browser,
    baseURL,
    household,
  }, testInfo) => {
    test.setTimeout(120_000);
    const requester = await createFixtureRequester(household.db);
    const hostContext = await browser.newContext({ baseURL });
    const resumed = await browser.newContext({
      baseURL,
      viewport: page.viewportSize(),
    });
    const name = locale === "en" ? "Casa Almendro" : "Casa Olivo";
    const chat = page.getByRole("region", {
      name: copy.GuestConversation.title,
    });
    async function ask(message: string) {
      await chat.getByLabel(copy.GuestConversation.message).fill(message);
      await chat
        .getByRole("button", { name: copy.GuestConversation.ask, exact: true })
        .click();
      await expect(chat.getByRole("log")).toContainText(message);
    }
    const statusQuestion =
      locale === "es" ? "¿Ya confirmaron?" : "Did the hosts confirm?";
    try {
      const [listing] =
        await household.db`insert into public.household_public_listings(home_id,display_name,search_name,published) values(${household.homeId},${name},${name.toLowerCase()},true) returning handle`;
      await requester.signIn(context);
      await page.goto(
        locale === "en" ? "/en/stays" : `/es/stays/${listing!.handle}`,
      );
      await expect(page.locator(`a[href="/${locale}/requests"]`)).toHaveCount(
        0,
      );
      await ask(
        locale === "en"
          ? "Two weeks in July at Casa Almendroo"
          : "Dos semanas en julio",
      );
      if (locale === "en") {
        await chat.getByRole("button", { name, exact: true }).click();
      }
      await expect(chat.getByRole("log")).toContainText(
        locale === "en" ? "How many adults" : "Cuántos adultos",
      );
      await ask(
        locale === "en" ? "Two adults and one child" : "Dos adultos y un niño",
      );
      await expect(
        chat.getByRole("list", { name: copy.GuestConversation.options }),
      ).toBeVisible();
      await ask(locale === "en" ? "Twin beds" : "Camas individuales");
      await expect(chat.getByRole("log")).toContainText(
        locale === "en" ? "No stays matched" : "Ninguna estancia",
      );
      await ask(locale === "en" ? "Ground floor" : "Planta baja");
      const options = chat.getByRole("list", {
        name: copy.GuestConversation.options,
      });
      await expect(options.getByRole("button").first()).toContainText(
        "Garage Room",
      );
      await expect(options).not.toContainText("Guest Room");
      await expect(options).toContainText("One sofa bed");
      await expect(options.getByRole("button").first()).toContainText(
        "One double air mattress",
      );
      const structured = await chat
        .getByRole("link", { name: copy.GuestConversation.structured })
        .getAttribute("href");
      expect(structured).toContain("nights=14");
      await chat.screenshot({
        path: evidencePath(testInfo, "conversation-options.png"),
      });
      await ask(locale === "en" ? "Choose option 2" : "Elige la opción 2");
      await expect(
        chat.getByRole("checkbox", { name: "Garage Room" }),
      ).toBeChecked();
      await chat.getByLabel(copy.StayRequests.overflowConsent).check();
      await chat.getByLabel(copy.StayRequests.notes).fill("Arriving by train");
      await chat.getByLabel(copy.StayRequests.requests).fill("Bike storage");
      await chat
        .getByRole("button", { name: copy.StayRequests.review })
        .click();
      await expect(
        page.getByRole("button", { name: copy.StayRequests.send }),
      ).toBeVisible();
      await expect(
        page.getByRole("region", { name: copy.StayRequests.terms }),
      ).toContainText("One double air mattress");
      await expect(page.locator(`a[href="/${locale}/requests"]`)).toHaveCount(
        0,
      );
      await expect(
        page.getByText(copy.GuestConversation.commandHint, { exact: true }),
      ).toBeVisible();
      await page.getByRole("main").screenshot({
        path: evidencePath(testInfo, "conversation-review.png"),
      });
      await page
        .getByLabel(copy.GuestConversation.commandHint)
        .fill(locale === "en" ? "Did the hosts confirm?" : "¿Ya confirmaron?");
      await page
        .getByRole("button", {
          name: copy.GuestConversation.command,
          exact: true,
        })
        .click();
      await expect(
        page.getByText(copy.GuestConversation.otherCommand),
      ).toBeVisible();
      const [before] =
        await household.db`select count(*)::int as n from public.stay_requests where home_id=${household.homeId}`;
      expect(before!.n).toBe(0);
      if (locale === "en") {
        await page.route("**/en/requests/review", async (route) => {
          if (
            route.request().headers()["next-action"] &&
            route.request().postData()?.includes(requester.email)
          ) {
            await route.fetch();
            await route.abort("connectionreset");
          } else await route.fallback();
        });
      }
      const submit = async () => {
        await page
          .getByLabel(copy.GuestConversation.commandHint)
          .fill(copy.GuestConversation.submitExample);
        await page
          .getByRole("button", {
            name: copy.GuestConversation.command,
            exact: true,
          })
          .click();
      };
      await submit();
      if (locale === "en") {
        await expect(
          page.getByText(copy.StayRequests.unavailable),
        ).toBeVisible();
        await page.unroute("**/en/requests/review");
        await submit();
      }
      await expect(page.getByRole("status")).toHaveText(
        copy.StayRequests.status.pending,
      );
      const receipt = new URL(page.url()).pathname;
      const id = receipt.split("/").at(-1)!;
      // Compare the captured projection after completing the guest's uninterrupted turn.
      const comparison = await context.newPage();
      await comparison.goto(structured!);
      const matched = comparison
        .getByRole("region", { name: copy.PublicStays.matches })
        .locator("details")
        .first();
      await matched.locator("summary").click();
      await expect(
        matched.getByRole("checkbox", { name: "Garage Room" }),
      ).toBeVisible();
      await comparison.close();
      await page.goto(`/${locale}/stays`);
      await expect(
        page
          .getByRole("link", { name: copy.StayRequests.history, exact: true })
          .first(),
      ).toBeVisible();
      await ask(statusQuestion);
      await expect(
        chat.getByRole("link", { name: new RegExp(name) }),
      ).toHaveAttribute("href", receipt);
      await expect(chat).toContainText(copy.StayRequests.status.pending);
      await household.signIn(hostContext);
      const host = await hostContext.newPage();
      await host.goto(`/${locale}/review-stay/${id}`);
      const card = host.locator(`#stay-request-${id}`);
      await expect(card).toContainText("Bike storage");
      await card
        .getByRole("button", { name: copy.HostStayRequests.confirm })
        .click();
      await expect(card.getByRole("status")).toContainText(
        copy.HostStayRequests.confirmed,
      );
      await requester.signIn(resumed);
      const fresh = await resumed.newPage();
      await fresh.goto(`/${locale}/stays`);
      const freshChat = fresh.getByRole("region", {
        name: copy.GuestConversation.title,
      });
      await freshChat
        .getByLabel(copy.GuestConversation.message)
        .fill(statusQuestion);
      await freshChat
        .getByRole("button", { name: copy.GuestConversation.ask, exact: true })
        .click();
      await expect(
        freshChat.getByText(copy.GuestAccount.status.confirmed, {
          exact: true,
        }),
      ).toBeVisible();
      await freshChat.getByRole("link", { name: new RegExp(name) }).click();
      await expect(fresh.getByRole("status")).toHaveText(
        copy.GuestAccount.status.confirmed,
      );
      const [counts] =
        await household.db`select (select count(*)::int from public.stay_requests where home_id=${household.homeId}) as requests,(select count(*)::int from public.visits where home_id=${household.homeId}) as visits`;
      expect(counts).toEqual({ requests: 1, visits: 1 });
    } finally {
      await resumed.close();
      await hostContext.close();
      await requester.cleanup();
    }
  });
}

test.afterAll(closeDatabase);
test("a returning guest sees both declined and changed proposals in conversation", async ({
  household,
  page,
  context,
}) => {
  const requester = await createFixtureRequester(household.db);
  try {
    const [listing] =
      await household.db`insert into public.household_public_listings(home_id,display_name,search_name,published) values(${household.homeId},'Casa Nube','casa nube',true) returning handle`;
    const criteria = {
      from: "2090-07-01",
      to: "2090-07-15",
      nights: 14,
      adults: 2,
      children: 0,
      pets: 0,
    };
    const [option] = (await searchPublicStays(listing!.handle, criteria))
      .options;
    const group = {
      handle: listing!.handle,
      criteria,
      roomRefs: option!.recommendedRoomRefs,
      overflowConsent: false,
      locale: "en" as const,
      notes: "",
      requests: "",
    };
    const first = await submitStayRequest(requester, {
      ...group,
      idempotencyKey: randomUUID(),
    });
    const second = await submitStayRequest(requester, {
      ...group,
      idempotencyKey: randomUUID(),
    });
    if (first.status !== "pending" || second.status !== "pending")
      throw new Error("Missing pending fixture");
    const host = { id: household.hostIds[0]!, homeId: household.homeId };
    await decideRequestedStay(host, first.requestId, 1, "decline");
    await household.db`update public.rooms set sleeping_arrangement='Twin beds' where home_id=${household.homeId}`;
    await decideRequestedStay(host, second.requestId, 1, "confirm");
    await requester.signIn(context);
    await page.goto("/en/stays");
    const chat = page.getByRole("region", { name: en.GuestConversation.title });
    await chat
      .getByLabel(en.GuestConversation.message)
      .fill("Did the hosts confirm?");
    await chat
      .getByRole("button", { name: en.GuestConversation.ask, exact: true })
      .click();
    const declined = chat
      .locator("li")
      .filter({ hasText: en.StayRequests.status.declined });
    const changed = chat
      .locator("li")
      .filter({ hasText: en.StayRequests.status.needs_new_selection });
    await expect(declined.getByRole("link")).toHaveAttribute(
      "href",
      `/en/requests/${first.requestId}`,
    );
    await expect(changed.getByRole("link")).toHaveAttribute(
      "href",
      `/en/requests/${second.requestId}`,
    );
  } finally {
    await requester.cleanup();
  }
});
