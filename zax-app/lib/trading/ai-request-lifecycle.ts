export const AI_SERVICE_FAILURE_KINDS = [
  "terminal-unavailable",
  "request-refused",
  "temporarily-unavailable",
] as const;

export type AIServiceFailureKind = (typeof AI_SERVICE_FAILURE_KINDS)[number];
export type AIRequestSurface = "coach" | "scenario" | "scenario-layer";

const SURFACE_LABELS: Record<AIRequestSurface, string> = {
  coach: "coach",
  scenario: "scenario",
  "scenario-layer": "scenario layer",
};

const PRESERVED_INPUT_COPY: Record<AIRequestSurface, string> = {
  coach: "Your conversation was kept.",
  scenario: "Your question and existing scenario were kept.",
  "scenario-layer": "Your question and saved layers were kept.",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/** Accept only the three protocol values intentionally exposed by the server. */
export function isAIServiceFailureKind(
  value: unknown,
): value is AIServiceFailureKind {
  return (
    typeof value === "string" &&
    (AI_SERVICE_FAILURE_KINDS as readonly string[]).includes(value)
  );
}

/**
 * Reads only the tRPC formatter's allow-listed field. Provider messages, causes,
 * and other error properties are deliberately ignored.
 */
export function readAIServiceFailureKind(
  error: unknown,
): AIServiceFailureKind | undefined {
  if (!isRecord(error) || !isRecord(error.data)) return undefined;
  const kind = error.data.aiFailureKind;
  return isAIServiceFailureKind(kind) ? kind : undefined;
}

/** Fixed UI copy: none of these branches can include upstream/provider text. */
export function fixedAIServiceFailureCopy(
  kind: AIServiceFailureKind | undefined,
  surface: AIRequestSurface,
): string {
  const label = SURFACE_LABELS[surface];
  const preserved = PRESERVED_INPUT_COPY[surface];
  switch (kind) {
    case "terminal-unavailable":
      return `The AI ${label} service cannot complete this request. ${preserved}`;
    case "request-refused":
      return `The AI ${label} service declined this request. Update the request before sending a new one. ${preserved}`;
    default:
      return `The AI ${label} service is temporarily unavailable. ${preserved} Try again later.`;
  }
}

/**
 * This is intentionally longer than the 48-second scenario server deadline.
 * It only releases device controls; it cannot cancel an in-flight server/model request.
 */
export const LOCAL_SCENARIO_REQUEST_TIMEOUT_MS = 52_000;

export function localScenarioTimeoutCopy(surface: AIRequestSurface): string {
  const label = SURFACE_LABELS[surface];
  const preserved = PRESERVED_INPUT_COPY[surface];
  return `This device stopped waiting for the AI ${label}. ${preserved} This did not cancel any server or model work; a late result is ignored.`;
}

/**
 * A small lifecycle guard for an unabortable mutation. Only its active epoch can
 * settle UI state; reset/timeout invalidates late responses without changing inputs.
 */
export class ScenarioRequestEpoch {
  private nextEpoch = 0;
  private activeEpoch: number | undefined;

  begin(): number {
    const epoch = ++this.nextEpoch;
    this.activeEpoch = epoch;
    return epoch;
  }

  settle(epoch: number): boolean {
    if (this.activeEpoch !== epoch) return false;
    this.activeEpoch = undefined;
    return true;
  }

  invalidate(): void {
    this.nextEpoch += 1;
    this.activeEpoch = undefined;
  }
}
