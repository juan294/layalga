import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { resolvePublicListing } from "@/core/booking/public-listings";
import { PublicStayRegistration } from "@/components/webmcp/public-registration";
import { guestInvitationDefaults } from "@/components/guest/guest-invitation-defaults";
import { Field } from "@/components/guest/field";
import { formatDateStay } from "@/components/frontend-utils";
import styles from "@/components/guest/guest-ledger.module.css";
import { MAX_ADULTS, MAX_CHILDREN, MAX_PETS } from "@/agent/task-limits";
import { lookupStays } from "../actions";

const counts = [
  { name: "nights", min: 1, max: 30 },
  { name: "adults", min: 1, max: MAX_ADULTS },
  { name: "children", min: 0, max: MAX_CHILDREN },
  { name: "pets", min: 0, max: MAX_PETS },
] as const;

export default async function HouseholdStaysPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: "en" | "es"; handle: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale, handle } = await params;
  const query = await searchParams;
  const listing = await resolvePublicListing(handle).catch(() => undefined);
  const t = await getTranslations({ locale, namespace: "PublicStays" });
  if (!listing)
    return (
      <main className={styles.shell}>
        <article className={styles.ledger}>
          <header className={styles.header}>
            <h1>{t(listing === null ? "not_found" : "unavailable")}</h1>
          </header>
          <div className={styles.body}>
            <Link href={`/${locale}/stays`}>{t("find")}</Link>
          </div>
        </article>
      </main>
    );
  const defaults = guestInvitationDefaults({}, { timeZone: listing.timezone });
  const result = Object.keys(query).length
    ? await lookupStays({ ...query, handle })
    : null;
  const value = (key: keyof typeof defaults) =>
    typeof query[key] === "string" ? query[key] : String(defaults[key]);
  return (
    <main className={styles.shell}>
      <PublicStayRegistration />
      <article className={styles.ledger}>
        <header className={styles.header}>
          <div>
            <Link href={`/${locale}/stays`}>{t("find")}</Link>
            <h1 className={styles.title}>{listing.displayName}</h1>
          </div>
        </header>
        <div className={styles.body}>
          <form className={styles.formStack} method="get">
            <div className={styles.fieldGrid}>
              {(["from", "to"] as const).map((key) => (
                <Field key={key} label={t(key)} name={key}>
                  <input
                    required
                    type="date"
                    name={key}
                    defaultValue={value(key)}
                  />
                </Field>
              ))}
              {counts.map(({ name, min, max }) => (
                <Field key={name} label={t(name)} name={name}>
                  <input
                    required
                    type="number"
                    name={name}
                    min={min}
                    max={max}
                    defaultValue={value(name)}
                  />
                </Field>
              ))}
            </div>
            <button className={styles.primaryButton}>{t("check")}</button>
          </form>
          {result?.status === "success" ? (
            <section aria-label={t("matches")}>
              <h2>{t("matches")}</h2>

              {result.options.map((option) => (
                <details key={option.stay[0]} className={styles.ruledForm}>
                  <summary>{formatDateStay(option.stay, locale)}</summary>
                  <p>
                    {t("checkout", { date: option.stay[1] })} {t("review")}
                  </p>
                  <ul className={styles.accountVisits}>
                    {option.rooms.map((room) => (
                      <li key={room.ref}>
                        <strong>{room.guestLabel}</strong>
                        <span>
                          {[room.floorLabel, room.sleepingArrangement]
                            .filter(Boolean)
                            .join(" · ")}
                        </span>
                        <small>
                          {t("sleeps", { count: room.standardCapacity })}
                        </small>
                        {room.maximumCapacity > room.standardCapacity &&
                          room.overflowArrangement && (
                            <small>
                              {t("overflow", {
                                count: room.maximumCapacity,
                                arrangement: room.overflowArrangement,
                              })}
                            </small>
                          )}
                        {option.recommendedRoomRefs.includes(room.ref) && (
                          <small>{t("recommended")}</small>
                        )}
                      </li>
                    ))}
                  </ul>
                </details>
              ))}
              {result.truncated && <p>{t("moreStays")}</p>}
            </section>
          ) : (
            result && <p role="status">{t(result.status)}</p>
          )}
        </div>
      </article>
    </main>
  );
}
