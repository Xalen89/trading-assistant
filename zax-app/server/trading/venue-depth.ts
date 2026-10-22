import { TRPCError } from "@trpc/server";
import type { QuantBook } from "../../lib/trading/quant-lab-types";
import { cached, jsonFetch, marketById } from "./market";

const streams = new Map<string, VenueStream>();
type RestDepthSnapshot = {
  raw: { bids?: unknown; asks?: unknown; auction_mode?: unknown; sequence?: unknown };
  fetchedAt: number;
  until: number;
};
const restDepthSnapshots = new Map<string, RestDepthSnapshot>();
const restDepthInflight = new Map<string, Promise<RestDepthSnapshot>>();
const MAX_LEVELS = 200000;
const REST_DEPTH_TTL_MS = 3_000;

async function restDepthSnapshot(
  symbol: string,
  product: string,
): Promise<RestDepthSnapshot> {
  const hit = restDepthSnapshots.get(symbol);
  if (hit && hit.until > Date.now()) return hit;
  const inflight = restDepthInflight.get(symbol);
  if (inflight) return inflight;

  const request = Promise.resolve(
    jsonFetch(
      `https://api.exchange.coinbase.com/products/${product}/book?level=2`,
    ),
  )
    .then((raw) => {
      // Receipt time belongs to the fetched body, not to each later cache read.
      const fetchedAt = Date.now();
      const snapshot: RestDepthSnapshot = {
        raw,
        fetchedAt,
        until: fetchedAt + REST_DEPTH_TTL_MS,
      };
      restDepthSnapshots.set(symbol, snapshot);
      if (restDepthSnapshots.size > 200)
        restDepthSnapshots.delete(restDepthSnapshots.keys().next().value!);
      return snapshot;
    })
    .finally(() => restDepthInflight.delete(symbol));
  restDepthInflight.set(symbol, request);
  return request;
}

