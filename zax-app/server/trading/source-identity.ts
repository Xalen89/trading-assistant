import { createHash } from "node:crypto";

/**
 * A stable, opaque discriminator for one authorized TradeLocker INFO/BID source.
 * It is deliberately safe to persist or return to clients: the selected account,
 * instrument, and route identifiers are only hash inputs and are never included
 * in the resulting value.
 */
export type BrokerSourceIdentity = `tradelocker-info-bid:${string}`;

type BrokerSourceIdentityInput = Readonly<{
  accountId: string;
  instrumentId: string;
  infoRouteId: string;
  side: "BID";
}>;

const NUMERIC_IDENTIFIER = /^\d{1,18}$/;
const PREFIX = "tradelocker-info-bid";

function requiredNumericIdentifier(value: string, field: string): string {
  if (!NUMERIC_IDENTIFIER.test(value)) {
    throw new Error(`Invalid ${field} while resolving broker source identity.`);
  }
  return value;
}

/**
 * Resolves a source identity only after the adapter has selected the authorized
 * account and exact instrument INFO route. The raw inputs must stay server-only.
 */
export function tradeLockerSourceIdentity(
  input: BrokerSourceIdentityInput,
): BrokerSourceIdentity {
  const accountId = requiredNumericIdentifier(
    input.accountId,
    "account identifier",
  );
  const instrumentId = requiredNumericIdentifier(
    input.instrumentId,
    "instrument identifier",
  );
  const infoRouteId = requiredNumericIdentifier(
    input.infoRouteId,
    "INFO route",
  );

  const fingerprint = createHash("sha256")
    .update(PREFIX)
    .update("\u0000")
    .update(accountId)
    .update("\u0000")
    .update(instrumentId)
    .update("\u0000")
    .update(infoRouteId)
    .update("\u0000")
    .update(input.side)
    .digest("hex");

  return `${PREFIX}:${fingerprint}`;
}

/** A bounded identity is required before durable provenance may be reused. */
export function isSourceIdentity(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= 128 &&
    value.trim() === value &&
    !/[\u0000-\u001f\u007f]/.test(value)
  );
}
