import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { PendingStayRequests } from "./pending-stay-requests";
import type { HostStayRequestReceipt } from "@/core/booking/stay-requests";

vi.mock("@/app/[locale]/(host)/stay-decision-actions", () => ({
  decideStay: vi.fn(),
}));
vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("next-intl/server", () => ({
  getTranslations: async () => (key: string) => key,
}));
it("exposes the pending card at the notification anchor and includes the exact proposal", async () => {
  const request: HostStayRequestReceipt = {
    handle: "fixture-listing",
    displayName: "Test household",
    overflowConsent: false,
    status: "pending",
    version: 1,
    visitId: null,
    visitStatus: null,
    createdAt: "2028-06-01T00:00:00Z",
    id: "abc",
    requesterEmail: "sam@example.test",
    stay: ["2028-07-01", "2028-07-15"],
    rooms: [
      {
        ref: "r",
        floorLabel: "Upstairs",
        standardCapacity: 2,
        maximumCapacity: 2,
        overflowArrangement: null,
        guestLabel: "Room B",
        sleepingArrangement: "Twin beds",
      },
    ],
    adults: 2,
    children: 0,
    pets: 0,
    notes: "Late arrival",
    requests: "Bring a cot",
    locale: "en",
  };
  const html = renderToStaticMarkup(
    await PendingStayRequests({ requests: [request], locale: "en" }),
  );
  for (const field of [
    'id="stay-request-abc"',
    "sam@example.test",
    "Room B",
    "Twin beds",
    "Late arrival",
    "Bring a cot",
    "confirmationMeaning",
    "roomCheck",
    ">confirm</button>",
    ">decline</button>",
  ])
    expect(html).toContain(field);
});
