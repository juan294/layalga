import { redirect } from "next/navigation";
import { getAuthUser } from "@/lib/auth/current-user";
import { verifiedGoogleGuestEmail } from "@/lib/auth/verified-guest-email";
import { staySignInPath } from "@/lib/auth/stay-sign-in-path";
import { GuestConversation } from "@/components/guest/guest-conversation";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Field } from "@/components/guest/field";
import styles from "@/components/guest/guest-ledger.module.css";
import { PublicStayRegistration } from "@/components/webmcp/public-registration";
import { lookupHouseholds } from "./actions";

export default async function FindHouseholdPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: "en" | "es" }>;
  searchParams: Promise<{ q?: string }>;
}) {
  const { locale } = await params;
  const { q } = await searchParams;
  if (!verifiedGoogleGuestEmail(await getAuthUser()))
    redirect(staySignInPath(locale, undefined, { q }));
  const t = await getTranslations({ locale, namespace: "PublicStays" });
  const result = q !== undefined ? await lookupHouseholds(q) : null;
  if (result?.status === "sign_in")
    redirect(staySignInPath(locale, undefined, { q }));
  return (
    <main className={styles.shell}>
      <PublicStayRegistration />
      <article className={styles.ledger}>
        <header className={styles.header}>
          <h1 className={styles.title}>{t("find")}</h1>
        </header>
        <div className={styles.body}>
          <GuestConversation locale={locale} />
          <form
            id="structured-stay-search"
            method="get"
            className={styles.formStack}
          >
            <Field label={t("householdName")} name="q">
              <input
                name="q"
                type="search"
                required
                minLength={2}
                maxLength={80}
                defaultValue={q}
              />
            </Field>
            <button className={styles.primaryButton}>{t("search")}</button>
          </form>
          {result &&
            (result.listings.length ? (
              <ul className={styles.accountVisits}>
                {result.listings.map((h) => (
                  <li key={h.handle}>
                    <Link href={`/${locale}/stays/${h.handle}`}>
                      {h.displayName}
                      {result.listings.some(
                        (other) =>
                          other.handle !== h.handle &&
                          other.displayName === h.displayName,
                      ) && <small> · {h.handle}</small>}
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p role="status">
                {t(
                  result.status === "success"
                    ? "noMatch"
                    : result.status === "invalid"
                      ? "invalidName"
                      : "unavailable",
                )}
              </p>
            ))}
          {result?.truncated && <p>{t("moreHomes")}</p>}
        </div>
      </article>
    </main>
  );
}
