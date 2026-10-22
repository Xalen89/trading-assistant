import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  directModels: vi.fn(),
  directInvoke: vi.fn(),
  managedModels: vi.fn(),
  managedInvoke: vi.fn(),
}));
vi.mock("../../server/_core/llm", () => ({
  listLLMModels: mocks.managedModels,
  invokeLLM: mocks.managedInvoke,
}));
vi.mock("../../server/trading/openai-scenario-client", async (original) => {
  const actual =
    await original<
      typeof import("../../server/trading/openai-scenario-client")
    >();
  return {
    ...actual,
    listDirectOpenAIModels: mocks.directModels,
    invokeDirectOpenAIScenario: mocks.directInvoke,
  };
});
import {
  generateAIPriceForecast,
  type ForecastGenerationInput,
} from "../../server/trading/forecast-service";
import { DirectOpenAIError } from "../../server/trading/openai-scenario-client";
import { scenarioLayersSchema } from "../../lib/trading/scenario-layer-storage";
const syntheticKey = "sk-" + "non-live-software-fixture".repeat(3);
const draft = {
  direction: "up",
  thesis: "Conditional fixture only.",
  assumptions: ["Fixture condition."],
  invalidation: "Fixture invalidation.",
  steps: Array.from({ length: 12 }, (_, i) => ({
    closeAtr: (i + 1) / 10,
    upperWickAtr: 0.1,
    lowerWickAtr: 0.1,
  })),
};
function input(): ForecastGenerationInput {
  const last = Math.floor(Date.now() / 1000) - 3 * 3600;
  return {
    market: "BTC-USD",
    timeframe: "5m",
    contextMode: "last-available",
    aiQuality: "efficient",
    directOpenAI: { apiKey: syntheticKey },
    feed: {
      source: "Software-only source fixture",
      fetchedAt: Date.now(),
      sourceCadenceSeconds: 300,
      candles: Array.from({ length: 16 }, (_, i) => ({
        time: last - (15 - i) * 300,
        open: 100 + i,
        high: 102 + i,
        low: 99 + i,
        close: 101 + i,
        volume: 1,
      })),
    },
  };
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.directModels.mockResolvedValue(["gpt-5-mini", "gpt-5"]);
  mocks.directInvoke.mockResolvedValue(JSON.stringify(draft));
});
describe("owner-saved direct scenario draft integration", () => {
  it("calls only direct provider, carries no key/account identifiers into the model context or persisted layer", async () => {
    const source = input();
    const original = JSON.stringify(source);
    const forecast = await generateAIPriceForecast(source);
    expect(mocks.directModels).toHaveBeenCalledWith(
      syntheticKey,
      expect.any(Number),
    );
    expect(mocks.managedModels).not.toHaveBeenCalled();
    expect(mocks.managedInvoke).not.toHaveBeenCalled();
    const request = mocks.directInvoke.mock.calls[0][0];
    expect(request.model).toBe("gpt-5-mini");
    expect(JSON.stringify(request.messages)).not.toContain(syntheticKey);
    expect(forecast.generationNotice).toContain("direct OpenAI");
    expect(forecast.probability).toBeNull();
    expect(forecast.candles).toHaveLength(12);
    expect(forecast.candles.every((c) => c.volume === 0)).toBe(true);
    expect(forecast.anchorPrice).toBe(source.feed.candles.at(-1)!.close);
    expect(forecast.source).toBe(source.feed.source);
    expect(JSON.stringify(source)).toBe(original);
    expect(JSON.stringify(forecast)).not.toContain(syntheticKey);
    expect(() =>
      scenarioLayersSchema.parse([
        {
          id: "fixture-layer",
          kind: "ai",
          label: "Fixture",
          market: "BTC-USD",
          sourceTimeframe: "5m",
          displayTimeframes: ["5m"],
          enabled: true,
          style: "both",
          anchorMode: "follow",
          color: "#59A8FF",
          createdAt: Date.now(),
          forecast,
        },
      ]),
    ).not.toThrow();
  });
  it("uses deep only when the chosen direct model actually exists and never escalates/falls back", async () => {
    const source = input();
    source.aiQuality = "deep";
    await generateAIPriceForecast(source);
    expect(mocks.directInvoke.mock.calls[0][0].model).toBe("gpt-5");
    mocks.directModels.mockResolvedValue(["gpt-5-mini"]);
    mocks.directInvoke.mockClear();
    await expect(generateAIPriceForecast(source)).rejects.toMatchObject({
      kind: "unavailable",
    });
    expect(mocks.directInvoke).not.toHaveBeenCalled();
    expect(mocks.managedModels).not.toHaveBeenCalled();
  });
  it("allows just one full-schema direction correction with identical source and deadline", async () => {
    mocks.directInvoke
      .mockResolvedValueOnce(JSON.stringify({ ...draft, direction: "down" }))
      .mockResolvedValueOnce(JSON.stringify(draft));
    const forecast = await generateAIPriceForecast(input());
    expect(mocks.directInvoke).toHaveBeenCalledTimes(2);
    const [first, second] = mocks.directInvoke.mock.calls.map(([r]) => r);
    expect(first.messages[1]).toEqual(second.messages[1]);
    expect(first.deadline).toBe(second.deadline);
    expect(first.schema).toBe(second.schema);
    expect(first.model).toBe(second.model);
    expect(forecast.generationNotice).toMatch(
      /Direct OpenAI.*correction.*direction-mismatch/,
    );
  });
  it("does not retry a terminal provider failure or switch back to managed", async () => {
    mocks.directInvoke.mockRejectedValue(
      new DirectOpenAIError("authentication", true),
    );
    await expect(generateAIPriceForecast(input())).rejects.toMatchObject({
      kind: "authentication",
    });
    expect(mocks.directInvoke).toHaveBeenCalledTimes(1);
    expect(mocks.managedInvoke).not.toHaveBeenCalled();
  });
  it("refuses still-invalid corrected drafts and unsupported certainty instead of synthesizing a path", async () => {
    mocks.directInvoke.mockResolvedValue(
      JSON.stringify({ ...draft, direction: "down" }),
    );
    await expect(generateAIPriceForecast(input())).rejects.toThrow(
      /correction failed/,
    );
    expect(mocks.directInvoke).toHaveBeenCalledTimes(2);
    mocks.directInvoke.mockClear();
    mocks.directInvoke.mockResolvedValue(
      JSON.stringify({ ...draft, thesis: "Guaranteed profit" }),
    );
    await expect(generateAIPriceForecast(input())).rejects.toThrow(
      /unsupported certainty/,
    );
    expect(mocks.directInvoke).toHaveBeenCalledTimes(1);
  });
});
