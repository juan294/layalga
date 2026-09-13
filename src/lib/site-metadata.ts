import type { Metadata } from "next";

const SITE_URL = new URL("https://layalga.thecreativetoken.com");
const SOCIAL_IMAGE_URL = "/brand/layalga-social.jpg";

type SiteMetadataInput = {
  description: string;
  imageAlt: string;
  locale: "en" | "es";
  title: string;
};

export function buildSiteMetadata({
  description,
  imageAlt,
  locale,
  title,
}: SiteMetadataInput): Metadata {
  const openGraphLocale = locale === "es" ? "es_ES" : "en_US";
  const alternateLocale = locale === "es" ? "en_US" : "es_ES";
  const url = `/${locale}`;

  return {
    metadataBase: SITE_URL,
    title,
    description,
    alternates: {
      canonical: url,
      languages: { en: "/en", es: "/es" },
    },
    openGraph: {
      title,
      description,
      url,
      siteName: "L’Ayalga",
      locale: openGraphLocale,
      alternateLocale: [alternateLocale],
      type: "website",
      images: [
        {
          url: SOCIAL_IMAGE_URL,
          width: 1200,
          height: 630,
          alt: imageAlt,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [{ url: SOCIAL_IMAGE_URL, alt: imageAlt }],
    },
  };
}
