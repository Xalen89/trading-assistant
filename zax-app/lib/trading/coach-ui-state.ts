export const COACH_HISTORY_LIMIT = 14;
export const COACH_CONVERSATION_LIMIT = 60;
export const COACH_STORAGE_VERSION = 1;

export type CoachRole = "user" | "assistant";

export type CoachCitation = {
  id: string;
  label: string;
  kind: string;
  asOf?: number;
};

export type CoachTurn = {
  id: string;
  role: CoachRole;
  content: string;
  createdAt: number;
  model?: string;
  sources?: CoachCitation[];
  contextStatus?: string[];
};

export type CoachHistoryTurn = Pick<CoachTurn, "role" | "content">;

export type CoachExchange = {
  id: string;
  user: string;
  assistant: string;
  createdAt: number;
  model?: string;
  sources?: CoachCitation[];
  contextStatus?: string[];
};

export function cleanCoachMessage(value: string, maxLength = 1600) {
  return value.replace(/\r\n?/g, "\n").trim().slice(0, maxLength);
}

export function coachStorageKey(
  ownerId: string | number,
  scope: "general" | "library",
  sourceId?: string,
) {
  return `stratdesk.coach.${encodeURIComponent(String(ownerId))}.${scope}.${encodeURIComponent(sourceId || "general")}.v${COACH_STORAGE_VERSION}`;
}

/** Only completed user/assistant turns are sent as continuation memory. */
export function continuationHistory(
  turns: readonly CoachTurn[],
  limit = COACH_HISTORY_LIMIT,
): CoachHistoryTurn[] {
  const safeLimit = Math.max(0, Math.floor(limit));
  return turns
    .filter(
      (turn) =>
        (turn.role === "user" || turn.role === "assistant") &&
        cleanCoachMessage(turn.content).length > 0,
    )
    .slice(-safeLimit)
    .map(({ role, content }) => ({ role, content }));
}

/**
 * Keep legacy device transcripts render-safe without dropping a completed turn.
 * Existing unique IDs always win; repeated IDs receive the first free numeric
 * suffix after every original ID has been reserved.
 */
function normalizeCoachTurnIds(turns: readonly CoachTurn[]): CoachTurn[] {
  const reserved = new Set(turns.map((turn) => turn.id));
  const assigned = new Set<string>();
  const nextSuffix = new Map<string, number>();

  return turns.map((turn) => {
    if (!assigned.has(turn.id)) {
      assigned.add(turn.id);
      return turn;
    }

    let suffix = nextSuffix.get(turn.id) ?? 2;
    let id = `${turn.id}-${suffix}`;
    while (reserved.has(id) || assigned.has(id)) {
      suffix += 1;
      id = `${turn.id}-${suffix}`;
    }
    nextSuffix.set(turn.id, suffix + 1);
    reserved.add(id);
    assigned.add(id);
    return { ...turn, id };
  });
}

/** Commit an exchange only after the server returns a valid assistant reply. */
export function commitCoachExchange(
  turns: readonly CoachTurn[],
  exchange: CoachExchange,
): CoachTurn[] {
  const user = cleanCoachMessage(exchange.user);
  const assistant = cleanCoachMessage(exchange.assistant, 12000);
  const normalizedTurns = normalizeCoachTurnIds(turns);
  if (!user || !assistant) {
    return normalizedTurns.slice(-COACH_CONVERSATION_LIMIT);
  }

  const createdAt = Number.isFinite(exchange.createdAt)
    ? exchange.createdAt
    : Date.now();
  const exchangeId =
    typeof exchange.id === "string" && exchange.id.trim()
      ? exchange.id
      : "coach-exchange";
  const completed: CoachTurn[] = [
    { id: `${exchangeId}:user`, role: "user", content: user, createdAt },
    {
      id: `${exchangeId}:assistant`,
      role: "assistant",
      content: assistant,
      createdAt,
      ...(exchange.model ? { model: exchange.model } : {}),
      ...(exchange.sources?.length ? { sources: exchange.sources } : {}),
      ...(exchange.contextStatus?.length
        ? { contextStatus: exchange.contextStatus }
        : {}),
    },
  ];
  return normalizeCoachTurnIds([...normalizedTurns, ...completed]).slice(
    -COACH_CONVERSATION_LIMIT,
  );
}

export function serializeCoachConversation(turns: readonly CoachTurn[]) {
  return JSON.stringify({
    version: COACH_STORAGE_VERSION,
    turns: normalizeCoachTurnIds(turns).slice(-COACH_CONVERSATION_LIMIT),
  });
}

/** Corrupt or stale device storage is ignored instead of shown to another owner. */
export function parseCoachConversation(raw: string | null): CoachTurn[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    const candidate = Array.isArray(parsed)
      ? parsed
      : parsed && typeof parsed === "object" && "turns" in parsed
        ? (parsed as { turns?: unknown }).turns
        : undefined;
    if (!Array.isArray(candidate)) return [];
    const turns = candidate
      .filter(isCoachTurn)
      .map(
        (turn): CoachTurn => ({
          id: turn.id,
          role: turn.role === "assistant" ? "assistant" : "user",
          content: cleanCoachMessage(turn.content, 12000),
          createdAt: turn.createdAt,
          ...(typeof turn.model === "string" ? { model: turn.model } : {}),
          sources: cleanCitations(turn.sources),
          contextStatus: cleanStrings(turn.contextStatus),
        }),
      )
      .filter((turn) => Boolean(turn.content))
      .slice(-COACH_CONVERSATION_LIMIT);
    return normalizeCoachTurnIds(turns);
  } catch {
    return [];
  }
}

function isCoachTurn(value: unknown): value is CoachTurn {
  if (!value || typeof value !== "object") return false;
  const turn = value as Partial<CoachTurn>;
  return (
    (turn.role === "user" || turn.role === "assistant") &&
    typeof turn.id === "string" &&
    typeof turn.content === "string" &&
    typeof turn.createdAt === "number" &&
    Number.isFinite(turn.createdAt)
  );
}

function cleanCitations(value: unknown): CoachCitation[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const citations = value
    .filter(
      (source): source is CoachCitation =>
        Boolean(source) &&
        typeof source === "object" &&
        typeof (source as CoachCitation).id === "string" &&
        typeof (source as CoachCitation).label === "string" &&
        typeof (source as CoachCitation).kind === "string",
    )
    .slice(0, 12)
    .map((source) => ({
      id: source.id.slice(0, 160),
      label: source.label.slice(0, 240),
      kind: source.kind.slice(0, 80),
      ...(typeof source.asOf === "number" && Number.isFinite(source.asOf)
        ? { asOf: source.asOf }
        : {}),
    }));
  return citations.length ? citations : undefined;
}

function cleanStrings(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const strings = value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim().slice(0, 480))
    .filter(Boolean)
    .slice(0, 12);
  return strings.length ? strings : undefined;
}
