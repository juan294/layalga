export function hostEmailIndex(
  email: string | undefined,
  configured = process.env.HOST_EMAILS,
): number {
  if (!email || !configured) return -1;

  const normalizedEmail = email.trim().toLowerCase();
  return configured
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean)
    .indexOf(normalizedEmail);
}
