import { getTranslations } from "next-intl/server";

import { getDatabaseConnection } from "@/core/db/client";
import { calendarMonthWindow, householdMonth } from "@/components/frontend-utils";
import { HostBreadcrumb } from "@/components/host/host-breadcrumb";
import {
  RoomLedger,
  type RoomLedgerLabels,
} from "@/components/host/room-ledger";
import { labelStyle, pageHeadingStyle, panelStyle } from "@/components/host/host-styles";
import { loadHostContext } from "../host-context";
import { loadHostRoomLedger } from "../room-data";

export default async function HostRoomsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const { host, locale: safeLocale, timeZone, demoNow } = await loadHostContext(locale);
  const t = await getTranslations({ locale: safeLocale, namespace: "Host" });
  const window = calendarMonthWindow(
    householdMonth(demoNow ?? undefined, undefined, timeZone),
  );
  const roomData = await loadHostRoomLedger(getDatabaseConnection().db, host.homeId, [
    window.from,
    window.to,
  ]);

  return (
    <>
      <HostBreadcrumb label={t("nav.backToToday")} locale={safeLocale} />
      <p style={labelStyle}>{t("rooms.eyebrow")}</p>
      <h1 style={pageHeadingStyle}>{t("rooms.title")}</h1>
      <div style={{ ...panelStyle, marginTop: "1.25rem" }}>
        <RoomLedger data={roomData} labels={roomLedgerLabels(t)} locale={safeLocale} />
      </div>
    </>
  );
}

function roomLedgerLabels(
  t: Awaited<ReturnType<typeof getTranslations>>,
): RoomLedgerLabels {
  return {
    doorStripLabel: t("rooms.doorStripLabel"),
    inventoryTitle: t("rooms.inventoryTitle"),
    inventoryHelp: t("rooms.inventoryHelp"),
    addRoom: t("rooms.addRoom"),
    privateBlockTitle: t("rooms.privateBlockTitle"),
    privateBlockHelp: t("rooms.privateBlockHelp"),
    roomsLabel: t("rooms.roomsLabel"),
    publicLabel: t("rooms.publicLabel"),
    privateNote: t("rooms.privateNote"),
    createBlock: t("rooms.createBlock"),
    cancel: t("rooms.cancel"),
    from: t("rooms.from"),
    to: t("rooms.to"),
    dateControlTitle: t("rooms.dateControlTitle"),
    dateControlHelp: t("rooms.dateControlHelp"),
    room: t("rooms.room"),
    chooseRoom: t("rooms.chooseRoom"),
    action: t("rooms.action"),
    close: t("rooms.close"),
    open: t("rooms.open"),
    saveControl: t("rooms.saveControl"),
    remove: t("rooms.remove"),
    agentRequestTitle: t("rooms.agentRequestTitle"),
    agentRequestHelp: t("rooms.agentRequestHelp"),
    agentRequestLabel: t("rooms.agentRequestLabel"),
    agentRequestPlaceholder: t("rooms.agentRequestPlaceholder"),
    agentRequestSubmit: t("rooms.agentRequestSubmit"),
    proposalTitle: t("rooms.proposalTitle"),
    proposalHelp: t("rooms.proposalHelp"),
    apply: t("rooms.apply"),
    dismiss: t("rooms.dismiss"),
    noProposals: t("rooms.noProposals"),
    capacity: (standard, maximum) => t("rooms.capacity", { standard, maximum }),
    states: {
      available: t("rooms.states.available"),
      occupied: t("rooms.states.occupied"),
      private: t("rooms.states.private"),
      closed: t("rooms.states.closed"),
      withheld: t("rooms.states.withheld"),
      inactive: t("rooms.states.inactive"),
      draft: t("rooms.states.draft"),
    },
    actions: {
      open: t("rooms.open"),
      close: t("rooms.close"),
      private_block: t("rooms.private_block"),
    },
    inventory: {
      internalName: t("rooms.internalName"),
      guestLabel: t("rooms.guestLabel"),
      floor: t("rooms.floor"),
      sleepingArrangement: t("rooms.sleepingArrangement"),
      standardCapacity: t("rooms.standardCapacity"),
      maximumCapacity: t("rooms.maximumCapacity"),
      inventoryState: t("rooms.inventoryState"),
      overflowPolicy: t("rooms.overflowPolicy"),
      overflowArrangement: t("rooms.overflowArrangementField"),
      displayOrder: t("rooms.displayOrder"),
      privateNotes: t("rooms.privateNotes"),
      none: t("rooms.none"),
      hostApproval: t("rooms.hostApproval"),
      save: t("rooms.saveRoom"),
      create: t("rooms.createRoom"),
    },
  };
}
