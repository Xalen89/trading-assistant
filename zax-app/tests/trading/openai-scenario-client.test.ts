import { describe, expect, it, vi } from "vitest";
import {
  DirectOpenAIError,
  invokeDirectOpenAIScenario,
  listDirectOpenAIModels,
} from "../../server/trading/openai-scenario-client";

const apiKey = "sk-unit-test-key-that-must-never-appear-in-payload";
const deadline = () => Date.now() + 5_000;

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function completedResponse(text: string, extras: Record<string, unknown> = {}) {
  return {
    status: "completed",
    output: [
      { type: "reasoning", status: "completed" },
      {
        type: "message",
        role: "assistant",
        status: "completed",
        content: [{ type: "output_text", text }],
      },
    ],
    ...extras,
  };
}

function request(overrides: Record<string, unknown> = {}) {
  return {
    apiKey,
    model: "gpt-5-mini",
    messages: [
      { role: "system" as const, content: "Return the required JSON only." },
      { role: "user" as const, content: "Synthetic fixture." },
    ],
    schemaName: "scenario_draft",
    schema: {
      type: "object",
      properties: {
        label: { type: "string", minLength: 2, maxLength: 32 },
        score: { type: "number", minimum: 0, maximum: 1 },
        steps: {
          type: "array",
          minItems: 12,
          maxItems: 12,
          items: {
            type: "object",
            properties: { note: { type: "string", minLength: 1, maxLength: 64 } },
          },
        },
      },
      minProperties: 1,
    },
    quality: "efficient" as const,
    deadline: deadline(),
    ...overrides,
  };
}

async function expectDirectFailure(work: Promise<unknown>) {
  try {
    await work;
    throw new Error("Expected a direct OpenAI failure");
  } catch (error) {
    expect(error).toBeInstanceOf(DirectOpenAIError);
    return error as DirectOpenAIError;
  }
}

