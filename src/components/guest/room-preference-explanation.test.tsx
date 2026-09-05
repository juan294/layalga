import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it } from "vitest";

import en from "../../../messages/en.json";
import es from "../../../messages/es.json";
import { RoomPreferenceExplanation } from "./room-preference-explanation";

function render(
  locale: "en" | "es",
  explanation: Parameters<typeof RoomPreferenceExplanation>[0]["explanation"],
  selectionChanged = false,
) {
  return renderToStaticMarkup(
    <NextIntlClientProvider
      locale={locale}
      messages={locale === "en" ? en : es}
      timeZone="UTC"
    >
      <RoomPreferenceExplanation
        explanation={explanation}
        selectionChanged={selectionChanged}
      />
    </NextIntlClientProvider>,
  );
}

describe("room preference explanations", () => {
  it("names matched and unavailable preferences for the recommendation while preserving manual choice", () => {
    const html = render(
      "en",
      {
        status: "available",
        matched: ["ground_floor"],
        unmatched: ["separate_beds"],
      },
      true,
    );
    expect(html).toContain("Recommended rooms include: ground floor");
    expect(html).toContain("The recommended rooms do not match: separate beds");
    expect(html).toContain(
      "Your current selection differs from our suggestion",
    );
    expect(html).toContain("Choose the rooms you want");
    expect(html).toContain("does not guarantee step-free or wheelchair access");
    expect(html).not.toContain('name="roomIds"');
  });

  it.each(["off", "empty", "unavailable", "unusable", "conflicting"] as const)(
    "explains %s without inventing a remembered preference",
    (status) => {
      const html = render("en", { status, matched: [], unmatched: [] });
      expect(html).toContain(en.Guest.roomPreferences[status]);
      expect(html).toContain("available rooms that fit your group");
      expect(html).not.toContain("Recommended rooms include:");
      expect(html).not.toContain("wheelchair");
    },
  );

  it("explains matched and unmatched preferences in Spanish", () => {
    const html = render("es", {
      status: "available",
      matched: ["double_bed"],
      unmatched: ["upper_floor"],
    });
    expect(html).toContain(
      "Las habitaciones recomendadas incluyen: cama doble",
    );
    expect(html).toContain(
      "Las habitaciones recomendadas no cumplen: planta superior",
    );
    expect(html).toContain("Elige las habitaciones que quieras");
    expect(html).not.toContain("silla de ruedas");
  });
});
