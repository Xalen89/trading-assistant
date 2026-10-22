import { afterEach, describe, expect, it, vi } from "vitest";
import {
  fixedAIServiceFailureCopy,
  LOCAL_SCENARIO_REQUEST_TIMEOUT_MS,
  readAIServiceFailureKind,
  ScenarioRequestEpoch,
} from "../../lib/trading/ai-request-lifecycle";
import {
  LLMServiceError,
  safeLLMFailureKind,
} from "../../server/_core/llm-errors";

// Pure fixtures only: no tRPC transport, database, catalog, or model is invoked.
afterEach(() => vi.useRealTimers());

describe("safe AI failure and scenario request lifecycle", () => {
  it("serializes only an allow-listed LLM kind and never a provider-shaped object", () => {
    const terminal = new LLMServiceError("terminal-unavailable");
    const forged = {
      kind: "terminal-unavailable",
      message: "raw provider account body",
    };

    expect(safeLLMFailureKind(terminal)).toBe("terminal-unavailable");
    expect(safeLLMFailureKind(forged)).toBeUndefined();
    expect(
      readAIServiceFailureKind({
        data: {
          aiFailureKind: "terminal-unavailable",
          providerBody: "must never be read",
        },
      }),
    ).toBe("terminal-unavailable");
    expect(
      readAIServiceFailureKind({
        data: { aiFailureKind: "forged-provider-kind" },
      }),
    ).toBeUndefined();
  });

  it("uses fixed terminal copy without an immediate-retry claim", () => {
    const copy = fixedAIServiceFailureCopy("terminal-unavailable", "scenario");

    expect(copy).toContain("cannot complete this request");
    expect(copy).toContain("existing scenario were kept");
    expect(copy).not.toContain("Try again later");
    expect(copy).not.toContain("provider");
  });

  it("settles the local timer once and suppresses a late scenario result", async () => {
    vi.useFakeTimers();
    const epoch = new ScenarioRequestEpoch();
    const request = epoch.begin();
    let applied = "existing scenario";

    setTimeout(() => {
      if (epoch.settle(request)) applied = "local timeout";
    }, LOCAL_SCENARIO_REQUEST_TIMEOUT_MS);

    await vi.advanceTimersByTimeAsync(LOCAL_SCENARIO_REQUEST_TIMEOUT_MS);
    expect(applied).toBe("local timeout");

    // A delayed tRPC completion can no longer replace the preserved scenario.
    if (epoch.settle(request)) applied = "late generated scenario";
    expect(applied).toBe("local timeout");
  });

  it("invalidates a reset request without changing retained inputs or layers", () => {
    const epoch = new ScenarioRequestEpoch();
    const request = epoch.begin();
    const retained = {
      question: "Keep this condition",
      layers: ["saved-layer"],
    };

    epoch.invalidate();

    expect(epoch.settle(request)).toBe(false);
    expect(retained).toEqual({
      question: "Keep this condition",
      layers: ["saved-layer"],
    });
  });
});
