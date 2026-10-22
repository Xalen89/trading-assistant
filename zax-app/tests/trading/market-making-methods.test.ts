import { describe, expect, it } from "vitest";
import {
  calculateBboImbalance,
  educationalBboCrossScenario,
  proposeAvellanedaStoikovPaperQuotes,
  proposePmmPaperLevels,
} from "../../lib/trading/market-making-methods";

const NOW = 1_800_000_000_000;
const SYNTHETIC_SOURCE =
  "SYNTHETIC unit fixture only; not market data, execution, or performance evidence";

function book(overrides: Record<string, unknown> = {}) {
  return {
    symbol: "SYNTH-USD",
    source: SYNTHETIC_SOURCE,
    receivedAt: NOW - 10,
    status: "streamed" as const,
    tickSize: 0.1,
    lotSize: 0.01,
    bids: [[99.9, 5]] as [number, number][],
    asks: [[100.1, 2]] as [number, number][],
    ...overrides,
  };
}

const costs = { feeBps: 1, expectedSlippageBps: 2 };
const risk = { currentEquity: 1_000, equityRiskCap: 25, maxInventory: 0.1 };

describe("clean-room paper market-making methods", () => {
  it("applies the published Avellaneda-Stoikov reservation-price and spread formulas without mutating synthetic inventory", () => {
    const syntheticInventory = 0.02;
    const proposal = proposeAvellanedaStoikovPaperQuotes({
      book: book(),
      now: NOW,
      staleAfterMs: 1_000,
      costs,
      risk,
      syntheticInventory,
      targetInventory: 0,
      gamma: 0.1,
      volatility: 0.02,
      tau: 1,
      kappa: 1,
      requestedOrderSize: 0.03,
      minimumSpreadBps: 0,
    });

    const modelSpread = 0.1 * 0.02 ** 2 + (2 * Math.log(1 + 0.1 / 1)) / 0.1;
    expect(proposal.available).toBe(true);
    expect(proposal.reservationPrice).toBeCloseTo(
      100 - syntheticInventory * 0.1 * 0.02 ** 2,
    );
    expect(proposal.modelSpread).toBeCloseTo(modelSpread);
    expect(proposal.diagnostics?.syntheticInventory).toBe(syntheticInventory);
    expect(proposal.diagnostics?.expectedSlippagePerSide).toBeCloseTo(0.02);
    expect(proposal.diagnostics?.costSource).toContain("caller-supplied");
    expect(JSON.stringify(proposal)).not.toContain('"fill"');
    for (const level of [...proposal.bidLevels, ...proposal.askLevels]) {
      expect(level.price / 0.1).toBeCloseTo(Math.round(level.price / 0.1));
      expect(level.quantity / 0.01).toBeCloseTo(
        Math.round(level.quantity / 0.01),
      );
      expect(level.notional).toBeLessThanOrEqual(risk.equityRiskCap);
    }
  });

  it("invalidates stale and future WebSocket receipts rather than proposing a current quote", () => {
    const stale = proposePmmPaperLevels({
      book: book({ receivedAt: NOW - 1_001 }),
      now: NOW,
      staleAfterMs: 1_000,
      costs,
      risk,
      syntheticInventory: 0,
      targetInventory: 0,
      referencePrice: 100,
      minimumSpreadBps: 10,
      levels: [{ level: 1, bidSpreadBps: 10, askSpreadBps: 10, amount: 0.01 }],
    });
    const future = proposePmmPaperLevels({
      book: book({ receivedAt: NOW + 1 }),
      now: NOW,
      staleAfterMs: 1_000,
      costs,
      risk,
      syntheticInventory: 0,
      targetInventory: 0,
      referencePrice: 100,
      minimumSpreadBps: 10,
      levels: [{ level: 1, bidSpreadBps: 10, askSpreadBps: 10, amount: 0.01 }],
    });

    expect(stale).toMatchObject({
      available: false,
      reason: expect.stringContaining("stale"),
    });
    expect(future).toMatchObject({
      available: false,
      reason: expect.stringContaining("future"),
    });
  });

  it("creates tick/lot-rounded, price-ordered PMM levels within cumulative inventory and funds caps", () => {
    const proposal = proposePmmPaperLevels({
      book: book(),
      now: NOW,
      staleAfterMs: 1_000,
      costs,
      risk: { currentEquity: 1_000, equityRiskCap: 10, maxInventory: 0.05 },
      syntheticInventory: 0.01,
      targetInventory: 0,
      referencePrice: 100,
      minimumSpreadBps: 5,
      levels: [
        { level: 1, bidSpreadBps: 6, askSpreadBps: 6, amount: 0.03 },
        { level: 2, bidSpreadBps: 15, askSpreadBps: 15, amount: 0.03 },
        { level: 3, bidSpreadBps: 25, askSpreadBps: 25, amount: 0.03 },
      ],
    });

    expect(proposal.available).toBe(true);
    expect(proposal.bidLevels.length).toBeGreaterThan(0);
    expect(proposal.askLevels.length).toBeGreaterThan(0);
    expect([...proposal.bidLevels].map((level) => level.price)).toEqual(
      [...proposal.bidLevels].map((level) => level.price).sort((a, b) => b - a),
    );
    expect([...proposal.askLevels].map((level) => level.price)).toEqual(
      [...proposal.askLevels].map((level) => level.price).sort((a, b) => a - b),
    );
    expect(
      [...proposal.bidLevels, ...proposal.askLevels].reduce(
        (sum, level) => sum + level.notional,
        0,
      ),
    ).toBeLessThanOrEqual(10);
    expect(
      proposal.bidLevels.reduce((sum, level) => sum + level.quantity, 0) + 0.01,
    ).toBeLessThanOrEqual(0.05);
    expect(
      0.01 - proposal.askLevels.reduce((sum, level) => sum + level.quantity, 0),
    ).toBeGreaterThanOrEqual(-0.05);
    for (const level of [...proposal.bidLevels, ...proposal.askLevels]) {
      expect(level.price / 0.1).toBeCloseTo(Math.round(level.price / 0.1));
      expect(level.quantity / 0.01).toBeCloseTo(
        Math.round(level.quantity / 0.01),
      );
    }
  });

  it("uses exact BBO min/max and signed-imbalance math, then keeps cross output educational and filtered", () => {
    const features = calculateBboImbalance(5, 2);
    expect(features).toMatchObject({
      ratio: 0.4,
      signedImbalance: 3 / 7,
      dominantSide: "bid",
    });

    const scenario = educationalBboCrossScenario({
      book: book(),
      now: NOW,
      staleAfterMs: 1_000,
      triggerMinimumSize: 4,
      triggerImbalanceRatio: 0.5,
      cooldownElapsed: true,
      paperRiskCapQuantity: 1,
    });
    expect(scenario.state).toBe("educational-scenario");
    expect(scenario.scenario).toMatchObject({
      label: "BBO-cross stress scenario",
      direction: "buy",
      referencePrice: 100.1,
      quantity: 1,
    });
    expect(scenario.scenario?.note).toContain("No order");

    const filtered = educationalBboCrossScenario({
      book: book(),
      now: NOW,
      staleAfterMs: 1_000,
      triggerMinimumSize: 4,
      triggerImbalanceRatio: 0.4,
      cooldownElapsed: true,
      paperRiskCapQuantity: 1,
    });
    expect(filtered).toMatchObject({ state: "filtered", scenario: null });
    expect(filtered.reasons.join(" ")).toContain("not strictly below");
  });
});
