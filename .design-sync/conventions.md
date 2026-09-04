## Wrapping and setup

Every component reads copy from `next-intl` — wrap the tree in `NextIntlClientProvider` with a `locale` and a `messages` object shaped like the app's own catalogue (top-level namespaces `Host`, `Guest`, `GuestAccount`, `DemoHost`, `Runs`, `RouteStates`), or `useTranslations()` throws and the component renders nothing:

```tsx
<NextIntlClientProvider locale="en" messages={messages}>
  <StatusChip label="Confirmed" status="confirmed" />
</NextIntlClientProvider>
```

Pass real keys under the right namespace — a missing key renders literally as `Host.rooms.title`, not a fallback. `RoomLedger`, `CalendarLedger`, `PendingDecisions`, `CaptureInvitationForm`, `DemoClockPanel`, `StatusChip` read `Host.*`; `Field`, `GuestActionButton`, `GuestActions`, `GuestInviteForm` read `Guest.*`; `RunStatusPoller` reads `Runs.*`. Most components also take fully-formed data/label props rather than raw model objects (see each `<Name>.d.ts`) — build the props shape first, then wire i18n.

## Styling idiom

No utility classes and no theme/prop API — this is a **CSS custom-property** design system. The base tokens (defined once, shared everywhere):

| Token | Use |
|---|---|
| `--paper` | page/app background |
| `--sheet` | card/surface background |
| `--ink` | primary text, borders |
| `--graphite` | secondary/muted text |
| `--rule` | hairline dividers (derived from `--ink`) |
| `--teal` | seasonal accent — links, focus rings, primary actions |
| `--accent-soft` | decorative/large-text only accent, not contrast-safe for body copy |
| `--focus` | focus-ring color (defaults to `--teal`) |
| `--state-available` / `--state-occupied` / `--state-private` / `--state-closed` | room/door status colors — hue-separated, season-independent |
| `--interactive-target` / `--interactive-target-compact` | minimum tap-target sizing (2.75rem / 2.25rem) |
| `--font-fraunces` / `--font-inter` / `--font-jetbrains-mono` | the three brand typefaces (serif display, body, mono/label) |

Some components (`GuestActions`, `RunStatusPoller`) alias these into locally-scoped fallback vars (`--guest-paper`, `--run-teal`, etc., each `var(--base-token, <fallback>)`) purely so they degrade gracefully outside the app shell — treat the base tokens above as canonical when composing new layout. New layout glue (wrappers, spacing, grids around these components) should read the same `var(--*)` tokens via inline style or a plain stylesheet — never invent new hex colors or borrow a component's own CSS-Modules class names (they're hashed and private to that component).

The tokens are season-reactive: an ancestor `<html data-season="primavera|verano|otono|invierno">` shifts `--paper`/`--teal`/`--accent-soft`; omit it and everything renders on the verano (summer) values. `prefers-color-scheme: dark` is also handled at the token layer — no separate dark variant to wire up.

## Where the truth lives

Read `styles.css` at this bundle's root first — it `@import`s the real token definitions and `_ds_bundle.css` (the compiled component styles). Each component's own `<Name>.prompt.md` documents its exact props and translation keys; trust those over guessing.

## Example

```tsx
<NextIntlClientProvider locale="en" messages={messages}>
  <div style={{ background: "var(--paper)", padding: "1.5rem" }}>
    <div style={{ background: "var(--sheet)", border: "1px solid var(--ink)", padding: "1rem" }}>
      <StatusChip label="Confirmed" status="confirmed" />
    </div>
  </div>
</NextIntlClientProvider>
```
