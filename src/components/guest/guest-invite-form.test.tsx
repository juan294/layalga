import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";

import en from "../../../messages/en.json";
import {
  GuestInviteForm,
  guestRoomReviewKey,
  guestSearchIsStale,
  guestSelectionCanSubmit,
} from "./guest-invite-form";

const defaults = {
  from: "2026-09-12",
  to: "2026-09-16",
  nights: 2,
  adults: 2,
  children: 1,
  pets: 0,
  notes: "Please leave the key in the lockbox.",
};

describe("guest invitation form", () => {
  it("identifies stale searches across every search dimension", () => {
    const current = { ...defaults };
    expect(guestSearchIsStale(current, current)).toBe(false);
    for (const field of ["from", "to", "nights", "adults", "children", "pets"] as const) {
      const changed = { ...current, [field]: field === "nights" ? 3 : field === "from" ? "2026-09-13" : field === "to" ? "2026-09-17" : 4 };
      expect(guestSearchIsStale(current, changed)).toBe(true);
    }
  });

  it("builds stable review keys and refuses empty or undersized room selections", () => {
    const options = [
      {
        stay: ["2026-09-12", "2026-09-14"] as const,
        rooms: [],
        recommendedRoomIds: ["room-1"],
        hasOverlap: false,
      },
    ];
    expect(guestRoomReviewKey(defaults, options)).toContain("room-1");
    expect(guestSelectionCanSubmit(0, 10, 2)).toBe(false);
    expect(guestSelectionCanSubmit(1, 1, 2)).toBe(false);
    expect(guestSelectionCanSubmit(1, 2, 2)).toBe(true);
  });

  it("renders the hydrated-safe search form with an optional private token", () => {
    const html = renderToStaticMarkup(
      <NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
        <GuestInviteForm
          defaults={defaults}
          findAction={vi.fn()}
          locale="en"
          submitAction={vi.fn()}
          token="private-token"
        />
      </NextIntlClientProvider>,
    );

    expect(html).toContain('data-webmcp-guest-search');
    expect(html).toContain('data-hydrated="false"');
    expect(html).toContain('name="token"');
    expect(html).toContain('value="private-token"');
    expect(html).toContain("Find dates");
    expect(html).not.toContain('data-testid="guest-submit-form"');
  });
});
