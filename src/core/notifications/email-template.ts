import type { Season } from "@/lib/season";

const DEFAULT_FROM_ADDRESS = "noreply@layalga.thecreativetoken.com";

// Light values match html[data-season] in src/app/globals.css; dark values
// match html[data-theme="dark"][data-season] there, so a household's email
// and its dashboard land on the same accent.
const SEASON_TEAL: Record<Season, { light: string; dark: string }> = {
  primavera: { light: "#5d7026", dark: "#b9c46a" },
  verano: { light: "#14596b", dark: "#6fbdc8" },
  otono: { light: "#b3572f", dark: "#e08a63" },
  invierno: { light: "#3a4e58", dark: "#8fb3c9" },
};

export function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (char) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[char]!,
  );
}

/** The mono-span treatment the design uses for exact figures (a stay's dates). */
export function monoSpan(value: string): string {
  return `<span style="font-family:'Courier New',Courier,monospace;font-size:15px;white-space:nowrap;">${escapeHtml(value)}</span>`;
}

export interface EmailDocumentParams {
  subject: string;
  preheader: string;
  eyebrow: string;
  headline: string;
  /** Pre-built HTML (may use <strong> and monoSpan()); not escaped here. */
  bodyHtml: string;
  ctaLabel: string;
  ctaUrl: string;
  season?: Season;
  fromAddress?: string;
}

/**
 * Renders the L'Ayalga transactional email shell: masthead, sheet, CTA, and
 * footer, from the design handoff (docs/... design_handoff_emails). One
 * template for every automated email; callers only supply the holes.
 */
export function renderEmailDocument(params: EmailDocumentParams): string {
  const teal = SEASON_TEAL[params.season ?? "verano"];
  const fromAddress = params.fromAddress ?? DEFAULT_FROM_ADDRESS;
  const ctaUrl = escapeHtml(params.ctaUrl);
  return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<title>${escapeHtml(params.subject)}</title>
<!--[if mso]><style>table,td{font-family:Georgia,serif;}</style><![endif]-->
<style>
@media (prefers-color-scheme: dark){
  .paper{background-color:#101617!important;}
  .sheet{background-color:#171f21!important;border-color:#edefe9!important;}
  .ink{color:#edefe9!important;}
  .graphite{color:#aeb8b6!important;}
  .rule{border-color:#3b4649!important;}
  .cta{background-color:${teal.dark}!important;color:#101617!important;}
}
</style>
</head>
<body class="paper" style="margin:0;padding:0;background-color:#f2f0e9;">
<span style="display:none;font-size:1px;color:#f2f0e9;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">${escapeHtml(params.preheader)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="paper" style="background-color:#f2f0e9;">
<tr><td align="center" style="padding:40px 16px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px;">
<!-- masthead -->
<tr><td style="padding:0 4px 20px 4px;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
  <tr>
    <td class="ink" style="font-family:Georgia,'Times New Roman',serif;font-size:22px;line-height:28px;color:#182225;letter-spacing:-0.01em;mso-line-height-rule:exactly;">L&#8217;Ayalga</td>
    <td class="graphite" align="right" style="font-family:'Courier New',Courier,monospace;font-size:11px;line-height:16px;letter-spacing:0.14em;text-transform:uppercase;color:#4f5f63;mso-line-height-rule:exactly;">${escapeHtml(params.eyebrow)}</td>
  </tr>
  </table>
</td></tr>
<!-- sheet -->
<tr><td class="sheet" style="background-color:#fdfcf6;border:1px solid #182225;padding:40px 44px 36px 44px;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
  <tr><td class="ink" style="font-family:Georgia,'Times New Roman',serif;font-size:30px;line-height:36px;color:#182225;letter-spacing:-0.015em;padding-bottom:20px;mso-line-height-rule:exactly;">${escapeHtml(params.headline)}</td></tr>
  <tr><td class="ink" style="font-family:Helvetica,Arial,sans-serif;font-size:17px;line-height:27px;color:#182225;padding-bottom:28px;mso-line-height-rule:exactly;">${params.bodyHtml}</td></tr>
  <tr><td>
    <table role="presentation" cellpadding="0" cellspacing="0" border="0">
    <tr><td class="cta" bgcolor="${teal.light}" style="background-color:${teal.light};">
      <a href="${ctaUrl}" style="display:block;padding:14px 26px;font-family:'Courier New',Courier,monospace;font-size:13px;line-height:16px;letter-spacing:0.08em;text-transform:uppercase;color:#fdfcf6;text-decoration:none;font-weight:bold;">${escapeHtml(params.ctaLabel)}</a>
    </td></tr>
    </table>
  </td></tr>
  <tr><td class="rule" style="border-top:1px solid #c9cbc6;padding-top:20px;margin-top:28px;"></td></tr>
  <tr><td class="graphite" style="font-family:Helvetica,Arial,sans-serif;font-size:13px;line-height:20px;color:#4f5f63;padding-top:8px;mso-line-height-rule:exactly;">If the button doesn't work, open this address: <a href="${ctaUrl}" class="graphite" style="color:#4f5f63;text-decoration:underline;word-break:break-all;">${ctaUrl}</a></td></tr>
  </table>
</td></tr>
<!-- footer -->
<tr><td class="graphite" style="padding:24px 4px 0 4px;font-family:'Courier New',Courier,monospace;font-size:11px;line-height:18px;letter-spacing:0.06em;color:#4f5f63;mso-line-height-rule:exactly;">
  Sent by L&#8217;Ayalga &middot; ${escapeHtml(fromAddress)}<br>
  Automatic notice from the house calendar. Reply is not monitored.
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}
