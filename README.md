# Tape Room

A private, browser-local research workspace for reviewing historical XAUUSD and NAS100 candles against simplified WR1/OTE rules. It does not connect to a broker, fetch market data, or provide investment advice.

## Run locally

```sh
npm install
npm run dev
```

Use `npm run build` to type-check and create a production build, and `npm run lint` for lint checks.

## Import candle data

Choose XAUUSD or NAS100, then import a CSV with a header row containing:

```csv
timestamp,open,high,low,close,volume
2026-10-20T13:30:00Z,4300.1,4302.4,4298.8,4301.7,1234
```

`timestamp`, `time`, `date`, or `datetime` are accepted, as are `open/high/low/close` or their one-letter abbreviations. Volume is optional. Timestamps with an explicit timezone are recommended. The importer sorts candles, replaces duplicate timestamps with the latest imported row, and ignores malformed candle rows. At least 45 valid unique candles are required. Data is stored in the current browser's local storage (up to 25,000 candles per market); use **Export workspace** to save a JSON copy. Clearing browser storage removes the local data.

The seven-day window ends at the latest timestamp in the imported dataset, not the computer's current date. This makes historical files reviewable without pretending they contain current prices.

## Scan assumptions

- A candidate begins with a break of the prior 20-bar high or low followed by a close back inside, in the direction of the recent 20-bar drift.
- The next eight bars define a possible displacement leg. The scanner looks for a retracement to the midpoint of the 61.8%–79% OTE zone, within twelve bars.
- The hypothetical stop is placed at the sweep candle's extreme. The target defaults to 2R and can be changed; the time exit defaults to 24 bars and can also be changed.
- A setup is labeled **Win** only when its hypothetical exit is above entry for a long (or below entry for a short). Target/stop collisions within one candle are resolved stop-first; targets touched on the entry candle are not counted. A trade that has not completed its holding period by the end of the data is **Unresolved**, not a win.
- “WR1 + OTE” denotes an OTE candidate also occurring in a simplified New York time window; “OTE” denotes the OTE rules without that timing match. This is a heuristic, not a complete representation of discretionary strategy rules.
- The confluence checklist always includes the detected sweep/reclaim and OTE retracement. FVG midpoints and opposing-candle OB overlap are approximate candle-based proxies; session and time-number matches use New York time with daylight-saving rules.
- SMT, STDV projections, RDRB, news-wick detection, weekly/monthly bias, broker feeds, and trade execution are not implemented.
- Pattern thumbnails and chart downloads use the uploaded candle bars. A profitable result means positive **price points** under these assumptions, not account-currency profit. Spread, commissions, slippage, position sizing, and liquidity are not modeled.

These outputs are for historical study only. They are not trade recommendations or evidence that a strategy is profitable.
