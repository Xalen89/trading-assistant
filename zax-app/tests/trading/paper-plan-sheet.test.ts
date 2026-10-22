import { describe, expect, it } from "vitest";
import {
  PAPER_RISK_TEMPLATES,
  normalizedPaperRiskPct,
} from "../../lib/trading/paper-risk-template";

describe("paper plan sheet risk templates", () => {
  it("keeps the approved 0.5% selection when the ticket opens instead of promoting it to 1%", () => {
    expect(PAPER_RISK_TEMPLATES).toContain(0.5);
    expect(normalizedPaperRiskPct(0.5)).toBe(0.5);
  });

  it("returns to the 0.5% reference template only for an unsupported selection", () => {
    expect(normalizedPaperRiskPct(0.75)).toBe(0.5);
  });
});
