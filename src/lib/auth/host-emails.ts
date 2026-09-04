export function normalizeHostEmail(email: string | undefined): string | null {
  const normalized = email?.trim().toLowerCase();
  return normalized || null;
}

/**
 * Masks an address for display in the host UI, e.g. `j***@gmail.com`. Keeps
 * only the first character of the local part; the domain stays visible so a
 * host can still tell which of their addresses it is.
 */
export function maskHostEmail(email: string): string | null {
  const at = email.indexOf("@");
  if (at <= 0 || at === email.length - 1) return null;
  return `${email.slice(0, 1)}***${email.slice(at)}`;
}
