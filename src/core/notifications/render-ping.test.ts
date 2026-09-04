import { describe, expect, it } from "vitest";

import { renderPing } from "./email-outbox";

describe("renderPing", () => {
  it("reads naturally for a special request, in both locales", () => {
    const en = renderPing("pending_decision", "en", {
      partyName: "Vega",
      link: "https://layalga.example/en#pending-decisions",
      stay: ["2026-09-18", "2026-09-21"],
      reasonCode: "special_request",
    });
    expect(en.text).toBe(
      "Vega is requesting approval for a special request for 2026-09-18 – 2026-09-21. Review and decide: https://layalga.example/en#pending-decisions",
    );

    const es = renderPing("pending_decision", "es", {
      partyName: "Vega",
      link: "https://layalga.example/es#pending-decisions",
      stay: ["2026-09-18", "2026-09-21"],
      reasonCode: "special_request",
    });
    expect(es.text).toBe(
      "Vega solicita aprobación para una petición especial para 2026-09-18 – 2026-09-21. Revisa y decide: https://layalga.example/es#pending-decisions",
    );
  });

  it("reads naturally for an unclassified reason, in both locales", () => {
    const en = renderPing("pending_decision", "en", {
      partyName: "Vega",
      link: "https://layalga.example/en#pending-decisions",
      stay: ["2026-09-18", "2026-09-21"],
      reasonCode: "something_unrecognized",
    });
    expect(en.text).toContain("requesting approval for a request for");

    const es = renderPing("pending_decision", "es", {
      partyName: "Vega",
      link: "https://layalga.example/es#pending-decisions",
      stay: ["2026-09-18", "2026-09-21"],
      reasonCode: "something_unrecognized",
    });
    expect(es.text).toContain("solicita aprobación para una solicitud para");
  });
});
