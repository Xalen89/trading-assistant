import { describe, it, expect, vi } from "vitest";
import type { Strategy } from "../../lib/trading/model";
import type {
  SetupAnalysis,
  SetupCandidate,
  PaperProposal,
} from "../../lib/trading/setup-model";
import { draftConfluence } from "../../lib/trading/confluence-runtime";
vi.mock("../../server/trading/setup-service", () => ({
  setupAnalysis: vi.fn(),
}));
import {
  enforceStrategyGate,
  paperEntryEvidence,
} from "../../server/trading/paper-gate";
const now = Date.now(),
  cut = Math.floor(now / 300000) * 300,
  base: Strategy = {
    id: "unit-core",
    name: "Synthetic test only",
    description: "Unit fixture",
    color: "#FFFFFF",
    kind: "strategy",
    visible: true,
    version: 1,
    factors: [],
  };
const candidate: SetupCandidate = {
  id: "unit-long",
  family: "core-sequence",
  side: "long",
  strategyId: base.id,
  strategyVersion: 1,
  name: "Unit",
  ready: false,
  source: "Synthetic unit source",
  zones: [],
  steps: [
    { id: "retest", name: "Retest", status: "met", evidence: "Fixture" },
    { id: "mss", name: "MSS", status: "met", evidence: "Fixture" },
  ],
};
const analysis = {
  market: "UNIT",
  timeframe: "5m",
  asOf: cut,
  source: "Synthetic unit source",
  candles: [
    { time: cut - 300, open: 100, high: 110, low: 90, close: 105, volume: 1 },
  ],
  candidates: [candidate],
  combination: "all",
  selectedStrategyIds: [base.id],
} as SetupAnalysis;
const config = draftConfluence(base, candidate, "5m");
config.contract.approval = {
  status: "approved",
  approvedAt: cut * 1000,
  approvedBy: "unit-test",
};
const strategy = { ...base, confluence: config };
const proposal = {
  side: "long",
  strategyIds: [base.id],
  strategyVersions: [1],
  analysis,
} as PaperProposal;
describe("Two-mode gate authority — synthetic fixtures only", () => {
  it("permits genuinely approved distinct trigger+condition, despite candidate.ready false", () => {
    expect(
      enforceStrategyGate(proposal, [strategy], analysis, (cut + 20) * 1000)[
        base.id
      ].strategyEntryEligible,
    ).toBe(true);
  });
  it("does not turn missing config or wrong direction into strategy approval", () => {
    expect(() =>
      enforceStrategyGate(proposal, [base], analysis, (cut + 20) * 1000),
    ).toThrow();
    expect(() =>
      enforceStrategyGate(
        { ...proposal, side: "short" },
        [strategy],
        analysis,
        (cut + 20) * 1000,
      ),
    ).toThrow();
  });
  it("blocks a stale closed bar after rollover and pending source condition", () => {
    expect(() =>
      enforceStrategyGate(proposal, [strategy], analysis, (cut + 301) * 1000),
    ).toThrow();
    const pending = {
      ...analysis,
      candidates: [
        {
          ...candidate,
          steps: candidate.steps.map((s) =>
            s.id === "mss" ? { ...s, status: "unknown" as const } : s,
          ),
        },
      ],
    };
    expect(() =>
      enforceStrategyGate(proposal, [strategy], pending, (cut + 20) * 1000),
    ).toThrow();
  });
  it("keeps manual practice available with an explicit unknown snapshot, not a fabricated score", async () => {
    const record = await paperEntryEvidence(
      { id: 1 } as never,
      proposal,
      null,
      "practice",
    );
    expect(record.snapshots).toHaveLength(1);
    expect(record.snapshots[0].deterministicScore).toBeNull();
    expect(record.snapshots[0].strategyEntryEligible).toBe(false);
  });
  it("requires canonical saved approval for strategy mode", async () => {
    await expect(
      paperEntryEvidence({ id: 1 } as never, proposal, null, "strategy"),
    ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
  });
});
