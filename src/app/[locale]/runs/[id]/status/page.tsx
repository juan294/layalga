import { getTranslations, setRequestLocale } from "next-intl/server";

import { getAuthorizedRunSnapshot } from "@/app/api/runs/run-data";
import { RunStatusPoller } from "@/components/runs/run-status-poller";
import { getDatabaseConnection, sqlClient } from "@/core/db/client";
import styles from "@/components/runs/run-status.module.css";

interface RunStatusPageProps {
  params: Promise<{ locale: "en" | "es"; id: string }>;
  searchParams: Promise<{ returnTo?: string; token?: string }>;
}

export default async function RunStatusPage({
  params,
  searchParams,
}: RunStatusPageProps) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "Runs" });
  const query = await searchParams;
  const run = await getAuthorizedRunSnapshot(id, query.token);
  const runContext = run ? await loadRunContext(id) : null;
  const requestedReturn = query.returnTo;
  const returnTo = safeReturnPath(requestedReturn, locale);

  return (
    <main className={styles.shell}>
      <div className={styles.frame}>
        <p className={styles.eyebrow}>{t("eyebrow")}</p>
        <h1 className={styles.title}>{t("title")}</h1>
        {run ? (
          <RunStatusPoller
            initial={run}
            deadlineAt={runContext?.deadlineAt ?? null}
            locale={locale}
            returnTo={returnTo}
            token={query.token}
            timeZone={runContext?.timeZone ?? "UTC"}
          />
        ) : (
          <section
            className={styles.card}
            data-status="failed"
            data-testid="run-status"
          >
            <p>{t("notFound")}</p>
            <a className={styles.returnLink} href={returnTo}>
              {t("returnToVisit")}
            </a>
          </section>
        )}
      </div>
    </main>
  );
}

async function loadRunContext(
  id: string,
): Promise<{ timeZone: string; deadlineAt: string | null } | null> {
  const sql = sqlClient(getDatabaseConnection().db);
  const [row] = await sql<
    { timezone: string; deadline_at: Date | string | null }[]
  >`
    select h.timezone, r.deadline_at
    from public.runs r
    join public.homes h on h.id = r.home_id
    where r.id = ${id}
    limit 1
  `;
  return row
    ? {
        timeZone: row.timezone,
        deadlineAt: row.deadline_at
          ? new Date(row.deadline_at).toISOString()
          : null,
      }
    : null;
}

function safeReturnPath(value: string | undefined, locale: string): string {
  return value?.startsWith(`/${locale}/`) && !value.startsWith("//")
    ? value
    : `/${locale}`;
}
