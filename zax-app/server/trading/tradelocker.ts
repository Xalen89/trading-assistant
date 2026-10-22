import { TRPCError } from "@trpc/server";
import type { Candle, Market, Quote, Timeframe } from "../../lib/trading/model";
import { validateCandles, SECONDS } from "../../lib/trading/engine";
import { isDerivedTimeframe } from "../../lib/trading/timeframes";
import type { SourceSessionMetadata } from "../../lib/trading/freshness";
import type { InstrumentFacts } from "../../lib/trading/instrument-setup-types";
import { ENV } from "../_core/env";
import { tradeLockerBase, tradeLockerConfigured } from "./tradelocker-config";
import { beforeDeadline, requestTimeout } from "./scan-budget";
import {
  scheduledScanDeadline,
  consumeScheduledBrokerRead,
} from "./scheduled-scan-budget";
import {
  tradeLockerSourceIdentity,
  type BrokerSourceIdentity,
} from "./source-identity";

type Account = { id: string; accNum: string; currency: string; status: string };
type Instrument = {
  tradableInstrumentId: number;
  name: string;
  description?: string;
  type: string;
  routes: { id: number; type: string }[];
  barSource?: string;
  marketDataExchange?: string;
};
type SourceBoundQuote = Quote & { sourceIdentity: BrokerSourceIdentity };
type NativeBrokerTimeframe = Exclude<Timeframe, "30m" | "4h" | "1w">;
type ResolvedInfoInstrument = {
  item: Instrument;
  route: string;
  account: Account;
  sourceIdentity: BrokerSourceIdentity;
};
const undeclaredBrokerSession = (item: Instrument): SourceSessionMetadata => ({
  coverage: "unknown",
  timezone: "Provider Unix UTC timestamps; broker venue/session",
  calendarState: "unknown",
  reason: `${item.name} did not return a declared trading-session calendar or complete UTC source-period schedule.`,
});
let auth: { accessToken: string; until: number } | undefined,
  authWork: Promise<string> | undefined;
let accountCache:
  | { value: Account; until: number; selectedAccountId: string | undefined }
  | undefined;
let instrumentsCache:
  | { value: Instrument[]; until: number; accountId: string }
  | undefined;
const values = new Map<string, { until: number; value: any }>(),
  pending = new Map<string, Promise<any>>();
let queue = Promise.resolve(),
  lastRequest = 0;
const deadlineReads = new Map<number, number>();
export { tradeLockerConfigured };
// Reserve information reads if the cache cannot remain valid for the whole scan.
function configuredAccountId() {
  const value = process.env.TRADELOCKER_ACCOUNT_ID?.trim();
  return value && value !== "select" ? value : undefined;
}

export function brokerBootstrapReadBudget(deadline: number) {
  const selectedAccountId = configuredAccountId();
  const accountValid =
    accountCache &&
    accountCache.until > deadline &&
    accountCache.selectedAccountId === selectedAccountId;
  return (
    Number(!accountValid) +
    Number(
      !accountValid ||
        !instrumentsCache ||
        instrumentsCache.until <= deadline ||
        instrumentsCache.accountId !== accountCache!.value.id,
    )
  );
}

