"use client";

import { useEffect, useMemo } from "react";

import {
  createHostWebMcpTools,
  type HostWebMcpRoom,
  type PreparedHostBlock,
  type PreparedHostControl,
} from "./host-tools";
import { registerWebMcpTools } from "./register-tools";

export function HostWebMcpRegistration({ rooms }: { rooms: HostWebMcpRoom[] }) {
  const tools = useMemo(
    () =>
      createHostWebMcpTools({
        rooms,
        prepareBlock: prepareHostBlock,
        prepareControl: prepareHostControl,
      }),
    [rooms],
  );
  useEffect(() => registerWebMcpTools(document, tools), [tools]);
  return null;
}

function prepareHostBlock(value: PreparedHostBlock): void {
  prepareHostBlockInDocument(document, value);
}

export function prepareHostBlockInDocument(
  target: Pick<Document, "querySelector">,
  value: PreparedHostBlock,
): void {
  const form = target.querySelector<HTMLFormElement>(
    "form[data-webmcp-host-block]",
  );
  if (!form) throw new Error("The private-block form is not visible");
  setValue(form, "from", value.from);
  setValue(form, "to", value.to);
  setValue(form, "publicLabel", value.publicLabel);
  for (const checkbox of form.querySelectorAll<HTMLInputElement>(
    'input[name="roomIds"]',
  )) {
    checkbox.checked = value.roomIds.includes(checkbox.value);
    notify(checkbox);
  }
  reveal(form);
}

function prepareHostControl(value: PreparedHostControl): void {
  prepareHostControlInDocument(document, value);
}

export function prepareHostControlInDocument(
  target: Pick<Document, "querySelector">,
  value: PreparedHostControl,
): void {
  const form = target.querySelector<HTMLFormElement>(
    "form[data-webmcp-room-control]",
  );
  if (!form) throw new Error("The room-control form is not visible");
  setValue(form, "from", value.from);
  setValue(form, "to", value.to);
  setValue(form, "roomId", value.roomId);
  setValue(form, "action", value.action);
  reveal(form);
}

function setValue(form: HTMLFormElement, name: string, value: string): void {
  const control = form.elements.namedItem(name);
  if (!control || !("value" in control)) {
    throw new Error(`The visible ${name} field is unavailable`);
  }
  const valueControl = control as unknown as
    HTMLInputElement | HTMLSelectElement;
  valueControl.value = value;
  notify(valueControl);
}

function notify(control: HTMLInputElement | HTMLSelectElement): void {
  control.dispatchEvent(new Event("input", { bubbles: true }));
  control.dispatchEvent(new Event("change", { bubbles: true }));
}

function reveal(form: HTMLFormElement): void {
  form.scrollIntoView({ behavior: "smooth", block: "center" });
  form.querySelector<HTMLElement>("input, select, textarea")?.focus();
}
