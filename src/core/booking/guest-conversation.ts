import "@/core/server-only";
import { guestSessionOptionInput } from "./guest-action-input";
import {
  conversationInput,
  type GuestConversationReply,
  type GuestConversationState,
  type GuestConversationReceipt,
} from "./guest-conversation-contract";
import {
  interpretation,
  interpretLocally,
  dayRange,
  normalized,
  parsePublicText,
  providerVocabulary,
} from "./guest-conversation-interpreter";
import { interpretGuestCriteria } from "./guest-conversation-model";
import {
  discoverPublicListings,
  resolvePublicListing,
} from "./public-listings";
import { searchPublicStays, type PublicStayOption } from "./public-stay-search";
import { listRequesterStayRequests } from "./stay-requests";
import { verifiedRequester } from "@/lib/auth/verified-requester";
import { recommendRoomsWithOverflow } from "@/core/rooms/recommendation";
import type { GuestRoomOption } from "@/core/rooms/types";
import type { GuestSearchCriteria } from "./stay-options";

const defaults = {
  now: () => new Date(),
  interpret: interpretGuestCriteria,
  discover: discoverPublicListings,
  resolve: resolvePublicListing,
  search: searchPublicStays,
  receipts: async (): Promise<GuestConversationReceipt[] | null> => {
    const user = await verifiedRequester();
    return user ? await listRequesterStayRequests(user.userId) : null;
  },
};
type Services = Omit<typeof defaults, "interpret"> & {
  interpret: (words: string) => unknown | Promise<unknown>;
};
const day = 86_400_000;
const iso = (n: number) => new Date(n).toISOString().slice(0, 10);
function criteriaFor(
  state: GuestConversationState,
  today: string,
): GuestSearchCriteria | null {
  const { nights, adults } = state;
  if (!nights || !adults) return null;
  let { from, to } = state;
  const start = Date.parse(today),
    date = new Date(start);
  if (
    state.relative === "next_month" ||
    state.relative === "this_month" ||
    state.month
  ) {
    const month = state.relative
      ? date.getUTCMonth() + (state.relative === "next_month" ? 1 : 0)
      : state.month! - 1;
    let year = state.year ?? date.getUTCFullYear();
    if (!state.year && !state.relative && month < date.getUTCMonth()) year++;
    from = iso(Date.UTC(year, month, 1));
    to = iso(Date.UTC(year, month + 1, 1));
    if (from < today && to > today) from = today;
  } else if (state.relative) {
    const weekday = (date.getUTCDay() + 6) % 7;
    if (state.relative === "next_week" || state.relative === "this_week") {
      const monday =
        start - weekday * day + (state.relative === "next_week" ? 7 : 0) * day;
      from = iso(Math.max(start, monday));
      to = iso(monday + (6 + nights) * day);
    } else {
      from = iso(start + (state.relative === "tomorrow" ? day : 0));
      to = iso(Date.parse(from) + nights * day);
    }
  } else if (from && !to) {
    to = iso(Date.parse(from) + nights * day);
  }
  if (!from || !to) return null;
  return {
    from,
    to,
    nights,
    adults,
    children: state.children ?? 0,
    pets: state.pets ?? 0,
  };
}

