import { describe, it, expect, vi } from "vitest";
const clock = vi.hoisted(() => ({ value: 0 }));
vi.mock("../../server/trading/tradelocker", () => ({
  brokerOwner: () => true,
}));
vi.mock("../../server/trading/quant-data", () => ({ quantHistory: vi.fn() }));
vi.mock("../../server/trading/venue-depth", () => ({
  venueDepth: async () => {
    clock.value += 2000;
    return {
      symbol: "BTC-USD",
      source: "Coinbase Exchange · synthetic unit fixture — not live evidence",
      receivedAt: clock.value,
      bids: [[100, 1]],
      asks: [[101, 1]],
      tickSize: 0.01,
      lotSize: 0.01,
      status: "polled",
    };
  },
}));
import { quantRouter } from "../../server/trading/quant-router";
import { DEFAULT_QUANT_SETTINGS } from "../../lib/trading/quant-lab-types";
describe("Quant router timing — synthetic no-DB fixtures", () => {
  it("evaluates a book at completion rather than the older request-start clock", async () => {
    const start = Date.UTC(2026, 9, 17, 12, 0);
    clock.value = start;
    const spy = vi.spyOn(Date, "now").mockImplementation(() => clock.value);
    try {
      const caller = quantRouter.createCaller({
        user: { id: 99999, openId: "synthetic-unit-owner", role: "user" },
        req: {},
        res: {},
      } as never);
      const result = await caller.run({
        family: "making",
        symbols: ["BTC-USD"],
        timeframe: "1d",
        bars: 60,
        settings: DEFAULT_QUANT_SETTINGS,
      });
      expect(result.result.status, result.result.summary).toBe("ready");
      expect(result.result.asOf).toBe(start + 2000);
    } finally {
      spy.mockRestore();
    }
  });
});
