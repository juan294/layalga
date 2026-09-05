import { getTranslations } from "next-intl/server";
import { getDatabaseConnection } from "@/core/db/client";
import { loadHouseholdPolicy } from "@/core/policy/settings";
import { HouseholdPolicyForm } from "./household-policy-form";
import { headingStyle, panelStyle } from "./host-styles";

export async function HouseholdPolicyPanel({
  homeId,
  hostId,
  locale,
}: {
  homeId: string;
  hostId: string;
  locale: "en" | "es";
}) {
  const t = await getTranslations({ locale, namespace: "HouseholdPolicy" });
  const policy = await loadHouseholdPolicy(
    getDatabaseConnection().db,
    homeId,
    hostId,
  );
  return (
    <section id="household-policy" style={panelStyle}>
      <h2 style={headingStyle}>{t("title")}</h2>
      <HouseholdPolicyForm initial={policy} locale={locale} />
    </section>
  );
}
