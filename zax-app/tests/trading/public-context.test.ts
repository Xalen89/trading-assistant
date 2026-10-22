import { describe, expect, it, vi } from "vitest";
import {
  getPublicContext,
  mapCftcReport,
  parseFomcCalendar,
} from "../../server/trading/public-context";

const now = Date.parse("2026-10-01T00:00:00.000Z");
const blsFixture = `BEGIN:VCALENDAR
BEGIN:VEVENT
DTSTART;TZID=US-Eastern:20261009T083000
SUMMARY:Employment Situation
END:VEVENT
BEGIN:VEVENT
DTSTART;TZID=US-Eastern:20261013T083000
SUMMARY:Consumer Price Index
END:VEVENT
BEGIN:VEVENT
DTSTART;TZID=US-Eastern:20261016T083000
SUMMARY:Unselected BLS release
END:VEVENT
END:VCALENDAR`;
const beaFixture = {
  "Gross Domestic Product": { release_dates: ["2026-10-29T12:30:00+00:00"] },
  "Personal Income and Outlays": {
    release_dates: ["2026-10-29T12:30:00+00:00"],
  },
  "U.S. International Trade in Goods and Services": {
    release_dates: ["2026-11-04T13:30:00+00:00"],
  },
};
const fedFixture = `<h4>2026 FOMC Meetings</h4><strong>October</strong><p>27-28</p><strong>December</strong><p>8-9*</p><h4>2027 FOMC Meetings</h4><strong>January</strong><p>26-27</p>`;
const cftcFixture = [
  {
    market_and_exchange_names: "BITCOIN - CHICAGO MERCANTILE EXCHANGE",
    cftc_contract_market_code: "133741",
    report_date_as_yyyy_mm_dd: "2026-09-29T00:00:00.000",
    open_interest_all: "20752",
    noncomm_positions_long_all: "17320",
    noncomm_positions_short_all: "14786",
    comm_positions_long_all: "85",
    comm_positions_short_all: "2820",
    contract_units: "(5 Bitcoins)",
  },
];

/** All records in this file are synthetic fixtures shaped from the documented official schemas. */
function syntheticFetcher(blocked?: "bls" | "bea" | "fed" | "cftc") {
  return vi.fn(async (url: string) => {
    if (url.includes("bls.gov")) {
      if (blocked === "bls") throw new Error("synthetic BLS outage");
      return new Response(blsFixture, { status: 200 });
    }
    if (url.includes("apps.bea.gov")) {
      if (blocked === "bea") throw new Error("synthetic BEA outage");
      return new Response(JSON.stringify(beaFixture), { status: 200 });
    }
    if (url.includes("federalreserve.gov")) {
      if (blocked === "fed") throw new Error("synthetic Fed outage");
      return new Response(fedFixture, { status: 200 });
    }
    if (url.includes("publicreporting.cftc.gov")) {
      if (blocked === "cftc") throw new Error("synthetic CFTC outage");
      return new Response(JSON.stringify(cftcFixture), { status: 200 });
    }
    throw new Error(`unexpected synthetic URL ${url}`);
  });
}

describe("Official public context adapter — synthetic fixtures only", () => {
  it("maps scheduled official fields and verified CME futures positions without forecasts or bias", async () => {
    const fetcher = syntheticFetcher();
    const result = await getPublicContext({ fetcher, now });

    expect(fetcher).toHaveBeenCalledTimes(4);
    expect(result.events.map((event) => event.event)).toEqual([
      "Employment Situation",
      "Consumer Price Index",
      "FOMC meeting (final scheduled meeting day)",
      "Gross Domestic Product",
      "Personal Income and Outlays",
      "U.S. International Trade in Goods and Services",
      "FOMC meeting (final scheduled meeting day)",
      "FOMC meeting (final scheduled meeting day)",
    ]);
    const employment = result.events[0];
    expect(employment.date).toBe("2026-10-09T12:30:00.000Z");
    expect(employment.impact).toBe("High");
    expect(employment.importanceSource).toBe(
      "StratDesk fixed release importance",
    );
    expect(employment.actual).toBeNull();
    expect(employment.estimate).toBeNull();
    expect(employment.source).toContain("Bureau of Labor Statistics");

    const fomc = result.events.find((event) => event.event.startsWith("FOMC"));
    expect(fomc).toMatchObject({ date: "2026-10-28", timeKnown: false });
    expect(fomc?.timezone).toContain("publication time not supplied");

    expect(result.cot).toEqual([
      expect.objectContaining({
        symbol: "BTC-USD",
        market: "BITCOIN - CHICAGO MERCANTILE EXCHANGE",
        exchange: "Chicago Mercantile Exchange",
        cftcContractMarketCode: "133741",
        reportDate: "2026-09-29",
        publishedAt: null,
        releaseVintage: "unknown",
        nonCommercialLong: 17320,
        nonCommercialShort: 14786,
        commercialLong: 85,
        commercialShort: 2820,
      }),
    ]);
    expect(result.cot[0].coverage).toContain("not Coinbase spot");
    expect(result.message).toContain("Forecasts, actuals, previous values, and surprises are unavailable");

    const cftcUrl = fetcher.mock.calls
      .map(([url]) => url)
      .find((url) => url.includes("publicreporting.cftc.gov"));
    expect(cftcUrl).toBeDefined();
    const query = new URL(cftcUrl!).searchParams;
    expect(query.get("$limit")).toBe("1");
    expect(query.get("$where")).toBe("cftc_contract_market_code='133741'");
  });

  it("returns partial official coverage honestly when one agency source fails", async () => {
    const result = await getPublicContext({
      fetcher: syntheticFetcher("bls"),
      now,
    });
    expect(result.events.some((event) => event.source.includes("BLS"))).toBe(false);
    expect(result.events.some((event) => event.source.includes("Economic Analysis"))).toBe(true);
    expect(result.message).toContain("Partial coverage");
    expect(result.message).toContain("synthetic BLS outage");
  });

  it("does not turn a non-CME or non-Bitcoin record into a crypto positioning claim", () => {
    expect(
      mapCftcReport([
        { ...cftcFixture[0], cftc_contract_market_code: "999999" },
      ]),
    ).toBeUndefined();
  });

  it("retains only scheduled FOMC meeting dates and never invents a release clock", () => {
    const events = parseFomcCalendar(fedFixture, now);
    expect(events).toHaveLength(3);
    expect(events.every((event) => event.timeKnown === false)).toBe(true);
    expect(events.map((event) => event.date)).toEqual([
      "2026-10-28",
      "2026-12-09",
      "2027-01-27",
    ]);
  });
});
