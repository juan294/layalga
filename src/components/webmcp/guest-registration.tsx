"use client";

import { useEffect, useRef } from "react";

import {
  createGuestWebMcpTools,
  type GuestWebMcpOption,
  type PreparedGuestBooking,
  type PreparedGuestSearch,
} from "./guest-tools";
import { registerWebMcpTools } from "./register-tools";

export function GuestWebMcpRegistration({
  options,
}: {
  options: GuestWebMcpOption[];
}) {
  const currentOptions = useRef(options);
  useEffect(() => {
    currentOptions.current = options;
  }, [options]);
  useEffect(
    () =>
      registerWebMcpTools(
        document,
        createGuestWebMcpTools({
          options: () => currentOptions.current,
          prepareBooking: (value) =>
            prepareGuestBookingInDocument(document, value),
          prepareSearch: (value) =>
            prepareGuestSearchInDocument(document, value),
        }),
      ),
    [],
  );
  return null;
}

export function prepareGuestSearchInDocument(
  target: Pick<Document, "querySelector">,
  value: PreparedGuestSearch,
): void {
  const form = target.querySelector<HTMLFormElement>(
    "form[data-webmcp-guest-search]",
  );
  if (!form) throw new Error("The guest search form is not visible");
  setInput(form, "from", value.from);
  setInput(form, "to", value.to);
  setInput(form, "nights", String(value.nights));
  setInput(form, "adults", String(value.adults));
  setInput(form, "children", String(value.children));
  setInput(form, "pets", String(value.pets));
  reveal(form);
}

export function prepareGuestBookingInDocument(
  target: Pick<Document, "querySelector">,
  value: PreparedGuestBooking,
): void {
  const form = target.querySelector<HTMLFormElement>(
    "form[data-webmcp-guest-options]",
  );
  if (!form) throw new Error("The guest room form is not visible");
  clickToState(
    form.querySelector<HTMLInputElement>(
      `input[name="stay-choice"][value="${selectorValue(value.stay)}"]`,
    ),
    true,
  );
  for (const checkbox of form.querySelectorAll<HTMLInputElement>(
    'input[name="roomIds"]',
  )) {
    clickToState(checkbox, value.roomIds.includes(checkbox.value));
  }
  const overflow = form.querySelector<HTMLInputElement>(
    'input[name="overflowConsent"]',
  );
  if (overflow) clickToState(overflow, value.acceptOverflow);
  reveal(form);
}

function setInput(form: HTMLFormElement, name: string, value: string): void {
  const control = form.elements.namedItem(name);
  if (!control || !("value" in control)) {
    throw new Error(`The visible ${name} field is unavailable`);
  }
  const input = control as unknown as HTMLInputElement;
  const setter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value",
  )?.set;
  setter?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

function clickToState(
  control: HTMLInputElement | null,
  checked: boolean,
): void {
  if (!control) throw new Error("A prepared room choice is not visible");
  if (control.checked !== checked) control.click();
}

function reveal(form: HTMLFormElement): void {
  form.scrollIntoView({ behavior: "smooth", block: "center" });
  form.querySelector<HTMLElement>("input, select, textarea")?.focus();
}

function selectorValue(value: string): string {
  if (typeof CSS !== "undefined" && CSS.escape) return CSS.escape(value);
  return value.replaceAll('"', '\\"');
}
