# `technicalindicators`: pattern and indicator references for a paper-analysis app

The repository identifies itself as **`technicalindicators`**, a JavaScript/TypeScript technical-indicator library; its checked-in `package.json` says version **3.1.0** and MIT license. Its README documents Node.js and browser JavaScript use, including both function-style calculations and indicator classes with `calculate`, `getResult`, and incremental `nextValue` APIs. Those examples are useful as integration-style references, but the README does **not** document Expo or React Native support specifically. Treat RN compatibility as unverified and assess the exact dependency build/bundling separately. No repository code was installed or run for this review. [1] [2]

## A version caveat on candlesticks

The README says pattern detection was removed in version 3.0 and directs users needing it to version 2.0. However, that same README lists 35 candle patterns, and the current `master` source entry point exports numerous pattern functions while `src/candlestick` contains their implementations. This is a real documentation/source discrepancy, not a basis for assuming a specific published build provides them. For an app decision, check the exact resolved package version and exported bundle before relying on candle helpers; avoid assuming the README's v2 instruction or the current source tree alone settles runtime availability. [1] [4]

The candle helpers are boolean matches over numeric OHLC arrays, not subjective chart-reading tools. The base finder requires a minimum number of candles, evaluates the latest required window for `hasPattern`, and supports reversed input. Several definitions use hard-coded comparisons rather than configurable candle/body thresholds or user-supplied trend context. For instance, the base helper's approximate-equality tolerance is fixed, and the tweezer-bottom implementation compares two lows for exact equality. These are implementation conventions, not universal definitions of the named formations. [9] [13]

## Pattern/style references

Here are four candidate references, paraphrased from the repository's implementations. They can be useful as explainable paper-analysis annotations; a match is not evidence of predictive value.

- **Bullish Engulfing:** compare two adjacent candles: the earlier body is bearish and the later candle's open/close cross the prior body in the implementation's prescribed way. The code uses body-price comparisons; it does not establish a market-wide definition or add a trend filter. **Status:** numeric OHLC boolean detector is present in the source tree; published-version availability is unclear because of the README discrepancy. [10]
- **Morning Star:** compare three candles: a bearish first candle, a separated/small middle candle under this implementation's strict gap comparisons, and a bullish third candle that closes above the first candle's midpoint. Strict gaps can make matches sensitive to market/session conventions and bar construction. **Status:** numeric OHLC boolean detector is present in the source tree; same version caveat. [11]
- **Hammer Pattern:** its implementation examines five bars, checks a downtrend using relative average gains/losses, looks for a hammer-like candle, then requires a bullish confirmation candle closing above the candidate hammer's close. The constituent hammer-stick definitions are also hard-coded. **Status:** numeric OHLC rule with an embedded trend/confirmation check in source; same version caveat. [12]
- **Tweezer Bottom:** checks for a prior declining condition and equality of the two final lows. The exact-equality test is notably brittle for feeds with differing decimal precision or rounded prices, and the rule does not itself require bullish confirmation. **Status:** numeric OHLC rule in source, with fixed equality criterion; same version caveat. [13]

## Three additional rule ideas to compose from the indicators

These are **custom paper-analysis rules**, not strategies supplied or validated by the library. Use explicit user-configured settings, show why each condition matched, and do not attach win-rate or performance claims without separate, properly controlled research.

- **EMA trend and pullback:** define a faster and slower EMA. Mark an uptrend when price is above the slower average and the fast average is above the slow one; flag a pullback candidate when price revisits the fast average and then closes back above it. A mirrored downtrend version can be shown separately. **Status:** EMAs are numeric calculations; trend, touch/proximity, and recapture logic are custom.
- **RSI reset within a trend:** use an EMA-defined trend regime, then annotate a pullback when RSI enters a configurable weak zone and recovers through a configured threshold. This makes the RSI condition contextual rather than treating a fixed oversold reading as a standalone signal. **Status:** RSI is numeric; thresholds, crossings, regime filter, and annotations are custom.
- **Bollinger squeeze and expansion:** compute band width relative to the middle band, compare it with a configurable trailing baseline, and annotate a close outside a band after a low-width period. Optionally require a separate trend or volume condition. **Status:** band values and percent-B are numeric; squeeze baseline, breakout, confirmation, and interpretation are custom.

