# Demo guest session implementation notes

## Deviations

### Phase 2 guest visit type import

- Plan said: `2026-09-04-demo-guest-session.md` moves the token route's
  `guest-data.ts` module but does not list `guest-visit-presentation.ts` among
  the files to edit.
- Found: `guest-visit-presentation.ts` imported `GuestVisitStatus` directly
  from the moved module.
- Chose: update that type-only import to the new core module path.
- Why: leaving the import unchanged would break typechecking after the move;
  this is a required consumer update with no runtime behavior change.

### Phase 2 simplify follow-up

- Plan said: extract guest actions into core without listing the room-choice
  contract as a moved file, and reuse `InvitationByToken` for ID lookup.
- Found: the extracted core action then depended on a component module, while
  invitation expiry is nullable for records without a magic link.
- Chose: move the guest-room contract into `core/booking/`, centralize identity
  dispatch, and make the shared expiry field nullable.
- Why: this preserves behavior while restoring dependency direction, removing
  repeated dispatch logic, and matching the database schema.

### Phase 3 shared guest rendering

- Plan said: reuse `GuestVisitRecord` by exporting it from the token route or
  duplicate it in the session route.
- Found: Next.js route modules reject arbitrary page exports, and the new route
  also needs the token page's invitation-default mapping.
- Chose: extract both route-neutral helpers into `components/guest/` and import
  them from the token and session pages.
- Why: this keeps the page export contract valid and prevents the two guest
  entry points from drifting without changing their rendered behavior.

### Phase 3 simplify follow-up

- Plan said: authorize any invitation in a demo home when resolving or minting
  a guest session, and keep parallel token/session action wrappers.
- Found: that admitted cancelled invitations, while the parallel wrappers and
  shared components duplicated validation and depended on token-route types.
- Chose: reject cancelled invitations in both cookie entry paths and move input
  schemas, action signatures, and redirect detection to neutral shared modules.
- Why: cancelled access now matches existing invitation lookup behavior, and
  both guest entry points share one validation and component contract.

### Phase 4 simplify follow-up

- Plan said: select the demo guest invitation together with its party family
  name.
- Found: the page never renders the family name, and the query still exposed a
  cancelled invitation as an entry that the session route would reject.
- Chose: select only the invitation ID and exclude cancelled invitations.
- Why: the sign-in entry now agrees with session authorization and avoids an
  unused join and result field.

### Phase 5 demo-driver compliance follow-up

- Plan said: the demo driver did not depend on the hidden second host.
- Found: one indexed host reference remained, and switching it to the visible
  host exposed the scripted model reusing a prior capture tool result across a
  newer user turn.
- Chose: use the visible host and stop tool-result lookup at the current user
  turn boundary, with a regression covering consecutive capture requests.
- Why: the driver now follows the user-visible flow and each new scripted task
  performs its own tool call while current-turn tool results still resolve.
