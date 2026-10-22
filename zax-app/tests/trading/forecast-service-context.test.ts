import { beforeEach, describe, expect, it, vi } from "vitest";

const llm = vi.hoisted(() => ({
  invokeLLM: vi.fn(),
  listLLMModels: vi.fn(),
}));

vi.mock("../../server/_core/llm", () => llm);

import { generateAIPriceForecast } from "../../server/trading/forecast-service";

const MINUTE = 60;
const period = 5 * MINUTE;

function staleBars() {
  const lastOpen = Math.floor(Date.now() / 1_000) - 3 * 60 * MINUTE;
  return Array.from({ length: 16 }, (_, index) => {
    const value = 100 + index;
    return {
      time: lastOpen - (15 - index) * period,
      open: value,
      high: value + 1,
      low: value - 1,
      close: value,
      volume: 1,
    };
  });
}

const draft = {
  direction: "up",
  thesis: "Conditional historical fixture.",
  assumptions: ["Fixture condition."],
  invalidation: "Fixture invalidation.",
  steps: Array.from({ length: 12 }, (_, index) => ({
    closeAtr: (index + 1) / 20,
    upperWickAtr: 0.1,
    lowerWickAtr: 0.1,
  })),
};

describe("available-history forecast generation", () => {
  beforeEach(() => {
    llm.listLLMModels.mockReset();
    llm.invokeLLM.mockReset();
    llm.listLLMModels.mockResolvedValue({ data: [{ id: "gpt-5-mini" }] });
    llm.invokeLLM.mockResolvedValue({
      id: "unit-response",
      created: 0,
      model: "gpt-5-mini",
      choices: [
        {
          index: 0,
          message: { role: "assistant", content: JSON.stringify(draft) },
          finish_reason: "stop",
        },
      ],
    });
  });

  it("uses no quote, exposes stale provenance, and tells the model the context is historical only", async () => {
    const candles = staleBars();
    const scenario = await generateAIPriceForecast({
      market: "BTC-USD",
      timeframe: "5m",
      contextMode: "last-available",
      feed: {
        candles,
        source: "mocked historical source",
        fetchedAt: Date.now(),
        sourceCadenceSeconds: period,
      },
    });

    expect(scenario).toMatchObject({
      kind: "ai-hypothetical",
      contextMode: "last-available",
      sourceFreshness: {
        status: "stale",
        closedAt: candles.at(-1)!.time + period,
      },
      anchorAt: candles.at(-1)!.time,
    });
    const request = llm.invokeLLM.mock.calls[0][0];
    const prompt = JSON.parse(request.messages[1].content);
    expect(prompt).toMatchObject({
      contextMode: "last-available",
      currentQuote: null,
      sourceFreshness: { status: "stale" },
    });
    expect(request.messages[0].content).toMatch(/historical-only context/i);
  });
});