A MACD crossover/zero-line annotation is another small extension if desired: MACD, signal, and histogram are calculated outputs, while crossover detection and any trend/context filter are custom. The package also exports cross-up/cross-down utilities in current source, but the README/code version caveat still applies to the exact bundle. [4] [7]

## Parameters and safeguards to decide before adding any rule

- **Input and alignment:** choose instrument, bar interval, session/timezone, price basis (for example close versus another OHLC-derived series), chronological ordering, and corporate-action adjustment policy. Keep OHLC arrays aligned, handle gaps/missing bars, and ensure a pattern is evaluated only after the relevant bar is complete. The README describes incremental calculation; candle matching also depends on input order and the last required window. [1] [9]
- **EMA:** set the period and source price, and account for warm-up. The implementation seeds EMA from an SMA window before applying the recursive smoothing formula, so early values and alignment matter. [5]
- **RSI:** choose the lookback period and application-specific zones/crossing logic. The library returns numeric RSI values; it does not prescribe the interpretation thresholds for the app. [6]
- **MACD:** configure fast, slow, and signal periods, and choose whether the oscillator and signal use simple or exponential averages. The implementation returns MACD, signal, and histogram fields; each may be undefined during warm-up. [7]
- **Bollinger Bands:** configure period and standard-deviation multiplier, as well as source price. The output includes middle, upper, lower, and percent-B values. A squeeze requires an additional width definition, comparison window, and cutoff that the indicator itself does not supply. [8]
- **Candle criteria:** decide whether to use the repository's fixed comparisons or app-specific tolerances/definitions; also handle minimum history and input precision. Do not treat a named pattern match as confirmation of direction or as a probability estimate. [9] [10] [11] [13]

## JavaScript usage and license

The README shows npm/CommonJS use and browser bundles, and demonstrates `calculate` as well as incremental indicator instances. Its documented examples support using the library as a JavaScript calculation reference, but do not verify the package in Expo/React Native. The README also contains a legacy Node/browser installation note about `canvas` and polyfills; check the exact published package and target bundler rather than inferring compatibility from the examples. [1] [2]

The repository's `LICENSE` and package metadata identify **MIT**. The license allows use, copying, modification, distribution, sublicensing, and sale, conditioned on retaining the copyright and permission notice in copies or substantial portions; it disclaims warranties and liability. If any library code is copied or bundled into a distributed app, preserve the required notice and review the exact dependency/license obligations for the chosen version. This is a practical license caution, not legal advice. [2] [3]

This research concerns analysis and paper annotations only. It does not recommend trades, claim strategy performance, connect to a brokerage, or place orders.

## References

[1]: https://github.com/anandanand84/technicalindicators "Official repository README and repository identity"
[2]: https://github.com/anandanand84/technicalindicators/blob/master/package.json "Official package metadata"
[3]: https://github.com/anandanand84/technicalindicators/blob/master/LICENSE "Official MIT license text"
[4]: https://raw.githubusercontent.com/anandanand84/technicalindicators/master/src/index.ts "Official source entry-point exports"
[5]: https://raw.githubusercontent.com/anandanand84/technicalindicators/master/src/moving_averages/EMA.ts "Official EMA implementation"
[6]: https://raw.githubusercontent.com/anandanand84/technicalindicators/master/src/oscillators/RSI.ts "Official RSI implementation"
[7]: https://raw.githubusercontent.com/anandanand84/technicalindicators/master/src/moving_averages/MACD.ts "Official MACD implementation"
[8]: https://raw.githubusercontent.com/anandanand84/technicalindicators/master/src/volatility/BollingerBands.ts "Official Bollinger Bands implementation"
[9]: https://raw.githubusercontent.com/anandanand84/technicalindicators/master/src/candlestick/CandlestickFinder.ts "Official candlestick finder base class"
[10]: https://raw.githubusercontent.com/anandanand84/technicalindicators/master/src/candlestick/BullishEngulfingPattern.ts "Official bullish engulfing implementation"
[11]: https://raw.githubusercontent.com/anandanand84/technicalindicators/master/src/candlestick/MorningStar.ts "Official morning star implementation"
[12]: https://raw.githubusercontent.com/anandanand84/technicalindicators/master/src/candlestick/HammerPattern.ts "Official hammer pattern implementation"
[13]: https://raw.githubusercontent.com/anandanand84/technicalindicators/master/src/candlestick/TweezerBottom.ts "Official tweezer bottom implementation"
