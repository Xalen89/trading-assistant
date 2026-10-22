# Instrument setup evidence — 18 October 2026

TradeLocker’s instrument details endpoint is an information-only GET using the selected instrument/account's documented settings route. `tickSize[]` contains an optional `leftRangeLimit` and reported `tickSize`; the latter is documented as the minimum price change. Lot step, lot size, tick cost and chart decimals are different quantities. A malformed/conflicting/variable schedule cannot be silently flattened to an invented scalar tick. [1]

TradeLocker explicitly documents daily-history timestamps as 00:00 UTC. That establishes a provider daily timestamp basis, not a continuous 24/7 calendar, a US regular-session close or exchange settlement. The app may use the last actual completed reported provider UTC day with a current-day anchor, bounded age and real gap/duplicate checks; it must describe this as the provider day. [2]

History `v` is described only as “Volume.” The documentation does not establish venue trade volume, consolidated volume or tick-count semantics. Broker-reported relative volume can be a deliberately selected, labelled proxy, never a silent venue-volume upgrade; zero/missing values cannot qualify. [2]

Coinbase product `quote_increment` is the minimum order-price increment. It can populate supported Coinbase instrument price ticks without deriving them from display precision. [3]

The current daily-bar endpoint describes current OHLCV but returns no prior close or timestamp in its schema; it is not used to invent PDC. [4]

Detected metadata/defaults remain local configuration suggestions until saved. No free-form AI, prepared data, proxy choice or source metadata can authorize automatic paper trading, replace fresh native evidence or expose broker execution.

The current official getting-started guide specifies `TRADE` routeId for instrument settings and `INFO` for quotes/history. The official Python SDK still sends `INFO` for details. The selected owner INFO response lacked a usable tick, so the app follows the guide for this metadata-only GET while keeping all market data on INFO and denying all order/position paths and mutating broker methods. A route identifier does not grant this app broker execution. [5][6]

The actual selected XAUUSD response returned a single numeric tickSize0.01 with leftRangeLimit:null. The endpoint schema's lower bound is optional. The old parser misclassified this as missing metadata. The corrected decoder accepts the reported single minimum increment without inventing a numeric bound; restricted/conflicting/malformed schedules remain rejected. This does not establish exchange-volume or RTH-calendar semantics.

## References

[1]: https://public-api.tradelocker.com/reference/getinstrumentdetails "TradeLocker instrument details and minimum-price-change schedule"
[2]: https://public-api.tradelocker.com/reference/gethistory "TradeLocker historical bars, UTC daily timestamps and volume field"
[3]: https://docs.cdp.coinbase.com/exchange/reference/exchangerestapi_getproduct "Coinbase Exchange product price increment"
[4]: https://public-api.tradelocker.com/reference/getdailybar "TradeLocker current daily bar response"
[5]: https://public-api.tradelocker.com/docs/getting-started.md "Official instrument-specific routeId mapping"
[6]: https://raw.githubusercontent.com/TradeLocker/tradelocker-python/main/src/tradelocker/tradelocker_api.py "Official Python SDK conflicting INFO instrument-details implementation"
