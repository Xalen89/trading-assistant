const DIRECT_OPENAI_BASE_URL = "https://api.openai.com/v1";
const MAX_REQUEST_BYTES = 500 * 1024;
const MAX_RESPONSE_BYTES = 500 * 1024;
const MODELS_TIMEOUT_MS = 15_000;
const MAX_MODEL_ID_LENGTH = 256;

export type DirectOpenAIErrorKind =
  | "authentication"
  | "rate-limit"
  | "timeout"
  | "unavailable"
  | "invalid-output";

const safeMessages: Record<DirectOpenAIErrorKind, string> = {
  authentication: "Direct OpenAI authentication failed.",
  "rate-limit": "Direct OpenAI rate limit reached.",
  timeout: "Direct OpenAI request timed out.",
  unavailable: "Direct OpenAI is temporarily unavailable.",
  "invalid-output": "Direct OpenAI returned invalid output.",
};

/** A deliberately body-free error safe to surface beyond this transport. */
export class DirectOpenAIError extends Error {
  readonly kind: DirectOpenAIErrorKind;
  readonly terminal: boolean;

  constructor(kind: DirectOpenAIErrorKind, terminal: boolean) {
    super(safeMessages[kind]);
    this.name = "DirectOpenAIError";
    this.kind = kind;
    this.terminal = terminal;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

type ScenarioMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

type ScenarioRequest = {
  apiKey: string;
  model: string;
  messages: ScenarioMessage[];
  schema: Record<string, unknown>;
  schemaName: string;
  quality: "efficient" | "deep";
  /** Absolute Unix time in milliseconds. */
  deadline: number;
};

type JsonRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is JsonRecord =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isDeadlineExpired = (deadline: number) =>
  !Number.isFinite(deadline) || Date.now() >= deadline;

function throwIfExpired(deadline: number): void {
  if (isDeadlineExpired(deadline)) {
    throw new DirectOpenAIError("timeout", true);
  }
}

function cleanApiKey(apiKey: string): string {
  if (typeof apiKey !== "string" || apiKey.trim().length === 0) {
    throw new DirectOpenAIError("authentication", true);
  }
  return apiKey.trim();
}

function isValidModelId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= MAX_MODEL_ID_LENGTH &&
    value.trim() === value &&
    !/[\u0000-\u001f\u007f]/.test(value)
  );
}

function validSchemaName(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[A-Za-z0-9_-]{1,64}$/.test(value)
  );
}

/**
 * OpenAI strict structured output does not support every JSON Schema keyword.
 * Keep parent-side constraints intact; this copy strips only string-length limits
 * from the provider payload while retaining numeric and array constraints.
 */
function withoutUnsupportedStringLengths(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(withoutUnsupportedStringLengths);
  }
  if (!isRecord(value)) return value;

  const copy: JsonRecord = {};
  for (const [key, child] of Object.entries(value)) {
    if (key === "minLength" || key === "maxLength") continue;
    copy[key] = withoutUnsupportedStringLengths(child);
  }
  return copy;
}

function serializeBoundedJson(payload: unknown, deadline: number): string {
  let encoded: string;
  try {
    encoded = JSON.stringify(payload);
  } catch {
    throw new DirectOpenAIError("invalid-output", true);
  }
  if (typeof encoded !== "string") {
    throw new DirectOpenAIError("invalid-output", true);
  }
  throwIfExpired(deadline);
  if (new TextEncoder().encode(encoded).byteLength > MAX_REQUEST_BYTES) {
    throw new DirectOpenAIError("invalid-output", true);
  }
  return encoded;
}

function timeoutAt(deadline: number, limitMs?: number): number {
  throwIfExpired(deadline);
  return limitMs === undefined
    ? deadline
    : Math.min(deadline, Date.now() + limitMs);
}

function statusFailure(status: number): DirectOpenAIError {
  if (status === 401 || status === 403) {
    return new DirectOpenAIError("authentication", true);
  }
  if (status === 429) {
    return new DirectOpenAIError("rate-limit", true);
  }
  if (status >= 500 && status <= 599) {
    return new DirectOpenAIError("unavailable", false);
  }
  return new DirectOpenAIError("unavailable", true);
}

function isAbortError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    (error as { name?: unknown }).name === "AbortError"
  );
}

async function cancelBody(response: Response): Promise<void> {
  try {
    await response.body?.cancel();
  } catch {
    // Cancellation is best-effort and must not expose an upstream failure.
  }
}

async function readBoundedJson(
  response: Response,
  deadline: number,
): Promise<unknown> {
  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_RESPONSE_BYTES) {
    throw new DirectOpenAIError("invalid-output", true);
  }

  const reader = response.body?.getReader();
  if (!reader) throw new DirectOpenAIError("invalid-output", true);

  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      throwIfExpired(deadline);
      let part: ReadableStreamReadResult<Uint8Array>;
      try {
        part = await reader.read();
      } catch (error) {
        if (isDeadlineExpired(deadline) || isAbortError(error)) {
          throw new DirectOpenAIError("timeout", true);
        }
        throw new DirectOpenAIError("unavailable", false);
      }
      throwIfExpired(deadline);
      if (part.done) break;
      if (!(part.value instanceof Uint8Array)) {
        throw new DirectOpenAIError("invalid-output", true);
      }
      size += part.value.byteLength;
      if (size > MAX_RESPONSE_BYTES) {
        try {
          await reader.cancel();
        } catch {
          // The local size limit is already decisive.
        }
        throw new DirectOpenAIError("invalid-output", true);
      }
      chunks.push(part.value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new DirectOpenAIError("invalid-output", true);
  }
  if (text.length === 0) throw new DirectOpenAIError("invalid-output", true);

  try {
    return JSON.parse(text);
  } catch {
    throw new DirectOpenAIError("invalid-output", true);
  }
}

