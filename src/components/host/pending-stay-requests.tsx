import { getTranslations } from "next-intl/server";
import type { HostStayRequestReceipt } from "@/core/booking/stay-requests";
import type { AppLocale } from "@/i18n/routing";
import { formatDateStay } from "../frontend-utils";
import { headingStyle, panelStyle } from "./host-styles";

export async function PendingStayRequests({
  requests,
  locale,
}: {
  requests: HostStayRequestReceipt[];
  locale: AppLocale;
}) {
  if (!requests.length) return null;
  const t = await getTranslations({ locale, namespace: "HostStayRequests" });
  return (
    <section style={panelStyle}>
      <h2 style={headingStyle}>{t("title")}</h2>
      {requests.map((r) => (
        <article key={r.id} id={`stay-request-${r.id}`}>
          <h3>{formatDateStay(r.stay, locale)}</h3>
          <p>{r.requesterEmail}</p>
          <p>
            {t("group", {
              adults: r.adults,
              children: r.children,
              pets: r.pets,
            })}
          </p>
          <ul>
            {r.rooms.map((room) => (
              <li key={room.ref}>
                <strong>{room.guestLabel}</strong> · {room.sleepingArrangement}
                {r.overflowConsent && room.overflowArrangement && (
                  <div>
                    {t("overflow", { terms: room.overflowArrangement })}
                  </div>
                )}
              </li>
            ))}
          </ul>
          {r.notes && (
            <p>
              <strong>{t("notes")}</strong> {r.notes}
            </p>
          )}
          {r.requests && (
            <p>
              <strong>{t("requests")}</strong> {r.requests}
            </p>
          )}
        </article>
      ))}
    </section>
  );
}
