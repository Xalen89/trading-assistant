import { describe, it, expect, vi } from "vitest";
import { SessionBackgroundPrimitive } from "../../lib/trading/session-background-primitive";
import type { ChartSessionBox } from "../../lib/trading/chart-sessions";
import { backgroundStrategyStatusFromRows } from "../../server/trading/background-strategy-status";
import {
  activateSchedule,
  schedulerTaskUidFromJwtIdentity,
  scheduledSessionAutoWork,
  setupAlertSignalIdentity,
} from "../../server/trading/notifications";

// Synthetic timestamps/canvas mock only: not market evidence or device verification.
const box: ChartSessionBox = {
  id: "UNIT",
  session: "new-york",
  label: "New York",
  timezone: "America/New_York",
  from: 1000,
  to: 1200,
  startsAt: 1000,
  endsAt: 1600,
  clipped: true,
  color: "#D8F36A",
  row: 2,
};
const candles = [
  { time: 1000, open: 100, high: 101, low: 99, close: 100, volume: 1 },
];
function fixture() {
  const context = Object.fromEntries(
    [
      "save",
      "restore",
      "scale",
      "beginPath",
      "rect",
      "clip",
      "fillRect",
      "strokeRect",
      "fillText",
    ].map((name) => [name, vi.fn()]),
  );
  const requestUpdate = vi.fn();
  const primitive = new SessionBackgroundPrimitive();
  primitive.attached({
    chart: {
      timeScale: () => ({
        timeToCoordinate: (time: number) => (time === 1000 ? 10 : null),
        options: () => ({ barSpacing: 60 }),
      }),
    },
    requestUpdate,
  } as any);
  const target = {
    useBitmapCoordinateSpace: (fn: (scope: any) => void) =>
      fn({
        context,
        bitmapSize: { width: 400, height: 600 },
        horizontalPixelRatio: 2,
        verticalPixelRatio: 2,
      }),
  };
  const draw = () => (primitive.paneViews()[0].renderer() as any).draw(target);
  return { context, requestUpdate, primitive, draw };
}

describe("session backgrounds are bounded display-only decoration", () => {
  it("draws subtle rectangles at bottom z-order and never contributes autoscale or price data", () => {
    const { primitive, context, draw, requestUpdate } = fixture();
    primitive.set([box], candles, 300);
    expect(primitive.paneViews()[0].zOrder?.()).toBe("bottom");
    expect("autoscaleInfo" in primitive).toBe(false);
    draw();
    expect(requestUpdate).toHaveBeenCalledOnce();
    expect(context.rect).toHaveBeenCalledWith(0, 0, 200, 300);
    expect(context.fillRect).toHaveBeenCalledWith(10, 0, 40, 300);
    expect(candles[0].close).toBe(100);
  });
  it("redraws to zero boxes when switched off, keeping source candles untouched", () => {
    const { primitive, context, draw } = fixture();
    primitive.set([box], candles, 300);
    draw();
    const calls = context.fillRect.mock.calls.length;
    primitive.set([], candles, 300);
    draw();
    expect(primitive.count).toBe(0);
    expect(context.fillRect).toHaveBeenCalledTimes(calls);
    primitive.detached();
    draw();
    expect(context.fillRect).toHaveBeenCalledTimes(calls);
  });
  it("rejects malformed/unsafe boxes and limits retained draw work", () => {
    const { primitive } = fixture();
    primitive.set(
      [
        { ...box, color: "url(unsafe)" },
        { ...box, to: NaN },
        { ...box, row: 100 },
      ],
      candles,
      300,
    );
    expect(primitive.count).toBe(0);
    primitive.set(
      Array.from({ length: 400 }, (_, i) => ({ ...box, id: String(i) })),
      candles,
      300,
    );
    expect(primitive.count).toBe(256);
  });
});

