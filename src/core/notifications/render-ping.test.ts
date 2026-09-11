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

  it("renders a decision-pending email in the shared template", () => {
    const rendered = renderPing("pending_decision", "en", {
      partyName: "Vega",
      link: "https://layalga.example/en#pending-decisions",
      stay: ["2026-09-18", "2026-09-21"],
      reasonCode: "overflow",
      season: "otono",
    });
    expect(rendered.html).toContain("Decision pending");
    expect(rendered.html).toContain("A decision is waiting for you");
    expect(rendered.html).toContain("<strong>Vega</strong>");
    expect(rendered.html).toContain("2026-09-18 – 2026-09-21");
    expect(rendered.html).toContain("Review and decide");
    expect(rendered.html).toContain("https://layalga.example/en#pending-decisions");
    expect(rendered.html).toContain("background-color:#b3572f");
  });

  it("renders a reconfirmation-needed email in the shared template", () => {
    const rendered = renderPing("reconfirm_escalation", "es", {
      partyName: "Vega",
      link: "https://layalga.example/es",
    });
    expect(rendered.html).toContain("Reconfirmación pendiente");
    expect(rendered.html).toContain("Vega no ha reconfirmado su visita");
    expect(rendered.html).toContain("Revisar la visita");
    expect(rendered.html).toContain("https://layalga.example/es");
  });

  it("falls back to a generic party name when none is known, in both locales", () => {
    const en = renderPing("reconfirm_escalation", "en", {
      partyName: "",
      link: "https://layalga.example/en",
    });
    expect(en.html).toContain("A family has not reconfirmed their visit");

    const es = renderPing("reconfirm_escalation", "es", {
      partyName: "",
      link: "https://layalga.example/es",
    });
    expect(es.html).toContain("Una familia no ha reconfirmado su visita");
  });
});
