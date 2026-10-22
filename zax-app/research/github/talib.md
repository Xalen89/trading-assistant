# TA-Lib pattern and indicator references for a paper-analysis app

TA-Lib’s specified repository is **`TA-Lib/ta-lib`**, the official repository titled “Technical analysis library: indicators and candlestick patterns.” Its README describes a native C/C++/Rust/Java/C# library with indicator and candlestick-pattern functions, and links to the project’s function documentation. This is the TA-Lib core repository, not a particular Expo/React Native integration or a strategy/backtesting product. [1]

## License and reuse cautions

The repository identifies its license as **BSD 3-Clause**. The checked-in `LICENSE` grants permission to redistribute and modify source and binary forms if conditions are met: source redistributions must retain the copyright notice, conditions and disclaimer; binary redistributions must reproduce them in documentation or other materials; and the copyright holder/contributors’ names cannot be used to endorse derived products without prior written permission. It disclaims warranties and liability. [1] [2]

For an owner-only app, the repository license does not prohibit commercial integration. If actual TA-Lib code is copied, bundled or distributed, preserve the applicable notices and satisfy the binary/source conditions; do not imply project endorsement. Confirm the exact dependency’s license separately before adding a language wrapper or port: this report verifies the named core repository only, not every third-party wrapper. Merely using an independently written implementation of a general pattern idea is not the same as redistributing TA-Lib source, but this is not a legal opinion. [2] [3]

## Useful pattern references and rule ideas

These are educational paper-signal candidates, not evidence of profitability. A pattern match is a bar-shape classification, not a complete trading strategy. TA-Lib’s function docs describe the OHLC inputs and numeric outputs; its Python wrapper reference also lists pattern names and signatures. [4] [5]

- **Engulfing (CDLENGULFING):** Look for a second candle whose real body covers the prior candle’s opposite-colored body. The recognizer returns positive values for bullish and negative for bearish; 100/−100 indicates strict overhang and 80/−80 an endpoint-touch variant. The function does **not** check whether price was trending down/up first, so a UI rule could display “bullish/bearish body engulfing; trend context not checked,” rather than assert a reversal. **Status:** numerically detectable from OHLC; context/filter is custom or manually reviewed. [6]
- **Hammer (CDLHAMMER):** A small body near the top of a candle’s range with a relatively long lower wick and little upper wick. TA-Lib detects the shape and outputs +100, but does not establish the preceding downtrend assumed by the textbook reversal interpretation. Pair the display with a separately computed trend/context check or mark context “unverified.” **Status:** numeric shape detector; prior trend is an extra numeric filter or manual review. [7]
- **Morning Star (CDLMORNINGSTAR):** Three-bar candidate: long bearish candle, smaller-bodied middle candle gapping lower by real bodies, then bullish candle closing back into the first body. The function outputs +100 for a match and offers a penetration parameter (official current docs default it to 0.3). Its docs explicitly say it does not verify the prior downtrend. **Status:** numerical OHLC pattern detector; trend context is custom/manual. [8]
- **Doji (CDLDOJI):** Flag a candle when the absolute open-close body is at or below TA-Lib’s BodyDoji candle-average threshold. A +100 result means doji detected, not bullish or bearish. This is a useful neutral/indecision annotation rather than a direction by itself. **Status:** numerically detectable, with the library’s candle-threshold convention; contextual interpretation is manual/custom. [9]
- **Harami (CDLHARAMI):** A long real body followed by a shorter real body contained within it; positive/negative output indicates the direction associated with the first candle’s color, and 80-magnitude variants reflect shared body endpoints. The function does not test prior trend, and the docs caution that a shape should not be treated as guaranteed reversal. **Status:** numerically detectable from OHLC; context/filter requires separate logic or review. [10]
- **Rising/Falling Three Methods (CDLRISEFALL3METHODS):** Five-bar continuation candidate: a long initial candle, three smaller counter-color candles overlapping its range, and a final long candle in the original direction. Positive/negative output marks rising/falling. The detector specifically uses three middle candles and does not verify the prior trend. **Status:** numerically detectable from OHLC; continuation context needs a separate trend check. [11]

## A few simple indicator-based paper strategies

These combinations are **proposed app-level rules**, not named or validated trading systems supplied by TA-Lib. Display parameters and trigger behavior explicitly so users can change them. No performance claim is implied.

