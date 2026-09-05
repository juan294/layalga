"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import {
  updateHouseholdPolicyAction,
  type PolicySettingsState,
} from "@/app/[locale]/(host)/policy-actions";
import type { HouseholdPolicy } from "@/core/policy/settings";
import { buttonStyle, fieldStyle, graphite } from "./host-styles";

export function HouseholdPolicyForm({
  locale,
  initial,
}: {
  locale: "en" | "es";
  initial: HouseholdPolicy;
}) {
  const t = useTranslations("HouseholdPolicy");
  const [state, action, pending] = useActionState(updateHouseholdPolicyAction, {
    status: "idle",
  } as PolicySettingsState);
  const policy =
    state.status === "saved" && state.policy.version >= initial.version
      ? state.policy
      : initial;
  return (
    <form
      key={policy.version}
      action={action}
      data-testid="household-policy-form"
      style={{ display: "grid", gap: "1rem" }}
    >
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="expectedVersion" value={policy.version} />
      <p style={{ color: graphite, margin: 0 }}>{t("description")}</p>
      <label
        style={{
          display: "flex",
          alignItems: "center",
          gap: "0.75rem",
          minHeight: "var(--interactive-target, 44px)",
        }}
      >
        <input
          type="checkbox"
          name="petsTogetherAllowed"
          defaultChecked={policy.petsTogetherAllowed}
        />
        <span>{t("petsTogether")}</span>
      </label>
      <label style={{ display: "grid", gap: "0.5rem" }}>
        <span>{t("families")}</span>
        <input
          style={{
            ...fieldStyle,
            minHeight: "var(--interactive-target, 44px)",
          }}
          type="number"
          name="maxFamiliesWithChildren"
          min={1}
          max={20}
          step={1}
          required
          defaultValue={policy.maxFamiliesWithChildren}
        />
      </label>
      <p style={{ color: graphite, margin: 0 }}>{t("capacity")}</p>
      <button style={buttonStyle} type="submit" disabled={pending}>
        {t(pending ? "saving" : "save")}
      </button>
      {state.status === "saved" ? <p role="status">{t("saved")}</p> : null}
      {state.status === "error" ? (
        <p role="alert">
          {t(`errors.${state.error}`)}{" "}
          {state.error === "stale" ? (
            <button
              type="button"
              onClick={() => window.location.reload()}
              style={{
                ...buttonStyle,
                display: "inline-flex",
                minHeight: "var(--interactive-target, 44px)",
                alignItems: "center",
              }}
            >
              {t("reload")}
            </button>
          ) : null}
        </p>
      ) : null}
    </form>
  );
}
