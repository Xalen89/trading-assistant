import { describe, it, expect } from "vitest";
import { INDICATOR_PRESETS } from "../../lib/trading/indicator-presets";
import { indicatorCandidate } from "../../lib/trading/indicator-setups";
import { strategySchema } from "../../server/trading/validation";
const bars = Array.from({ length: 80 }, (_, i) => ({
  time: 1700000000 + i * 300,
  open: 100,
  high: 101,
  low: 99,
  close: 100,
  volume: i < 60 ? 100 : 10,
}));
describe("indicator support contracts · synthetic unit only", () => {
  it("never counts unknown broker volume as a met low-volume consolidation", () => {
    const s = INDICATOR_PRESETS.find((p) => p.id === "breakout-momentum")!;
    const c = indicatorCandidate(
      s,
      "breakout-momentum",
      bars,
      "5m",
      "TradeLocker · UNIT_BOOK_VOLUME_UNKNOWN",
      bars.at(-1)!.time + 301,
    );
    expect(c.steps.find((x) => x.id === "breakout-consolidation")?.status).toBe(
      "unknown",
    );
    expect(c.steps.find((x) => x.id === "breakout-rvol")?.status).toBe(
      "unknown",
    );
    expect(c.ready).toBe(false);
  });
  it("accepts declared added families without authorizing detector-by-name", () => {
    for (const s of INDICATOR_PRESETS)
      expect(
        strategySchema.safeParse({ ...s, setupFamily: s.id }).success,
      ).toBe(true);
  });
});
