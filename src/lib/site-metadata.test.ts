import { describe, expect, test } from "vitest";

import { buildSiteMetadata } from "./site-metadata";

describe("site metadata", () => {
  test("publishes a locale-aware large social card", () => {
    const metadata = buildSiteMetadata({
      description: "A household guest ledger from invitation to arrival.",
      imageAlt: "A welcoming house overlooking the Cantabrian Sea.",
      locale: "en",
      title: "L’Ayalga",
    });

    expect(metadata.metadataBase?.toString()).toBe(
      "https://layalga.thecreativetoken.com/",
    );
    expect(metadata.alternates).toEqual({
      canonical: "/en",
      languages: { en: "/en", es: "/es" },
    });
    expect(metadata.openGraph).toMatchObject({
      description: "A household guest ledger from invitation to arrival.",
      locale: "en_US",
      siteName: "L’Ayalga",
      title: "L’Ayalga",
      type: "website",
      url: "/en",
      images: [
        {
          alt: "A welcoming house overlooking the Cantabrian Sea.",
          height: 630,
          url: "/brand/layalga-social.jpg",
          width: 1200,
        },
      ],
    });
    expect(metadata.twitter).toMatchObject({
      card: "summary_large_image",
      images: [
        {
          alt: "A welcoming house overlooking the Cantabrian Sea.",
          url: "/brand/layalga-social.jpg",
        },
      ],
    });
  });

  test("uses the Spanish Open Graph locale and English alternate", () => {
    const metadata = buildSiteMetadata({
      description: "Descripción",
      imageAlt: "Texto alternativo",
      locale: "es",
      title: "L’Ayalga",
    });

    expect(metadata.openGraph).toMatchObject({
      alternateLocale: ["en_US"],
      locale: "es_ES",
      url: "/es",
    });
  });
});
