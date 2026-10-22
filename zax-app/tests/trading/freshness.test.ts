import { describe, expect, it } from "vitest";
import {
  DAILY_CLOSED_BAR_FRESHNESS_CAP_SECONDS,
  QUOTE_STALE_AFTER_SECONDS,
  WEEKLY_CLOSED_BAR_FRESHNESS_CAP_SECONDS,
  closedBarFreshness,
  closedBarStaleAfterSeconds,
  quoteFreshnessAt,
} from "../../lib/trading/freshness";

const DAY = 86_400;
const HOUR = 3_600;

describe("central market freshness policy", () => {
  it("keeps one 120-second provider-timestamp quote policy", () => {
    expect(quoteFreshnessAt(1_000, 1_120).status).toBe("live");
    expect(quoteFreshnessAt(1_000, 1_120.001)).toMatchObject({
      status: "stale",
      staleAfterSeconds: QUOTE_STALE_AFTER_SECONDS,
    });
    expect(quoteFreshnessAt(1_100, 1_000)).toMatchObject({
      status: "stale",
      reason: expect.stringMatching(/future/i),
    });
  });

  it("uses bar completion rather than opening time and applies daily/weekly caps", () => {
    expect(closedBarStaleAfterSeconds("1d")).toBe(
      DAILY_CLOSED_BAR_FRESHNESS_CAP_SECONDS,
    );
    expect(closedBarStaleAfterSeconds("1w")).toBe(
      WEEKLY_CLOSED_BAR_FRESHNESS_CAP_SECONDS,
    );
    const dailyOpen = 1_700_000_000;
    expect(
      closedBarFreshness({
        timeframe: "1d",
        latestClosedBar: dailyOpen,
        nowSeconds:
          dailyOpen + DAY + DAILY_CLOSED_BAR_FRESHNESS_CAP_SECONDS + 1,
      }),
    ).toMatchObject({ status: "stale", closeAgeSeconds: DAILY_CLOSED_BAR_FRESHNESS_CAP_SECONDS + 1 });
  });

  it("does not falsely stale a Monday-completed weekly bar during the following week", () => {
    const monday = Date.UTC(2024, 0, 1) / 1_000;
    const completedAt = monday + 7 * DAY;
    const throughSunday = closedBarFreshness({
      timeframe: "1w",
      latestClosedBar: monday,
      nowSeconds: completedAt + 6 * DAY + HOUR,
    });
    const afterPolicy = closedBarFreshness({
      timeframe: "1w",
      latestClosedBar: monday,
      nowSeconds: completedAt + WEEKLY_CLOSED_BAR_FRESHNESS_CAP_SECONDS + 1,
    });
    expect(throughSunday).toMatchObject({
      status: "fresh",
      completedAt,
      staleAfterSeconds: WEEKLY_CLOSED_BAR_FRESHNESS_CAP_SECONDS,
    });
    expect(afterPolicy.status).toBe("stale");
  });

  it("distinguishes a stale source receipt from bar-close age and reports declared closure separately", () => {
    const now = 1_800_000_000;
    const receiptStale = closedBarFreshness({
      timeframe: "1h",
      latestClosedBar: now - HOUR,
      sourceReceivedAt: now - 2 * HOUR - 1,
      nowSeconds: now,
    });
    const declaredClosure = closedBarFreshness({
      timeframe: "1h",
      latestClosedBar: now - HOUR,
      calendarState: "closed",
      nowSeconds: now,
    });
    expect(receiptStale).toMatchObject({
      status: "stale",
      closeAgeSeconds: 0,
      reason: expect.stringMatching(/receipt/i),
    });
    expect(declaredClosure).toMatchObject({
      status: "fresh",
      calendarState: "closed",
      calendarNote: expect.stringMatching(/separately/i),
    });
  });
});
