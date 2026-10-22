# Public Context Sources

**Author:** Manus AI  
**Validated:** 2026-10-17

The no-key adapter in `server/trading/public-context.ts` is deliberately a small, public, US-only context source. It makes **four bounded read-only requests**: one BLS iCalendar feed, one BEA JSON object, one Federal Reserve meeting-calendar page, and one CFTC Socrata query limited to a verified CME Bitcoin futures contract. It does not supply a global economic calendar, consensus, release values, or a live positioning feed.

## Calendar records

The BLS official iCalendar feed exposes `VEVENT` records with `DTSTART;TZID=US-Eastern` and `SUMMARY`. The adapter accepts only four explicitly named release summaries: **Employment Situation**, **Consumer Price Index**, **Producer Price Index**, and **Job Openings and Labor Turnover Survey**. `DTSTART` maps to `EconomicEvent.date`; `SUMMARY` maps to `event`. The IANA conversion is performed from `America/New_York` rather than applying today's offset to every future release. The source does not provide a result, consensus, prior value, or surprise in this calendar record, so `actual`, `estimate`, `previous`, and `change` are all `null`.[1]

The BEA official machine-readable endpoint is a JSON object keyed by release name. For the finite scope, the implementation accepts only the verified keys **Gross Domestic Product**, **Personal Income and Outlays**, and **U.S. International Trade in Goods and Services**. Each `release_dates[]` ISO timestamp maps to `EconomicEvent.date`; the JSON key maps to `event`. It again leaves actual/forecast/prior/surprise fields null.[2]

The Federal Reserve's FOMC calendar publishes meeting dates. The adapter parses only the final day of a listed date range as the **meeting date**, not as an invented statement time. `EconomicEvent.timeKnown` is false and `timezone` says that no publication time was supplied. This covers scheduled FOMC meeting dates only; it does not create a “rate decision” timestamp or output.[3]

Every calendar impact is a **StratDesk fixed release-importance label**, not an official agency impact rating: Employment Situation, CPI, PPI, GDP, Personal Income and Outlays, and FOMC are labelled High; JOLTS and international trade are labelled Medium. The UI-visible `importanceSource` makes that authorship explicit. Calendar results are limited to the next 366 days (with a one-day grace interval) and at most 50 dated records.

## COT record

CFTC's official COT documentation says COT reports break down Tuesday open interest, are generally released on Friday, and trader classifications are report categories rather than motives for specific positions.[4] The official Socrata **Legacy – Futures Only** dataset ID is `6dca-aqww`. The request uses a `where` filter for CFTC contract market code `133741`, orders `report_date_as_yyyy_mm_dd DESC`, selects the exact fields below, and sets `$limit=1`. No application token, CFTC API key, account, or provider subscription is used.[5]

| Official Socrata field | Returned `COTReport` field | Meaning retained |
| --- | --- | --- |
| `market_and_exchange_names` | `market` | Must equal `BITCOIN - CHICAGO MERCANTILE EXCHANGE` |
| `cftc_contract_market_code` | `cftcContractMarketCode` | Must equal verified code `133741` |
| `report_date_as_yyyy_mm_dd` | `date`, `reportDate` | Tuesday report date, not a live timestamp |
| `open_interest_all` | `openInterest` | Total futures-only open interest |
| `noncomm_positions_long_all` | `nonCommercialLong` | Legacy non-commercial long contracts |
| `noncomm_positions_short_all` | `nonCommercialShort` | Legacy non-commercial short contracts |
| `comm_positions_long_all` | `commercialLong` | Legacy commercial long contracts |
| `comm_positions_short_all` | `commercialShort` | Legacy commercial short contracts |
| `contract_units` | `contractUnits` | CFTC-published contract unit text |

CFTC's returned record for this code identifies **BITCOIN – CHICAGO MERCANTILE EXCHANGE** and contract units of five Bitcoins. This is why the adapter is explicitly labelled **CME Bitcoin futures only**. It does **not** represent Coinbase spot BTC-USD positions merely because the app may chart a Coinbase BTC-USD price. It also excludes other crypto venues, derivatives, OTC positions, and all spot holdings.[6]

`publishedAt` is `null` and `releaseVintage` is `"unknown"`: the response contains the Tuesday report date but no historical publication timestamp. The code does not generate a net-position direction, bullish/bearish bias, or a publication date. COT is a dated weekly historical disclosure, not live positioning.

## Failure and cache behavior

Each source is fetched independently with a 12-second timeout. One unavailable agency does not trigger guessed replacement dates: available official records remain, and the response `message` says **Partial coverage** with the failed source detail. The normal no-option call is process-cached for five minutes and coalesces concurrent calls. The CFTC request itself is one-record bounded; the three schedule reads are fixed endpoints.

## References

[1]: https://www.bls.gov/schedule/news_release/bls.ics "BLS Economic News Release Schedule iCalendar feed"
[2]: https://apps.bea.gov/API/signup/release_dates.json "BEA machine-readable release dates JSON"
[3]: https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm "Federal Reserve FOMC meeting calendars and information"
[4]: https://www.cftc.gov/MarketReports/CommitmentsofTraders/index.htm "CFTC Commitments of Traders report descriptions"
[5]: https://publicreporting.cftc.gov/Commitments-of-Traders/Legacy-Futures-Only/6dca-aqww "CFTC Legacy Futures Only Socrata dataset"
[6]: https://publicreporting.cftc.gov/resource/6dca-aqww.json?%24select=market_and_exchange_names%2Ccftc_contract_market_code%2Creport_date_as_yyyy_mm_dd%2Copen_interest_all%2Cnoncomm_positions_long_all%2Cnoncomm_positions_short_all%2Ccomm_positions_long_all%2Ccomm_positions_short_all%2Ccontract_units&%24where=cftc_contract_market_code%3D%27133741%27&%24order=report_date_as_yyyy_mm_dd%20DESC&%24limit=1 "Official CFTC CME Bitcoin futures Legacy Futures Only record query"
