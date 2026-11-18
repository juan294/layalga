/**
 * Case- and diacritic-insensitive text normalization, shared by every
 * deterministic free-text match in the agent layer.
 * Decomposes accented characters (NFD), strips the combining marks, lowers
 * case, and collapses whitespace so "  Peña  " and "PENA" fold to the same
 * string.
 */
export function foldText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}
