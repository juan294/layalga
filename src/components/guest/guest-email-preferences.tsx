import { getTranslations } from "next-intl/server";
import { saveGuestEmail } from "@/app/[locale]/guest/email-actions";
import { getDatabaseConnection } from "@/core/db/client";
import {
  GuestContactError,
  loadGuestContact,
} from "@/core/notifications/guest-contact";
import {
  resolveGuestContactAuthority,
  type GuestContactContext,
} from "@/lib/auth/guest-contact-authority";
import { GuestActionButton } from "./guest-action-button";
import { Field } from "./field";
import styles from "./guest-ledger.module.css";

export async function GuestEmailPreferences({
  locale,
  context,
  feedback,
}: {
  locale: "en" | "es";
  context: GuestContactContext;
  feedback?: string;
}) {
  const resolved = await resolveGuestContactAuthority(context);
  if (!resolved) return null;
  return AuthorizedGuestEmailPreferences({
    locale,
    context,
    feedback,
    resolved,
  });
}

/** Server-only read rendering for an identity and invitation already checked by the caller. */
export async function AuthorizedGuestEmailPreferences({
  locale,
  context,
  feedback,
  resolved,
}: {
  locale: "en" | "es";
  context: GuestContactContext;
  feedback?: string;
  resolved: NonNullable<
    Awaited<ReturnType<typeof resolveGuestContactAuthority>>
  >;
}) {
  const t = await getTranslations({ locale, namespace: "GuestEmail" });
  let state;
  try {
    state = await loadGuestContact(
      getDatabaseConnection().db,
      resolved.authority,
    );
  } catch (error) {
    if (!(error instanceof GuestContactError)) throw error;
    return <p className={styles.notice}>{t("unavailable")}</p>;
  }
  const action = saveGuestEmail.bind(null, context, locale);
  const unavailable = process.env.EMAIL !== "ses";
  const error =
    feedback === "invalid" ||
    feedback === "unavailable" ||
    feedback === "rate_limit"
      ? feedback
      : null;
  return (
    <details
      className={styles.changeForm}
      id={`guest-email-${resolved.authority.invitationId}`}
      open={Boolean(feedback) || state.status === "unverified"}
      data-testid="guest-email-preferences"
    >
      <summary className={styles.cancellationToggle}>{t("title")}</summary>
      <p>{t("body")}</p>
      <p role="status">{t(state.status, { email: state.email ?? "" })}</p>
      {state.deliveryFailed ? <p role="alert">{t("deliveryFailed")}</p> : null}
      {error ? <p role="alert">{t(error)}</p> : null}
      {state.status !== "demo" && unavailable ? (
        <p role="status">{t("unavailable")}</p>
      ) : null}
      {state.status !== "demo" && !unavailable ? (
        <form action={action} className={styles.changeForm}>
          {resolved.verifiedEmail ? (
            <>
              <input type="hidden" name="addressSource" value="google" />
              <p>{t("googleAddress", { email: resolved.verifiedEmail })}</p>
            </>
          ) : (
            <Field label={t("email")} name="reminder-email">
              <input
                name="email"
                type="email"
                autoComplete="email"
                maxLength={254}
                required
                defaultValue={state.email ?? ""}
              />
            </Field>
          )}
          <label className={styles.emailConsent}>
            <input type="checkbox" name="consent" required />{" "}
            <span>{t("consent")}</span>
          </label>
          <GuestActionButton
            className={styles.secondaryButton}
            label={t(resolved.verifiedEmail ? "enable" : "verifySend")}
            pendingLabel={t("pending")}
            testId="guest-email-enable"
          />
        </form>
      ) : null}
      {state.status === "enabled" || state.status === "unverified" ? (
        <form action={action}>
          <input type="hidden" name="operation" value="disable" />
          <GuestActionButton
            className={styles.secondaryButton}
            label={t("disable")}
            pendingLabel={t("pending")}
            testId="guest-email-disable"
          />
        </form>
      ) : null}
    </details>
  );
}
import "server-only";
