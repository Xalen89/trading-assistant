import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import type { User } from "../../drizzle/schema";
import { tradingRuntimeState } from "../../drizzle/schema";
import type { Quote } from "../../lib/trading/model";
import type { QuoteObservationPair } from "../../lib/trading/session-strategy-model";
import { mayUseApp } from "./access";
import { dbRequired } from "./repository";
import { isSourceIdentity } from "./source-identity";

export const STRATEGY_QUOTE_OBSERVATION_KIND = "strategy-quote-observation";
const MAX_QUOTE_AGE_SECONDS = 30;
const MAX_PAIR_INTERVAL_SECONDS = 90;
const MAX_UNIX_SECONDS = 10_000_000_000;

type SourceBoundQuote = Quote;

type PersistedQuoteObservation = {
  version: 2;
  symbol: string;
  source: string;
  /** Omitted for legacy label-only providers; never synthesized from a label. */
  sourceIdentity?: string;
  last: SourceBoundQuote;
  previous?: SourceBoundQuote;
  /** Server receipt time in Unix seconds, rather than a provider timestamp. */
  capturedAt: number;
};

export type QuoteObservationTransition =
  | {
      action: "store";
      pair: QuoteObservationPair;
      record: PersistedQuoteObservation;
    }
  | { action: "reuse"; pair: QuoteObservationPair }
  | { action: "reject" };

type ReadObservation = {
  last: SourceBoundQuote;
  previous?: SourceBoundQuote;
  capturedAt: number;
};

function validSeconds(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value > 0 &&
    value < MAX_UNIX_SECONDS
  );
}

function exactIdentifier(
  value: unknown,
  maximumLength: number,
): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= maximumLength &&
    value.trim() === value
  );
}

/**
 * Whitelist quote fields before persistence. Unknown provider fields, including
 * accidental credentials or account details, are never copied to runtime state.
 */
function canonicalQuote(value: unknown): SourceBoundQuote | undefined {
  if (!value || typeof value !== "object") return undefined;
  const input = value as Partial<Quote> & { sourceIdentity?: unknown };
  if (
    !exactIdentifier(input.symbol, 100) ||
    !exactIdentifier(input.source, 2_000) ||
    typeof input.price !== "number" ||
    !Number.isFinite(input.price) ||
    input.price <= 0 ||
    typeof input.change !== "number" ||
    !Number.isFinite(input.change) ||
    !validSeconds(input.timestamp) ||
    input.status !== "live"
  )
    return undefined;
  if (
    input.sourceIdentity !== undefined &&
    !isSourceIdentity(input.sourceIdentity)
  )
    return undefined;

  if (
    input.timestampKind !== undefined &&
    input.timestampKind !== "provider" &&
    input.timestampKind !== "received"
  )
    return undefined;
  if (
    input.changeAvailable !== undefined &&
    typeof input.changeAvailable !== "boolean"
  )
    return undefined;
  if (
    input.bid !== undefined &&
    (!Number.isFinite(input.bid) || input.bid <= 0)
  )
    return undefined;
  if (
    input.ask !== undefined &&
    (!Number.isFinite(input.ask) || input.ask <= 0)
  )
    return undefined;
  if (
    input.bid !== undefined &&
    input.ask !== undefined &&
    input.ask < input.bid
  )
    return undefined;

  return {
    symbol: input.symbol,
    price: input.price,
    change: input.change,
    ...(input.changeAvailable === undefined
      ? {}
      : { changeAvailable: input.changeAvailable }),
    ...(input.bid === undefined ? {} : { bid: input.bid }),
    ...(input.ask === undefined ? {} : { ask: input.ask }),
    ...(input.timestampKind === undefined
      ? {}
      : { timestampKind: input.timestampKind }),
    timestamp: input.timestamp,
    source: input.source,
    ...(input.sourceIdentity === undefined
      ? {}
      : { sourceIdentity: input.sourceIdentity }),
    status: "live",
  };
}

function currentQuote(
  value: unknown,
  nowSeconds: number,
): SourceBoundQuote | undefined {
  if (!validSeconds(nowSeconds)) return undefined;
  const quote = canonicalQuote(value);
  if (!quote) return undefined;
  if (quote.timestamp > nowSeconds) return undefined;
  if (nowSeconds - quote.timestamp > MAX_QUOTE_AGE_SECONDS) return undefined;
  return quote;
}

