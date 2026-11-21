import { randomUUID } from "node:crypto";
import { expect } from "@playwright/test";
import en from "../../messages/en.json" with { type: "json" };
import es from "../../messages/es.json" with { type: "json" };
import { closeDatabase } from "../../src/core/db/client";
import { searchPublicStays } from "../../src/core/booking/public-stay-search";
import { submitStayRequest } from "../../src/core/booking/stay-requests";
import { signInAsHost } from "../../src/test-support/host-session";
import { createFixtureRequester } from "./helpers/requester";
import { test } from "./helpers/household";

test.use({ householdOptions: { parties: [], hosts: 2 } });
test.afterAll(closeDatabase);

for (const scenario of [
  "confirmed",
  "declined",
  "needs_new_selection",
] as const) {
  test(`a final host decision gives the guest a private ${scenario} outcome`, async ({
    page: guest,
    context,
    browser,
    baseURL,
    household,
  }) => {
    test.setTimeout(120_000);
    const requester = await createFixtureRequester(household.db);
    const host = await browser.newContext({ baseURL });
    const otherHost = await browser.newContext({ baseURL });
    try {
      const [listing] =
        await household.db`insert into public.household_public_listings(home_id,display_name,search_name,published)
        values(${household.homeId},'Hill House','hill house',true) returning handle`;
      const july = `${new Date().getUTCFullYear() + 1}-07`;
      const criteria = {
        from: `${july}-01`,
        to: `${july}-15`,
        nights: 14,
        adults: 2,
        children: 1,
        pets: 0,
      };
      const [option] = (await searchPublicStays(listing!.handle, criteria))
        .options;
      const room = option?.rooms.find((r) => r.guestLabel === "Garage Room");
      if (!room) throw new Error("Fixture needs the reviewed overflow room");
      const request = await submitStayRequest(requester, {
        handle: listing!.handle,
        criteria,
        roomRefs: [room.ref],
        overflowConsent: true,
        notes: "Arriving by train.",
        requests: "Please store our bikes.",
        locale: "es",
        idempotencyKey: randomUUID(),
      });
      if (request.status !== "pending")
        throw new Error(`Fixture request must be pending: ${request.status}`);
      const id = request.requestId;
      const receipt = (locale: string) => `/${locale}/requests/${id}`;
      const notification = (locale: string) => `/${locale}/review-stay/${id}`;
      await requester.signIn(context);
      await guest.goto(receipt("es"));
      await expect(guest.getByRole("status")).toContainText(
        es.StayRequests.status.pending,
      );

      await household.signIn(host);
      const dashboard = await host.newPage();
      const card = dashboard.locator(`#stay-request-${id}`);
      await dashboard.goto(notification("es"));
      await expect(card).toContainText(es.HostStayRequests.confirmationMeaning);
      await expect(card).toContainText(es.HostStayRequests.roomCheck);
      await expect(card).toContainText("One double air mattress");
      await expect(card).toContainText("Please store our bikes.");
      await dashboard.goto(notification("en"));
      await expect(card).toContainText(en.HostStayRequests.confirmationMeaning);
      await expect(card).toContainText(en.HostStayRequests.roomCheck);
      await expect(card).toContainText(requester.email);
      const staleDashboard = await otherHost.newPage();
      if (scenario === "confirmed") {
        await signInAsHost(otherHost, {
          sql: household.db,
          hostId: household.hostIds[1]!,
        });
        await staleDashboard.goto(notification("es"));
        await expect(
          staleDashboard.getByRole("button", {
            name: es.HostStayRequests.decline,
          }),
        ).toBeVisible();
      }
      if (scenario === "needs_new_selection") {
        await household.db`update public.rooms set overflow_arrangement='Rollaway bed' where home_id=${household.homeId} and guest_label='Garage Room'`;
      }
      if (scenario === "confirmed") {
        // Let the real server commit, then drop just its response to this tab.
        await dashboard.route("**/en", async (route) => {
          if (!route.request().headers()["next-action"])
            return route.fallback();
          await route.fetch();
          await route.abort("connectionreset");
        });
        await card
          .getByRole("button", { name: en.HostStayRequests.confirm })
          .click();
        await expect(card.getByRole("alert")).toContainText(
          en.HostStayRequests.unavailable,
        );
        await dashboard.unroute("**/en");
      }
      await card
        .getByRole("button", {
          name:
            scenario === "declined"
              ? en.HostStayRequests.decline
              : en.HostStayRequests.confirm,
        })
        .click();
      await expect(card.getByRole("status")).toContainText(
        en.HostStayRequests[scenario],
      );
      const [record] =
        await household.db`select status,visit_id from public.stay_requests where home_id=${household.homeId} and id=${id}`;
      expect(record!.status).toBe(scenario);
      await guest.reload();

      if (scenario === "confirmed") {
        expect(record!.visit_id).toBeTruthy();
        const [winner] =
          await household.db`select display_name from public.hosts where id=${household.hostIds[0]!}`;
        await expect(card.getByRole("status")).toContainText(
          winner!.display_name,
        );
        const otherCard = staleDashboard.locator(`#stay-request-${id}`);
        await otherCard
          .getByRole("button", { name: es.HostStayRequests.decline })
          .click();
        await expect(otherCard.getByRole("status")).toContainText(
          es.HostStayRequests.conflict,
        );
        await expect(otherCard.getByRole("status")).toContainText(
          winner!.display_name,
        );
        await staleDashboard.goto(notification("es"));
        await expect(staleDashboard.getByRole("status")).toContainText(
          es.StayRequests.status.confirmed,
        );
        await expect(staleDashboard.getByRole("status")).toContainText(
          winner!.display_name,
        );
        for (const [locale, copy] of [
          ["es", es],
          ["en", en],
        ] as const) {
          await guest.goto(receipt(locale));
          await expect(
            guest.getByText(copy.GuestAccount.status.confirmed, {
              exact: true,
            }),
          ).toBeVisible();
          await expect(guest.getByTestId("guest-room-labels")).toHaveText(
            "Garage Room",
          );
          await expect(guest.getByTestId("request-change")).toBeVisible();
          await guest
            .getByText(copy.Cancellation.openVisit, { exact: true })
            .click();
          await expect(guest.getByTestId("confirm-cancellation")).toBeVisible();
        }
        const [bookings] =
          await household.db`select count(*)::int as n from public.visits where home_id=${household.homeId}`;
        expect(bookings!.n).toBe(1);
        await guest.getByLabel(en.Cancellation.confirmLabel).check();
        await guest.getByTestId("confirm-cancellation").click();
        await expect(guest).toHaveURL(/\/en\/cancellation-complete$/);
        await guest.goto(receipt("en"));
        await expect(guest.getByRole("status")).toHaveText(
          en.GuestAccount.status.cancelled,
        );
        await expect(guest.getByTestId("request-change")).toHaveCount(0);
        await expect(guest.getByTestId("confirm-cancellation")).toHaveCount(0);
      } else {
        expect(record!.visit_id).toBeNull();
        await expect(guest.getByRole("status")).toContainText(
          es.StayRequests.status[scenario],
        );
        await expect(
          guest.getByRole("link", { name: es.StayRequests.findAnother }),
        ).toBeVisible();
        await expect(guest.getByTestId("request-change")).toHaveCount(0);
      }
    } finally {
      await otherHost.close();
      await host.close();
      await requester.cleanup();
    }
  });
}
