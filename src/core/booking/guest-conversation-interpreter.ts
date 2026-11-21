import { z } from "zod";
import {
  conversationFields,
  type GuestConversationState,
} from "./guest-conversation-contract";

export const interpretation = conversationFields.extend({
  ambiguous: z.boolean().optional(),
});
export type Interpretation = z.infer<typeof interpretation>;
export function normalized(text: string) {
  return text
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[’']/g, "")
    .trim();
}
const months = [
  ["january", "enero"],
  ["february", "febrero"],
  ["march", "marzo"],
  ["april", "abril"],
  ["may", "mayo"],
  ["june", "junio"],
  ["july", "julio"],
  ["august", "agosto"],
  ["september", "septiembre"],
  ["october", "octubre"],
  ["november", "noviembre"],
  ["december", "diciembre"],
];
const numbers = [
  ["zero", "cero", "no", "sin"],
  ["one", "a", "an", "un", "una", "uno"],
  ["two", "dos"],
  ["three", "tres"],
  ["four", "cuatro"],
  ["five", "cinco"],
  ["six", "seis"],
  ["seven", "siete"],
  ["eight", "ocho"],
  ["nine", "nueve"],
  ["ten", "diez"],
  ["eleven", "once"],
  ["twelve", "doce"],
  ["thirteen", "trece"],
  ["fourteen", "catorce"],
  ["fifteen", "quince"],
  ["sixteen", "dieciseis"],
  ["seventeen", "diecisiete"],
  ["eighteen", "dieciocho"],
  ["nineteen", "diecinueve"],
  ["twenty", "veinte"],
  ["twenty-one", "veintiuno"],
];
const numberLookup = new Map([
  ...numbers.flatMap((words, n) => words.map((word) => [word, n] as const)),
  ["thirty", 30],
  ["treinta", 30],
] as [string, number][]);
const countPattern = "(\\d{1,4}|" + [...numberLookup.keys()].join("|") + ")";
const vocabulary = new Set([
  ...months.flat(),
  ...numberLookup.keys(),
  ..."week weeks semana semanas night nights noche noches adults adult adultos adulto adultas adulta children child kids kid ninos ninas nino nina bebe pets pet dog dogs cat cats mascota mascotas perro perros gato gatos next this coming today tomorrow month proximo proxima que viene este esta mes hoy manana from to until starting entre desde hasta del al in en and y or o for para with con without no two of us somos couple pareja guests personas travelers viajeros people".split(
    " ",
  ),
]);
/** Only scheduling words and bounded numbers reach the provider. Never pass raw text or account context. */
export function providerVocabulary(message: string) {
  const clean = normalized(message)
    .replace(
      /https?:\/\/\S+|[\w.+-]+@[\w.-]+|\b[\da-f]{8}-[\da-f-]{27,}\b/gi,
      " ",
    )
    .replace(
      /\b(?:bearer|password|token|secret|authorization|clave|pin|(?:private |security )?code|codigo)(?:\s+(?:is|es))?\s*[:=]?\s*\S+/gi,
      " ",
    );
  const tokens = clean.match(/[a-z0-9_-]+/g) ?? [];
  const unit =
    /^(?:nights?|weeks?|noches?|semanas?|adults?|adult[oa]s?|child(?:ren)?|kids?|nin[oa]s?|bebes?|pets?|dogs?|cats?|perr[oa]s?|gat[oa]s?|mascotas?|guests?|personas?)$/;
  return tokens
    .filter((token, index) => {
      if (vocabulary.has(token) || /^20\d{2}-\d\d-\d\d$/.test(token))
        return true;
      if (!/^\d+$/.test(token)) return false;
      if (unit.test(tokens[index + 1] ?? "")) return true;
      // Month expressions may contain a day and/or year. Other isolated
      // numbers (reference numbers, contact details) are not scheduling data.
      return (
        months.some((forms) =>
          tokens
            .slice(Math.max(0, index - 2), index + 3)
            .some((t) => forms.includes(t)),
        ) &&
        (/^\d{1,2}$/.test(token) || /^20\d{2}$/.test(token))
      );
    })
    .join(" ");
}
function readCount(text: string, units: string) {
  const values = [
    ...text.matchAll(
      new RegExp("\\b" + countPattern + "\\s+(?:" + units + ")\\b", "g"),
    ),
  ].map((m) => numberLookup.get(m[1]!) ?? Number(m[1]));
  return values.length > 1 ? null : values[0];
}
export function interpretLocally(text: string): Interpretation {
  const clean = normalized(text);
  const result: Interpretation = {};
  const monthMatches = months.flatMap((forms, i) =>
    forms.some((m) => clean.split(/\W+/).includes(m)) ? [i + 1] : [],
  );
  if (monthMatches.length > 1 || /\b(?:or|o)\b/.test(clean))
    return { ambiguous: true };
  if (monthMatches[0]) result.month = monthMatches[0];
  const year = clean.match(/\b(20\d{2}|21\d{2})\b/);
  if (year) result.year = Number(year[1]);
  const dates = clean.match(/\b\d{4}-\d{2}-\d{2}\b/g) ?? [];
  if (dates[0]) {
    result.from = dates[0];
    if (dates[1]) result.to = dates[1];
    delete result.year;
  }
  const weeks = readCount(clean, "weeks?|semanas?"),
    nights = readCount(clean, "nights?|noches?");
  if (
    weeks === null ||
    nights === null ||
    (weeks !== undefined && nights !== undefined)
  )
    return { ambiguous: true };
  if (weeks !== undefined) result.nights = weeks * 7;
  else if (nights !== undefined) result.nights = nights;
  for (const [k, units] of [
    ["adults", "adults?|adult[oa]s?"],
    ["children", "child(?:ren)?|kids?|nin[oa]s?|bebes?"],
    ["pets", "pets?|dogs?|cats?|mascotas?|perr[oa]s?|gat[oa]s?"],
  ] as const) {
    const count = readCount(clean, units);
    if (count === null) return { ambiguous: true };
    if (count !== undefined) result[k] = count;
  }
  if (/\b(?:next month|proximo mes|mes (?:que viene|proximo))\b/.test(clean))
    result.relative = "next_month";
  else if (/\b(?:this month|este mes)\b/.test(clean))
    result.relative = "this_month";
  else if (
    /\b(?:next week|proxima semana|semana (?:que viene|proxima))\b/.test(clean)
  )
    result.relative = "next_week";
  else if (/\b(?:this week|esta semana)\b/.test(clean))
    result.relative = "this_week";
  else if (/\b(?:tomorrow|manana)\b/.test(clean)) result.relative = "tomorrow";
  else if (/\b(?:today|hoy)\b/.test(clean)) result.relative = "today";
  return result;
}

// These are calendar days in the selected household. Resolve the year only
// after its timezone is known. Unparsed day constraints must not widen to a month.
export function dayRange(message: string) {
  const text = normalized(message);
  const monthList = months.flat().join("|");
  const en = new RegExp(
    "\\b(" +
      monthList +
      ")\\s+(\\d{1,2})(?:st|nd|rd|th)?\\s*(?:to|until|[-–])\\s*(?:(" +
      monthList +
      ")\\s+)?(\\d{1,2})(?:st|nd|rd|th)?\\b",
  ).exec(text);
  const es = new RegExp(
    "\\b(?:del?\\s+)?(\\d{1,2})\\s+(?:al|hasta el)\\s+(\\d{1,2})\\s+de\\s+(" +
      monthList +
      ")\\b",
  ).exec(text);
  if (en && (!en[3] || en[1] === en[3]))
    return { arrivalDay: Number(en[2]), departureDay: Number(en[4]) };
  if (es) return { arrivalDay: Number(es[1]), departureDay: Number(es[2]) };
  if (
    new RegExp(
      "\\b(?:" +
        monthList +
        ")\\s+\\d{1,2}(?:st|nd|rd|th)?\\b|\\b\\d{1,2}\\s+(?:de\\s+)?(?:" +
        monthList +
        ")\\b",
    ).test(text)
  )
    return "clarify";
  return null;
}

export function parsePublicText(
  message: string,
  known: GuestConversationState,
) {
  const text = message.trim();
  const clean = normalized(text);
  const preference =
    clean.match(
      /\b(ground floor|upper floor|upstairs|downstairs|planta baja|planta alta|piso superior|double bed|cama doble|sofa bed|sofa cama|air mattress|colchon inflable|twin beds|camas individuales)\b/i,
    )?.[1] ??
    text
      .match(
        /(?:prefer(?:ir[ií]a|imos|iría)?|prefiero|preferencia por|room named)\s+(?:the |la |el )?([^.,!?;]{2,80})/iu,
      )?.[1]
      ?.trim();
  const quoted = text.match(/["“«]([^"”»]{2,80})["”»]/u)?.[1];
  const segments = [
    ...text.matchAll(
      /\b(?:at|called|named|llamad[ao]|en|in)\s+(.+?)(?=\s+(?:at|en|in|for|para|with|con|from|desde|next|this|during)\b|[,;!?]|$)/giu,
    ),
  ];
  const candidate = segments
    .map((m) => m[1]!.trim())
    .find((s) => {
      const parsed = interpretLocally(s);
      return (
        !Object.keys(parsed).length &&
        !/^\d|\b(?:weeks?|semanas?|month|mes|planta|floor|room)\b/i.test(s)
      );
    });
  let name = quoted ?? candidate;
  if (
    !name &&
    !known.handle &&
    !preference &&
    text.length >= 2 &&
    text.length <= 80 &&
    !Object.keys(interpretLocally(clean)).length &&
    !/\b(?:we|want|would|stay|book|find|search|need|looking|quiero|quisiera|busco|reservar|buscar|for|para|guests?|personas?)\b/i.test(
      clean,
    )
  )
    name = text.replace(/[.!?]+$/, "").trim();
  const preceding = preference
    ? clean.slice(0, clean.indexOf(normalized(preference)))
    : "";
  return {
    name: name?.slice(0, 80),
    preference: preference?.trim(),
    avoidPreference:
      /\b(?:no|not|without|avoid|sin|evitar|evita|no quiero)\s+(?:(?:a|the|un|una|el|la|any)\s+)?$/.test(
        preceding,
      ),
    clearPreference:
      /\b(?:any room|no preference|cualquier habitacion|sin preferencia)\b/.test(
        clean,
      ),
  };
}
