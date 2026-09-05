import "@/core/server-only";
import { sqlClient, type DatabaseClient } from "../db/client";
import { parseServerEnvironment } from "@/lib/server/env";
import { createMemoryClient, type MemoryClient } from "./client";
import { memoryRecordText } from "./record-text";
import {
  ROOM_PREFERENCES,
  type RoomPreference,
  type RoomPreferenceRecall,
} from "../rooms/preferences";
export type {
  RoomPreference,
  RoomPreferenceRecall,
} from "../rooms/preferences";

interface Options {
  client?: MemoryClient;
  config?: {
    memory: "none" | "agentcore";
    memoryId?: string;
    awsRegion?: string;
  };
}
const MAX_PAGES = 3,
  MAX_RECORDS = 100,
  TIMEOUT_MS = 2000;
const NEGATIVE =
  /\b(no|not|never|dont|doesnt|didnt|cannot|cant|wont|wouldnt|isnt|arent|hardly|avoid|avoids|dislike|dislikes|nunca|tampoco|jamas|sin|evita|evitan|antes)\b|\bno longer\b|\bused to\b/;
const UNSUPPORTED =
  /\b(wheelchair|accessible|accessibility|movilidad|accesible|accesibilidad)\b|silla de ruedas/;
const UNCERTAIN =
  /\b(may|might|maybe|perhaps|if|whether|unclear|unknown|quiza|quizas|si|acaso|posible|posiblemente)\b|\btal vez\b/;
const PREFIX =
  "(?:prefers?|preferred|would like|prefiere|prefieren|preferimos|preferencia por)\\s+(?:(?:a|an|the|una?|las?|los?|rooms?|habitaciones?|habitacion|en|on|la)\\s+){0,5}";
const features: Record<RoomPreference, string> = {
  ground_floor: "(?:ground floor(?: rooms?)?|planta baja)",
  upper_floor:
    "(?:upstairs(?: rooms?)?|upper floor(?: rooms?)?|planta alta|primera planta)",
  separate_beds:
    "(?:separate beds|twin beds|camas separadas|(?:dos )?camas individuales)",
  double_bed: "(?:double bed|cama doble|cama de matrimonio)",
};
function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/[-–—]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
function usableTexts(raw: string): string[] | null {
  if (raw.length > 2048) return null;
  let preferred = raw,
    context: string | undefined;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
      return null;
    const data = parsed as Record<string, unknown>;
    preferred =
      typeof data.preference === "string" && data.preference.trim()
        ? data.preference
        : typeof data.context === "string"
          ? data.context
          : "";
    if (!preferred) return null;
    context = typeof data.context === "string" ? data.context : undefined;
  } catch {
    /* Plain prose is supported. */
  }
  if (preferred.trim().length > 240 || (context && context.trim().length > 240))
    return null;
  return [
    ...new Set([
      normalize(memoryRecordText(raw)),
      ...(context ? [normalize(context)] : []),
    ]),
  ];
}
function recall(texts: readonly string[]): RoomPreferenceRecall {
  if (texts.length === 0) return { status: "empty", preferences: [] };
  const found = new Set<RoomPreference>();
  let unusable = false;
  for (const raw of texts) {
    const parts = usableTexts(raw);
    if (parts === null) {
      unusable = true;
      continue;
    }
    for (const text of parts) {
      if (
        NEGATIVE.test(text) ||
        UNSUPPORTED.test(text) ||
        UNCERTAIN.test(text)
      ) {
        unusable = true;
        continue;
      }
      for (const preference of ROOM_PREFERENCES) {
        const feature = features[preference];
        if (
          new RegExp(`\\b${PREFIX}${feature}\\b`).test(text) ||
          new RegExp(`\\b${feature}\\s+(?:is |are )?preferred\\b`).test(text)
        )
          found.add(preference);
      }
    }
  }
  if (
    (found.has("ground_floor") && found.has("upper_floor")) ||
    (found.has("separate_beds") && found.has("double_bed"))
  )
    return { status: "conflicting", preferences: [] };
  if (unusable || found.size === 0)
    return { status: "unusable", preferences: [] };
  return {
    status: "available",
    preferences: ROOM_PREFERENCES.filter((preference) => found.has(preference)),
  };
}
export async function loadPartyRoomPreferences(
  database: DatabaseClient,
  scope: { homeId: string; partyId: string },
  options: Options = {},
): Promise<RoomPreferenceRecall> {
  try {
    const config = options.config ?? parseServerEnvironment();
    if (config.memory === "none") return { status: "off", preferences: [] };
    const [party] = await sqlClient(database)<
      { id: string }[]
    >`select id from public.parties where id=${scope.partyId} and home_id=${scope.homeId}`;
    if (!party) return { status: "unavailable", preferences: [] };
    if (!config.memoryId || !config.awsRegion)
      return { status: "unavailable", preferences: [] };
    const client = options.client ?? createMemoryClient(config.awsRegion);
    const texts: string[] = [],
      seenTokens = new Set<string>();
    let nextToken: string | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => reject(new Error("Memory deadline")),
        TIMEOUT_MS,
      );
    });
    try {
      for (let page = 0; page < MAX_PAGES; page++) {
        const result = await Promise.race([
          client.listMemoryRecords({
            memoryId: config.memoryId,
            namespacePath: `/parties/home-${scope.homeId}/party-${scope.partyId}`,
            ...(nextToken ? { nextToken } : {}),
          }),
          timeout,
        ]);
        if (texts.length + result.items.length > MAX_RECORDS)
          return { status: "unusable", preferences: [] };
        for (const item of result.items) texts.push(item.text);
        if (!result.nextToken) return recall(texts);
        if (seenTokens.has(result.nextToken))
          return { status: "unusable", preferences: [] };
        seenTokens.add(result.nextToken);
        nextToken = result.nextToken;
      }
      return { status: "unusable", preferences: [] };
    } finally {
      clearTimeout(timer);
    }
  } catch {
    console.error("[ROOM_PREFERENCE_RECALL_UNAVAILABLE]");
    return { status: "unavailable", preferences: [] };
  }
}
