/**
 * Read-only, no-key public market context.  It intentionally covers only a small,
 * source-labelled US calendar and one verified CME Bitcoin futures COT contract.
 * It is not a live news, consensus, or OTC/spot positioning feed.
 */
export type EconomicEvent = {
  /** ISO instant when supplied by the source, otherwise the official meeting date. */
  date: string;
  country: "US";
  currency: "USD";
  event: string;
  impact: "High" | "Medium";
  /** The app's fixed importance label, not an agency-assigned impact score. */
  importanceSource: "StratDesk fixed release importance";
  actual: null;
  estimate: null;
  previous: null;
  change: null;
  source: string;
  sourceUrl: string;
  timezone: string;
  /** Only BLS has a reference-period label in this bounded source set. */
  referencePeriod?: string;
  /** FOMC supplies a meeting date but not a release time in this parser. */
  timeKnown: boolean;
};

export type COTReport = {
  /** CFTC Tuesday report date; this is historical weekly data, not a live position. */
  date: string;
  reportDate: string;
  /** CFTC does not provide a historical publication timestamp in this record. */
  publishedAt: null;
  releaseVintage: "unknown";
  symbol: "BTC-USD";
  market: string;
  exchange: "Chicago Mercantile Exchange";
  cftcContractMarketCode: "133741";
  reportType: "CFTC Legacy futures-only";
  contractUnits: string;
  openInterest: number;
  nonCommercialLong: number;
  nonCommercialShort: number;
  commercialLong: number;
  commercialShort: number;
  /** This identifies contracts, not a forecast, sentiment, or directional bias. */
  coverage: "CME Bitcoin futures only; not Coinbase spot, OTC, or all crypto";
  source: string;
  sourceUrl: string;
};

export type PublicContext = {
  events: EconomicEvent[];
  cot: COTReport[];
  message: string;
};

type ContextFetcher = (input: string, init?: RequestInit) => Promise<Response>;

export type PublicContextOptions = {
  fetcher?: ContextFetcher;
  now?: number;
};

type JsonRecord = Record<string, unknown>;
type SourceResult<T> = { value: T; label: string };

const BLS_ICS_URL = "https://www.bls.gov/schedule/news_release/bls.ics";
const BEA_RELEASES_URL = "https://apps.bea.gov/API/signup/release_dates.json";
const FED_FOMC_URL = "https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm";
const CFTC_DATASET_URL = "https://publicreporting.cftc.gov/resource/6dca-aqww.json";
const CFTC_CONTRACT_CODE = "133741" as const;
const REQUEST_TIMEOUT_MS = 12_000;
const CONTEXT_CACHE_MS = 5 * 60_000;
const WINDOW_MS = 366 * 24 * 60 * 60 * 1000;
const MAX_EVENTS = 50;

const BLS_IMPORTANCE: Record<string, "High" | "Medium"> = {
  "Employment Situation": "High",
  "Consumer Price Index": "High",
  "Producer Price Index": "High",
  "Job Openings and Labor Turnover Survey": "Medium",
};

const BEA_IMPORTANCE: Record<string, "High" | "Medium"> = {
  "Gross Domestic Product": "High",
  "Personal Income and Outlays": "High",
  "U.S. International Trade in Goods and Services": "Medium",
};

let cache: { until: number; value: PublicContext } | undefined;
let inflight: Promise<PublicContext> | undefined;

function defaultFetcher(input: string, init?: RequestInit) {
  return fetch(input, init);
}

function asRecord(value: unknown): JsonRecord | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : undefined;
}

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function wholeNumber(value: unknown): number | undefined {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : undefined;
}

function isoDate(value: string): string | undefined {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : undefined;
}

function dateOnly(value: string): string | undefined {
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(value);
  return match?.[1];
}

function sourceError(label: string, error: unknown) {
  const detail = error instanceof Error ? error.message : "unknown failure";
  return `${label} unavailable (${detail.slice(0, 180)})`;
}

