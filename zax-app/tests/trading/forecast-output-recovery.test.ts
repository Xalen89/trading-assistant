import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const llm = vi.hoisted(() => ({ invokeLLM: vi.fn(), listLLMModels: vi.fn() }));
vi.mock("../../server/_core/llm", () => llm);
import {
  generateAIPriceForecast,
  type ForecastGenerationInput,
} from "../../server/trading/forecast-service";
import { scenarioLayersSchema } from "../../lib/trading/scenario-layer-storage";

// Synthetic software fixtures ONLY. These do not establish forecast accuracy or trading edge.
const draft = {
  direction: "up",
  thesis: "Conditional unit path.",
  assumptions: ["Unit condition."],
  invalidation: "Unit invalidation.",
  steps: Array.from({ length: 12 }, (_, i) => ({
    closeAtr: (i + 1) / 10,
    upperWickAtr: 0.1,
    lowerWickAtr: 0.1,
  })),
};
function input(): ForecastGenerationInput {
  const lastOpen = Math.floor(Date.now() / 1000) - 3 * 3600;
  return {
    market: "BTC-USD",
    timeframe: "5m",
    contextMode: "last-available",
    feed: {
      source: "unit actual-source fixture",
      fetchedAt: Date.now(),
      sourceCadenceSeconds: 300,
      candles: Array.from({ length: 16 }, (_, i) => ({
        time: lastOpen - (15 - i) * 300,
        open: 100 + i,
        high: 102 + i,
        low: 99 + i,
        close: 101 + i,
        volume: 1,
      })),
    },
  };
}
const response = (value: unknown) => ({
  id: "unit-response",
  created: 0,
  model: "gpt-5-mini",
  choices: [
    {
      index: 0,
      message: {
        role: "assistant",
        content: typeof value === "string" ? value : JSON.stringify(value),
      },
      finish_reason: "stop",
    },
  ],
});

