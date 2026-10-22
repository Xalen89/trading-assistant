# Backtesting.py crossover patterns and license notes

The repository `kernc/backtesting.py` is the Python project “Backtest trading strategies with Python”; GitHub identifies the repository license as **AGPL-3.0** and links its documentation and source. The project is a backtesting framework, not an Expo/React Native strategy package. [1]

## SMA crossover rule

A simple moving-average (SMA) crossover compares a shorter lookback average of closing prices with a longer lookback average. In the documented example, the short SMA uses 10 periods and the long SMA 20. A newly detected upward cross closes any existing position and opens a long; a downward cross closes the long and opens a short. The project website describes the short entry as conditional on an instrument that permits shorting, such as a CFD. [2] [3]

The example is an explicit, numerical signal rule, not a discretionary chart pattern. Its 10/20 periods are example settings, not universal defaults. In the quick-start code, absent explicit sizing, the framework uses the maximal possible position. By default it executes new orders on the next bar’s open; `trade_on_close=True` changes that to the current bar’s close. Those assumptions matter if translating the *idea* into a paper-analysis UI. [3]

## Rule concepts to consider for paper analysis

These are independently paraphrased rule ideas grounded in official examples, not copied implementations or claims of effectiveness. They are suitable as explainable signal cards or what-if scenarios; none should submit brokerage orders.

1. **Fast/slow SMA cross (reference baseline).** Enter long when the faster SMA crosses above the slower SMA; on the reverse cross, exit the long and optionally switch short only when shorting is supported and selected. The official example uses 10/20 periods. **Status:** fully numerical once both lookbacks, direction, and crossover execution semantics are configured; the example periods are illustrative. [3]
2. **SMA trend with ATR trailing stop.** Use an upward SMA cross as a long entry, then trail a protective stop a chosen multiple of average true range (ATR) from price. The official composable-strategy tutorial demonstrates a 10/25 SMA signal with a 2× ATR trailing-stop setting, in a long-only signal variant. **Status:** numerical when the SMA lengths, ATR calculation/lookback, multiplier, and stop update/execution behavior are specified. The tutorial gives 10/25 and 2× as example values. [4]
3. **Daily/weekly RSI plus moving-average stack.** A documented long-only example requires daily RSI(30) above 70, weekly RSI(30) above 70 and above daily RSI, price above the 10-day SMA, and the 10/20/50/100-day SMAs in descending order. It exits if close falls at least 2% below the 10-day SMA; it also specifies an 8% fixed stop. **Status:** numerically specified in the example, including thresholds and lookbacks; RSI implementation and bar/calendar conventions still need fixing for consistent reproduction. The example is an illustration, not an endorsement. [5]
4. **Trend-filtered MA pullback exit.** Reuse the MA-stack concept for a long-only monitor: show a candidate only while price is above the 10-day average and the averages are ordered 10 > 20 > 50 > 100; flag exit/invalidated status after a close 2% under the 10-day average. The official multi-timeframe example also adds RSI confirmation and an 8% stop, so a simplified monitor should say clearly which filters it omits. **Status:** numerical if the cited thresholds and periods are retained; otherwise user-configurable. [5]

## Parameters and paper-only interpretation

Before any signal can be reproduced, the app needs to expose or document the instrument and OHLC data source, bar interval and timezone, warm-up/history requirements, indicator definitions (especially RSI and ATR), exact crossover equality/touch convention, long-only versus short-enabled mode, position sizing, commission/slippage assumptions, and signal timestamp versus hypothetical fill timing. For stops, specify whether a gap can fill worse than the stop and how intrabar high/low data is treated. The examples do not supply a single deployment-ready configuration for an arbitrary user’s instrument and data.

The framework’s `next()` checks one completed bar at a time and ordinarily places orders for the next bar’s open, so a paper screen should distinguish “condition detected on this bar” from any simulated entry price. Its documentation also warns against overfitting from in-sample optimization and notes the SMA-cross strategy is vulnerable to sideways whipsaws. The landing-page example plots results for manual inspection, but visual inspection is not a defined signal rule. No performance figure here is a success rate, guarantee, or expected return. [2] [3]

## License cautions

The project’s repository metadata and `LICENSE.md` identify **GNU Affero General Public License v3.0 (AGPL-3.0)**. This is a strong copyleft license, not a permissive MIT/BSD license. AGPLv3 permits private use of an unmodified copy without conditions so long as it is not conveyed; when a covered/modified work is conveyed, the license imposes source, notice, and licensing conditions. For modified software offered for remote network interaction, section 13 requires a prominent offer of the corresponding source to those interacting remotely. [1] [6]

For the owner-only Expo/RN paper-analysis app, the lower-risk route is to use only independently written descriptions of the abstract trading rules and implement them clean-room, without importing `backtesting.py` or copying/adapting its code, docs, or substantial expressive text. Do not assume that embedding or porting the Python library into a distributed mobile binary—or making a derivative server-side version available to users—is compatible with a closed-source app; AGPL obligations may apply, and how a particular app is combined or conveyed is fact-specific. Obtain qualified legal review before incorporating or distributing covered code. This is license information, not legal advice. [1] [6]

## References

[1]: https://github.com/kernc/backtesting.py "kernc/backtesting.py official GitHub repository"
[2]: https://kernc.github.io/backtesting.py/ "Backtesting.py official project website"
[3]: https://kernc.github.io/backtesting.py/doc/examples/Quick%20Start%20User%20Guide.html "Backtesting.py official Quick Start User Guide"
[4]: https://kernc.github.io/backtesting.py/doc/examples/Strategies%20Library.html "Backtesting.py official composable Strategies Library tutorial"
[5]: https://kernc.github.io/backtesting.py/doc/examples/Multiple%20Time%20Frames.html "Backtesting.py official Multiple Time Frames tutorial"
[6]: https://raw.githubusercontent.com/kernc/backtesting.py/master/LICENSE.md "Backtesting.py repository AGPL-3.0 license text"
