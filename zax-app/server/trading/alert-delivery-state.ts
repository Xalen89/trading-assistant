export const DELIVERY_LEASE_MS = 20_000;
export const MAX_DELIVERY_ATTEMPTS = 3;
export const MAX_DELIVERY_TICKETS = 10;

export type DeliveryTicketStatus = "accepted" | "rejected";
export type DeliveryReceiptStatus =
  | "pending"
  | "ok"
  | "error"
  | "not-requested";
export type DeliveryPhase = "sending" | "sent" | "recovered" | "exhausted";

/**
 * Runtime-state payload for one owner event. It intentionally stores a stable
 * hash of each device token rather than the token itself, while preserving every
 * ticket and receipt needed to derive a conservative aggregate delivery state.
 */
export type AlertDeliveryRuntimeRecord = {
  version: 1;
  eventId: string;
  claimToken?: string;
  phase: DeliveryPhase;
  attempts: number;
  claimedAt?: number;
  leaseUntil?: number;
  tickets: Array<{
    deviceKey: string;
    ticketId?: string;
    ticketStatus: DeliveryTicketStatus;
    receiptStatus: DeliveryReceiptStatus;
    providerError?: string;
    updatedAt: number;
  }>;
};

export type AggregateDelivery =
  | "receipt-pending"
  | "provider-accepted"
  | "provider-partial"
  | "receipt-error"
  | "push-partial"
  | "push-rejected";

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function boundedText(value: unknown, maximum: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed && trimmed.length <= maximum ? trimmed : undefined;
}

export function deliveryRuntimeStateId(userId: number, eventId: string) {
  if (!Number.isInteger(userId) || userId <= 0) return undefined;
  const safeEventId = boundedText(eventId, 128);
  if (!safeEventId) return undefined;
  const id = `alert-delivery:${userId}:${safeEventId}`;
  return id.length <= 180 ? id : undefined;
}

export function sendingDelivery(claimToken: string) {
  const token = boundedText(claimToken, 24);
  return token && /^[A-Za-z0-9_-]+$/.test(token)
    ? `sending:${token}`
    : undefined;
}

/** Mirrors the event-row `WHERE delivery = 'pending'` precondition. */
export function conditionalPendingClaim(
  currentDelivery: string,
  claimToken: string,
) {
  return currentDelivery === "pending"
    ? sendingDelivery(claimToken)
    : undefined;
}

export function claimTokenFromDelivery(delivery: unknown) {
  if (typeof delivery !== "string" || !delivery.startsWith("sending:"))
    return undefined;
  const token = delivery.slice("sending:".length);
  return sendingDelivery(token) ? token : undefined;
}

export function deliveryRuntimeRecord(
  value: unknown,
): AlertDeliveryRuntimeRecord | undefined {
  if (!value || typeof value !== "object") return undefined;
  const raw = value as Partial<AlertDeliveryRuntimeRecord>;
  const eventId = boundedText(raw.eventId, 128);
  const attempts = raw.attempts;
  if (
    raw.version !== 1 ||
    !eventId ||
    !Object.values<DeliveryPhase>({
      sending: "sending",
      sent: "sent",
      recovered: "recovered",
      exhausted: "exhausted",
    }).includes(raw.phase as DeliveryPhase) ||
    typeof attempts !== "number" ||
    !Number.isInteger(attempts) ||
    attempts < 0 ||
    attempts > MAX_DELIVERY_ATTEMPTS ||
    !Array.isArray(raw.tickets) ||
    raw.tickets.length > MAX_DELIVERY_TICKETS
  )
    return undefined;
  const tickets = raw.tickets.map((ticket) => {
    if (!ticket || typeof ticket !== "object") return undefined;
    const item = ticket as AlertDeliveryRuntimeRecord["tickets"][number];
    const deviceKey = boundedText(item.deviceKey, 64);
    const ticketId = boundedText(item.ticketId, 256);
    const providerError = boundedText(item.providerError, 64);
    if (
      !deviceKey ||
      (item.ticketStatus !== "accepted" && item.ticketStatus !== "rejected") ||
      !["pending", "ok", "error", "not-requested"].includes(
        item.receiptStatus,
      ) ||
      !finite(item.updatedAt) ||
      (item.ticketStatus === "accepted" && !ticketId)
    )
      return undefined;
    return {
      deviceKey,
      ...(ticketId ? { ticketId } : {}),
      ticketStatus: item.ticketStatus,
      receiptStatus: item.receiptStatus,
      ...(providerError ? { providerError } : {}),
      updatedAt: item.updatedAt,
    };
  });
  if (tickets.some((ticket) => !ticket)) return undefined;
  const claimToken = boundedText(raw.claimToken, 24);
  const leaseUntil = finite(raw.leaseUntil) ? raw.leaseUntil : undefined;
  const claimedAt = finite(raw.claimedAt) ? raw.claimedAt : undefined;
  if (
    raw.phase === "sending" &&
    (!claimToken || !sendingDelivery(claimToken) || !claimedAt || !leaseUntil)
  )
    return undefined;
  return {
    version: 1,
    eventId,
    ...(claimToken ? { claimToken } : {}),
    phase: raw.phase as DeliveryPhase,
    attempts,
    ...(claimedAt ? { claimedAt } : {}),
    ...(leaseUntil ? { leaseUntil } : {}),
    tickets: tickets as AlertDeliveryRuntimeRecord["tickets"],
  };
}