describe("direct OpenAI scenario client", () => {
  it("uses the fixed public origin rather than inherited environment configuration and keeps catalog IDs from data only", async () => {
    const previousBase = process.env.OPENAI_API_BASE;
    const previousKey = process.env.OPENAI_API_KEY;
    process.env.OPENAI_API_BASE = "https://proxy.example.invalid/v1";
    process.env.OPENAI_API_KEY = "sk-inherited-key-must-not-be-used";
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse({
        object: "list",
        data: [
          { id: "gpt-5-mini" },
          { id: "gpt-5" },
          { id: "gpt-5-mini" },
          { id: " bad-model" },
          { id: 42 },
          null,
        ],
      }),
    );

    try {
      await expect(listDirectOpenAIModels(apiKey, deadline(), fetchMock)).resolves.toEqual([
        "gpt-5-mini",
        "gpt-5",
      ]);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, init] = fetchMock.mock.calls[0]!;
      expect(url).toBe("https://api.openai.com/v1/models");
      expect(init?.headers).toEqual({ authorization: `Bearer ${apiKey}` });
      expect(init?.body).toBeUndefined();
    } finally {
      if (previousBase === undefined) delete process.env.OPENAI_API_BASE;
      else process.env.OPENAI_API_BASE = previousBase;
      if (previousKey === undefined) delete process.env.OPENAI_API_KEY;
      else process.env.OPENAI_API_KEY = previousKey;
    }
  });

  it("sends a stateless Responses structured-output request with fixed budgets and no secret in its body", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse(completedResponse('{"label":"ok"}')),
    );

    await expect(invokeDirectOpenAIScenario(request(), fetchMock)).resolves.toBe(
      '{"label":"ok"}',
    );

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://api.openai.com/v1/responses");
    expect(init?.method).toBe("POST");
    expect(init?.headers).toEqual({
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    });
    expect(typeof init?.body).toBe("string");
    expect(init?.body).not.toContain(apiKey);
    expect(init?.body).not.toContain("OPENAI_API_KEY");
    expect(JSON.parse(init?.body as string)).toEqual({
      model: "gpt-5-mini",
      input: [
        { role: "system", content: "Return the required JSON only." },
        { role: "user", content: "Synthetic fixture." },
      ],
      store: false,
      max_output_tokens: 6000,
      reasoning: { effort: "low" },
      text: {
        format: {
          type: "json_schema",
          name: "scenario_draft",
          strict: true,
          schema: {
            type: "object",
            properties: {
              label: { type: "string" },
              score: { type: "number", minimum: 0, maximum: 1 },
              steps: {
                type: "array",
                minItems: 12,
                maxItems: 12,
                items: {
                  type: "object",
                  properties: { note: { type: "string" } },
                },
              },
            },
            minProperties: 1,
          },
        },
      },
    });
    expect(init?.body).not.toMatch(/tools|background|conversation|temperature/);
  });

  it("uses medium reasoning for deep quality and returns REST output-array text, not an SDK convenience field", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse(
        completedResponse('{"actual":true}', {
          output_text: '{"sdkConvenience":true}',
        }),
      ),
    );

    await expect(
      invokeDirectOpenAIScenario(request({ quality: "deep" }), fetchMock),
    ).resolves.toBe('{"actual":true}');
    expect(JSON.parse(fetchMock.mock.calls[0]![1]?.body as string).reasoning).toEqual({
      effort: "medium",
    });
  });

  it("rejects refusal, incomplete, error, and multiple assistant response shapes", async () => {
    const malformedBodies = [
      {
        status: "completed",
        output: [{
          type: "message",
          role: "assistant",
          status: "completed",
          content: [{ type: "refusal", refusal: "private upstream refusal" }],
        }],
      },
      {
        status: "incomplete",
        output: [],
      },
      {
        status: "completed",
        error: { message: "private upstream error" },
        output: [],
      },
      {
        status: "completed",
        output: [
          {
            type: "message",
            role: "assistant",
            status: "completed",
            content: [{ type: "output_text", text: "one" }],
          },
          {
            type: "message",
            role: "assistant",
            status: "completed",
            content: [{ type: "output_text", text: "two" }],
          },
        ],
      },
    ];

    for (const body of malformedBodies) {
      const failure = await expectDirectFailure(
        invokeDirectOpenAIScenario(request(), vi.fn<typeof fetch>().mockResolvedValue(jsonResponse(body))),
      );
      expect(failure.kind).toBe("invalid-output");
      expect(failure.terminal).toBe(true);
      expect(failure.message).not.toMatch(/private|refusal|upstream/i);
    }
  });

  it("bounds streamed response bytes instead of calling unbounded response text/json", async () => {
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode("x".repeat(500 * 1024 + 1)));
        controller.close();
      },
    });
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(stream, { status: 200, headers: { "content-type": "application/json" } }),
    );

    const failure = await expectDirectFailure(
      invokeDirectOpenAIScenario(request(), fetchMock),
    );
    expect(failure.kind).toBe("invalid-output");
    expect(failure.terminal).toBe(true);
  });

  it("does not retry and maps auth, rate-limit, and unavailable statuses without leaking raw provider bodies", async () => {
    const cases: Array<{
      status: number;
      kind: DirectOpenAIError["kind"];
      terminal: boolean;
    }> = [
      { status: 401, kind: "authentication", terminal: true },
      { status: 403, kind: "authentication", terminal: true },
      { status: 429, kind: "rate-limit", terminal: true },
      { status: 503, kind: "unavailable", terminal: false },
    ];

    for (const current of cases) {
      const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
        jsonResponse({ error: { message: "raw sensitive provider payload" } }, current.status),
      );
      const failure = await expectDirectFailure(
        invokeDirectOpenAIScenario(request(), fetchMock),
      );
      expect(failure.kind).toBe(current.kind);
      expect(failure.terminal).toBe(current.terminal);
      expect(failure.message).not.toMatch(/sensitive|provider|payload|sk-unit/i);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    }
  });

  it("fails before fetch on an expired absolute deadline", async () => {
    const fetchMock = vi.fn<typeof fetch>();
    const failure = await expectDirectFailure(
      invokeDirectOpenAIScenario(request({ deadline: Date.now() - 1 }), fetchMock),
    );
    expect(failure.kind).toBe("timeout");
    expect(failure.terminal).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("keeps the AbortController alive while reading a streamed body", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(
      async (_url, init) => {
        const signal = init?.signal as AbortSignal;
        const stream = new ReadableStream<Uint8Array>({
          start(controller) {
            signal.addEventListener("abort", () => {
              controller.error(new DOMException("aborted", "AbortError"));
            });
          },
        });
        return new Response(stream, { status: 200 });
      },
    );

    const failure = await expectDirectFailure(
      invokeDirectOpenAIScenario(request({ deadline: Date.now() + 25 }), fetchMock),
    );
    expect(failure.kind).toBe("timeout");
    expect(failure.terminal).toBe(true);
    expect(fetchMock.mock.calls[0]![1]?.signal).toBeInstanceOf(AbortSignal);
    expect((fetchMock.mock.calls[0]![1]?.signal as AbortSignal).aborted).toBe(true);
  });
});