export function isBrokerMarket(symbol: string) {
  return /^TL:[0-9]{1,18}$/.test(symbol);
}
export type BrokerIdentity = { openId?: string | null; email?: string | null };
export function brokerOwner(identity?: BrokerIdentity | null) {
  if (!identity?.openId) return false;
  if (ENV.ownerOpenId) return identity.openId === ENV.ownerOpenId;
  const owner = (process.env.TRADELOCKER_OWNER_EMAIL || "")
    .trim()
    .toLowerCase();
  return Boolean(
    owner && identity.email && identity.email.trim().toLowerCase() === owner,
  );
}
export function requireBrokerOwner(identity?: BrokerIdentity | null) {
  if (!brokerOwner(identity))
    throw new TRPCError({
      code: "FORBIDDEN",
      message:
        "Sign in with your authorized Manus account to use the private TradeLocker feed.",
    });
}
export function brokerReadAllowed(path: string) {
  return (
    path === "/auth/jwt/all-accounts" ||
    path === "/trade/quotes" ||
    path === "/trade/history" ||
    /^\/trade\/accounts\/[0-9]+\/instruments$/.test(path) ||
    /^\/trade\/instruments\/[0-9]{1,18}$/.test(path)
  );
}
async function transport(
  path: string,
  options: RequestInit = {},
  deadline?: number,
) {
  deadline = scheduledScanDeadline(deadline);
  const job = queue.then(async () => {
    const wait = 650 - (Date.now() - lastRequest);
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    requestTimeout(deadline);
    consumeScheduledBrokerRead();
    if (deadline && path !== "/auth/jwt/token") {
      const used = deadlineReads.get(deadline) || 0;
      if (used >= 12)
        throw new Error("Broker scan read budget exhausted; work deferred.");
      deadlineReads.set(deadline, used + 1);
      if (deadlineReads.size > 100)
        deadlineReads.delete(deadlineReads.keys().next().value!);
    }
    lastRequest = Date.now();
    let response: Response;
    try {
      response = await fetch(tradeLockerBase() + path, {
        ...options,
        redirect: "error",
        signal: AbortSignal.timeout(requestTimeout(deadline)),
      });
    } catch {
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message:
          "TradeLocker transport unavailable. No alternate account, environment or host was attempted.",
      });
    }
    if (!response.ok)
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: `TradeLocker data access returned HTTP ${response.status}. Verify account/API permission. No trading request was sent.`,
      });
    return response.json();
  });
  queue = job.then(
    () => undefined,
    () => undefined,
  );
  return beforeDeadline(job, deadline);
}
async function token() {
  if (auth && auth.until > Date.now()) return auth.accessToken;
  if (authWork) return authWork;
  authWork = (async () => {
    if (!tradeLockerConfigured())
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: "TradeLocker credentials are not configured.",
      });
    const data = await transport("/auth/jwt/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        email: process.env.TRADELOCKER_EMAIL,
        password: process.env.TRADELOCKER_PASSWORD,
        server: process.env.TRADELOCKER_SERVER,
      }),
    });
    if (typeof data.accessToken !== "string")
      throw new Error("Invalid TradeLocker token response.");
    let expiry = Date.now() + 20 * 60000;
    try {
      const payload = JSON.parse(
        Buffer.from(data.accessToken.split(".")[1], "base64url").toString(),
      );
      if (Number.isFinite(payload.exp))
        expiry = Math.min(expiry, payload.exp * 1000 - 60000);
    } catch {}
    auth = { accessToken: data.accessToken, until: expiry };
    return data.accessToken;
  })().finally(() => {
    authWork = undefined;
  });
  return authWork;
}
async function read(
  path: string,
  params: Record<string, string> = {},
  account?: Account,
  deadline?: number,
) {
  requestTimeout(deadline);
  if (!brokerReadAllowed(path))
    throw new TRPCError({
      code: "FORBIDDEN",
      message:
        "Broker order/position operations are not implemented or allowed.",
    });
  const query = new URLSearchParams(params).toString();
  return transport(
    path + (query ? "?" + query : ""),
    {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${await beforeDeadline(token(), deadline)}`,
        ...(account ? { accNum: account.accNum } : {}),
      },
    },
    deadline,
  );
}
async function selectedAccount(deadline?: number): Promise<Account> {
  const selectedAccountId = configuredAccountId();
  if (
    accountCache &&
    accountCache.until > Date.now() &&
    accountCache.selectedAccountId === selectedAccountId
  )
    return accountCache.value;
  const data = await read("/auth/jwt/all-accounts", {}, undefined, deadline);
  const rows = Array.isArray(data) ? data : data.accounts;
  if (!Array.isArray(rows))
    throw new Error("Invalid TradeLocker account response.");
  const raw = selectedAccountId
    ? rows.find((a: any) => String(a.id) === selectedAccountId)
    : rows.length === 1
      ? rows[0]
      : undefined;
  if (!raw)
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message:
        "A matching account must be explicitly selected in protected configuration; no other account was chosen.",
    });
  if (!/^[0-9]+$/.test(String(raw.id)) || !/^[0-9]+$/.test(String(raw.accNum)))
    throw new Error("Invalid account identifiers.");
  const value = {
    id: String(raw.id),
    accNum: String(raw.accNum),
    currency: String(raw.currency || ""),
    status: String(raw.status || ""),
  };
  accountCache = {
    value,
    until: Date.now() + 300000,
    selectedAccountId,
  };
  return value;
}
async function instruments(deadline?: number): Promise<Instrument[]> {
  // Resolve the currently configured selected account before consulting this
  // cache. A configuration change must not bridge an old account's catalog.
  const account = await selectedAccount(deadline);
  if (
    instrumentsCache &&
    instrumentsCache.until > Date.now() &&
    instrumentsCache.accountId === account.id
  )
    return instrumentsCache.value;
  const data = await read(
    `/trade/accounts/${account.id}/instruments`,
    { locale: "en" },
    account,
    deadline,
  );
  const rows = data?.d?.instruments;
  if (!Array.isArray(rows))
    throw new Error("Invalid TradeLocker instrument response.");
  const value = rows.filter(
    (i: any) =>
      Number.isSafeInteger(Number(i.tradableInstrumentId)) &&
      typeof i.name === "string" &&
      Array.isArray(i.routes) &&
      i.routes.some((r: any) => r.type === "INFO"),
  ) as Instrument[];
  instrumentsCache = {
    value,
    until: Date.now() + 300000,
    accountId: account.id,
  };
  return value;
}
function normalized(name: string) {
  return name.toUpperCase().replace(/[^A-Z0-9]/g, "");
}
export function brokerMarket(i: Instrument): Market {
  const s = normalized(i.name),
    type = i.type.toUpperCase();
  const forex = type === "FOREX";
  const category: Market["category"] =
    type === "FUTURES"
      ? "Futures"
      : /XAU|XAG|GOLD|SILVER|OIL|WTI|BRENT/.test(s)
        ? "Metals"
        : type.includes("CRYPTO")
          ? "Crypto"
          : forex
            ? "Forex"
            : /EQUITY|ETF/.test(type)
              ? "Stocks"
              : "Indices";
  const knownUSD =
    type !== "FUTURES" &&
    (s.endsWith("USD") ||
      [
        "USDJPY",
        "USDCAD",
        "NAS100",
        "US100",
        "USTEC",
        "US500",
        "SPX500",
        "SP500",
        "US30",
        "DJ30",
        "AAPL",
        "MSFT",
        "NVDA",
        "TSLA",
        "AMZN",
        "GOOGL",
        "META",
        "SPY",
        "QQQ",
      ].includes(s));
  return {
    id: `TL:${i.tradableInstrumentId}`,
    name: `${i.name} · broker ${type.replaceAll("_", " ")}`,
    category,
    provider: "tradelocker",
    providerSymbol: i.name,
    precision: forex
      ? s.endsWith("JPY")
        ? 3
        : 5
      : category === "Crypto"
        ? 5
        : s.startsWith("XAG")
          ? 3
          : 2,
    pointValue: 1,
    paperSupported: knownUSD,
    valuationSymbol: ["USDJPY", "USDCAD"].includes(s) ? s : undefined,
  };
}
export async function brokerCatalog() {
  return (await instruments()).map(brokerMarket);
}
async function instrument(
  symbol: string,
  deadline?: number,
): Promise<ResolvedInfoInstrument> {
  if (!isBrokerMarket(symbol))
    throw new Error("Invalid TradeLocker instrument ID.");
  const item = (await instruments(deadline)).find(
    (i) => String(i.tradableInstrumentId) === symbol.slice(3),
  );
  if (!item)
    throw new TRPCError({
      code: "NOT_FOUND",
      message:
        "Instrument is not available on the selected TradeLocker account.",
    });
  const route = item.routes.find((r) => r.type === "INFO");
  if (!route) throw new Error("No information route available.");
  const infoRouteId = String(route.id);
  const account = await selectedAccount(deadline);
  return {
    item,
    route: infoRouteId,
    account,
    sourceIdentity: tradeLockerSourceIdentity({
      accountId: account.id,
      instrumentId: String(item.tradableInstrumentId),
      infoRouteId,
      side: "BID",
    }),
  };
}
async function cached<T>(
  key: string,
  ttl: number,
  work: () => Promise<T>,
): Promise<T> {
  const hit = values.get(key);
  if (hit && hit.until > Date.now()) return hit.value;
  if (pending.has(key)) return pending.get(key)!;
  const task = work()
    .then((value) => {
      values.set(key, { value, until: Date.now() + ttl });
      if (values.size > 250) values.delete(values.keys().next().value!);
      return value;
    })
    .finally(() => pending.delete(key));
  pending.set(key, task);
  return task;
}
async function retryCached<T>(
  key: string,
  deadline: number | undefined,
  read: () => Promise<T>,
): Promise<T> {
  const task = pending.get(key);
  if (task)
    await beforeDeadline(
      task.catch(() => undefined),
      deadline,
    );
  values.delete(key);
  return read();
}
function isNativeBrokerTimeframe(
  timeframe: Timeframe,
): timeframe is NativeBrokerTimeframe {
  return !isDerivedTimeframe(timeframe);
}
function uniformTickSize(details: unknown) {
  const bands = (details as { tickSize?: unknown })?.tickSize;
  if (!Array.isArray(bands) || !bands.length) return undefined;
  let tick: number | undefined,
    lowest = Infinity;
  for (const band of bands) {
    if (!band || typeof band !== "object" || Array.isArray(band))
      return undefined;
    const value = (band as { tickSize?: unknown }).tickSize,
      left = (band as { leftRangeLimit?: unknown }).leftRangeLimit;
    if (typeof value !== "number" || !Number.isFinite(value) || value <= 0)
      return undefined;
    // A sole documented minimum increment can have an unstated optional lower bound. Never invent zero.
    if (bands.length === 1 && (left === null || left === undefined))
      return value;
    if (typeof left !== "number" || !Number.isFinite(left)) return undefined;
    lowest = Math.min(lowest, left);
    if (tick === undefined) tick = value;
    else if (tick !== value) return undefined;
  }
  return lowest <= 0 ? tick : undefined;
}
export async function brokerInstrumentFacts(
  symbol: string,
  identity?: BrokerIdentity | null,
  deadline?: number,
): Promise<InstrumentFacts> {
  requireBrokerOwner(identity);
  const { item, account } = await instrument(symbol, deadline);
  const settingsRoute = item.routes.find((route) => route.type === "TRADE");
  if (!settingsRoute || !/^[0-9]+$/.test(String(settingsRoute.id)))
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message:
        "The selected instrument has no documented settings route. No alternate account or guessed route was used.",
    });
  const route = String(settingsRoute.id);
  return beforeDeadline(
    cached(
      `instrument-facts:${account.id}:${symbol}:${route}`,
      300000,
      async () => {
        // The endpoint guide assigns TRADE routeId to this informational GET. All order/position paths remain denied.
        const data = await read(
          `/trade/instruments/${item.tradableInstrumentId}`,
          { routeId: route, locale: "en" },
          account,
          deadline,
        );
        const details = data?.d,
          retrievedAt = Date.now();
        if (
          !details ||
          typeof details.name !== "string" ||
          typeof details.type !== "string" ||
          details.name !== item.name ||
          details.type !== item.type
        )
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message:
              "TradeLocker instrument details did not match the selected account instrument; no alternate instrument was used.",
          });
        const value = uniformTickSize(details),
          tick =
            value === undefined
              ? undefined
              : { value, source: "TradeLocker instrument details tickSize" };
        const shape = Array.isArray(details.tickSize)
          ? `${details.tickSize.length} price bands`
          : `field type ${typeof details.tickSize}`;
        const tickFields = Array.isArray(details.tickSize)
          ? details.tickSize
              .slice(0, 3)
              .map(
                (band: any) =>
                  `lower bound ${band?.leftRangeLimit === undefined ? "omitted" : band?.leftRangeLimit === null ? "null" : typeof band?.leftRangeLimit}, increment ${typeof band?.tickSize}`,
              )
              .join("; ")
          : shape;
        return {
          market: symbol,
          providerSymbol: item.name,
          source:
            "TradeLocker · selected personal account · instrument details",
          retrievedAt,
          tick,
          dailyBasis: "utc-provider-trading-days",
          volumeBasis: "broker-reported",
          messages: [
            tick
              ? `TradeLocker tickSize reports a uniform minimum price change of ${tick.value}.`
              : `TradeLocker instrument details contained no safe uniform tickSize (${shape}); no universal increment was established. No precision, lotStep, tickCost, decimal, or futures-market fallback was used.`,
            ...(tick
              ? []
              : [`Returned tick-field diagnostics only: ${tickFields}.`]),
            "Instrument settings were read through the documented settings identifier; quotes/history stay on INFO and broker orders remain disabled.",
            "Daily bars are provider trading days with timestamps at 00:00 UTC.",
            "Volume is broker-reported; the API does not establish a venue or volume type.",
          ],
        };
      },
    ),
    deadline,
  );
}
async function cachedBrokerQuote(
  symbol: string,
  selected: ResolvedInfoInstrument,
  deadline?: number,
): Promise<SourceBoundQuote> {
  return beforeDeadline(
    cached(`quote:${selected.sourceIdentity}`, 10000, async () => {
      const { item, route, account, sourceIdentity } = selected;
      const data = await read(
        "/trade/quotes",
        {
          tradableInstrumentId: String(item.tradableInstrumentId),
          routeId: route,
        },
        account,
        deadline,
      );
      const q = data.d,
        bid = Number(q?.bp),
        ask = Number(q?.ap);
      if (
        !Number.isFinite(bid) ||
        !Number.isFinite(ask) ||
        bid <= 0 ||
        ask < bid
      )
        throw new Error("TradeLocker did not return a valid bid/ask quote.");
      return {
        symbol,
        price: (bid + ask) / 2,
        bid,
        ask,
        change: 0,
        changeAvailable: false,
        timestamp: Date.now() / 1000,
        timestampKind: "received",
        source: "TradeLocker · selected personal account · bid/ask midpoint",
        sourceIdentity,
        status: "live" as const,
        message:
          "REST response received now; the API quote has no provider timestamp. Price midpoint is not a broker fill. Verify venue sessions and candle freshness.",
      };
    }),
    deadline,
  );
}
export async function brokerQuote(
  symbol: string,
  deadline?: number,
): Promise<SourceBoundQuote> {
  // The caller performs owner authorization before this resolution. Resolve the
  // selected account/instrument INFO route before any quote-cache lookup.
  return cachedBrokerQuote(
    symbol,
    await instrument(symbol, deadline),
    deadline,
  );
}
export async function retryBrokerQuote(
  symbol: string,
  deadline?: number,
): Promise<SourceBoundQuote> {
  const selected = await instrument(symbol, deadline);
  return retryCached(`quote:${selected.sourceIdentity}`, deadline, () =>
    cachedBrokerQuote(symbol, selected, deadline),
  );
}
async function cachedBrokerCandles(
  symbol: string,
  timeframe: NativeBrokerTimeframe,
  selected: ResolvedInfoInstrument,
  deadline?: number,
) {
  return beforeDeadline(
    cached(`bars:${selected.sourceIdentity}:${timeframe}`, 20000, async () => {
      const { item, route, account, sourceIdentity } = selected;
      const resolution = {
        "1m": "1m",
        "5m": "5m",
        "15m": "15m",
        "1h": "1H",
        "1d": "1D",
      }[timeframe];
      const now = Date.now(),
        from = now - SECONDS[timeframe] * 1000 * 600;
      const data = await read(
        "/trade/history",
        {
          tradableInstrumentId: String(item.tradableInstrumentId),
          routeId: route,
          resolution,
          from: String(from),
          to: String(now),
        },
        account,
        deadline,
      );
      if (data.s !== "ok")
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message:
            "TradeLocker reports no historical data in the requested interval.",
        });
      const raw = data.d?.barDetails ?? data.d?.bars ?? data.d;
      if (!Array.isArray(raw))
        throw new Error("Invalid TradeLocker historical-bar response.");
      const volumeBasis = raw.every(
          (r: any) =>
            typeof r?.v === "number" && Number.isFinite(r.v) && r.v >= 0,
        )
          ? ("broker-reported" as const)
          : ("unknown" as const),
        dailyPeriodBasis =
          timeframe === "1d" &&
          raw.every(
            (r: any) =>
              typeof r?.t === "number" &&
              Number.isFinite(r.t) &&
              r.t % 86400000 === 0,
          )
            ? ("utc-provider-trading-days" as const)
            : ("unknown" as const);
      const candles = validateCandles(
        raw.map((r: any) => ({
          time: Number(r.t) / 1000,
          open: Number(r.o),
          high: Number(r.h),
          low: Number(r.l),
          close: Number(r.c),
          volume: Number(r.v || 0),
        })),
      ).slice(-300);
      return {
        candles,
        source: `TradeLocker · ${item.name} · ${item.barSource || "provider"} bars`,
        sourceIdentity,
        requestedAt: now,
        fetchedAt: Date.now(),
        timezone: "Provider Unix UTC timestamps; broker venue/session",
        status: "historical" as const,
        sourceCadenceSeconds: SECONDS[timeframe],
        volumeBasis,
        dailyPeriodBasis,
        session: undeclaredBrokerSession(item),
        message: `Real selected-account bars. Raw volume is ${volumeBasis === "broker-reported" ? "broker-reported (not venue-qualified)" : "unknown because one or more raw v fields were missing or malformed"}. Daily-period basis is ${dailyPeriodBasis === "utc-provider-trading-days" ? "UTC-midnight provider trading days for this actual 1D response" : "unknown for this response"}. Its session calendar was not supplied, so derived 30m/4h/weekly bars are built only where complete lower source periods exist or refused rather than fabricated. Intrabar REST updates are polled, not an exchange WebSocket. Do not infer exchange futures from CFDs.`,
      };
    }),
    deadline,
  );
}
export async function brokerCandles(
  symbol: string,
  timeframe: Timeframe,
  deadline?: number,
) {
  if (!isNativeBrokerTimeframe(timeframe))
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message:
        "Derived 30m/4h/weekly bars must be built from existing lower-resolution reads; no native broker resolution was assumed.",
    });
  // The caller performs owner authorization before this resolution. Resolve the
  // selected account/instrument INFO route before any bar-cache lookup.
  return cachedBrokerCandles(
    symbol,
    timeframe,
    await instrument(symbol, deadline),
    deadline,
  );
}
export async function retryBrokerCandles(
  symbol: string,
  timeframe: Timeframe,
  deadline?: number,
) {
  if (!isNativeBrokerTimeframe(timeframe))
    return brokerCandles(symbol, timeframe, deadline);
  const selected = await instrument(symbol, deadline);
  return retryCached(
    `bars:${selected.sourceIdentity}:${timeframe}`,
    deadline,
    () => cachedBrokerCandles(symbol, timeframe, selected, deadline),
  );
}
export async function brokerStatus() {
  const account = await selectedAccount(),
    catalog = await brokerCatalog();
  return {
    connected: true,
    instrumentCount: catalog.length,
    currency: account.currency,
    accountStatus: account.status,
    mode: "data-only" as const,
    message:
      "Selected TradeLocker account authenticated. Information routes only; broker trading operations disabled.",
  };
}