const equivalents = [
  ["ground floor", "downstairs", "planta baja"],
  ["upper floor", "upstairs", "planta alta", "piso superior"],
  ["double bed", "cama doble"],
  ["sofa bed", "sofa cama"],
  ["air mattress", "colchon inflable", "colchon hinchable"],
  ["twin beds", "camas individuales"],
];
function matchingProjection(
  preference: string,
  partySize: number,
  avoid = false,
) {
  const needle = normalized(preference);
  const terms = equivalents.find((words) => words.includes(needle)) ?? [needle];
  return (option: PublicStayOption): PublicStayOption | null => {
    const rooms = option.rooms.filter(
      (room) =>
        avoid !==
        terms.some((word) =>
          normalized(
            [
              room.guestLabel,
              room.floorLabel,
              room.sleepingArrangement,
              room.overflowArrangement ?? "",
            ].join(" "),
          ).includes(word),
        ),
    );
    const candidates: GuestRoomOption[] = rooms.map((r, i) => ({
      ...r,
      id: r.ref,
      displayOrder: i,
      overflowPolicy: r.overflowArrangement ? "host_approval" : "none",
    }));
    const recommendation = recommendRoomsWithOverflow(
      candidates,
      partySize,
      [],
    );
    return recommendation
      ? {
          ...option,
          rooms,
          recommendedRoomRefs: recommendation.rooms.map((r) => r.id),
        }
      : null;
  };
}
const privacy =
  /\b(?:(?:other|another) (?:guest|visitor|person|request)|someone else|who (?:else|is staying)|hosts? (?:schedule|calendar|whereabouts)|where (?:are|is|will) (?:the |my )?hosts?|when (?:are|will) (?:the )?hosts?|private (?:schedule|calendar|notes)|approve (?:my|this|the) (?:stay|booking|request)|self.approv|auto.approv|otros? (?:huesped|visitante)|de otra persona|quien (?:mas|se aloja)|donde (?:estan|estaran) (?:los )?anfitriones|agenda (?:privada|de los anfitriones)|aprueba|apruebame|autoaprueba)\b/;
const status =
  /\b(?:status|estado|confirmaron|confirmado|confirmada|aprobaron|respuesta|did (?:they|the hosts?) (?:confirm|approve|respond)|has (?:my|the) (?:request|stay) been|heard back|my requests?|mis solicitudes)\b/;
const explicit = new Set([
  "send my request",
  "submit my request",
  "send this request",
  "submit this request",
  "enviar mi solicitud",
  "envia mi solicitud",
  "enviar esta solicitud",
  "envia esta solicitud",
]);
const strings = {
  invalid: [
    "Please check the dates and guest counts, or use the booking form.",
    "Comprueba las fechas y el número de personas, o usa el formulario.",
  ],
  privacy: [
    "I can show public rooms and your own requests. Only a host can confirm a stay.",
    "Puedo mostrar habitaciones públicas y tus solicitudes. Solo un anfitrión puede confirmar la estancia.",
  ],
  sign_in: [
    "Sign in to see your requests.",
    "Inicia sesión para ver tus solicitudes.",
  ],
  status: [
    "Here are your requests and their latest status.",
    "Estas son tus solicitudes y su estado actual.",
  ],
  empty: [
    "You have no stay requests yet.",
    "Todavía no tienes solicitudes de estancia.",
  ],
  submit: [
    "Send only after reviewing the exact stay shown.",
    "Envía la solicitud después de revisar la estancia exacta.",
  ],
  review: [
    "Review the dates, rooms and guests for this option.",
    "Revisa las fechas, habitaciones y personas de esta opción.",
  ],
  name: [
    "What is the household’s public name?",
    "¿Cuál es el nombre público del alojamiento?",
  ],
  unknown: [
    "I couldn't find that public name. What name should I look for?",
    "No encontré ese nombre público. ¿Qué alojamiento busco?",
  ],
  listings: [
    "Which of these households did you mean?",
    "¿Cuál de estos alojamientos buscas?",
  ],
  exactDates: [
    "Which exact check-in and checkout dates did you mean? You can enter both as YYYY-MM-DD.",
    "¿Cuáles son las fechas exactas de entrada y salida? Puedes escribir ambas como AAAA-MM-DD.",
  ],
  duration: [
    "How many nights or weeks would you like to stay?",
    "¿Cuántas noches o semanas te gustaría quedarte?",
  ],
  dates: [
    "What month or check-in and checkout dates work for you?",
    "¿Qué mes o fechas de entrada y salida te vienen bien?",
  ],
  adults: [
    "How many adults are coming? Include any children and pets.",
    "¿Cuántos adultos vienen? Indica también los niños y las mascotas.",
  ],
  ambiguous: [
    "Which single date window and party size should I search?",
    "¿Para qué fechas y número de personas hago la búsqueda?",
  ],
  options: [
    "These dates and rooms are available. A host must approve a request.",
    "Estas fechas y habitaciones están disponibles. Un anfitrión debe aprobar la solicitud.",
  ],
  none: [
    "No stays matched those dates, guests and room preferences. Try different dates or a different room.",
    "Ninguna estancia coincide con esas fechas, personas y preferencias. Prueba otras fechas u otra habitación.",
  ],
  unavailable: [
    "I couldn’t complete this search. You can continue with the booking form.",
    "No pude completar la búsqueda. Puedes continuar con el formulario.",
  ],
} as const;

