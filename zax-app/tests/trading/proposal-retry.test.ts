import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ bars: vi.fn(), load: vi.fn(), db: vi.fn() }));
vi.mock("../../server/trading/access", () => ({ mayUseApp: () => true }));
vi.mock("../../server/trading/market", () => ({
  getCandles: mocks.bars,
  getQuote: vi.fn(),
}));
vi.mock("../../server/trading/repository", () => ({
  dbRequired: mocks.db,
  loadWorkspace: mocks.load,
}));
vi.mock("../../server/trading/setup-history", () => ({
  digest: (x: unknown) => JSON.stringify(x),
  retainBars: vi.fn(),
  retainedBars: vi.fn(),
  retainSetup: vi.fn(),
}));
vi.mock("../../lib/trading/setup-engine", () => ({
  analyzeSetups: (x: any) => ({
    candles: x.candles,
    messages: [],
    createdAt: Date.now(),
  }),
  proposePaper: vi.fn(),
}));
import { setupAnalysis } from "../../server/trading/setup-service";
import { WR1 } from "../../lib/trading/model";
const request = (id: string) => ({
  market: "BTC-USD",
  timeframe: "1m" as const,
  strategyIds: [id],
  strategies: [{ ...WR1, id }],
  combination: "any" as const,
  timezone: "America/New_York" as const,
});
const closed = () =>
  Array.from({ length: 20 }, (_, i) => ({
    time: Date.now() / 1000 - 1200 + i * 60,
    open: 100,
    high: 102,
    low: 99,
    close: 101,
    volume: 1,
  }));
describe("bounded single-flight source analysis · synthetic unit only", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(1700000400000);
    mocks.bars.mockReset();
    mocks.load.mockReset();
    mocks.db.mockReset();
    mocks.db.mockRejectedValue(new Error("UNIT heavy DB must not run"));
  });
  afterEach(() => vi.useRealTimers());
  it("does not read the full ledger for complete supplied local snapshots", async () => {
    mocks.bars.mockResolvedValue({
      candles: closed(),
      source: "UNIT_SYNTHETIC_SOURCE",
    });
    const result = await setupAnalysis(
      { id: -1 } as any,
      request("UNIT_FAST"),
      Date.now() + 25_000,
      { proposalOnly: true },
    );
    expect(result.candles).toHaveLength(20);
    expect(mocks.load).not.toHaveBeenCalled();
    expect(mocks.db).not.toHaveBeenCalled();
  });
  it("expires a stalled attempt so retry starts fresh rather than sharing timed-out work", async () => {
    mocks.bars
      .mockImplementationOnce(() => new Promise(() => {}))
      .mockImplementationOnce(() => new Promise(() => {}))
      .mockImplementationOnce(() => new Promise(() => {}));
    const first = setupAnalysis(
      { id: -2 } as any,
      request("UNIT_RETRY"),
      Date.now() + 25_000,
      { proposalOnly: true },
    );
    const rejected = expect(first).rejects.toThrow();
    await vi.advanceTimersByTimeAsync(25_001);
    await rejected;
    expect(mocks.bars).toHaveBeenCalledTimes(3);
    mocks.bars.mockResolvedValue({
      candles: closed(),
      source: "UNIT_SYNTHETIC_FRESH",
    });
    const next = await setupAnalysis(
      { id: -2 } as any,
      request("UNIT_RETRY"),
      Date.now() + 25_000,
      { proposalOnly: true },
    );
    expect(next.candles).toHaveLength(20);
    expect(mocks.bars).toHaveBeenCalledTimes(6);
  });
});
