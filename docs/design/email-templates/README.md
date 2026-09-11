# L'Ayalga transactional email template

One base template (`template.html`) with Mustache-style holes; two filled examples.

## Holes
- `{{subject}}` — email subject / <title>
- `{{preheader}}` — hidden preview text (~85 chars)
- `{{eyebrow}}` — mono uppercase label top-right (e.g. "Decision pending", "Reconfirmation needed", "Visit confirmed")
- `{{headline}}` — serif, 30px, one sentence
- `{{body_html}}` — 1–2 sentences; wrap names in <strong>, dates in the mono span used in decision-pending.html
- `{{cta_label}}` / `{{cta_url}}` — one action only; the URL is repeated as plain text below the rule

## Token mapping (light / dark)
- --paper  #f2f0e9 / #101617 — page background
- --sheet  #fdfcf6 / #171f21 — card
- --ink    #182225 / #edefe9 — headline, body, card border
- --graphite #4f5f63 / #aeb8b6 — eyebrow, footnote, footer
- --teal   #14596b / #6fbdc8 — CTA (verano). Swap for season: primavera #5d7026, otono #b3572f, invierno #3a4e58.

Fonts are email-safe stand-ins: Georgia → Fraunces, Helvetica → Inter, Courier New → JetBrains Mono.
Dark mode via <style> media query; clients that strip it fall back to the light inline values.

## Implementation

Design handoff (2026-09-11); `template.html`/`decision-pending.example.html`/
`reconfirmation-needed.example.html` here are the original handoff files,
kept verbatim for reference. The live implementation is
`src/core/notifications/email-template.ts` (`renderEmailDocument`), used by
every automated email:
- Host pings (`pending_decision`, `reconfirm_escalation`) —
  `src/core/notifications/email-outbox.ts` (`renderPing`)
- Guest pings (`verification`, `reconfirm_chase`) —
  `src/core/notifications/guest-outbox.ts` (`renderGuestEmail`)

The dark-mode `--teal` swap per season also picks up otoño/invierno/primavera
dark values from `src/app/globals.css`'s `html[data-theme="dark"][data-season]`
overrides, one step beyond this handoff's verano-only dark value, so a
household's email and its dashboard land on the same accent in both themes.
Season is `src/lib/season.ts`'s `currentSeason(now)` at send time (the send
clock's calendar date, not household-timezone-aware — `householdSeason`
would need home timezone threaded into both dispatch queries, not done here).