async function discoverName(name: string, services: Services) {
  const exact = await services.discover(name);
  if (exact.listings.length) return exact;
  // A narrowed prefix recovers a misspelling. Always let the guest select a fuzzy match.
  const tokens = normalized(name)
    .replace(/[^\p{L}\d ]/gu, "")
    .split(/\s+/)
    .filter(
      (s) =>
        s.length >= 4 &&
        !["casa", "house", "home", "villa", "guest", "room"].includes(s),
    )
    .sort((a, b) => b.length - a.length);
  const prefix = tokens[0]?.slice(0, Math.min(5, tokens[0].length - 1));
  if (!prefix || prefix.length < 3) return exact;
  const found = await services.discover(prefix);
  return { ...found, fuzzy: true };
}

export async function guestTurn(
  input: unknown,
  services: Services = defaults,
): Promise<GuestConversationReply> {
  const validated = conversationInput.safeParse(input);
  const locale = validated.success
    ? validated.data.locale
    : input &&
        typeof input === "object" &&
        "locale" in input &&
        input.locale === "es"
      ? "es"
      : "en";
  const state: GuestConversationState = {
    ...(validated.success ? validated.data.state : {}),
  };
  let interpreterUnavailable = false;
  function reply(
    kind: GuestConversationReply["kind"],
    text: keyof typeof strings,
    extra: Partial<GuestConversationReply> = {},
  ): GuestConversationReply {
    if (interpreterUnavailable) {
      kind = "unavailable";
      text = "unavailable";
    }
    return {
      kind,
      state,
      message: strings[text][locale === "es" ? 1 : 0],
      ...extra,
    };
  }
  if (!validated.success) return reply("clarify", "invalid");
  const message = validated.data.message;
  const clean = normalized(message).replace(/^[¿¡!?.,\s]+|[!?.,\s]+$/g, "");
  try {
    if (privacy.test(clean)) return reply("privacy", "privacy");
    if (explicit.has(clean))
      return /[?¿]/.test(message)
        ? reply("clarify", "review")
        : reply("submit", "submit");
    if (status.test(clean)) {
      // Treat ownership as a property of the signed-in session, never of the input text.
      const records = await services.receipts();
      if (!records) return reply("sign_in", "sign_in");
      const receipts = records
        .slice(0, 20)
        .map(({ id, status, visitStatus, displayName, stay }) => ({
          id,
          status,
          visitStatus,
          ...(displayName ? { displayName } : {}),
          ...(stay ? { stay } : {}),
        }));
      return reply("status", receipts.length ? "status" : "empty", {
        receipts,
      });
    }
    const selection = clean.match(
      /^(?:(?:choose|select|review|pick|elige|elijo|selecciona|revisa)\s+(?:the |la )?)?(?:option|opcion)\s+(\d{1,2})$/,
    );
    if (selection) {
      const index = Number(selection[1]) - 1;
      return index >= 0 && index < 12
        ? reply("review", "review", { selectedIndex: index })
        : reply("clarify", "invalid");
    }
    if (message) {
      const range = dayRange(message);
      if (range === "clarify") return reply("clarify", "exactDates");
      const vocabulary = providerVocabulary(message),
        local = interpretLocally(vocabulary);
      if (local.ambiguous) return reply("clarify", "ambiguous");
      if (!interpretation.safeParse(local).success)
        return reply("clarify", "invalid");
      let fields = { ...local };
      try {
        const interpreted = interpretation.parse(
          await services.interpret(vocabulary),
        );
        if (interpreted.ambiguous) return reply("clarify", "ambiguous");
        fields = { ...interpreted, ...local };
      } catch {
        interpreterUnavailable = true;
      }
      delete fields.ambiguous;
      // The model may interpret how a count was expressed, but may never
      // invent a household member or pet that the guest did not mention.
      if (!/\badult(?:s|[oa]s?)?\b/.test(vocabulary)) delete fields.adults;
      if (!/\b(?:child(?:ren)?|kids?|nin[oa]s?|bebes?)\b/.test(vocabulary))
        delete fields.children;
      if (
        !/\b(?:pets?|dogs?|cats?|mascotas?|perr[oa]s?|gat[oa]s?)\b/.test(
          vocabulary,
        )
      )
        delete fields.pets;
      if (fields.from || fields.relative || fields.month) {
        delete state.from;
        delete state.to;
        delete state.year;
        delete state.relative;
        delete state.month;
        delete state.arrivalDay;
        delete state.departureDay;
      }
      Object.assign(state, fields);
      if (range) {
        Object.assign(state, range);
        if (!fields.nights) delete state.nights;
      }
      const publicText = parsePublicText(message, state);
      if (
        publicText.name &&
        normalized(publicText.name) !== normalized(state.name ?? "")
      ) {
        state.name = publicText.name;
        delete state.handle;
      }
      if (publicText.preference) {
        state.roomPreference = publicText.preference;
        state.avoidRoomPreference = publicText.avoidPreference;
      }
      if (publicText.clearPreference) {
        delete state.roomPreference;
        delete state.avoidRoomPreference;
      }
    }
    if (!state.handle) {
      if (!state.name) return reply("clarify", "name");
      const found = await discoverName(state.name, services);
      if (!found.listings.length) return reply("clarify", "unknown");
      if (found.listings.length > 1 || found.truncated || "fuzzy" in found)
        return reply("listings", "listings", { listings: found.listings });
      state.handle = found.listings[0]!.handle;
    }
    const listing = await services.resolve(state.handle);
    if (!listing) {
      delete state.handle;
      return reply("clarify", "unknown");
    }
    state.name = listing.displayName;
    const today = new Intl.DateTimeFormat("sv-SE", {
      timeZone: listing.timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(services.now());
    if (state.arrivalDay !== undefined || state.departureDay !== undefined) {
      if (
        !state.arrivalDay ||
        !state.departureDay ||
        !state.month ||
        state.arrivalDay >= state.departureDay
      )
        return reply("clarify", "exactDates");
      let year = state.year ?? Number(today.slice(0, 4));
      if (
        !state.year &&
        iso(Date.UTC(year, state.month - 1, state.arrivalDay)) < today
      )
        year++;
      const start = iso(Date.UTC(year, state.month - 1, state.arrivalDay)),
        end = iso(Date.UTC(year, state.month - 1, state.departureDay));
      if (
        state.nights &&
        state.nights !== state.departureDay - state.arrivalDay
      )
        return reply("clarify", "exactDates");
      if (Number(end.slice(5, 7)) !== state.month)
        return reply("clarify", "exactDates");
      state.from = start;
      state.to = end;
      delete state.month;
      delete state.year;
      delete state.arrivalDay;
      delete state.departureDay;
    }
    if (!state.nights && state.from && state.to)
      state.nights = (Date.parse(state.to) - Date.parse(state.from)) / day;
    if (!state.nights) return reply("clarify", "duration");
    if (!state.month && !state.relative && !state.from)
      return reply("clarify", "dates");
    if (!state.adults) return reply("clarify", "adults");
    const criteria = criteriaFor(state, today);
    if (
      !criteria ||
      criteria.from < today ||
      Date.parse(criteria.to) - Date.parse(criteria.from) <
        criteria.nights * day ||
      !guestSessionOptionInput.safeParse({ ...criteria, locale }).success
    )
      return reply("clarify", "invalid");
    if (interpreterUnavailable)
      return reply("unavailable", "unavailable", { criteria });
    const result = await services.search(
      listing.handle,
      criteria,
      state.roomPreference
        ? matchingProjection(
            state.roomPreference,
            criteria.adults + criteria.children,
            state.avoidRoomPreference,
          )
        : undefined,
    );
    if (result.status === "invalid") return reply("clarify", "invalid");
    if (result.status === "not_found") {
      delete state.handle;
      return reply("clarify", "unknown");
    }
    return result.options.length
      ? reply("options", "options", { criteria, options: result.options })
      : reply("none", "none", { criteria, options: [] });
  } catch {
    return reply("unavailable", "unavailable");
  }
}
