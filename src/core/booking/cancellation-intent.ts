import { foldText } from "@/lib/text-fold";

/** A conservative routing hint, never authority to cancel. Even an ambiguous
 * or negated cancellation phrase goes to a review screen with a keep option. */
export function requestsCancellationReview(message: string): boolean {
  const text = foldText(message).replace(/[’']/g, "");
  return (
    /\b(wont|will not) (?:be there|come|attend)\b|\bpull out\b|\bno (?:iremos|vendremos|ire|vendre)\b/.test(
      text,
    ) ||
    /\b(cancel\w*|withdraw\w*|anular\w*|anulacion)\b/.test(text) ||
    /\b(can(?:not|t)|unable to|no longer (?:can|able to)) (?:come|attend|make it|visit)\b/.test(
      text,
    ) ||
    /\bcan no longer (?:come|attend|make it|visit)\b/.test(text) ||
    /\bno (?:podemos|puedo|vamos a|voy a) (?:ir|venir|asistir)\b/.test(text)
  );
}