async function requestJson(
  url: string,
  init: RequestInit,
  deadline: number,
  fetchImpl: typeof fetch,
  limitMs?: number,
): Promise<unknown> {
  const requestDeadline = timeoutAt(deadline, limitMs);
  const controller = new AbortController();
  const waitMs = requestDeadline - Date.now();
  const timer = setTimeout(() => controller.abort(), Math.max(0, waitMs));

  try {
    let response: Response;
    try {
      response = await fetchImpl(url, { ...init, signal: controller.signal });
    } catch (error) {
      if (isDeadlineExpired(requestDeadline) || controller.signal.aborted || isAbortError(error)) {
        throw new DirectOpenAIError("timeout", true);
      }
      throw new DirectOpenAIError("unavailable", false);
    }

    throwIfExpired(requestDeadline);
    if (!response.ok) {
      await cancelBody(response);
      throw statusFailure(response.status);
    }

    const payload = await readBoundedJson(response, requestDeadline);
    throwIfExpired(requestDeadline);
    return payload;
  } finally {
    clearTimeout(timer);
  }
}

function responseOutputText(payload: unknown, deadline: number): string {
  throwIfExpired(deadline);
  if (!isRecord(payload) || payload.status !== "completed" || "error" in payload) {
    throw new DirectOpenAIError("invalid-output", true);
  }
  if (!Array.isArray(payload.output)) {
    throw new DirectOpenAIError("invalid-output", true);
  }

  let assistantMessage: JsonRecord | undefined;
  for (const item of payload.output) {
    if (!isRecord(item)) throw new DirectOpenAIError("invalid-output", true);
    if (item.type === "reasoning") {
      if ("status" in item && item.status !== "completed") {
        throw new DirectOpenAIError("invalid-output", true);
      }
      continue;
    }
    if (item.type !== "message" || item.role !== "assistant") {
      throw new DirectOpenAIError("invalid-output", true);
    }
    if (assistantMessage) throw new DirectOpenAIError("invalid-output", true);
    assistantMessage = item;
  }

  if (!assistantMessage || assistantMessage.status !== "completed") {
    throw new DirectOpenAIError("invalid-output", true);
  }
  if (!Array.isArray(assistantMessage.content) || assistantMessage.content.length !== 1) {
    throw new DirectOpenAIError("invalid-output", true);
  }

  const [content] = assistantMessage.content;
  if (
    !isRecord(content) ||
    content.type !== "output_text" ||
    typeof content.text !== "string" ||
    content.text.trim().length === 0
  ) {
    throw new DirectOpenAIError("invalid-output", true);
  }
  if (new TextEncoder().encode(content.text).byteLength > MAX_RESPONSE_BYTES) {
    throw new DirectOpenAIError("invalid-output", true);
  }
  throwIfExpired(deadline);
  return content.text;
}

/** Lists only syntactically safe IDs reported in the account's live /models catalog. */
export async function listDirectOpenAIModels(
  apiKey: string,
  deadline: number,
  fetchImpl: typeof fetch = fetch,
): Promise<string[]> {
  const key = cleanApiKey(apiKey);
  throwIfExpired(deadline);

  const payload = await requestJson(
    `${DIRECT_OPENAI_BASE_URL}/models`,
    { headers: { authorization: `Bearer ${key}` } },
    deadline,
    fetchImpl,
    MODELS_TIMEOUT_MS,
  );
  throwIfExpired(deadline);
  if (!isRecord(payload) || !Array.isArray(payload.data)) {
    throw new DirectOpenAIError("invalid-output", true);
  }

  const seen = new Set<string>();
  const models: string[] = [];
  for (const candidate of payload.data) {
    if (!isRecord(candidate) || !isValidModelId(candidate.id) || seen.has(candidate.id)) {
      continue;
    }
    seen.add(candidate.id);
    models.push(candidate.id);
  }
  throwIfExpired(deadline);
  return models;
}

/**
 * Sends one stateless, structured Responses request. It intentionally does not
 * use the Manus proxy, environment configuration, tools, conversation state,
 * provider retries, or the SDK's convenience output_text field.
 */
export async function invokeDirectOpenAIScenario(
  request: ScenarioRequest,
  fetchImpl: typeof fetch = fetch,
): Promise<string> {
  const key = cleanApiKey(request.apiKey);
  throwIfExpired(request.deadline);
  if (
    !isValidModelId(request.model) ||
    !Array.isArray(request.messages) ||
    !isRecord(request.schema) ||
    !validSchemaName(request.schemaName) ||
    (request.quality !== "efficient" && request.quality !== "deep")
  ) {
    throw new DirectOpenAIError("invalid-output", true);
  }

  const input = request.messages.map((message) => {
    if (
      !isRecord(message) ||
      (message.role !== "system" && message.role !== "user" && message.role !== "assistant") ||
      typeof message.content !== "string"
    ) {
      throw new DirectOpenAIError("invalid-output", true);
    }
    return { role: message.role, content: message.content };
  });

  const body = serializeBoundedJson(
    {
      model: request.model,
      input,
      store: false,
      max_output_tokens: 6000,
      reasoning: { effort: request.quality === "efficient" ? "low" : "medium" },
      text: {
        format: {
          type: "json_schema",
          name: request.schemaName,
          strict: true,
          schema: withoutUnsupportedStringLengths(request.schema),
        },
      },
    },
    request.deadline,
  );

  const payload = await requestJson(
    `${DIRECT_OPENAI_BASE_URL}/responses`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${key}`,
        "content-type": "application/json",
      },
      body,
    },
    request.deadline,
    fetchImpl,
  );
  throwIfExpired(request.deadline);
  return responseOutputText(payload, request.deadline);
}