beforeEach(() => {
  llm.invokeLLM.mockReset();
  llm.listLLMModels.mockReset();
  llm.listLLMModels.mockResolvedValue({ data: [{ id: "gpt-5-mini" }] });
  llm.invokeLLM.mockResolvedValue(response(draft));
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("bounded forecast model-output recovery", () => {
  it("does not retry a valid draft or label it corrected", async () => {
    const forecast = await generateAIPriceForecast(input());
    expect(llm.invokeLLM).toHaveBeenCalledTimes(1);
    expect(forecast.generationNotice).toBeUndefined();
    expect(forecast.aiQuality).toBe("efficient");
    expect(forecast.probability).toBeNull();
  });
  it("corrects one contradictory direction without forcing candles or changing the source packet", async () => {
    const source = input(),
      original = JSON.stringify(source);
    llm.invokeLLM
      .mockResolvedValueOnce(response({ ...draft, direction: "down" }))
      .mockResolvedValueOnce(response(draft));
    const forecast = await generateAIPriceForecast(source);
    expect(llm.invokeLLM).toHaveBeenCalledTimes(2);
    const [first, second] = llm.invokeLLM.mock.calls.map(
      ([request]) => request,
    );
    expect(first.model).toBe(second.model);
    expect(first.messages[1].content).toBe(second.messages[1].content);
    expect(second.messages[2].content).toMatch(/direction-mismatch/);
    expect(first.messages[0].content).toMatch(/steps\[11\].closeAtr/);
    expect(forecast.direction).toBe("up");
    expect(forecast.candles.at(-1)!.close).toBeGreaterThan(
      forecast.anchorPrice,
    );
    expect(forecast.generationNotice).toMatch(
      /One model-output correction.*direction-mismatch/,
    );
    expect(forecast.contextMode).toBe("last-available");
    expect(JSON.stringify(source)).toBe(original);
    expect(forecast).not.toHaveProperty("steps");
    const saved = scenarioLayersSchema.parse([
      {
        id: "unit-layer",
        kind: "ai",
        label: "Unit",
        market: forecast.market,
        sourceTimeframe: forecast.timeframe,
        displayTimeframes: ["5m"],
        enabled: true,
        style: "both",
        anchorMode: "follow",
        color: "#59A8FF",
        createdAt: Date.now(),
        forecast,
      },
    ]);
    expect(saved[0].kind === "ai" && saved[0].forecast.generationNotice).toBe(
      forecast.generationNotice,
    );
  });
  it("repairs malformed JSON once under the same strict schema", async () => {
    llm.invokeLLM
      .mockResolvedValueOnce(response("not JSON"))
      .mockResolvedValueOnce(response(draft));
    const forecast = await generateAIPriceForecast(input());
    expect(forecast.generationNotice).toMatch(/invalid-structure/);
    expect(
      llm.invokeLLM.mock.calls[1][0].response_format.json_schema.strict,
    ).toBe(true);
  });
  it("repairs an empty schema result once without format, still requiring valid local schema", async () => {
    llm.invokeLLM
      .mockResolvedValueOnce(response(""))
      .mockResolvedValueOnce(response(draft));
    expect((await generateAIPriceForecast(input())).generationNotice).toMatch(
      /empty-output/,
    );
    expect(llm.invokeLLM.mock.calls[1][0]).not.toHaveProperty(
      "response_format",
    );
  });
  it("stops after one correction when the direction remains contradictory", async () => {
    llm.invokeLLM.mockResolvedValue(response({ ...draft, direction: "down" }));
    await expect(generateAIPriceForecast(input())).rejects.toThrow(
      /correction failed.*direction/,
    );
    expect(llm.invokeLLM).toHaveBeenCalledTimes(2);
  });
  it("does not retry unsupported certainty or execution claims even with contradictory direction", async () => {
    llm.invokeLLM.mockResolvedValue(
      response({ ...draft, direction: "down", thesis: "Guaranteed profit" }),
    );
    await expect(generateAIPriceForecast(input())).rejects.toThrow(
      /unsupported certainty/,
    );
    expect(llm.invokeLLM).toHaveBeenCalledTimes(1);
  });
  it("does not retry invalid display price bounds", async () => {
    const source = input();
    source.feed.candles = source.feed.candles.map((c) => ({
      ...c,
      open: 0.5,
      close: 0.5,
      high: 1,
      low: 0.1,
    }));
    llm.invokeLLM.mockResolvedValue(
      response({
        ...draft,
        direction: "down",
        steps: draft.steps.map(() => ({
          closeAtr: -4,
          upperWickAtr: 0,
          lowerWickAtr: 0,
        })),
      }),
    );
    await expect(generateAIPriceForecast(source)).rejects.toThrow(
      /display bounds/,
    );
    expect(llm.invokeLLM).toHaveBeenCalledTimes(1);
  });
  it("does not retry transport/provider errors", async () => {
    llm.invokeLLM.mockRejectedValue(new Error("provider unavailable"));
    await expect(generateAIPriceForecast(input())).rejects.toThrow(
      "provider unavailable",
    );
    expect(llm.invokeLLM).toHaveBeenCalledTimes(1);
  });
  it("does not start a correction with less than six seconds left", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(Date.UTC(2026, 9, 18, 22, 0));
    const source = input();
    llm.invokeLLM.mockImplementationOnce(async () => {
      vi.setSystemTime(Date.now() + 44_000);
      return response({ ...draft, direction: "down" });
    });
    await expect(generateAIPriceForecast(source)).rejects.toThrow(
      /too little time/,
    );
    expect(llm.invokeLLM).toHaveBeenCalledTimes(1);
  });
  it("rejects a valid but late correction within the original deadline", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(Date.UTC(2026, 9, 18, 22, 0));
    const source = input();
    llm.invokeLLM
      .mockResolvedValueOnce(response({ ...draft, direction: "down" }))
      .mockImplementationOnce(async () => {
        vi.setSystemTime(Date.now() + 48_000);
        return response(draft);
      });
    await expect(generateAIPriceForecast(source)).rejects.toThrow(/timed out/);
    expect(llm.invokeLLM).toHaveBeenCalledTimes(2);
  });
  it("preserves strict Current rejection before any model discovery or completion", async () => {
    await expect(
      generateAIPriceForecast({ ...input(), contextMode: "current" }),
    ).rejects.toThrow(/stale/);
    expect(llm.listLLMModels).not.toHaveBeenCalled();
    expect(llm.invokeLLM).not.toHaveBeenCalled();
  });
  it("uses an available deep model only when opted in and persists the selected quality", async () => {
    llm.listLLMModels.mockResolvedValue({
      data: [
        { id: "gpt-5.5", status: "temporarily_unavailable" },
        { id: "gpt-5" },
        { id: "gemini-3.1-pro-preview" },
        { id: "gpt-5-mini" },
      ],
    });
    const forecast = await generateAIPriceForecast({
      ...input(),
      aiQuality: "deep",
    });
    expect(forecast.model).toBe("gpt-5");
    expect(forecast.aiQuality).toBe("deep");
    expect(llm.invokeLLM.mock.calls[0][0]).toMatchObject({
      model: "gpt-5",
      max_completion_tokens: 6000,
      reasoning: { effort: "medium" },
      maxRetries: 0,
    });
  });
  it("fails clearly if deep has no supported available model", async () => {
    await expect(
      generateAIPriceForecast({ ...input(), aiQuality: "deep" }),
    ).rejects.toMatchObject({ kind: "terminal-unavailable" });
    expect(llm.invokeLLM).not.toHaveBeenCalled();
  });
});
