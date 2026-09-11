import { describe, expect, it } from "vitest";

import { renderGuestEmail } from "./guest-outbox";

describe("renderGuestEmail", () => {
  it("renders a verification email in the shared template, in both locales", () => {
    const en = renderGuestEmail(
      "verification",
      "en",
      "https://layalga.example/en/guest/verify?capability=abc",
      "primavera",
    );
    expect(en.subject).toBe("Verify your email for L’Ayalga");
    expect(en.html).toContain("Verify your email");
    expect(en.html).toContain("Confirm your email to get reminders");
    expect(en.html).toContain("Confirm email");
    expect(en.html).toContain(
      "https://layalga.example/en/guest/verify?capability=abc",
    );
    expect(en.html).toContain("background-color:#5d7026");

    const es = renderGuestEmail(
      "verification",
      "es",
      "https://layalga.example/es/guest/verify?capability=abc",
    );
    expect(es.subject).toBe("Verifica tu correo para L’Ayalga");
    expect(es.html).toContain("Verifica tu correo");
    expect(es.html).toContain("Confirma tu correo para recibir recordatorios");
    expect(es.html).toContain("Confirmar correo");
  });

  it("renders a reconfirm-chase email in the shared template, in both locales", () => {
    const en = renderGuestEmail(
      "reconfirm_chase",
      "en",
      "https://layalga.example/en/guest/return?capability=abc",
    );
    expect(en.subject).toBe("Still coming to L’Ayalga?");
    expect(en.html).toContain("Reconfirmation needed");
    expect(en.html).toContain("Still coming to L’Ayalga?");
    expect(en.html).toContain("Reconfirm your visit");

    const es = renderGuestEmail(
      "reconfirm_chase",
      "es",
      "https://layalga.example/es/guest/return?capability=abc",
    );
    expect(es.subject).toBe("¿Seguís viniendo a L’Ayalga?");
    expect(es.html).toContain("Reconfirmación pendiente");
    expect(es.html).toContain("¿Seguís viniendo a L’Ayalga?");
    expect(es.html).toContain("Reconfirmar visita");
  });

  it("never mentions a party or family name", () => {
    const rendered = renderGuestEmail(
      "reconfirm_chase",
      "en",
      "https://layalga.example/en/guest/return?capability=abc",
    );
    expect(rendered.html).not.toContain("Family");
    expect(rendered.text).not.toContain("Family");
  });

  it("keeps the text body separate from the html, unaffected by season", () => {
    const rendered = renderGuestEmail(
      "verification",
      "en",
      "https://layalga.example/en/guest/verify?capability=abc",
    );
    expect(rendered.text).toBe(
      "You requested email reminders. Open this link and confirm your address. If you did not request this, ignore this email.\n\nhttps://layalga.example/en/guest/verify?capability=abc",
    );
  });

  it("uses the given from-address in the footer", () => {
    const rendered = renderGuestEmail(
      "verification",
      "en",
      "https://layalga.example/en/guest/verify?capability=abc",
      "verano",
      "noreply@staging.layalga.example",
    );
    expect(rendered.html).toContain("noreply@staging.layalga.example");
  });
});