async function readText(url: string, fetcher: ContextFetcher): Promise<string> {
  const response = await fetcher(url, {
    headers: {
      Accept: "text/calendar,text/html;q=0.9,*/*;q=0.1",
      "User-Agent": "StratDesk-public-context/1.0 (+read-only official sources)",
    },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.text();
}

async function readJson(url: string, fetcher: ContextFetcher): Promise<unknown> {
  const response = await fetcher(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": "StratDesk-public-context/1.0 (+read-only official sources)",
    },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

function unescapeIcs(value: string) {
  return value.replace(/\\n/gi, " ").replace(/\\,/g, ",").replace(/\\;/g, ";").replace(/\\\\/g, "\\");
}

function icsProperty(block: string, key: string): string | undefined {
  const match = new RegExp(`^${key}(?:;[^:]*)?:(.*)$`, "m").exec(block);
  return match ? unescapeIcs(match[1].trim()) : undefined;
}

/** Converts the BLS US-Eastern local DTSTART form without assuming today's DST offset. */
function easternIcsToIso(value: string): string | undefined {
  const utcMatch = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/.exec(value);
  if (utcMatch)
    return new Date(
      Date.UTC(
        Number(utcMatch[1]),
        Number(utcMatch[2]) - 1,
        Number(utcMatch[3]),
        Number(utcMatch[4]),
        Number(utcMatch[5]),
        Number(utcMatch[6]),
      ),
    ).toISOString();
  const match = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})$/.exec(value);
  if (!match) return undefined;
  const naive = Date.UTC(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
    Number(match[4]),
    Number(match[5]),
    Number(match[6]),
  );
  let guess = naive;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    }).formatToParts(new Date(guess));
    const shown = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    const shownUtc = Date.UTC(
      Number(shown.year),
      Number(shown.month) - 1,
      Number(shown.day),
      Number(shown.hour),
      Number(shown.minute),
      Number(shown.second),
    );
    guess += naive - shownUtc;
  }
  return new Date(guess).toISOString();
}

/** Parses the official BLS iCalendar VEVENT fields, not inferred recurring dates. */
export function parseBlsCalendar(calendar: string, now = Date.now()): EconomicEvent[] {
  const start = now - 24 * 60 * 60 * 1000;
  const end = now + WINDOW_MS;
  const unfolded = calendar.replace(/\r?\n[ \t]/g, "");
  const events: EconomicEvent[] = [];
  for (const match of unfolded.matchAll(/BEGIN:VEVENT\s*([\s\S]*?)\s*END:VEVENT/g)) {
    const block = match[1];
    const event = icsProperty(block, "SUMMARY");
    const startValue = icsProperty(block, "DTSTART");
    const impact = event ? BLS_IMPORTANCE[event] : undefined;
    const date = startValue ? easternIcsToIso(startValue) : undefined;
    if (!event || !impact || !date) continue;
    const milliseconds = Date.parse(date);
    if (!Number.isFinite(milliseconds) || milliseconds < start || milliseconds > end) continue;
    events.push({
      date,
      country: "US",
      currency: "USD",
      event,
      impact,
      importanceSource: "StratDesk fixed release importance",
      actual: null,
      estimate: null,
      previous: null,
      change: null,
      source: "U.S. Bureau of Labor Statistics · official release calendar",
      sourceUrl: BLS_ICS_URL,
      timezone: "America/New_York (BLS US-Eastern DTSTART)",
      timeKnown: true,
    });
  }
  return events;
}

/** Parses the official BEA machine-readable release_dates object without adding forecasts or results. */
export function parseBeaCalendar(value: unknown, now = Date.now()): EconomicEvent[] {
  const root = asRecord(value);
  if (!root) throw new Error("unexpected BEA JSON shape");
  const start = now - 24 * 60 * 60 * 1000;
  const end = now + WINDOW_MS;
  const events: EconomicEvent[] = [];
  for (const [event, impact] of Object.entries(BEA_IMPORTANCE)) {
    const record = asRecord(root[event]);
    const dates = record?.release_dates;
    if (!Array.isArray(dates)) continue;
    for (const candidate of dates) {
      const date = typeof candidate === "string" ? isoDate(candidate) : undefined;
      if (!date) continue;
      const milliseconds = Date.parse(date);
      if (milliseconds < start || milliseconds > end) continue;
      events.push({
        date,
        country: "US",
        currency: "USD",
        event,
        impact,
        importanceSource: "StratDesk fixed release importance",
        actual: null,
        estimate: null,
        previous: null,
        change: null,
        source: "U.S. Bureau of Economic Analysis · machine-readable release schedule",
        sourceUrl: BEA_RELEASES_URL,
        timezone: "UTC offset supplied by BEA",
        timeKnown: true,
      });
    }
  }
  return events;
}

