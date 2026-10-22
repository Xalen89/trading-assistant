import { describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "../../server/_core/context";
import type { Strategy } from "../../lib/trading/model";
import type { ForecastScenario } from "../../lib/trading/setup-model";

const mocked = vi.hoisted(() => ({ setupAnalysis: vi.fn() }));

vi.mock("../../server/trading/access", async () => {
  const core = await vi.importActual<typeof import("../../server/_core/trpc")>(
    "../../server/_core/trpc",
  );
  return { ownerProcedure: core.protectedProcedure };
});
vi.mock("../../server/trading/setup-service", () => ({
  setupAnalysis: mocked.setupAnalysis,
}));

import {
  historicalScenarioInputSchema,
  historicalScenarioResponse,
  scenarioRouter,
} from "../../server/trading/scenario-router";

const strategy: Strategy = {
  id: "local-strategy",
  name: "Local snapshot",
  description: "Synthetic test snapshot only.",
  color: "#8EC5FF",
  kind: "strategy",
  factors: [],
  visible: true,
  version: 3,
};

const scenario: ForecastScenario = {
  id: "unit-historical-scenario",
  anchorAt: 1_800_000_000,
  sourceAt: 1_799_992_800,
  source: "UNIT actual closed source bars",
  strategyIds: [strategy.id],
  strategyVersions: [strategy.version],
  combination: "all",
  candles: [
    {
      time: 1_799_993_100,
      open: 100,
      high: 102,
      low: 99,
      close: 101,
      volume: 10,
    },
  ],
  distance: 0.1,
  explanation: "Synthetic actual historical continuation only.",
  basis: "context-replay",
  anchorPrice: 100,
};

const request = {
  market: "BTC-USD",
  sourceTimeframe: "1h" as const,
  strategyIds: [strategy.id],
  strategies: [strategy],
  combination: "all" as const,
  timezone: "America/New_York",
};

function context(user: { id: number } | null): TrpcContext {
  return { user, req: {}, res: {} } as unknown as TrpcContext;
}

describe("historical scenario router", () => {
  it("requires one active local snapshot per selected strategy ID", () => {
    expect(
      historicalScenarioInputSchema.safeParse({
        ...request,
        strategyIds: [strategy.id, strategy.id],
      }).success,
    ).toBe(false);
    expect(
      historicalScenarioInputSchema.safeParse({
        ...request,
        strategies: [],
      }).success,
    ).toBe(false);
  });

  it("is protected before selected history analysis is called", async () => {
    const caller = scenarioRouter.createCaller(context(null));
    await expect(caller.historical(request)).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
    expect(mocked.setupAnalysis).not.toHaveBeenCalled();
  });

  it("uses the selected source timeframe and exact local snapshots", async () => {
    mocked.setupAnalysis.mockResolvedValue({
      candles: [scenario.candles[0]],
      scenario,
      source: "UNIT actual closed source bars",
    });
    const caller = scenarioRouter.createCaller(context({ id: 41 }));

    const result = await caller.historical(request);

    expect(mocked.setupAnalysis).toHaveBeenCalledWith(
      { id: 41 },
      {
        market: "BTC-USD",
        timeframe: "1h",
        strategyIds: [strategy.id],
        strategies: [strategy],
        combination: "all",
        timezone: "America/New_York",
      },
    );
    expect(result).toMatchObject({
      scenario,
      sourceTimeframe: "1h",
      market: "BTC-USD",
      source: "UNIT actual closed source bars",
    });
    expect(typeof result.generatedAt).toBe("number");
  });

  it("withholds empty history and missing historical continuations", () => {
    expect(() =>
      historicalScenarioResponse(
        { candles: [], scenario, source: "UNIT" },
        "BTC-USD",
        "5m",
        1,
      ),
    ).toThrow(/source-frame history is empty/i);
    expect(() =>
      historicalScenarioResponse(
        { candles: [scenario.candles[0]], scenario: undefined, source: "UNIT" },
        "BTC-USD",
        "5m",
        1,
      ),
    ).toThrow(/no valid past continuation/i);
  });
});
