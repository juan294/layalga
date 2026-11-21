"use client";

import { useEffect } from "react";
import { readOwnRequestStatus } from "@/app/[locale]/requests/status-action";
import { createReceiptStatusTool } from "./request-tools";
import { registerWebMcpTools } from "./register-tools";

export function ReceiptRegistration({ id }: { id: string }) {
  useEffect(
    () =>
      registerWebMcpTools(document, [
        createReceiptStatusTool(() => readOwnRequestStatus(id)),
      ]),
    [id],
  );
  return null;
}
