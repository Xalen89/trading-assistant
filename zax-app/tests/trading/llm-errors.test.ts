import { afterEach, describe, expect, it, vi } from "vitest";
import { invokeLLM, listLLMModels } from "../../server/_core/llm";
import { LLMServiceError } from "../../server/_core/llm-errors";

vi.mock("../../server/_core/env", () => ({
  ENV: {
    forgeApiKey: "unit-test-key",
    forgeApiUrl: "https://llm.unit.test",
  },
}));

// Error-envelope mocks only: no live model, catalog, account, or provider calls.
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function mockJsonResponse(body: unknown, status = 200) {
  const fetchMock = vi.fn().mockResolvedValue(
    new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    }),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

async function expectSafeFailure(work: Promise<unknown>) {
  try {
    await work;
    throw new Error("Expected an LLM service failure");
  } catch (error) {
    expect(error).toBeInstanceOf(LLMServiceError);
    const failure = error as LLMServiceError;
    expect(failure.message).not.toMatch(/usage|account|secret|provider/i);
    return failure;
  }
}

describe("LLM service error envelopes", () => {
  for (const status of [429, 500, 503]) {
    it(`does not retry a terminal code9 body under HTTP${status}`, async () => {
      const fetchMock = mockJsonResponse(
        { error: { code: 9, message: "raw private service error" } },
        status,
      );
      const failure = await expectSafeFailure(
        invokeLLM({
          messages: [{ role: "user", content: "fixture" }],
          maxRetries: 2,
        }),
      );
      expect(failure.terminal).toBe(true);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
  }
  it("rejects a direct HTTP200 code9 payload without a retry or consuming choices", async () => {
    const fetchMock = mockJsonResponse({
      code: 9,
      message: "raw private failure",
      choices: [],
    });
    const failure = await expectSafeFailure(
      invokeLLM({
        messages: [{ role: "user", content: "fixture" }],
        maxRetries: 2,
      }),
    );
    expect(failure.terminal).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it("rejects an HTTP 200 code-9 error before any choices are consumed", async () => {
    const fetchMock = mockJsonResponse({
      error: {
        code: 9,
        message: "raw provider account usage diagnostic must stay private",
      },
      choices: [{ message: { content: "must not be consumed" } }],
    });

    const failure = await expectSafeFailure(
      invokeLLM({
        messages: [{ role: "user", content: "fixture" }],
        maxRetries: 1,
      }),
    );

    expect(failure.kind).toBe("terminal-unavailable");
    expect(failure.terminal).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does not retry or expose a terminal HTTP 412 response body", async () => {
    const fetchMock = mockJsonResponse(
      { error: { code: 9, message: "raw exhausted service-account body" } },
      412,
    );

    const failure = await expectSafeFailure(
      invokeLLM({
        messages: [{ role: "user", content: "fixture" }],
        maxRetries: 2,
      }),
    );

    expect(failure.kind).toBe("terminal-unavailable");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("classifies HTTP 403 catalog envelopes without echoing their provider body", async () => {
    const fetchMock = mockJsonResponse(
      { error: { message: "raw forbidden provider diagnostic" } },
      403,
    );

    const failure = await expectSafeFailure(listLLMModels({ maxRetries: 2 }));

    expect(failure.kind).toBe("terminal-unavailable");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("treats a completion refusal as terminal without using its text", async () => {
    mockJsonResponse({
      id: "fixture",
      choices: [
        {
          message: {
            role: "assistant",
            content: null,
            refusal: "raw provider refusal detail",
          },
        },
      ],
    });

    const failure = await expectSafeFailure(
      invokeLLM({ messages: [{ role: "user", content: "fixture" }] }),
    );

    expect(failure.kind).toBe("request-refused");
    expect(failure.terminal).toBe(true);
  });

  it("leaves valid empty completion payloads for caller validation", async () => {
    mockJsonResponse({ id: "fixture", choices: [] });

    const result = await invokeLLM({
      messages: [{ role: "user", content: "fixture" }],
    });

    expect(result.choices).toEqual([]);
  });
});
