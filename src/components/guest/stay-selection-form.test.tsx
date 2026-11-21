import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import { expect, it, vi } from "vitest";
import en from "../../../messages/en.json";
import { StaySelectionForm } from "./stay-selection-form";

vi.mock("@/app/[locale]/requests/actions", () => ({
  prepareStayRequest: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

it("keeps private notes and requests out of native GET URLs before hydration", () => {
  const html = renderToStaticMarkup(
    <NextIntlClientProvider locale="en" timeZone="UTC" messages={en}>
      <StaySelectionForm
        locale="en"
        handle="test"
        criteria={{
          from: "2031-07-01",
          to: "2031-07-15",
          nights: 14,
          adults: 2,
          children: 0,
          pets: 0,
        }}
        option={{
          confirmation: "host_approval_required",
          stay: ["2031-07-01", "2031-07-15"],
          rooms: [],
          recommendedRoomRefs: [],
        }}
      />
    </NextIntlClientProvider>,
  );
  expect(html).toMatch(/<form[^>]*method="post"/i);
  expect(html).toContain('name="notes"');
  expect(html).toContain('name="requests"');
});
