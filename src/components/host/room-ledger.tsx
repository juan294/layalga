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
import type {
  DoorState,
  HostRoomLedgerData,
} from "@/app/[locale]/(host)/room-data";
import { formatDateStay } from "@/components/frontend-utils";

import { CalendarFeedControls } from "./calendar-feed-controls";
import { HostWebMcpRegistration } from "@/components/webmcp/host-registration";
import styles from "./room-ledger.module.css";

/* Presentational by contract: every string arrives through `labels`, so the
   component renders identically in the app and in a design-system preview
   card, which has no next-intl request scope to resolve copy from. The host
   page owns the translation, the same way it already does for CalendarLedger
   and PendingDecisions. */
export function RoomLedger({
  locale,
  data,
  labels,
}: {
  locale: "en" | "es";
  data: HostRoomLedgerData;
  labels: RoomLedgerLabels;
}) {
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
      <div className={styles.doorStrip} aria-label={labels.doorStripLabel}>
        {data.rooms.map((room) => (
          <div
            className={styles.door}
            data-door-state={room.doorState}
            key={room.id}
          >
            <span className={styles.doorShape} aria-hidden="true" />
            <strong>{roomDisplayName(room)}</strong>
            <small>
              {room.doorStates.map((state) => labels.states[state]).join(" · ")}
            </small>
          </div>
        ))}
      </div>

      <section className={styles.controlSection}>
        <h3>{labels.inventoryTitle}</h3>
        <p>{labels.inventoryHelp}</p>
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
                    .map((state) => labels.states[state])
                    .join(" · ")}
                </span>
              </summary>
              <p>
                {room.sleepingArrangement} ·{" "}
                {labels.capacity(room.standardCapacity, room.maximumCapacity)}
              </p>
              {room.privateNotes ? (
                <p className={styles.privateNote}>{room.privateNotes}</p>
              ) : null}
              <RoomInventoryForm
                labels={labels.inventory}
                locale={locale}
                room={room}
                stateLabels={labels.states}
              />
            </details>
          ))}
        </div>
        <details className={styles.addRoom}>
          <summary>{labels.addRoom}</summary>
          <RoomInventoryForm
            labels={labels.inventory}
            locale={locale}
            stateLabels={labels.states}
          />
        </details>
      </section>

      <div className={styles.controlGrid}>
        <section className={styles.controlSection}>
          <h3>{labels.privateBlockTitle}</h3>
          <p>{labels.privateBlockHelp}</p>
          <form
            action={createPrivateBlockAction}
            className={styles.stackForm}
            data-webmcp-host-block
          >
            <input name="locale" type="hidden" value={locale} />
            <DateFields fromLabel={labels.from} toLabel={labels.to} />
            <fieldset>
              <legend>{labels.roomsLabel}</legend>
              {manageableRooms.map((room) => (
                <label className={styles.checkRow} key={room.id}>
                  <input name="roomIds" type="checkbox" value={room.id} />
                  <span>{roomDisplayName(room)}</span>
                </label>
              ))}
            </fieldset>
            <label>
              <span>{labels.publicLabel}</span>
              <input maxLength={160} name="publicLabel" required />
            </label>
            <label>
              <span>{labels.privateNote}</span>
              <textarea maxLength={2000} name="privateNote" rows={2} />
            </label>
            <button type="submit">{labels.createBlock}</button>
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
                  <button type="submit">{labels.cancel}</button>
                </form>
              </li>
            ))}
          </ul>
        </section>

        <section className={styles.controlSection}>
          <h3>{labels.dateControlTitle}</h3>
          <p>{labels.dateControlHelp}</p>
          <form
            action={createRoomOverrideAction}
            className={styles.stackForm}
            data-webmcp-room-control
          >
            <input name="locale" type="hidden" value={locale} />
            <label>
              <span>{labels.room}</span>
              <select name="roomId" required>
                <option value="">{labels.chooseRoom}</option>
                {manageableRooms.map((room) => (
                  <option key={room.id} value={room.id}>
                    {roomDisplayName(room)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>{labels.action}</span>
              <select name="action" required>
                <option value="close">{labels.close}</option>
                <option value="open">{labels.open}</option>
              </select>
            </label>
            <DateFields fromLabel={labels.from} toLabel={labels.to} />
            <label>
              <span>{labels.privateNote}</span>
              <textarea maxLength={2000} name="privateNote" rows={2} />
            </label>
            <button type="submit">{labels.saveControl}</button>
          </form>
          <ul className={styles.compactList}>
            {data.overrides.map((control) => (
              <li key={control.id}>
                <span>
                  <strong>
                    {control.roomLabel} · {labels.actions[control.action]}
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
                  <button type="submit">{labels.remove}</button>
                </form>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <section className={styles.controlSection}>
        <h3>{labels.agentRequestTitle}</h3>
        <p>{labels.agentRequestHelp}</p>
        <form
          action={requestRoomProposalAction}
          className={styles.stackForm}
          data-agent-room-request
        >
          <input name="locale" type="hidden" value={locale} />
          <label>
            <span>{labels.agentRequestLabel}</span>
            <textarea
              maxLength={2_000}
              name="rawMessage"
              placeholder={labels.agentRequestPlaceholder}
              required
              rows={3}
            />
          </label>
          <button type="submit">{labels.agentRequestSubmit}</button>
        </form>
      </section>

      <section className={styles.controlSection}>
        <h3>{labels.proposalTitle}</h3>
        <p>{labels.proposalHelp}</p>
        {data.proposals.length ? (
          <ul className={styles.proposals}>
            {data.proposals.map((proposal) => (
              <li key={proposal.id}>
                <div>
                  <strong>{proposal.summary}</strong>
                  <p>
                    {labels.actions[proposal.kind]} ·{" "}
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
                    <button type="submit">{labels.apply}</button>
                  </form>
                  <form action={dismissRoomProposalAction}>
                    <input name="locale" type="hidden" value={locale} />
                    <input
                      name="proposalId"
                      type="hidden"
                      value={proposal.id}
                    />
                    <button type="submit">{labels.dismiss}</button>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p>{labels.noProposals}</p>
        )}
      </section>

      <CalendarFeedControls feeds={data.feeds} locale={locale} />
    </div>
  );
}

export interface RoomLedgerLabels {
  doorStripLabel: string;
  inventoryTitle: string;
  inventoryHelp: string;
  addRoom: string;
  privateBlockTitle: string;
  privateBlockHelp: string;
  roomsLabel: string;
  publicLabel: string;
  privateNote: string;
  createBlock: string;
  cancel: string;
  from: string;
  to: string;
  dateControlTitle: string;
  dateControlHelp: string;
  room: string;
  chooseRoom: string;
  action: string;
  close: string;
  open: string;
  saveControl: string;
  remove: string;
  agentRequestTitle: string;
  agentRequestHelp: string;
  agentRequestLabel: string;
  agentRequestPlaceholder: string;
  agentRequestSubmit: string;
  proposalTitle: string;
  proposalHelp: string;
  apply: string;
  dismiss: string;
  noProposals: string;
  /* Parameterised copy stays a function so the caller keeps ownership of
     pluralisation; a preview card supplies a plain formatter. */
  capacity: (standard: number, maximum: number) => string;
  /* Keyed by door state so the strip can label any state the loader emits,
     and reused by the inventory form's four selectable states. */
  states: Record<DoorState, string>;
  /* Shared by the override rows and the proposal rows, which name the same
     three verbs. */
  actions: Record<"open" | "close" | "private_block", string>;
  inventory: InventoryLabels;
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
}

function RoomInventoryForm({
  locale,
  room,
  labels,
  stateLabels,
}: {
  locale: "en" | "es";
  room?: HostRoomLedgerData["rooms"][number];
  labels: InventoryLabels;
  stateLabels: Record<DoorState, string>;
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
          <option value="draft">{stateLabels.draft}</option>
          <option value="available">{stateLabels.available}</option>
          <option value="withheld">{stateLabels.withheld}</option>
          <option value="inactive">{stateLabels.inactive}</option>
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