function htmlToText(html: string) {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ");
}

const MONTHS: Record<string, number> = {
  January: 0,
  February: 1,
  March: 2,
  April: 3,
  May: 4,
  June: 5,
  July: 6,
  August: 7,
  September: 8,
  October: 9,
  November: 10,
  December: 11,
};

/**
 * The Fed page publishes meeting days. It does not give a publication time in
 * the calendar section, so this emits only the final meeting day and marks time unknown.
 */
export function parseFomcCalendar(html: string, now = Date.now()): EconomicEvent[] {
  const page = htmlToText(html);
  const sections = Array.from(
    page.matchAll(/\b(20\d{2})\s+FOMC Meetings\b([\s\S]*?)(?=\b20\d{2}\s+FOMC Meetings\b|$)/g),
  );
  const start = now - 24 * 60 * 60 * 1000;
  const end = now + WINDOW_MS;
  const events: EconomicEvent[] = [];
  for (const section of sections) {
    const year = Number(section[1]);
    for (const match of section[2].matchAll(
      /\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2})(?:\s*[-–]\s*(\d{1,2}))?\*?/g,
    )) {
      const month = MONTHS[match[1]];
      const day = Number(match[3] || match[2]);
      const point = Date.UTC(year, month, day, 23, 59, 59);
      if (!Number.isFinite(point) || point < start || point > end) continue;
      const date = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      events.push({
        date,
        country: "US",
        currency: "USD",
        event: "FOMC meeting (final scheduled meeting day)",
        impact: "High",
        importanceSource: "StratDesk fixed release importance",
        actual: null,
        estimate: null,
        previous: null,
        change: null,
        source: "Federal Reserve · official FOMC meeting calendar",
        sourceUrl: FED_FOMC_URL,
        timezone: "America/New_York (meeting date; publication time not supplied)",
        timeKnown: false,
      });
    }
  }
  return events;
}

function cftcUrl() {
  const url = new URL(CFTC_DATASET_URL);
  url.searchParams.set(
    "$select",
    "market_and_exchange_names,cftc_contract_market_code,report_date_as_yyyy_mm_dd,open_interest_all,noncomm_positions_long_all,noncomm_positions_short_all,comm_positions_long_all,comm_positions_short_all,contract_units",
  );
  url.searchParams.set("$where", `cftc_contract_market_code='${CFTC_CONTRACT_CODE}'`);
  url.searchParams.set("$order", "report_date_as_yyyy_mm_dd DESC");
  url.searchParams.set("$limit", "1");
  return url.toString();
}

/** Maps only the verified CME Bitcoin Legacy Futures Only record; no Coinbase/spot inference is made. */
export function mapCftcReport(value: unknown): COTReport | undefined {
  if (!Array.isArray(value) || value.length !== 1) return undefined;
  const row = asRecord(value[0]);
  if (!row) return undefined;
  const market = text(row.market_and_exchange_names);
  const code = text(row.cftc_contract_market_code);
  const reportDate = text(row.report_date_as_yyyy_mm_dd);
  const contractUnits = text(row.contract_units);
  const openInterest = wholeNumber(row.open_interest_all);
  const nonCommercialLong = wholeNumber(row.noncomm_positions_long_all);
  const nonCommercialShort = wholeNumber(row.noncomm_positions_short_all);
  const commercialLong = wholeNumber(row.comm_positions_long_all);
  const commercialShort = wholeNumber(row.comm_positions_short_all);
  if (
    !market ||
    !market.includes("BITCOIN - CHICAGO MERCANTILE EXCHANGE") ||
    code !== CFTC_CONTRACT_CODE ||
    !reportDate ||
    !contractUnits ||
    openInterest === undefined ||
    nonCommercialLong === undefined ||
    nonCommercialShort === undefined ||
    commercialLong === undefined ||
    commercialShort === undefined
  )
    return undefined;
  const date = dateOnly(reportDate);
  if (!date) return undefined;
  return {
    date,
    reportDate: date,
    publishedAt: null,
    releaseVintage: "unknown",
    symbol: "BTC-USD",
    market,
    exchange: "Chicago Mercantile Exchange",
    cftcContractMarketCode: CFTC_CONTRACT_CODE,
    reportType: "CFTC Legacy futures-only",
    contractUnits,
    openInterest,
    nonCommercialLong,
    nonCommercialShort,
    commercialLong,
    commercialShort,
    coverage: "CME Bitcoin futures only; not Coinbase spot, OTC, or all crypto",
    source: "U.S. CFTC · Commitments of Traders Legacy Futures Only",
    sourceUrl: cftcUrl(),
  };
}

