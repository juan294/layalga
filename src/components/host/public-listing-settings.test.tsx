import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import { expect, it, vi } from "vitest";
import en from "../../../messages/en.json";
import es from "../../../messages/es.json";
import { PublicListingSettings } from "./public-listing-settings";

vi.mock("@/app/[locale]/(host)/public-listing-action", () => ({
  updatePublicListingAction: vi.fn(),
}));

it.each([
  [
    "en",
    en,
    "Public household name",
    "Publish household",
    "Unpublish household",
  ],
  [
    "es",
    es,
    "Nombre público de la casa",
    "Publicar la casa",
    "Retirar la publicación",
  ],
] as const)(
  "offers explicit publication and withdrawal in %s",
  (locale, messages, name, publish, unpublish) => {
    const render = (
      listing: { published: boolean; displayName: string } | null,
    ) =>
      renderToStaticMarkup(
        <NextIntlClientProvider
          locale={locale}
          messages={messages}
          timeZone="Europe/Madrid"
        >
          <PublicListingSettings locale={locale} listing={listing} />
        </NextIntlClientProvider>,
      );
    expect(render(null)).toContain(name);
    expect(render(null)).toContain(publish);
    expect(render(null)).not.toContain(unpublish);
    const published = render({ published: true, displayName: "Casa Clara" });
    expect(published).toContain("Casa Clara");
    expect(published).toContain(unpublish);
  },
);
