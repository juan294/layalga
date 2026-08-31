import { getTranslations } from "next-intl/server";

import {
  applyRoomProposalAction,
  cancelPrivateBlockAction,
  createPrivateBlockAction,
  createRoomInventoryAction,
  createRoomOverrideAction,
  dismissRoomProposalAction,
  removeRoomOverrideAction,
  requestRoomProposalAction,
  updateRoomInventoryAction,
} from "@/app/[locale]/(host)/room-actions";
import type { HostRoomLedgerData } from "@/app/[locale]/(host)/room-data";
import { formatDateStay } from "@/components/frontend-utils";

import { CalendarFeedControls } from "./calendar-feed-controls";
import { HostWebMcpRegistration } from "@/components/webmcp/host-registration";
import styles from "./room-ledger.module.css";

export async function RoomLedger({
  locale,
  data,
}: {
  locale: "en" | "es";
  data: HostRoomLedgerData;
}) {
  const t = await getTranslations({ locale, namespace: "Host.rooms" });
  const inventoryLabels = {
    internalName: t("internalName"),
    guestLabel: t("guestLabel"),
    floor: t("floor"),
    sleepingArrangement: t("sleepingArrangement"),
    standardCapacity: t("standardCapacity"),
    maximumCapacity: t("maximumCapacity"),
    inventoryState: t("inventoryState"),
    overflowPolicy: t("overflowPolicy"),
    overflowArrangement: t("overflowArrangementField"),
    displayOrder: t("displayOrder"),
    privateNotes: t("privateNotes"),
    none: t("none"),
    hostApproval: t("hostApproval"),
    save: t("saveRoom"),
    create: t("createRoom"),
    states: {
      draft: t("states.draft"),
      available: t("states.available"),
      withheld: t("states.withheld"),
      inactive: t("states.inactive"),
    },
  };
  const manageableRooms = data.rooms.filter(isManageableRoom);
  return (
    <div className={styles.ledger} data-testid="room-ledger">
      <HostWebMcpRegistration
        rooms={manageableRooms.slice(0, 20).map((room) => ({
          id: room.id,
          guestLabel: roomDisplayName(room),
          floorLabel: room.floorLabel,
          sleepingArrangement: room.sleepingArrangement,
          standardCapacity: room.standardCapacity,
          maximumCapacity: room.maximumCapacity,
          state: room.doorStates.join(" + "),
        }))}
      />
      <div className={styles.doorStrip} aria-label={t("doorStripLabel")}>
        {data.rooms.map((room) => (
          <div
            className={styles.door}
            data-door-state={room.doorState}
            key={room.id}
          >
            <span className={styles.doorShape} aria-hidden="true" />
            <strong>{roomDisplayName(room)}</strong>
            <small>
              {room.doorStates.map((state) => t(`states.${state}`)).join(" · ")}
            </small>
          </div>
        ))}
      </div>

      <section className={styles.controlSection}>
        <h3>{t("inventoryTitle")}</h3>
        <p>{t("inventoryHelp")}</p>
        <div className={styles.roomRows}>
          {data.rooms.map((room) => (
            <details className={styles.roomRow} key={room.id}>
              <summary>
                <span>
                  <strong>{roomDisplayName(room)}</strong>
                  <small>{room.floorLabel}</small>
                </span>
                <span>
                  {room.doorStates
                    .map((state) => t(`states.${state}`))
                    .join(" · ")}
                </span>
              </summary>
              <p>
                {room.sleepingArrangement} ·{" "}
                {t("capacity", {
                  standard: room.standardCapacity,
                  maximum: room.maximumCapacity,
                })}
              </p>
              {room.privateNotes ? (
                <p className={styles.privateNote}>{room.privateNotes}</p>
              ) : null}
              <RoomInventoryForm
                labels={inventoryLabels}
                locale={locale}
                room={room}
              />
            </details>
          ))}
        </div>
        <details className={styles.addRoom}>
          <summary>{t("addRoom")}</summary>
          <RoomInventoryForm labels={inventoryLabels} locale={locale} />
        </details>
      </section>

      <div className={styles.controlGrid}>
        <section className={styles.controlSection}>
          <h3>{t("privateBlockTitle")}</h3>
          <p>{t("privateBlockHelp")}</p>
          <form
            action={createPrivateBlockAction}
            className={styles.stackForm}
            data-webmcp-host-block
          >
            <input name="locale" type="hidden" value={locale} />
            <DateFields fromLabel={t("from")} toLabel={t("to")} />
            <fieldset>
              <legend>{t("roomsLabel")}</legend>
              {manageableRooms.map((room) => (
                <label className={styles.checkRow} key={room.id}>
                  <input name="roomIds" type="checkbox" value={room.id} />
                  <span>{roomDisplayName(room)}</span>
                </label>
              ))}
            </fieldset>
            <label>
              <span>{t("publicLabel")}</span>
              <input maxLength={160} name="publicLabel" required />
            </label>
            <label>
              <span>{t("privateNote")}</span>
              <textarea maxLength={2000} name="privateNote" rows={2} />
            </label>
            <button type="submit">{t("createBlock")}</button>
          </form>
          <ul className={styles.compactList}>
            {data.blocks.map((block) => (
              <li key={block.id}>
                <span>
                  <strong>{block.publicLabel}</strong>
                  <small>
                    {formatDateStay([block.start, block.end], locale)} ·{" "}
                    {block.roomLabels.join(", ")}
                  </small>
                  {block.privateNote ? (
                    <small>{block.privateNote}</small>
                  ) : null}
                </span>
                <form action={cancelPrivateBlockAction}>
                  <input name="locale" type="hidden" value={locale} />
                  <input name="blockId" type="hidden" value={block.id} />
                  <button type="submit">{t("cancel")}</button>
                </form>
              </li>
            ))}
          </ul>
        </section>

        <section className={styles.controlSection}>
          <h3>{t("dateControlTitle")}</h3>
          <p>{t("dateControlHelp")}</p>
          <form
            action={createRoomOverrideAction}
            className={styles.stackForm}
            data-webmcp-room-control
          >
            <input name="locale" type="hidden" value={locale} />
            <label>
              <span>{t("room")}</span>
              <select name="roomId" required>
                <option value="">{t("chooseRoom")}</option>
                {manageableRooms.map((room) => (
                  <option key={room.id} value={room.id}>
                    {roomDisplayName(room)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>{t("action")}</span>
              <select name="action" required>
                <option value="close">{t("close")}</option>
                <option value="open">{t("open")}</option>
              </select>
            </label>
            <DateFields fromLabel={t("from")} toLabel={t("to")} />
            <label>
              <span>{t("privateNote")}</span>
              <textarea maxLength={2000} name="privateNote" rows={2} />
            </label>
            <button type="submit">{t("saveControl")}</button>
          </form>
          <ul className={styles.compactList}>
            {data.overrides.map((control) => (
              <li key={control.id}>
                <span>
                  <strong>
                    {control.roomLabel} · {t(control.action)}
                  </strong>
                  <small>
                    {formatDateStay([control.start, control.end], locale)}
                  </small>
                  {control.privateNote ? (
                    <small>{control.privateNote}</small>
                  ) : null}
                </span>
                <form action={removeRoomOverrideAction}>
                  <input name="locale" type="hidden" value={locale} />
                  <input name="overrideId" type="hidden" value={control.id} />
                  <button type="submit">{t("remove")}</button>
                </form>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <section className={styles.controlSection}>
        <h3>{t("agentRequestTitle")}</h3>
        <p>{t("agentRequestHelp")}</p>
        <form
          action={requestRoomProposalAction}
          className={styles.stackForm}
          data-agent-room-request
        >
          <input name="locale" type="hidden" value={locale} />
          <label>
            <span>{t("agentRequestLabel")}</span>
            <textarea
              maxLength={2_000}
              name="rawMessage"
              placeholder={t("agentRequestPlaceholder")}
              required
              rows={3}
            />
          </label>
          <button type="submit">{t("agentRequestSubmit")}</button>
        </form>
      </section>

      <section className={styles.controlSection}>
        <h3>{t("proposalTitle")}</h3>
        <p>{t("proposalHelp")}</p>
        {data.proposals.length ? (
          <ul className={styles.proposals}>
            {data.proposals.map((proposal) => (
              <li key={proposal.id}>
                <div>
                  <strong>{proposal.summary}</strong>
                  <p>
                    {t(proposal.kind)} ·{" "}
                    {formatDateStay([proposal.start, proposal.end], locale)} ·{" "}
                    {proposal.roomLabels.join(", ")}
                  </p>
                </div>
                <div className={styles.proposalActions}>
                  <form action={applyRoomProposalAction}>
                    <input name="locale" type="hidden" value={locale} />
                    <input
                      name="proposalId"
                      type="hidden"
                      value={proposal.id}
                    />
                    <button type="submit">{t("apply")}</button>
                  </form>
                  <form action={dismissRoomProposalAction}>
                    <input name="locale" type="hidden" value={locale} />
                    <input
                      name="proposalId"
                      type="hidden"
                      value={proposal.id}
                    />
                    <button type="submit">{t("dismiss")}</button>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p>{t("noProposals")}</p>
        )}
      </section>

      <CalendarFeedControls feeds={data.feeds} locale={locale} />
    </div>
  );
}

interface InventoryLabels {
  internalName: string;
  guestLabel: string;
  floor: string;
  sleepingArrangement: string;
  standardCapacity: string;
  maximumCapacity: string;
  inventoryState: string;
  overflowPolicy: string;
  overflowArrangement: string;
  displayOrder: string;
  privateNotes: string;
  none: string;
  hostApproval: string;
  save: string;
  create: string;
  states: {
    draft: string;
    available: string;
    withheld: string;
    inactive: string;
  };
}

function RoomInventoryForm({
  locale,
  room,
  labels,
}: {
  locale: "en" | "es";
  room?: HostRoomLedgerData["rooms"][number];
  labels: InventoryLabels;
}) {
  return (
    <form
      action={room ? updateRoomInventoryAction : createRoomInventoryAction}
      className={styles.inventoryForm}
    >
      <input name="locale" type="hidden" value={locale} />
      {room ? <input name="roomId" type="hidden" value={room.id} /> : null}
      <label>
        <span>{labels.internalName}</span>
        <input defaultValue={room?.name} maxLength={120} name="name" required />
      </label>
      <label>
        <span>{labels.guestLabel}</span>
        <input
          defaultValue={room?.guestLabel}
          maxLength={120}
          name="guestLabel"
          required
        />
      </label>
      <label>
        <span>{labels.floor}</span>
        <input
          defaultValue={room?.floorLabel}
          maxLength={120}
          name="floorLabel"
          required
        />
      </label>
      <label className={styles.wide}>
        <span>{labels.sleepingArrangement}</span>
        <input
          defaultValue={room?.sleepingArrangement}
          maxLength={240}
          name="sleepingArrangement"
          required
        />
      </label>
      <label>
        <span>{labels.standardCapacity}</span>
        <input
          defaultValue={room?.standardCapacity ?? 2}
          min={1}
          name="standardCapacity"
          required
          type="number"
        />
      </label>
      <label>
        <span>{labels.maximumCapacity}</span>
        <input
          defaultValue={room?.maximumCapacity ?? 2}
          min={1}
          name="maximumCapacity"
          required
          type="number"
        />
      </label>
      <label>
        <span>{labels.inventoryState}</span>
        <select
          defaultValue={room?.inventoryState ?? "draft"}
          name="inventoryState"
        >
          <option value="draft">{labels.states.draft}</option>
          <option value="available">{labels.states.available}</option>
          <option value="withheld">{labels.states.withheld}</option>
          <option value="inactive">{labels.states.inactive}</option>
        </select>
      </label>
      <label>
        <span>{labels.overflowPolicy}</span>
        <select
          defaultValue={room?.overflowPolicy ?? "none"}
          name="overflowPolicy"
        >
          <option value="none">{labels.none}</option>
          <option value="host_approval">{labels.hostApproval}</option>
        </select>
      </label>
      <label className={styles.wide}>
        <span>{labels.overflowArrangement}</span>
        <input
          defaultValue={room?.overflowArrangement ?? ""}
          maxLength={240}
          name="overflowArrangement"
        />
      </label>
      <label>
        <span>{labels.displayOrder}</span>
        <input
          defaultValue={room?.displayOrder ?? 0}
          min={0}
          name="displayOrder"
          required
          type="number"
        />
      </label>
      <label className={styles.wide}>
        <span>{labels.privateNotes}</span>
        <textarea
          defaultValue={room?.privateNotes ?? ""}
          maxLength={2000}
          name="privateNotes"
          rows={2}
        />
      </label>
      <button type="submit">{room ? labels.save : labels.create}</button>
    </form>
  );
}

function roomDisplayName(room: HostRoomLedgerData["rooms"][number]): string {
  return room.guestLabel || room.name;
}

function isManageableRoom(room: HostRoomLedgerData["rooms"][number]): boolean {
  return (
    room.inventoryState === "available" || room.inventoryState === "withheld"
  );
}

function DateFields({
  fromLabel,
  toLabel,
}: {
  fromLabel: string;
  toLabel: string;
}) {
  return (
    <div className={styles.dateFields}>
      <label>
        <span>{fromLabel}</span>
        <input name="from" required type="date" />
      </label>
      <label>
        <span>{toLabel}</span>
        <input name="to" required type="date" />
      </label>
    </div>
  );
}
