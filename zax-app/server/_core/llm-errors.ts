import {
  type AIServiceFailureKind,
  isAIServiceFailureKind,
} from "../../lib/trading/ai-request-lifecycle";

export type LLMServiceFailureKind = AIServiceFailureKind;

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function valueAt(record: UnknownRecord | undefined, key: string): unknown {
  return record && key in record ? record[key] : undefined;
}

function errorDetails(payload: unknown): UnknownRecord | undefined {
  if (!isRecord(payload)) return undefined;
  return isRecord(payload.error) ? payload.error : undefined;
}

function hasRefusal(payload: unknown): boolean {
  const details = errorDetails(payload);
  const code =
    valueAt(details, "code") ??
    (isRecord(payload) ? valueAt(payload, "code") : undefined);
  if (typeof code === "string" && /refus/i.test(code)) return true;
  if (isRecord(payload) && typeof payload.refusal === "string") return true;

  const choices = isRecord(payload) ? payload.choices : undefined;
  const first = Array.isArray(choices) ? choices[0] : undefined;
  const message =
    isRecord(first) && isRecord(first.message) ? first.message : undefined;
  return Boolean(
    message &&
    (typeof message.refusal === "string" || message.refusal === true),
  );
}

function hasCodeNine(payload: unknown): boolean {
  const details = errorDetails(payload);
  const code =
    valueAt(details, "code") ??
    (isRecord(payload) ? valueAt(payload, "code") : undefined);
  return code === 9 || code === "9";
}

/**
 * Deliberately excludes upstream message/body text so callers can never send
 * provider diagnostics, account data, or opaque JSON to the client.
 */
export class LLMServiceError extends Error {
  readonly terminal: boolean;

  constructor(readonly kind: LLMServiceFailureKind) {
    super(
      kind === "request-refused"
        ? "The AI service declined this request. Update the request and try again."
        : kind === "temporarily-unavailable"
          ? "The AI service is temporarily unavailable. Try again later."
          : "The AI service cannot complete this request right now. Try again later.",
    );
    this.name = "LLMServiceError";
    this.terminal = kind !== "temporarily-unavailable";
  }
}

/**
 * tRPC may only serialize this machine-readable allow-list. In particular, it
 * must never serialize an upstream error message, body, cause, or code.
 */
export function safeLLMFailureKind(
  error: unknown,
): LLMServiceFailureKind | undefined {
  if (!(error instanceof LLMServiceError)) return undefined;
  return isAIServiceFailureKind(error.kind) ? error.kind : undefined;
}

/** Classifies only safe protocol signals; it intentionally never retains error text. */
export function classifyLLMServiceFailure(input: {
  status?: number;
  payload?: unknown;
}): LLMServiceError {
  if (
    input.status === 412 ||
    input.status === 403 ||
    hasCodeNine(input.payload)
  )
    return new LLMServiceError("terminal-unavailable");
  if (hasRefusal(input.payload)) return new LLMServiceError("request-refused");
  return new LLMServiceError("temporarily-unavailable");
}

/** HTTP 200 can still carry an OpenAI-compatible error envelope or refusal. */
export function assertUsableLLMResponse(payload: unknown): void {
  const envelope =
    isRecord(payload) && payload.error !== undefined && payload.error !== null;
  if (envelope || hasCodeNine(payload) || hasRefusal(payload)) {
    throw classifyLLMServiceFailure({ payload });
  }
}
