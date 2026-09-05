"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";

import { useHydrated } from "@/components/use-hydrated";

import { buttonStyle, graphite, rule } from "./host-styles";

type StartResult = "ready" | "reset_failed" | "entry_failed";

/** Both mutations retain the authorization and synthetic scope of their existing routes. */
export async function performGuidedDemoStart(
  homeId: string,
  invitationId: string,
  locale: "en" | "es",
  request: typeof fetch = fetch,
): Promise<StartResult> {
  let resetComplete = false;
  try {
    const reset = await request("/api/demo/reset", {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ homeId }),
    });
    if (!reset.ok) return "reset_failed";
    resetComplete = true;
    const form = new FormData();
    form.set("invitationId", invitationId);
    const entry = await request(`/${locale}/demo-enter-guest`, {
      method: "POST",
      credentials: "same-origin",
      body: form,
    });
    return entry.ok ? "ready" : "entry_failed";
  } catch {
    return resetComplete ? "entry_failed" : "reset_failed";
  }
}

export function GuidedDemoStart({
  homeId,
  locale,
  invitations,
}: {
  homeId: string;
  locale: "en" | "es";
  invitations: { vega: string; otero: string };
}) {
  const t = useTranslations("GuidedDemo");
  // Server-rendered controls must not accept clicks before their handler exists.
  const hydrated = useHydrated();
  const busy = useRef(false);
  const [working, setWorking] = useState<"vega" | "otero" | null>(null);
  const [failure, setFailure] = useState<Exclude<StartResult, "ready"> | null>(
    null,
  );

  async function start(scenario: "vega" | "otero") {
    if (busy.current) return;
    busy.current = true;
    setWorking(scenario);
    setFailure(null);
    const result = await performGuidedDemoStart(
      homeId,
      invitations[scenario],
      locale,
    );
    if (result === "ready") {
      // Use a fresh document so the newly issued guest cookie cannot reuse an old route payload.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- A new guest capability needs a fresh document, including all prefetched route state.
      window.location.assign(`/${locale}/guest`);
      return;
    }
    setFailure(result);
    setWorking(null);
    busy.current = false;
  }

  return (
    <div>
      {(["vega", "otero"] as const).map((scenario) => (
        <div
          key={scenario}
          style={{ borderTop: `1px solid ${rule}`, padding: "1rem 0" }}
        >
          <h3 style={{ margin: "0 0 0.5rem" }}>{t(`${scenario}Title`)}</h3>
          <p style={{ color: graphite }}>{t(`${scenario}Body`)}</p>
          <button
            type="button"
            style={buttonStyle}
            aria-describedby="guided-demo-shared-reset"
            aria-busy={working === scenario}
            disabled={!hydrated || working !== null}
            data-testid={`guided-demo-start-${scenario}`}
            onClick={() => void start(scenario)}
          >
            {working === scenario
              ? t("starting")
              : t(scenario === "vega" ? "startVega" : "startOtero")}
          </button>
        </div>
      ))}
      {failure ? (
        <p role="alert">
          {t(failure === "reset_failed" ? "resetFailed" : "entryFailed")}
        </p>
      ) : null}
    </div>
  );
}
