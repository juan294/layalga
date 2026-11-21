"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { updatePublicListingAction } from "@/app/[locale]/(host)/public-listing-action";
import type { AppLocale } from "@/i18n/routing";
import {
  buttonStyle,
  fieldStyle,
  graphite,
  headingStyle,
  panelStyle,
} from "./host-styles";

export function PublicListingSettings({
  locale,
  listing,
}: {
  locale: AppLocale;
  listing: { displayName: string; published: boolean } | null;
}) {
  const t = useTranslations("HostPublicListing");
  const [state, action, pending] = useActionState(
    updatePublicListingAction,
    "idle",
  );
  return (
    <section style={panelStyle}>
      <h2 style={headingStyle}>{t("title")}</h2>
      <p style={{ color: graphite }}>
        {listing?.published
          ? t("published", { name: listing.displayName })
          : t("unlisted")}
      </p>
      <form action={action} style={{ display: "grid", gap: "0.75rem" }}>
        <input type="hidden" name="locale" value={locale} />
        {listing?.published ? (
          <button
            type="submit"
            name="mode"
            value="unpublish"
            disabled={pending}
            style={buttonStyle}
          >
            {t("unpublish")}
          </button>
        ) : (
          <>
            <label htmlFor="public-listing-name">{t("name")}</label>
            <input
              id="public-listing-name"
              name="displayName"
              defaultValue={listing?.displayName ?? ""}
              minLength={2}
              maxLength={80}
              required
              style={fieldStyle}
            />
            <button
              type="submit"
              name="mode"
              value="publish"
              disabled={pending}
              style={buttonStyle}
            >
              {t("publish")}
            </button>
          </>
        )}
        {state !== "idle" && <p role="status">{t(state)}</p>}
      </form>
    </section>
  );
}
