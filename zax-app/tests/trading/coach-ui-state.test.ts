import { describe, expect, it } from "vitest";
import {
  COACH_CONVERSATION_LIMIT,
  COACH_HISTORY_LIMIT,
  coachStorageKey,
  commitCoachExchange,
  continuationHistory,
  parseCoachConversation,
  serializeCoachConversation,
  type CoachTurn,
} from "../../lib/trading/coach-ui-state";

const turn = (index: number): CoachTurn => ({
  id: `turn-${index}`,
  role: index % 2 ? "assistant" : "user",
  content: `message ${index}`,
  createdAt: 1_700_000_000_000 + index,
});

describe("coach UI state", () => {
  it("sends only the latest fourteen completed turns as continuation memory", () => {
    const turns = Array.from({ length: 20 }, (_, index) => turn(index));
    const history = continuationHistory(turns);

    expect(history).toHaveLength(COACH_HISTORY_LIMIT);
    expect(history[0]).toEqual({ role: "user", content: "message 6" });
    expect(history.at(-1)).toEqual({
      role: "assistant",
      content: "message 19",
    });
  });

  it("does not advance the transcript for an empty or invalid returned answer", () => {
    const original = [turn(1)];
    const next = commitCoachExchange(original, {
      id: "bad-response",
      user: "Explain confluence",
      assistant: "   ",
      createdAt: 1_700_000_100_000,
    });

    expect(next).toEqual(original);
  });

  it("commits a successful exchange with citation and context metadata", () => {
    const next = commitCoachExchange([], {
      id: "request-1",
      user: " Explain the setup ",
      assistant: "## Checklist\n- Confirm the level",
      createdAt: 1_700_000_100_000,
      model: "coach-model",
      sources: [{ id: "source-1", label: "My rulebook", kind: "library" }],
      contextStatus: ["Library source included"],
    });

    expect(next).toHaveLength(2);
    expect(next[0]).toMatchObject({
      role: "user",
      content: "Explain the setup",
    });
    expect(next[1]).toMatchObject({
      role: "assistant",
      model: "coach-model",
      sources: [{ id: "source-1", label: "My rulebook", kind: "library" }],
      contextStatus: ["Library source included"],
    });
  });

  it("bounds device storage and safely ignores corrupt persisted payloads", () => {
    const turns = Array.from(
      { length: COACH_CONVERSATION_LIMIT + 4 },
      (_, index) => turn(index),
    );
    const restored = parseCoachConversation(serializeCoachConversation(turns));

    expect(restored).toHaveLength(COACH_CONVERSATION_LIMIT);
    expect(restored[0].id).toBe("turn-4");
    expect(parseCoachConversation("not JSON")).toEqual([]);
  });

  it("normalizes legacy duplicate IDs without colliding with reserved suffixes", () => {
    const restored = parseCoachConversation(
      JSON.stringify({
        version: 1,
        turns: [
          { ...turn(1), id: "legacy" },
          { ...turn(2), id: "legacy" },
          { ...turn(3), id: "legacy-2" },
        ],
      }),
    );

    expect(restored.map(({ id }) => id)).toEqual([
      "legacy",
      "legacy-3",
      "legacy-2",
    ]);
    expect(restored.map(({ content }) => content)).toEqual([
      "message 1",
      "message 2",
      "message 3",
    ]);
  });

  it("keeps normalized transcript identities stable through storage round trips", () => {
    const legacy = JSON.stringify([
      { ...turn(1), id: "same" },
      { ...turn(2), id: "same" },
      { ...turn(3), id: "same-2" },
    ]);
    const first = parseCoachConversation(legacy);
    const serialized = serializeCoachConversation(first);

    expect(parseCoachConversation(serialized)).toEqual(first);
    expect(serializeCoachConversation(parseCoachConversation(serialized))).toBe(
      serialized,
    );
  });

  it("makes a remount-equivalent reused request exchange identity safe", () => {
    const existing: CoachTurn[] = [
      { ...turn(1), id: "coach-1:user" },
      { ...turn(2), id: "coach-1:assistant" },
      { ...turn(3), id: "coach-1:user-2" },
    ];
    const next = commitCoachExchange(existing, {
      id: "coach-1",
      user: "A fresh question",
      assistant: "A fresh completed answer",
      createdAt: 1_700_000_200_000,
    });

    expect(next.map(({ id }) => id)).toEqual([
      "coach-1:user",
      "coach-1:assistant",
      "coach-1:user-2",
      "coach-1:user-3",
      "coach-1:assistant-2",
    ]);
    expect(new Set(next.map(({ id }) => id)).size).toBe(next.length);
  });

  it("keeps only the newest sixty turns after a completed exchange", () => {
    const existing = Array.from(
      { length: COACH_CONVERSATION_LIMIT },
      (_, index) => turn(index),
    );
    const next = commitCoachExchange(existing, {
      id: "new-exchange",
      user: "new user turn",
      assistant: "new assistant turn",
      createdAt: 1_700_000_300_000,
    });

    expect(next).toHaveLength(COACH_CONVERSATION_LIMIT);
    expect(next[0]?.id).toBe("turn-2");
    expect(next.at(-2)?.id).toBe("new-exchange:user");
    expect(next.at(-1)?.id).toBe("new-exchange:assistant");
  });

  it("uses owner, scope, and source identity in the local conversation key", () => {
    expect(coachStorageKey("owner A", "general")).not.toBe(
      coachStorageKey("owner B", "general"),
    );
    expect(coachStorageKey("owner A", "library", "source-one")).not.toBe(
      coachStorageKey("owner A", "library", "source-two"),
    );
  });
});
