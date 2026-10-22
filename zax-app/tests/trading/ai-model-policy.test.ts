import { describe, expect, it } from "vitest";
import { resolveAIQuality } from "../../lib/trading/ai-quality";
import {
  aiCompletionBudget,
  availableAIModels,
  selectAIModel,
  selectAIFallbackModel,
} from "../../server/trading/ai-model-policy";

const catalog = {
  data: [
    { id: "gpt-5.5" },
    { id: "gpt-5" },
    { id: "gpt-5-mini" },
    { id: "gemini-3.1-pro-preview" },
    { id: "gemini-3-flash-preview" },
  ],
};

describe("bounded owner AI model quality policy", () => {
  it("uses the efficient tier by default even when premium models appear first", () => {
    expect(selectAIModel(availableAIModels(catalog))).toBe("gpt-5-mini");
    expect(resolveAIQuality(undefined)).toBe("efficient");
    expect(resolveAIQuality("gpt-5.5")).toBe("efficient");
    expect(resolveAIQuality("deep")).toBe("deep");
  });
  it("uses GPT-5.5 only when deep is explicitly selected", () => {
    expect(selectAIModel(availableAIModels(catalog), "deep")).toBe("gpt-5.5");
  });
  it("skips unavailable models and observes the declared deep priority", () => {
    const models = availableAIModels({
      data: [
        { id: "gpt-5.5", status: "temporarily_unavailable" },
        { id: "claude-opus-4-7", status: "temporarily_unavailable" },
        { id: "gpt-5" },
        { id: "gemini-3.1-pro-preview" },
      ],
    } as typeof catalog);
    expect(models.map((m) => m.id)).toEqual([
      "gpt-5",
      "gemini-3.1-pro-preview",
    ]);
    expect(selectAIModel(models, "deep")).toBe("gpt-5");
  });
  it("never substitutes an unlisted or wrong-tier model", () => {
    const onlyDeep = availableAIModels({ data: [{ id: "gpt-5.5" }] });
    const onlyEfficient = availableAIModels({ data: [{ id: "gpt-5-mini" }] });
    expect(selectAIModel(onlyDeep, "efficient")).toBeUndefined();
    expect(selectAIModel(onlyEfficient, "deep")).toBeUndefined();
    expect(
      selectAIModel(
        availableAIModels({ data: [{ id: "unreviewed-model" }] }),
        "deep",
      ),
    ).toBeUndefined();
  });
  it("keeps an output fallback in its selected tier", () => {
    const models = availableAIModels(catalog);
    expect(selectAIFallbackModel(models, "gpt-5.5", "deep")).toBe("gpt-5");
    expect(selectAIFallbackModel(models, "gpt-5-mini", "efficient")).toBe(
      "gemini-3-flash-preview",
    );
    expect(
      selectAIFallbackModel(
        availableAIModels({ data: [{ id: "gpt-5.5" }, { id: "gpt-5-mini" }] }),
        "gpt-5.5",
        "deep",
      ),
    ).toBeUndefined();
  });
  it("requires explicit vision capability and never infers it from a sparse catalog", () => {
    const models = availableAIModels({
      data: [
        { id: "gpt-5.5" },
        { id: "gpt-5", capabilities: { supports_vision: true } },
      ],
    } as typeof catalog);
    expect(selectAIModel(models, "deep", true)).toBe("gpt-5");
  });
  it("uses bounded provider-correct completion fields and the selected reasoning effort", () => {
    expect(aiCompletionBudget("gpt-5-mini", "efficient", "coach")).toEqual({
      max_completion_tokens: 2200,
      reasoning: { effort: "minimal" },
    });
    expect(aiCompletionBudget("gpt-5.5", "deep", "coach")).toEqual({
      max_completion_tokens: 4000,
      reasoning: { effort: "medium" },
    });
    expect(aiCompletionBudget("gpt-5.5", "deep", "forecast")).toEqual({
      max_completion_tokens: 6000,
      reasoning: { effort: "medium" },
    });
    const gemini = aiCompletionBudget(
      "gemini-3.1-pro-preview",
      "deep",
      "forecast",
    );
    expect(gemini).toEqual({ max_tokens: 10000 });
    expect(gemini).not.toHaveProperty("max_completion_tokens");
  });
});
