"use client";

import { useEffect } from "react";
import { lookupHouseholds, lookupStays } from "@/app/[locale]/stays/actions";
import { createPublicStayTools } from "./public-tools";
import { registerWebMcpTools } from "./register-tools";

export function PublicStayRegistration() {
  useEffect(
    () =>
      registerWebMcpTools(
        document,
        createPublicStayTools({
          discover: lookupHouseholds,
          search: lookupStays,
        }),
      ),
    [],
  );
  return null;
}
