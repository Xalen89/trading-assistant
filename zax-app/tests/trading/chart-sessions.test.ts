import { describe, expect, it } from "vitest";
import {
  buildSessionBoxes,
  DEFAULT_SESSION_OVERLAY,
  SESSION_DEFINITIONS,
  type SessionId,
  type SessionOverlayPrefs,
} from "../../lib/trading/chart-sessions";
import type { Candle, Timeframe } from "../../lib/trading/model";

// Synthetic Unix timestamps only: these fixtures are not market history or session evidence.
const utc = (year: number, month: number, day: number, hour = 0, minute = 0) =>
  Date.UTC(year, month - 1, day, hour, minute) / 1_000;
const candles = (...times: number[]): readonly Pick<Candle, "time">[] =>
  times.map((time) => ({ time }));
const selected = (...sessions: SessionId[]): SessionOverlayPrefs => ({
  enabled: true,
  sessions,
});
const session = (
  id: SessionId,
  boxes: ReturnType<typeof buildSessionBoxes>,
) => boxes.find((box) => box.session === id);

const build = (
  times: readonly number[],
  timeframe: Timeframe,
  preferences: SessionOverlayPrefs,
  now: number,
) => buildSessionBoxes(candles(...times), timeframe, preferences, now);

describe("synthetic chart session time bands", () => {
  it("publishes the requested analytical local schedules and default optionality", () => {
    expect(SESSION_DEFINITIONS).toEqual([
      expect.objectContaining({
        id: "asia",
        timezone: "Asia/Tokyo",
        startHour: 9,
        endHour: 18,
        color: "#B8A2FF",
        row: 0,
      }),
      expect.objectContaining({
        id: "london",
        timezone: "Europe/London",
        startHour: 8,
        endHour: 17,
        color: "#8EC5FF",
        row: 1,
      }),
      expect.objectContaining({
        id: "new-york",
        timezone: "America/New_York",
        startHour: 8,
        endHour: 17,
        color: "#D8F36A",
        row: 2,
      }),
      expect.objectContaining({
        id: "sydney",
        timezone: "Australia/Sydney",
        startHour: 8,
        endHour: 17,
        color: "#F4C878",
        row: 3,
      }),
    ]);
    expect(DEFAULT_SESSION_OVERLAY).toEqual({
      enabled: true,
      sessions: ["asia", "london", "new-york"],
    });
  });

  it("uses exact synthetic summer and winter UTC boundaries for London and New York", () => {
    const winter = build(
      [utc(2026, 1, 15, 8), utc(2026, 1, 15, 13)],
      "1h",
      selected("london", "new-york"),
      utc(2026, 1, 16),
    );
    expect(session("london", winter)).toMatchObject({
      startsAt: utc(2026, 1, 15, 8),
      endsAt: utc(2026, 1, 15, 17),
    });
    expect(session("new-york", winter)).toMatchObject({
      startsAt: utc(2026, 1, 15, 13),
      endsAt: utc(2026, 1, 15, 22),
    });

    const summer = build(
      [utc(2026, 7, 15, 7), utc(2026, 7, 15, 12)],
      "1h",
      selected("london", "new-york"),
      utc(2026, 7, 16),
    );
    expect(session("london", summer)).toMatchObject({
      startsAt: utc(2026, 7, 15, 7),
      endsAt: utc(2026, 7, 15, 16),
    });
    expect(session("new-york", summer)).toMatchObject({
      startsAt: utc(2026, 7, 15, 12),
      endsAt: utc(2026, 7, 15, 21),
    });
  });

  it("keeps London and New York DST transition weeks independent", () => {
    // US daylight time has begun; UK daylight time has not yet begun.
    const boxes = build(
      [utc(2026, 3, 15, 8), utc(2026, 3, 15, 12)],
      "1h",
      selected("london", "new-york"),
      utc(2026, 3, 16),
    );
    expect(session("london", boxes)).toMatchObject({
      startsAt: utc(2026, 3, 15, 8),
      endsAt: utc(2026, 3, 15, 17),
    });
    expect(session("new-york", boxes)).toMatchObject({
      startsAt: utc(2026, 3, 15, 12),
      endsAt: utc(2026, 3, 15, 21),
    });
  });

  it("converts Sydney daytime across the prior UTC calendar date", () => {
    const boxes = build(
      [utc(2026, 6, 14, 22)],
      "1h",
      selected("sydney"),
      utc(2026, 6, 16),
    );
    expect(session("sydney", boxes)).toMatchObject({
      startsAt: utc(2026, 6, 14, 22),
      endsAt: utc(2026, 6, 15, 7),
      timezone: "Australia/Sydney",
    });
  });

  it("retains overlapping time-only sessions without price bounds", () => {
    const boxes = build(
      [utc(2026, 7, 15, 7), utc(2026, 7, 15, 12)],
      "1h",
      selected("london", "new-york"),
      utc(2026, 7, 16),
    );
    const london = session("london", boxes)!;
    const newYork = session("new-york", boxes)!;
    expect(Math.max(london.startsAt, newYork.startsAt)).toBe(utc(2026, 7, 15, 12));
    expect(Math.min(london.endsAt, newYork.endsAt)).toBe(utc(2026, 7, 15, 16));
    expect(Object.keys(london).sort()).toEqual([
      "clipped",
      "color",
      "endsAt",
      "from",
      "id",
      "label",
      "row",
      "session",
      "startsAt",
      "timezone",
      "to",
    ]);
  });

  it("clips an active session to the supplied chart extent and deterministic now", () => {
    const now = utc(2026, 7, 15, 16, 30);
    const boxes = build(
      [utc(2026, 7, 15, 16)],
      "1h",
      selected("new-york"),
      now,
    );
    expect(session("new-york", boxes)).toMatchObject({
      startsAt: utc(2026, 7, 15, 12),
      endsAt: utc(2026, 7, 15, 21),
      from: utc(2026, 7, 15, 16),
      to: now,
      clipped: true,
    });
  });

  it("includes a supplied weekend interval but never makes a box for a sparse gap", () => {
    const weekend = build(
      [utc(2026, 1, 3, 8)],
      "1h",
      selected("london"),
      utc(2026, 1, 4),
    );
    expect(session("london", weekend)?.startsAt).toBe(utc(2026, 1, 3, 8));

    const sparse = build(
      [utc(2026, 1, 5, 0), utc(2026, 1, 5, 23)],
      "1h",
      selected("london"),
      utc(2026, 1, 6),
    );
    expect(sparse).toEqual([]);
  });

  it("ignores future/replay and invalid timestamps, and omits long or unknown frames", () => {
    const now = utc(2026, 7, 15, 12, 30);
    const current = [utc(2026, 7, 15, 12)];
    expect(
      buildSessionBoxes(candles(...current), "1h", { enabled: false, sessions: ["new-york"] }, now),
    ).toEqual([]);
    expect(build(current, "1h", selected(), now)).toEqual([]);
    const onlyCurrent = build(
      [utc(2026, 7, 15, 12), utc(2026, 7, 15, 13)],
      "1h",
      selected("new-york"),
      now,
    );
    expect(onlyCurrent).toHaveLength(1);
    expect(onlyCurrent[0]).toMatchObject({ from: utc(2026, 7, 15, 12), to: now });
    expect(onlyCurrent.every((box) => box.to <= now)).toBe(true);

    expect(
      buildSessionBoxes(
        [{ time: 0 }, { time: -1 }, { time: 1.5 }, { time: Infinity }] as Pick<
          Candle,
          "time"
        >[],
        "1h",
        selected("london"),
        now,
      ),
    ).toEqual([]);
    expect(build([utc(2026, 7, 15, 12)], "1d", selected("new-york"), now)).toEqual([]);
    expect(build([utc(2026, 7, 15, 12)], "1w", selected("new-york"), now)).toEqual([]);
    expect(
      buildSessionBoxes(
        candles(utc(2026, 7, 15, 12)),
        "unknown" as Timeframe,
        selected("new-york"),
        now,
      ),
    ).toEqual([]);
  });

  it("deduplicates timestamps and keeps no more than the latest 256 boxes from 3,000 inputs", () => {
    const start = utc(2020, 1, 1);
    const interval = 4 * 60 * 60;
    const times = Array.from({ length: 3_001 }, (_, index) => start + index * interval);
    const boxes = build(
      [...times, times[0]],
      "4h",
      selected("london"),
      times.at(-1)! + interval,
    );
    expect(boxes).toHaveLength(256);
    expect(new Set(boxes.map((box) => box.id)).size).toBe(boxes.length);
    expect(boxes.every((box, index) => index === 0 || box.startsAt >= boxes[index - 1].startsAt)).toBe(true);
  });
});