- **Moving-average trend/crossover view:** Compute two close-based SMAs (for example, user-selected 20- and 50-bar windows); annotate a potential bullish/bearish regime when the shorter average crosses above/below the longer one. SMA itself is a numerical unweighted rolling mean, but crossover direction, bar-close confirmation and any position-state logic are app-defined. TA-Lib’s SMA default is 30, not the illustrative 20/50 pair. **Status:** numerical indicators plus custom rule; alternatively show the averages for manual interpretation. [12]
- **RSI context filter for paper signals:** Compute RSI from closes (default lookback 14; TA-Lib docs describe the 0–100 oscillator and common 70/30 overbought/oversold reference levels). A conservative demo rule could flag possible mean-reversion *context* only when RSI crosses back from an extreme, optionally requiring price to be range-bound; the crossing-back and range-bound clauses are proposed custom conditions, not built-in TA-Lib strategy outputs. Do not treat an extreme reading alone as a buy/sell command. **Status:** RSI numerical; complete trigger/filter logic is custom, with manual override available. [13]
- **MACD momentum confirmation:** Compute MACD (default fast/slow/signal periods 12/26/9); optionally annotate a bullish/bearish momentum change when MACD crosses its signal line, or when histogram changes sign. MACD lines and histogram are numerical outputs; crossover interpretation, trend/risk filters and paper-position rules are app-defined. **Status:** numerical indicator plus custom strategy rule; can also be presented as chart context for manual analysis. [14]

## Implementation limits and parameters to make explicit

The official function references show that candlestick functions consume OHLC bars, while RSI, SMA and MACD consume a single real-valued series, typically closes. [6] [9] [12]–[14] Before making a result meaningful in an app, define instrument/market, bar interval and timezone, candle construction/data source, whether only completed bars count, missing/duplicate bars, and alignment of output indices with input candles. Warm-up/lookback and insufficient-history states also need explicit handling; the core repository illustrates that batch APIs return an output beginning at a reported bar index. [1]

Expose indicator periods and strategy thresholds as settings rather than presenting them as universal constants. TA-Lib documents RSI’s default period as 14, SMA’s as 30 and MACD’s as 12/26/9; the docs show Morning Star’s penetration default as 0.3. Candlestick pattern recognition also depends on body/shadow comparisons and candle-average settings; for example, Doji uses BodyDoji as its threshold. A custom shape implementation must define tolerances, treatment of equal open/close and gaps, and whether “gap” means body-to-body or full high/low gap where applicable. [8] [9] [12]–[14]

A numeric match is not the same as a manual chart judgment: the library applies specific formal thresholds, while a manual checklist can incorporate context not encoded by the pattern function. Label outputs as detected shape/context, keep parameters visible, and keep all resulting actions within paper analysis. This research did not inspect or edit the app, install or execute repository code, create a bot, or access a brokerage or user session.

## References

[1]: https://github.com/TA-Lib/ta-lib "TA-Lib core repository and README"
[2]: https://github.com/TA-Lib/ta-lib/blob/main/LICENSE "TA-Lib repository LICENSE (BSD 3-Clause text)"
[3]: https://ta-lib.org/ "TA-Lib official website and integration/license statement"
[4]: https://ta-lib.org/functions/ "Official TA-Lib function catalog"
[5]: https://ta-lib.github.io/ta-lib-python/func_groups/pattern_recognition.html "TA-Lib Python wrapper pattern function names and signatures"
[6]: https://ta-lib.org/functions/cdlengulfing.html "Official TA-Lib Engulfing definition"
[7]: https://ta-lib.org/functions/cdlhammer.html "Official TA-Lib Hammer definition"
[8]: https://ta-lib.org/functions/cdlmorningstar.html "Official TA-Lib Morning Star definition and penetration parameter"
[9]: https://ta-lib.org/functions/cdldoji.html "Official TA-Lib Doji definition and output"
[10]: https://ta-lib.org/functions/cdlharami.html "Official TA-Lib Harami definition"
[11]: https://ta-lib.org/functions/cdlrisefall3methods.html "Official TA-Lib Rising/Falling Three Methods definition"
[12]: https://ta-lib.org/functions/sma.html "Official TA-Lib Simple Moving Average definition and period"
[13]: https://ta-lib.org/functions/rsi.html "Official TA-Lib RSI formula and period"
[14]: https://ta-lib.org/functions/macd.html "Official TA-Lib MACD formula and parameters"
