import { getTranslations, setRequestLocale } from "next-intl/server";

import { SignInButton } from "@/app/[locale]/sign-in/sign-in-button";
import {
  loadGuestInvitation,
  partyDefaults,
  type GuestVisit,
} from "./guest-data";
import { GuestActions } from "@/components/guest/guest-actions";
import { GuestInviteForm } from "@/components/guest/guest-invite-form";
import styles from "@/components/guest/guest-ledger.module.css";

interface GuestPageProps {
  params: Promise<{ locale: "en" | "es"; token: string }>;
  searchParams: Promise<{ claim?: string }>;
}

export default async function GuestPage({
  params,
  searchParams,
}: GuestPageProps) {
  const { locale, token } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "Guest" });
  const invitation = await loadGuestInvitation(token, locale);
  const claimFailed = (await searchParams).claim === "failed";

  if (!invitation) {
    return (
      <main className={styles.shell}>
        <article
          className={styles.ledger}
          data-testid="guest-status"
          data-status="invalid"
        >
          <header className={styles.header}>
            <div>
              <p className={styles.eyebrow}>{t("eyebrow")}</p>
              <h1 className={styles.title}>{t("invalidLinkTitle")}</h1>
            </div>
          </header>
          <div className={styles.body}>
            <p className={styles.lede}>{t("invalidLinkBody")}</p>
          </div>
        </article>
      </main>
    );
  }

  const status = invitation.visit?.status ?? "invited";
  const title = t(`${status}Title`);
  const defaults = invitationDefaults(invitation.structured);

  return (
    <main className={styles.shell}>
      <article
        className={styles.ledger}
        data-testid="guest-status"
        data-status={status}
      >
        <header className={styles.header}>
          <div>
            <p className={styles.eyebrow}>{t("eyebrow")}</p>
            <h1 className={styles.title}>{title}</h1>
          </div>
          <span className={styles.stamp}>{t(`status.${status}`)}</span>
        </header>
        <div className={styles.body}>
          <p className={styles.lede}>
            {t(status === "invited" ? "invitedBody" : "visitBody", {
              party: invitation.partyName,
            })}
          </p>

          {status === "invited" ? (
            <GuestInviteForm
              defaults={defaults}
              locale={locale}
              token={token}
            />
          ) : invitation.visit ? (
            <GuestVisitRecord
              locale={locale}
              token={token}
              visit={invitation.visit}
            />
          ) : null}

          <aside className={styles.claim}>
            <div>
              <strong>{t("claimOptional")}</strong>
              <p>{t("claimBenefit")}</p>
            </div>
            <SignInButton
              className={styles.secondaryButton}
              label={t("claimWithGoogle")}
              locale={locale}
              nextPath={`/${locale}/g/${token}`}
            />
            {claimFailed ? <p role="alert">{t("claimFailed")}</p> : null}
          </aside>
        </div>
      </article>
    </main>
  );
}

async function GuestVisitRecord({
  locale,
  token,
  visit,
}: {
  locale: "en" | "es";
  token: string;
  visit: GuestVisit;
}) {
  const t = await getTranslations({ locale, namespace: "Guest" });
  const canChange =
    visit.status !== "cancelled" && visit.status !== "reconfirmed";

  return (
    <section className={styles.summary}>
      <dl className={styles.factList}>
        <dt>{t("stayLabel")}</dt>
        <dd>{formatStay(visit.stay, locale)}</dd>
        <dt>{t("guestsLabel")}</dt>
        <dd>
          {t("guestCounts", {
            adults: visit.adults,
            children: visit.children,
            pets: visit.pets,
          })}
        </dd>
        <dt>{t("roomCountLabel")}</dt>
        <dd data-testid="guest-room-count">
          {t("roomCount", { count: visit.roomCount })}
        </dd>
      </dl>

      {visit.hasOverlap ? (
        <p className={styles.sharedNote}>{t("sharedStayNote")}</p>
      ) : null}
      {visit.status === "reconfirm_pending" ? (
        <p className={styles.chase}>
          {visit.chaseMessage ?? t("chaseMessageFallback")}
        </p>
      ) : null}
      {canChange ? (
        <GuestActions
          canReconfirm={visit.status === "reconfirm_pending"}
          locale={locale}
          token={token}
        />
      ) : null}
    </section>
  );
}

function invitationDefaults(structured: Record<string, unknown>) {
  const party = partyDefaults(structured);
  const preferred = stringPair(structured.preferredStay);
  const flexible = record(structured.flexibleDates);
  const from = preferred?.[0] ?? stringValue(flexible.earliest) ?? "2026-09-18";
  const to = preferred?.[1] ?? stringValue(flexible.latest) ?? "2026-09-28";
  const nights = Math.max(
    1,
    Math.round(
      (new Date(`${to}T00:00:00Z`).getTime() -
        new Date(`${from}T00:00:00Z`).getTime()) /
        86_400_000,
    ),
  );
  const requests = Array.isArray(structured.specialRequests)
    ? structured.specialRequests.filter(
        (value): value is string => typeof value === "string",
      )
    : [];
  return { from, to, nights, ...party, notes: requests.join("; ") };
}

function stringPair(value: unknown): readonly [string, string] | null {
  return Array.isArray(value) &&
    value.length === 2 &&
    typeof value[0] === "string" &&
    typeof value[1] === "string"
    ? [value[0], value[1]]
    : null;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function formatStay(stay: readonly [string, string], locale: string): string {
  const formatter = new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeZone: "UTC",
  });
  return `${formatter.format(new Date(`${stay[0]}T00:00:00Z`))} – ${formatter.format(
    new Date(`${stay[1]}T00:00:00Z`),
  )}`;
}
