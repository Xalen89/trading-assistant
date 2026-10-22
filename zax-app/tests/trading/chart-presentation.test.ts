import { describe, expect, it } from "vitest";
import {
  chartLineCaption,
  compactChartTick,
  showChartLineBadge,
} from "../../lib/trading/chart-presentation";
import type { PlotPriceLine } from "../../lib/trading/lightweight-payload";
import type { TickMarkType, Time } from "lightweight-charts";

// Synthetic presentation fixtures only, not market data or trading evidence.
const line = (patch: Partial<PlotPriceLine> = {}): PlotPriceLine => ({
  id: "unit-level",
  price: 100,
  label: "Confirmed prior-swing sweep with long evidence",
  color: "#abcdef",
  ...patch,
});
describe("clean chart presentation", () => {
  it("hides only setup captions/badges, leaving the supplied level intact", () => {
    const l = line({ origin: "level" });
    expect(chartLineCaption(l, false)).toBe("");
    expect(showChartLineBadge(l, false)).toBe(false);
    expect(chartLineCaption(l, true).length).toBeLessThanOrEqual(22);
    expect(showChartLineBadge(l, true)).toBe(true);
    expect(l.price).toBe(100);
    expect(l.label).toContain("long evidence");
  });
  it("always retains compact canonical Entry/SL/TP badges", () => {
    for (const [paperTone, text] of [
      ["entry", "Entry"],
      ["stop", "SL"],
      ["target", "TP"],
    ] as const) {
      const l = line({ origin: "paper", paperTone });
      expect(chartLineCaption(l, false)).toBe(text);
      expect(showChartLineBadge(l, false)).toBe(true);
    }
    expect(
      chartLineCaption(
        line({
          origin: "paper",
          paperTone: "stop",
          label: "WORKING SL · BREAK-EVEN",
        }),
        false,
      ),
    ).toBe("SL · BE");
  });
  it("retains replaced/partial lines but reserves their text badges for expanded labels", () => {
    const l = line({
      origin: "paper",
      paperTone: "original",
      id: "original-stop",
    });
    expect(chartLineCaption(l, false)).toBe("Prev SL");
    expect(showChartLineBadge(l, false)).toBe(false);
    expect(showChartLineBadge(l, true)).toBe(true);
  });
  it("uses short device-time ticks instead of the full date on every intraday tick", () => {
    const t = (Date.UTC(2026, 0, 2, 15, 4, 5) / 1000) as Time;
    expect(compactChartTick(t, 3 as TickMarkType)).toMatch(/^\d{2}:\d{2}$/);
    expect(compactChartTick(t, 4 as TickMarkType)).toMatch(
      /^\d{2}:\d{2}:\d{2}$/,
    );
    expect(compactChartTick(t, 0 as TickMarkType)).toBe("2026");
    expect(compactChartTick(t, 2 as TickMarkType).length).toBeLessThanOrEqual(
      8,
    );
    expect(compactChartTick("2026-01-02", 3 as TickMarkType)).toBe("");
  });
});
