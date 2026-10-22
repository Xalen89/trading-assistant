import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  parseBookSide,
  assertNormalBook,
  closeVenueStreams,
} from "../../server/trading/venue-depth";
import { quantHistory } from "../../server/trading/quant-data";
const mocks = vi.hoisted(() => ({
  fetch: vi.fn(),
  candles: vi.fn(),
  owner: vi.fn(),
}));
vi.mock("../../server/trading/market", () => ({
  cached: async (_k: string, _ttl: number, fn: () => unknown) => fn(),
  jsonFetch: mocks.fetch,
  getCandles: mocks.candles,
  marketById: (id: string) => ({
    id,
    provider: "coinbase",
    providerSymbol: id,
  }),
}));
vi.mock("../../server/trading/tradelocker", () => ({
  isBrokerMarket: (id: string) => id.startsWith("TL:"),
  requireBrokerOwner: mocks.owner,
}));
describe("Real provider contract processing — synthetic unit fixtures only", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    closeVenueStreams();
  });
  it("treats aggregated size as size, not multiplied by order count", () => {
    expect(
      parseBookSide(
        [
          ["100", "2", 99],
          ["101", "3", 44],
        ],
        true,
      ),
    ).toEqual([
      [101, 3],
      [100, 2],
    ]);
  });
  it("drops invalid levels and forbids crossed/auction plans", () => {
    expect(
      parseBookSide(
        [
          ["NaN", "2"],
          [100, -2],
          [100, 2],
        ],
        false,
      ),
    ).toEqual([[100, 2]]);
    expect(() => assertNormalBook([[101, 2]], [[100, 2]])).toThrow();
    expect(() => assertNormalBook([[99, 2]], [[100, 2]], true)).toThrow();
  });
  it("requests <=300 bounded buckets, deduplicates actual bars and retains gaps", async () => {
    const step = 86400,
      end = Math.floor(Date.now() / 1000 / step) * step;
    const sample = [end - step, end - 3 * step].map((t) => [
      t,
      90,
      110,
      100,
      105,
      8,
    ]);
    mocks.fetch.mockResolvedValue([...sample, ...sample]);
    const result = await quantHistory("BTC-USD", "1d", {} as never, 60);
    expect(result.candles).toHaveLength(2);
    expect(result.candles[1].time - result.candles[0].time).toBe(2 * step);
    expect(result.provenance).toBe("provider");
    const url = new URL(mocks.fetch.mock.calls[0][0]);
    expect(
      (Date.parse(url.searchParams.get("end")!) -
        Date.parse(url.searchParams.get("start")!)) /
        1000 /
        step,
    ).toBeLessThanOrEqual(300);
  });
  it("checks broker ownership before using a historical source", async () => {
    mocks.owner.mockImplementation(() => {
      throw new Error("owner required");
    });
    await expect(quantHistory("TL:1", "1d", {} as never, 60)).rejects.toThrow(
      "owner required",
    );
    expect(mocks.candles).not.toHaveBeenCalled();
  });
});

describe("Derived history — fixture-only source safety", () => {
  beforeEach(() => vi.clearAllMocks());
  it("uses actual 15m Coinbase periods for 30m history and never transports granularity 1800", async () => {
    const step = 900;
    const now = Math.floor(Date.now() / 1000 / 1_800) * 1_800;
    const rows = Array.from({ length: 9 }, (_, index) => {
      const value = 100 + index;
      return [now - (8 - index) * step, value - 1, value + 2, value, value + 0.5, value];
    });
    mocks.fetch.mockResolvedValue(rows);

    const result = await quantHistory("BTC-USD", "30m", {} as never, 60);

    expect(result.candles).toHaveLength(4);
    expect(result.candles[0]).toMatchObject({
      time: now - 8 * step,
      open: 100,
      high: 103,
      low: 99,
      close: 101.5,
      volume: 201,
    });
    expect(result.candles.at(-1)?.time).toBe(now - 2 * step);
    expect(result.source).toContain("complete contiguous 15m periods");
    expect(
      mocks.fetch.mock.calls.every(
        ([url]) => new URL(url).searchParams.get("granularity") === "900",
      ),
    ).toBe(true);
  });

  it("forwards the production deadline and excludes the incomplete 4h bucket", async () => {
    const now = Math.floor(Date.now() / 1000 / 14400) * 14400;
    const rows = Array.from({ length: 14 }, (_, i) => {
      const t = now - 12 * 3600 + i * 3600;
      return [t, 90, 110, 100, 105, 8];
    });
    mocks.fetch.mockResolvedValue(rows);
    const deadline = Date.now() + 10000;
    const result = await quantHistory(
      "BTC-USD",
      "4h",
      {} as never,
      60,
      deadline,
    );
    expect(result.candles).toHaveLength(3);
    expect(result.candles.every((c) => c.time + 14400 <= now)).toBe(true);
    expect(mocks.fetch.mock.calls.every((call) => call[2] === deadline)).toBe(
      true,
    );
    expect(result.source).toContain("complete 1h buckets");
  });
});
