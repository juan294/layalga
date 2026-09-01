// design-sync preview shim for `@/app/[locale]/(host)/room-actions`.
// The real module is a "use server" file that reaches Supabase, Drizzle and the
// host session; it cannot be bundled into a browser preview. Every export below
// mirrors the real signature — `(formData: FormData) => Promise<void>` — so a
// signature change in the real file surfaces as a typecheck error rather than a
// silently stale preview. The bodies are inert because static preview cards
// never submit.
export async function createRoomInventoryAction(
  _formData: FormData,
): Promise<void> {}

export async function updateRoomInventoryAction(
  _formData: FormData,
): Promise<void> {}

export async function createPrivateBlockAction(
  _formData: FormData,
): Promise<void> {}

export async function cancelPrivateBlockAction(
  _formData: FormData,
): Promise<void> {}

export async function createRoomOverrideAction(
  _formData: FormData,
): Promise<void> {}

export async function removeRoomOverrideAction(
  _formData: FormData,
): Promise<void> {}

export async function applyRoomProposalAction(
  _formData: FormData,
): Promise<void> {}

export async function dismissRoomProposalAction(
  _formData: FormData,
): Promise<void> {}

export async function requestRoomProposalAction(
  _formData: FormData,
): Promise<void> {}