function orderEvents(events: EconomicEvent[]) {
  return [...events]
    .sort((left, right) => Date.parse(left.date) - Date.parse(right.date))
    .slice(0, MAX_EVENTS);
}

async function loadUncached(fetcher: ContextFetcher, now: number): Promise<PublicContext> {
  const requests = await Promise.allSettled([
    readText(BLS_ICS_URL, fetcher).then((body) => ({
      label: "BLS scheduled releases",
      value: parseBlsCalendar(body, now),
    })),
    readJson(BEA_RELEASES_URL, fetcher).then((body) => ({
      label: "BEA scheduled releases",
      value: parseBeaCalendar(body, now),
    })),
    readText(FED_FOMC_URL, fetcher).then((body) => ({
      label: "Federal Reserve FOMC meeting dates",
      value: parseFomcCalendar(body, now),
    })),
    readJson(cftcUrl(), fetcher).then((body) => ({
      label: "CFTC weekly CME Bitcoin futures COT",
      value: mapCftcReport(body),
    })),
  ]);

  const failures: string[] = [];
  const sourceNames = [
    "BLS scheduled releases",
    "BEA scheduled releases",
    "Federal Reserve FOMC meeting dates",
    "CFTC weekly CME Bitcoin futures COT",
  ];
  const labels = requests.flatMap((result, index) => {
    if (result.status === "fulfilled") return [result.value.label];
    failures.push(sourceError(sourceNames[index], result.reason));
    return [];
  });
  const calendarSources = requests.slice(0, 3);
  const events = orderEvents(
    calendarSources.flatMap((result) =>
      result.status === "fulfilled" ? (result.value.value as EconomicEvent[]) : [],
    ),
  );
  const cotResult = requests[3];
  const cot =
    cotResult.status === "fulfilled" && cotResult.value.value
      ? [cotResult.value.value as COTReport]
      : [];
  if (cotResult.status === "fulfilled" && !cot.length)
    failures.push("CFTC returned no complete verified CME Bitcoin futures record");

  const coverage = labels.length
    ? `Official no-key context: ${labels.join("; ")}.`
    : "Official no-key context sources were unavailable.";
  const limitations =
    "Calendar coverage is a finite US subset. Impact is a StratDesk fixed release-importance label, not an agency rating. Forecasts, actuals, previous values, and surprises are unavailable and left null. COT is dated weekly CME futures positioning; it is not live, OTC, spot, Coinbase, or a directional bias.";
  const partial = failures.length ? ` Partial coverage: ${failures.join("; ")}.` : "";
  return { events, cot, message: `${coverage} ${limitations}${partial}` };
}

/**
 * Gets public official context with at most four bounded read-only HTTP requests.
 * Supplying a fetcher or clock disables the process cache for deterministic tests.
 */
export async function getPublicContext(options: PublicContextOptions = {}): Promise<PublicContext> {
  const fetcher = options.fetcher ?? defaultFetcher;
  const now = options.now ?? Date.now();
  if (options.fetcher || options.now !== undefined) return loadUncached(fetcher, now);
  if (cache && cache.until > now) return cache.value;
  if (!inflight) {
    inflight = loadUncached(fetcher, now)
      .then((value) => {
        cache = { until: Date.now() + CONTEXT_CACHE_MS, value };
        return value;
      })
      .finally(() => {
        inflight = undefined;
      });
  }
  return inflight;
}