export function parseBookSide(
  value: unknown,
  descending: boolean,
): [number, number][] {
  if (!Array.isArray(value)) return [];
  const map = new Map<number, number>();
  for (const row of value)
    if (Array.isArray(row)) {
      const price = Number(row[0]),
        size = Number(row[1]);
      if (
        Number.isFinite(price) &&
        price > 0 &&
        Number.isFinite(size) &&
        size > 0
      )
        map.set(price, size);
    }
  return [...map].sort((a, b) => (descending ? b[0] - a[0] : a[0] - b[0]));
}
export function assertNormalBook(
  bids: [number, number][],
  asks: [number, number][],
  auction?: boolean,
) {
  if (auction || !bids.length || !asks.length || bids[0][0] >= asks[0][0])
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message:
        "Venue book is empty, crossed or in an indicative auction; no normal quote plan produced.",
    });
}
class VenueStream {
  readonly bids = new Map<number, number>();
  readonly asks = new Map<number, number>();
  socket: WebSocket | null = null;
  receivedAt = 0;
  heartbeatAt = 0;
  providerAt = 0;
  snapshot = false;
  failed = false;
  lastRequest = Date.now();
  idle: ReturnType<typeof setTimeout>;
  constructor(
    readonly symbol: string,
    readonly product: string,
  ) {
    this.idle = setTimeout(() => this.expire(), 300000);
    this.idle.unref?.();
    try {
      this.socket = new WebSocket("wss://ws-feed.exchange.coinbase.com");
      this.socket.onopen = () =>
        this.socket?.send(
          JSON.stringify({
            type: "subscribe",
            product_ids: [product],
            channels: ["level2_batch", "heartbeat"],
          }),
        );
      this.socket.onmessage = (event) => this.receive(String(event.data));
      this.socket.onerror = () => {
        this.failed = true;
      };
      this.socket.onclose = () => {
        this.failed = true;
      };
    } catch {
      this.failed = true;
    }
  }
  expire() {
    if (Date.now() - this.lastRequest < 300000) {
      this.idle = setTimeout(() => this.expire(), 300000);
      this.idle.unref?.();
      return;
    }
    this.close();
  }
  close() {
    clearTimeout(this.idle);
    this.socket?.close();
    this.socket = null;
    streams.delete(this.symbol);
  }
  receive(text: string) {
    if (text.length > 20 * 1024 * 1024) {
      this.failed = true;
      this.close();
      return;
    }
    let message: any;
    try {
      message = JSON.parse(text);
    } catch {
      return;
    }
    if (message.type === "error") {
      this.failed = true;
      return;
    }
    if (message.product_id !== this.product) return;
    const at = Date.now();
    if (message.type === "heartbeat") {
      this.heartbeatAt = at;
      return;
    }
    if (message.type === "snapshot") {
      if (!Array.isArray(message.bids) || !Array.isArray(message.asks)) return;
      this.bids.clear();
      this.asks.clear();
      const bid = parseBookSide(message.bids, true),
        ask = parseBookSide(message.asks, false);
      if (bid.length + ask.length > MAX_LEVELS) {
        this.failed = true;
        this.close();
        return;
      }
      bid.forEach(([p, q]) => this.bids.set(p, q));
      ask.forEach(([p, q]) => this.asks.set(p, q));
      this.snapshot = true;
      this.receivedAt = at;
    } else if (
      message.type === "l2update" &&
      this.snapshot &&
      Array.isArray(message.changes)
    ) {
      for (const row of message.changes) {
        if (!Array.isArray(row)) continue;
        const side =
            row[0] === "buy" ? this.bids : row[0] === "sell" ? this.asks : null,
          p = Number(row[1]),
          q = Number(row[2]);
        if (
          !side ||
          !Number.isFinite(p) ||
          p <= 0 ||
          !Number.isFinite(q) ||
          q < 0
        )
          continue;
        if (q === 0) side.delete(p);
        else side.set(p, q);
      }
      if (this.bids.size + this.asks.size > MAX_LEVELS) {
        this.failed = true;
        this.close();
        return;
      }
      this.receivedAt = at;
      const provider = Date.parse(message.time);
      if (Number.isFinite(provider) && provider <= at + 30000)
        this.providerAt = provider;
    }
  }
  ready() {
    return (
      this.snapshot &&
      !this.failed &&
      Date.now() - Math.max(this.receivedAt, this.heartbeatAt) < 15000
    );
  }
  sides() {
    return {
      bids: [...this.bids].sort((a, b) => b[0] - a[0]).slice(0, 50),
      asks: [...this.asks].sort((a, b) => a[0] - b[0]).slice(0, 50),
    };
  }
}
/** No key, no broker access, no orders: real Coinbase aggregated single-venue L2. */
export async function venueDepth(symbol: string): Promise<QuantBook> {
  if (symbol.startsWith("TL:"))
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message:
        "TradeLocker broker quotes are not venue depth. Choose a supported Coinbase crypto product for the real L2 workbench.",
    });
  const market = marketById(symbol);
  if (market.provider !== "coinbase")
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message:
        "No licensed venue L2 feed is configured for this instrument. Coinbase crypto venue depth is supported.",
    });
  const product = await cached(`venue-meta:${symbol}`, 3600000, () =>
    jsonFetch(
      `https://api.exchange.coinbase.com/products/${market.providerSymbol}`,
    ),
  );
  const tickSize = Number(product.quote_increment),
    lotSize = Number(product.base_increment);
  if (!(tickSize > 0 && lotSize > 0))
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "Actual venue tick/lot increments are unavailable.",
    });
  let stream = streams.get(symbol);
  if (stream?.failed) {
    stream.close();
    stream = undefined;
  }
  if (!stream) {
    stream = new VenueStream(symbol, market.providerSymbol);
    streams.set(symbol, stream);
  }
  stream.lastRequest = Date.now();
  for (let wait = 0; wait < 16 && !stream.ready() && !stream.failed; wait++)
    await new Promise((resolve) => setTimeout(resolve, 250));
  if (stream.ready()) {
    const sides = stream.sides();
    assertNormalBook(sides.bids, sides.asks);
    return {
      symbol,
      source: `Coinbase Exchange public level2_batch · single-venue aggregated depth${stream.providerAt ? `; latest engine event ${new Date(stream.providerAt).toISOString()}` : "; initial snapshot receipt time only"}`,
      receivedAt: stream.receivedAt,
      bids: sides.bids,
      asks: sides.asks,
      tickSize,
      lotSize,
      status: "streamed",
    };
  }
  const snapshot = await restDepthSnapshot(
    symbol,
    market.providerSymbol,
  );
  const raw = snapshot.raw;
  const bids = parseBookSide(raw.bids, true).slice(0, 50),
    asks = parseBookSide(raw.asks, false).slice(0, 50);
  assertNormalBook(bids, asks, raw.auction_mode === true);
  return {
    symbol,
    source:
      "Coinbase Exchange REST L2 snapshot · polled fallback, not streamed or consolidated NBBO",
    receivedAt: snapshot.fetchedAt,
    sequence: Number.isFinite(Number(raw.sequence))
      ? Number(raw.sequence)
      : undefined,
    bids,
    asks,
    tickSize,
    lotSize,
    status: "polled",
  };
}
export function closeVenueStreams() {
  for (const stream of streams.values()) stream.close();
}