describe("closed-app session monitoring status fixtures", () => {
  it("does not turn a mapped task or device registration into a verified delivery claim", () => {
    const now = Date.now();
    const status = backgroundStrategyStatusFromRows({
      taskUid: "task-owner-only",
      heartbeat: {
        taskUid: "task-owner-only",
        lastScheduledHeartbeat: now - 1_000,
        eventCount: 0,
      },
      devicePushRegistered: true,
    });
    expect(status).toMatchObject({
      registeredTask: "task-owner-only",
      schedulerRegistered: true,
      lastScheduledHeartbeat: now - 1_000,
      devicePushRegistered: true,
      deviceVerified: false,
    });
  });

  it("rejects an unmatched, future, or absent heartbeat rather than faking activation", () => {
    const future = Date.now() + 60_000;
    expect(
      backgroundStrategyStatusFromRows({
        taskUid: "task-a",
        heartbeat: { taskUid: "task-b", lastScheduledHeartbeat: Date.now() },
      }).lastScheduledHeartbeat,
    ).toBeNull();
    expect(
      backgroundStrategyStatusFromRows({
        taskUid: "task-a",
        heartbeat: { taskUid: "task-a", lastScheduledHeartbeat: future },
      }).lastScheduledHeartbeat,
    ).toBeNull();
    expect(
      backgroundStrategyStatusFromRows({ devicePushRegistered: true }),
    ).toMatchObject({
      schedulerRegistered: false,
      registeredTask: null,
      lastScheduledHeartbeat: null,
      deviceVerified: false,
    });
  });
});

describe("new session-family setup deduplication fixtures", () => {
  const base = {
    source: "UNIT source gateway",
    candles: [
      { time: 1_700_000_000, open: 100, high: 101, low: 99, close: 100, volume: 10 },
    ],
    candidates: [
      {
        id: "pdc-ready",
        family: "pdc-continuation",
        side: "long",
        strategyId: "pdc-strategy",
        strategyVersion: 1,
        name: "PDC",
        ready: true,
        steps: [],
        zones: [],
        source: "UNIT",
      },
      {
        id: "missing-critical-guard",
        family: "initial-balance",
        side: "long",
        strategyId: "ib-strategy",
        strategyVersion: 1,
        name: "IB",
        ready: false,
        steps: [],
        zones: [{ id: "must-not-enter-key", strategyId: "ib-strategy" }],
        source: "UNIT",
      },
    ],
    sessionContexts: [
      {
        strategyId: "pdc-strategy",
        quoteEvidence: {
          previous: { symbol: "TL:1", price: 99, timestamp: 10, source: "UNIT gateway", status: "live" },
          current: { symbol: "TL:1", price: 101, timestamp: 11, source: "UNIT gateway", status: "live" },
        },
      },
    ],
  };

  it("keeps same closed-bar and quote-pair alerts deterministic but changes with new PDC proof", () => {
    const first = setupAlertSignalIdentity(base as any);
    expect(setupAlertSignalIdentity(base as any)).toBe(first);
    expect(first).not.toContain("must-not-enter-key");
    const changed = structuredClone(base);
    changed.sessionContexts[0].quoteEvidence.current.timestamp = 12;
    expect(setupAlertSignalIdentity(changed as any)).not.toBe(first);
  });
});

describe("scheduled session paper work reporting", () => {
  it("accepts only matching non-expired cron JWT/SDK task mapping, never request body IDs", () => {
    const now = 1_800_000_000;
    const jwt = { appId: "private-project", exp: now + 60, openId: "cron_owner" };
    const sdkMapping = { taskUid: "task-from-platform-jwt", openId: "cron_owner" };
    const untrustedBody = { userId: 123, taskUid: "task-from-body" };
    expect(untrustedBody.taskUid).not.toBe(sdkMapping.taskUid);
    expect(
      schedulerTaskUidFromJwtIdentity(jwt, sdkMapping, "private-project", now),
    ).toBe("task-from-platform-jwt");
    expect(
      schedulerTaskUidFromJwtIdentity(
        jwt,
        { taskUid: "task-from-body", openId: "cron_another-owner" },
        "private-project",
        now,
      ),
    ).toBeUndefined();
    expect(
      schedulerTaskUidFromJwtIdentity(
        { ...jwt, exp: now },
        sdkMapping,
        "private-project",
        now,
      ),
    ).toBeUndefined();
  });

  it("reports absent canonical opt-in and missing source readiness as blocked work", () => {
    expect(
      scheduledSessionAutoWork({
        state: "off",
        checkedAt: 1,
        message: "No armed canonical session consent.",
      }),
    ).toMatchObject({ state: "blocked-work", result: "off" });
    expect(
      scheduledSessionAutoWork({
        state: "waiting",
        checkedAt: 1,
        message: "Current source evidence is unavailable.",
      }),
    ).toMatchObject({ state: "blocked-work", result: "waiting" });
    expect(
      scheduledSessionAutoWork({
        state: "busy",
        checkedAt: 1,
        message: "The bounded owner lock is in use.",
      }),
    ).toMatchObject({ state: "deferred", result: "busy" });
  });

  it("never creates a schedule in test/development before any database or job call", async () => {
    await expect(activateSchedule(999_999, "untrusted-session")).rejects.toMatchObject({
      code: "PRECONDITION_FAILED",
    });
  });
});
