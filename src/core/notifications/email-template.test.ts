import { describe, expect, it } from "vitest";

import { escapeHtml, monoSpan, renderEmailDocument } from "./email-template";

describe("renderEmailDocument", () => {
  const base = {
    subject: "A decision is waiting for you at L’Ayalga",
    preheader: "Vega is requesting approval. Review and decide.",
    eyebrow: "Decision pending",
    headline: "A decision is waiting for you",
    bodyHtml: "<strong>Vega</strong> is requesting approval.",
    ctaLabel: "Review and decide",
    ctaUrl: "https://layalga.example/en#pending-decisions",
  };

  it("renders the shared masthead, sheet, and footer chrome", () => {
    const html = renderEmailDocument(base);
    expect(html).toContain("L&#8217;Ayalga");
    expect(html).toContain(base.eyebrow);
    expect(html).toContain(base.headline);
    expect(html).toContain(base.bodyHtml);
    expect(html).toContain(base.ctaUrl);
    expect(html).toContain(base.preheader);
    expect(html).toContain("Sent by L&#8217;Ayalga");
    expect(html).toContain("noreply@layalga.thecreativetoken.com");
  });

  it("escapes the subject, eyebrow, headline, and cta label but not body html", () => {
    const html = renderEmailDocument({
      ...base,
      eyebrow: "R&D <pending>",
      headline: "5 < 10 & waiting",
      ctaLabel: "Go & decide",
      bodyHtml: "<strong>Kept as-is</strong> & unescaped",
    });
    expect(html).toContain("R&amp;D &lt;pending&gt;");
    expect(html).toContain("5 &lt; 10 &amp; waiting");
    expect(html).toContain("Go &amp; decide");
    expect(html).toContain("<strong>Kept as-is</strong> & unescaped");
  });

  it("defaults to the verano teal and swaps in a dark variant per media query", () => {
    const html = renderEmailDocument(base);
    expect(html).toContain("background-color:#14596b");
    expect(html).toContain(".cta{background-color:#6fbdc8!important");
  });

  it("swaps the CTA color for every season", () => {
    const primavera = renderEmailDocument({ ...base, season: "primavera" });
    expect(primavera).toContain("background-color:#5d7026");
    expect(primavera).toContain(".cta{background-color:#b9c46a!important");

    const otono = renderEmailDocument({ ...base, season: "otono" });
    expect(otono).toContain("background-color:#b3572f");
    expect(otono).toContain(".cta{background-color:#e08a63!important");

    const invierno = renderEmailDocument({ ...base, season: "invierno" });
    expect(invierno).toContain("background-color:#3a4e58");
    expect(invierno).toContain(".cta{background-color:#8fb3c9!important");
  });

  it("uses the real from-address in the footer when given one", () => {
    const html = renderEmailDocument({
      ...base,
      fromAddress: "noreply@staging.layalga.example",
    });
    expect(html).toContain("noreply@staging.layalga.example");
  });

  it("includes a dark-mode media query and hidden preheader span", () => {
    const html = renderEmailDocument(base);
    expect(html).toContain("@media (prefers-color-scheme: dark)");
    expect(html).toMatch(/display:none[^>]*>Vega is requesting/);
  });
});

describe("escapeHtml", () => {
  it("escapes the five reserved characters", () => {
    expect(escapeHtml(`<a href="x">&'</a>`)).toBe(
      "&lt;a href=&quot;x&quot;&gt;&amp;&#39;&lt;/a&gt;",
    );
  });
});

describe("monoSpan", () => {
  it("wraps and escapes the value in the mono date span", () => {
    const html = monoSpan("2026-09-18 – 2026-09-21");
    expect(html).toContain("font-family:'Courier New'");
    expect(html).toContain("2026-09-18 – 2026-09-21");
  });
});