function sameQuoteOrigin(left: SourceBoundQuote, right: SourceBoundQuote) {
  if (left.sourceIdentity !== undefined || right.sourceIdentity !== undefined)
    return (
      left.sourceIdentity !== undefined &&
      left.sourceIdentity === right.sourceIdentity
    );
  return left.source === right.source;
}

function sameQuote(left: SourceBoundQuote, right: SourceBoundQuote) {
  return (
    left.symbol === right.symbol &&
    sameQuoteOrigin(left, right) &&
    left.price === right.price &&
    left.change === right.change &&
    left.changeAvailable === right.changeAvailable &&
    left.bid === right.bid &&
    left.ask === right.ask &&
    left.timestampKind === right.timestampKind &&
    left.timestamp === right.timestamp &&
    left.status === right.status
  );
}

/**
 * Reads only an exact, same-source persisted record. A malformed or out-of-
 * interval prior is deliberately discarded; it must not manufacture a cross.
 */
function readObservation(
  value: unknown,
  symbol: string,
  source: string,
  sourceIdentity?: string,
): ReadObservation | undefined {
  if (!value || typeof value !== "object") return undefined;
  const input = value as Partial<PersistedQuoteObservation>;
  if (
    input.version !== 2 ||
    input.symbol !== symbol ||
    input.source !== source ||
    input.sourceIdentity !== sourceIdentity ||
    (input.sourceIdentity !== undefined &&
      !isSourceIdentity(input.sourceIdentity)) ||
    !validSeconds(input.capturedAt)
  )
    return undefined;
  const last = canonicalQuote(input.last);
  if (
    !last ||
    last.symbol !== symbol ||
    last.source !== source ||
    last.sourceIdentity !== sourceIdentity
  )
    return undefined;

  const candidate =
    input.previous === undefined ? undefined : canonicalQuote(input.previous);
  const previous =
    candidate &&
    candidate.symbol === symbol &&
    candidate.source === source &&
    candidate.sourceIdentity === sourceIdentity &&
    candidate.timestamp < last.timestamp &&
    last.timestamp - candidate.timestamp <= MAX_PAIR_INTERVAL_SECONDS
      ? candidate
      : undefined;
  return { last, previous, capturedAt: input.capturedAt };
}

function pair(
  current: SourceBoundQuote,
  observedAt: number,
  previous?: SourceBoundQuote,
): QuoteObservationPair {
  return {
    ...(previous === undefined ? {} : { previous }),
    current,
    ...(current.sourceIdentity === undefined
      ? {}
      : { sourceIdentity: current.sourceIdentity }),
    observedAt,
    method: "owner-persisted-rest-observations",
  };
}

function baseline(
  current: SourceBoundQuote,
  capturedAt: number,
): QuoteObservationTransition {
  return {
    action: "store",
    pair: pair(current, capturedAt),
    record: {
      version: 2,
      symbol: current.symbol,
      source: current.source,
      ...(current.sourceIdentity === undefined
        ? {}
        : { sourceIdentity: current.sourceIdentity }),
      last: current,
      capturedAt,
    },
  };
}

/**
 * Pure state transition used by the database wrapper and software-only tests.
 * It never fetches market data and it never treats a first observation as a
 * crossing quote. `reject` means evidence is unknown/not ready.
 */
export function transitionStrategyQuoteObservation(
  persisted: unknown,
  quote: Quote,
  nowSeconds = Date.now() / 1_000,
): QuoteObservationTransition {
  const current = currentQuote(quote, nowSeconds);
  if (!current) return { action: "reject" };

  const prior = readObservation(
    persisted,
    current.symbol,
    current.source,
    current.sourceIdentity,
  );
  // A row is absent only when its payload is undefined. A present but malformed,
  // wrong-source, or wrong-symbol row is not a safe baseline to overwrite.
  if (!prior)
    return persisted === undefined
      ? baseline(current, nowSeconds)
      : { action: "reject" };

  if (current.timestamp < prior.last.timestamp) return { action: "reject" };
  if (current.timestamp === prior.last.timestamp) {
    // Same provider instant with a different quote is contradictory, not a cross.
    if (!sameQuote(current, prior.last)) return { action: "reject" };
    if (
      prior.capturedAt > nowSeconds ||
      nowSeconds - prior.capturedAt > MAX_QUOTE_AGE_SECONDS
    )
      return { action: "reject" };
    return {
      action: "reuse",
      pair: pair(prior.last, prior.capturedAt, prior.previous),
    };
  }

  const previous =
    current.timestamp - prior.last.timestamp <= MAX_PAIR_INTERVAL_SECONDS
      ? prior.last
      : undefined;
  return {
    action: "store",
    pair: pair(current, nowSeconds, previous),
    record: {
      version: 2,
      symbol: current.symbol,
      source: current.source,
      ...(current.sourceIdentity === undefined
        ? {}
        : { sourceIdentity: current.sourceIdentity }),
      last: current,
      ...(previous === undefined ? {} : { previous }),
      capturedAt: nowSeconds,
    },
  };
}

