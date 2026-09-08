import { getTranslations } from "next-intl/server";

import { getDatabaseConnection } from "@/core/db/client";
import { formatHouseholdDateTime } from "@/components/frontend-utils";
import { HostBreadcrumb } from "@/components/host/host-breadcrumb";
import {
  MemoryPanel,
  type MemoryPartyRecords,
} from "@/components/host/memory-panel";
import { parseServerEnvironment } from "@/lib/server/env";
import { loadHostContext } from "../host-context";
import { loadHostMemoryPanel } from "../memory-data";

export default async function HostGuestsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const { host, locale: safeLocale, timeZone } = await loadHostContext(locale);
  const t = await getTranslations({ locale: safeLocale, namespace: "Host" });
  const envConfig = parseServerEnvironment();

  const memoryParties =
    envConfig.memory === "agentcore" && envConfig.memoryId && envConfig.awsRegion
      ? await loadHostMemoryPanel(
          getDatabaseConnection().db,
          host.homeId,
          envConfig.memoryId,
          envConfig.awsRegion,
        )
      : [];

  const memoryPartyRecords: MemoryPartyRecords[] = memoryParties.map(
    (party) => ({
      partyId: party.partyId,
      partyName: party.partyName,
      records: party.records.map((record) => ({
        id: record.id,
        text: record.text,
        createdAtLabel: formatHouseholdDateTime(
          record.createdAt.toISOString(),
          safeLocale,
          timeZone,
        ),
      })),
    }),
  );

  return (
    <>
      <HostBreadcrumb label={t("nav.backToToday")} locale={safeLocale} />
      <MemoryPanel
        locale={safeLocale}
        parties={memoryPartyRecords}
        labels={{
          eyebrow: t("memory.eyebrow"),
          title: t("memory.title"),
          description: t("memory.description"),
          recordsEmpty: t("memory.recordsEmpty"),
          forget: t("memory.forget"),
        }}
      />
    </>
  );
}