export function newDeliveryClaim(input: {
  eventId: string;
  claimToken: string;
  attempts: number;
  now: number;
}): AlertDeliveryRuntimeRecord | undefined {
  const claimToken = boundedText(input.claimToken, 24);
  const eventId = boundedText(input.eventId, 128);
  if (
    !eventId ||
    !claimToken ||
    !sendingDelivery(claimToken) ||
    !Number.isInteger(input.attempts) ||
    input.attempts < 1 ||
    input.attempts > MAX_DELIVERY_ATTEMPTS ||
    !finite(input.now)
  )
    return undefined;
  return {
    version: 1,
    eventId,
    claimToken,
    phase: "sending",
    attempts: input.attempts,
    claimedAt: input.now,
    leaseUntil: input.now + DELIVERY_LEASE_MS,
    tickets: [],
  };
}

export function mayRecoverDeliveryLease(input: {
  delivery: string;
  record?: unknown;
  createdAt?: Date;
  now: number;
}) {
  const token = claimTokenFromDelivery(input.delivery);
  const record = deliveryRuntimeRecord(input.record);
  if (token && record?.phase === "sending") {
    return (
      record.claimToken === token &&
      Boolean(record.leaseUntil && record.leaseUntil <= input.now) &&
      record.attempts < MAX_DELIVERY_ATTEMPTS
    );
  }
  // Only migrate a legacy bare `sending` state after a full lease interval.
  // New claims write the event and runtime record in one transaction.
  return Boolean(
    input.delivery === "sending" &&
    input.createdAt &&
    input.createdAt.getTime() <= input.now - DELIVERY_LEASE_MS,
  );
}

export function aggregateDelivery(
  tickets: AlertDeliveryRuntimeRecord["tickets"],
): AggregateDelivery {
  const accepted = tickets.filter(
    (ticket) => ticket.ticketStatus === "accepted",
  );
  if (!accepted.length) return "push-rejected";
  const pending = accepted.filter(
    (ticket) => ticket.receiptStatus === "pending",
  );
  if (pending.length) {
    return accepted.length === tickets.length
      ? "receipt-pending"
      : "push-partial";
  }
  const ok = accepted.filter((ticket) => ticket.receiptStatus === "ok");
  if (ok.length === accepted.length && accepted.length === tickets.length)
    return "provider-accepted";
  if (ok.length) return "provider-partial";
  return "receipt-error";
}

export function receiptTicketIds(record: unknown) {
  const parsed = deliveryRuntimeRecord(record);
  if (!parsed) return [];
  return parsed.tickets
    .filter(
      (ticket) =>
        ticket.ticketStatus === "accepted" &&
        ticket.receiptStatus === "pending" &&
        typeof ticket.ticketId === "string",
    )
    .map((ticket) => ticket.ticketId!);
}

export function withReceiptResults(input: {
  record: unknown;
  receipts: Record<string, { status?: unknown; details?: { error?: unknown } }>;
  now: number;
}) {
  const record = deliveryRuntimeRecord(input.record);
  if (!record || record.phase !== "sent") return undefined;
  const invalidDeviceKeys: string[] = [];
  const tickets = record.tickets.map((ticket) => {
    if (
      ticket.ticketStatus !== "accepted" ||
      ticket.receiptStatus !== "pending" ||
      !ticket.ticketId
    )
      return ticket;
    const receipt = input.receipts[ticket.ticketId];
    if (!receipt || (receipt.status !== "ok" && receipt.status !== "error"))
      return ticket;
    const providerError = boundedText(receipt.details?.error, 64);
    if (providerError === "DeviceNotRegistered")
      invalidDeviceKeys.push(ticket.deviceKey);
    return {
      ...ticket,
      receiptStatus:
        receipt.status === "ok" ? ("ok" as const) : ("error" as const),
      ...(providerError ? { providerError } : {}),
      updatedAt: input.now,
    };
  });
  const next: AlertDeliveryRuntimeRecord = {
    ...record,
    tickets,
  };
  return {
    record: next,
    delivery: aggregateDelivery(tickets),
    invalidDeviceKeys: [...new Set(invalidDeviceKeys)],
  };
}