/** Stable, owner-scoped primary key; source/symbol remain exact in the payload. */
export function strategyQuoteObservationId(
  userId: number,
  symbol: string,
  source: string,
  sourceIdentity = source,
) {
  const fingerprint = createHash("sha256")
    .update(symbol)
    .update("\u0000")
    .update(sourceIdentity)
    .digest("hex");
  return `${STRATEGY_QUOTE_OBSERVATION_KIND}:${userId}:${fingerprint}`;
}

function isDuplicateKey(error: unknown) {
  const dbError = error as {
    code?: unknown;
    errno?: unknown;
    message?: unknown;
  };
  return (
    dbError?.code === "ER_DUP_ENTRY" ||
    dbError?.errno === 1062 ||
    (typeof dbError?.message === "string" && /duplicate/i.test(dbError.message))
  );
}

/**
 * Durably observes an already-fetched actual REST quote. Failure is deliberately
 * represented as `undefined` (quote evidence unknown/not ready), never as a
 * fabricated prior/cross. The row lock and transaction prevent a late callback
 * from rolling a source's stored timestamp backward. No local cache is used as
 * evidence because a restart must read this owner-scoped record.
 */
export async function observeStrategyQuote(
  user: User,
  quote: Quote,
  nowSeconds = Date.now() / 1_000,
): Promise<QuoteObservationPair | undefined> {
  if (!mayUseApp(user) || !Number.isSafeInteger(user.id) || user.id <= 0)
    return undefined;

  // Avoid a DB transaction for input that can never become durable evidence.
  const validQuote = currentQuote(quote, nowSeconds);
  if (!validQuote) return undefined;
  const id = strategyQuoteObservationId(
    user.id,
    validQuote.symbol,
    validQuote.source,
    validQuote.sourceIdentity,
  );

  let db: any;
  try {
    db = await dbRequired();
  } catch {
    return undefined;
  }

  // A missing-row gap can race at insert. Retry that duplicate once, then lock
  // and re-evaluate the persisted newer row rather than clobbering it.
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      return await db.transaction(async (tx: any) => {
        const rows = await tx
          .select({ payload: tradingRuntimeState.payload })
          .from(tradingRuntimeState)
          .where(
            and(
              eq(tradingRuntimeState.id, id),
              eq(tradingRuntimeState.userId, user.id),
              eq(tradingRuntimeState.kind, STRATEGY_QUOTE_OBSERVATION_KIND),
            ),
          )
          .limit(1)
          .for("update");
        const transition = transitionStrategyQuoteObservation(
          rows[0]?.payload,
          validQuote,
          nowSeconds,
        );
        if (transition.action === "reject") return undefined;
        if (transition.action === "reuse") return transition.pair;

        if (rows.length) {
          await tx
            .update(tradingRuntimeState)
            .set({
              payload: transition.record,
              updatedAt: new Date(nowSeconds * 1_000),
            })
            .where(
              and(
                eq(tradingRuntimeState.id, id),
                eq(tradingRuntimeState.userId, user.id),
                eq(tradingRuntimeState.kind, STRATEGY_QUOTE_OBSERVATION_KIND),
              ),
            );
        } else {
          await tx.insert(tradingRuntimeState).values({
            id,
            userId: user.id,
            kind: STRATEGY_QUOTE_OBSERVATION_KIND,
            payload: transition.record,
            updatedAt: new Date(nowSeconds * 1_000),
          });
        }
        return transition.pair;
      });
    } catch (error) {
      if (attempt === 0 && isDuplicateKey(error)) continue;
      return undefined;
    }
  }
  return undefined;
}
