"use client";

import { useEffect } from "react";
import { lookupHouseholds, lookupStays } from "@/app/[locale]/stays/actions";
import type { PublicStayOption } from "@/core/booking/public-stay-search";
import type { StayRange } from "@/core/db/schema";
import { createPublicStayTools } from "./public-tools";
import { createPrepareRequestTool } from "./request-tools";
import { registerWebMcpTools } from "./register-tools";

function revealSelection(stay: StayRange, refs: string[]) {
  const form = Array.from(
    document.querySelectorAll<HTMLFormElement>(
      "form[data-webmcp-public-option]",
    ),
  ).find((item) => item.dataset.webmcpPublicOption === stay.join("|"));
  if (!form) return false;
  const rooms = Array.from(
    form.querySelectorAll<HTMLInputElement>('input[name="room"]'),
  );
  if (!refs.every((ref) => rooms.some((room) => room.value === ref)))
    return false;
  const consent = form.querySelector<HTMLInputElement>(
    'input[name="overflow"]',
  );
  if (
    rooms.some((room) => room.checked !== refs.includes(room.value)) &&
    consent
  )
    consent.checked = false;
  for (const room of rooms) room.checked = refs.includes(room.value);
  const details = form.closest("details");
  if (details) details.open = true;
  form.scrollIntoView({ block: "center" });
  rooms.find((room) => room.checked)?.focus({ preventScroll: true });
  return true;
}

export function PublicStayRegistration({
  options,
  partySize = 0,
}: { options?: PublicStayOption[]; partySize?: number } = {}) {
  useEffect(() => {
    const tools = createPublicStayTools({
      discover: lookupHouseholds,
      search: lookupStays,
    });
    if (options?.length)
      tools.push(createPrepareRequestTool(options, partySize, revealSelection));
    return registerWebMcpTools(document, tools);
  }, [options, partySize]);
  return null;
}
