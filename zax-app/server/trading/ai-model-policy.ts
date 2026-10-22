import type { AIQuality } from "../../lib/trading/ai-quality";
import type { InvokeParams } from "../_core/llm";

export type AIModelCandidate = { id: string; supportsVision: boolean };
export type AIModelPurpose = "coach" | "forecast";

const EFFICIENT_MODELS = ["gpt-5-mini", "gemini-3-flash-preview"] as const;
const DEEP_MODELS = ["gpt-5.5", "gpt-5", "gemini-3.1-pro-preview"] as const;

/** A priority list is policy, not availability: every selection must match the live catalog. */
export function selectAIModel(
  models: readonly AIModelCandidate[],
  quality: AIQuality = "efficient",
  needsVision = false,
): string | undefined {
  const priority = quality === "deep" ? DEEP_MODELS : EFFICIENT_MODELS;
  return priority.find((id) =>
    models.some((m) => m.id === id && (!needsVision || m.supportsVision)),
  );
}

/** One output-only fallback, inside the explicitly selected tier; no provider-error retry. */
export function selectAIFallbackModel(
  models: readonly AIModelCandidate[],
  primary: string,
  quality: AIQuality = "efficient",
  needsVision = false,
): string | undefined {
  return selectAIModel(
    models.filter((model) => model.id !== primary),
    quality,
    needsVision,
  );
}

export function availableAIModels(catalog: {
  data: readonly { id: string }[];
}): AIModelCandidate[] {
  return catalog.data.flatMap((model) => {
    const metadata = model as {
      id?: unknown;
      status?: unknown;
      capabilities?: { supports_vision?: unknown };
    };
    if (
      metadata.status === "temporarily_unavailable" ||
      typeof metadata.id !== "string" ||
      !metadata.id
    )
      return [];
    // Sparse capability metadata is not evidence of support. Keep explicit vision eligibility.
    return [
      {
        id: metadata.id,
        supportsVision: metadata.capabilities?.supports_vision === true,
      },
    ];
  });
}

/** Provider-specific fields; never send GPT's completion field to Gemini. */
export function aiCompletionBudget(
  model: string,
  quality: AIQuality,
  purpose: AIModelPurpose,
): Pick<InvokeParams, "max_completion_tokens" | "max_tokens" | "reasoning"> {
  if (model.startsWith("gpt-"))
    return {
      max_completion_tokens:
        purpose === "forecast" ? 6000 : quality === "deep" ? 4000 : 2200,
      reasoning: { effort: quality === "deep" ? "medium" : "minimal" },
    };
  return {
    max_tokens:
      purpose === "forecast" ? 10000 : quality === "deep" ? 6000 : 3200,
  };
}
