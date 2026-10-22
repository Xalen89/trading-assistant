# QuantConnect LEAN: simple trend and crossover patterns

The official [QuantConnect/Lean repository](https://github.com/QuantConnect/Lean) identifies itself as the LEAN algorithmic trading engine, includes Python and C# algorithm examples, and lists Apache-2.0 as its license. The following are implementation-pattern references, not proprietary-strategy claims or evidence of profitability. None of the cited examples reports a validated success rate. [1] [2]

## Useful patterns for a paper-analysis app

1. **Daily fast/slow EMA regime crossover — numerical example.** The Python sample uses SPY daily EMAs of 15 and 30 bars. It enters long when the fast EMA exceeds the slow EMA by a 0.015% tolerance, and liquidates the long when the fast EMA falls below the slow EMA. It evaluates at most once per day and targets 100% holdings. Though described by the source as a “cross,” the entry check is a level comparison rather than a one-time crossing-event test. [3]
   **Still needs app-level choices:** instrument/universe, data and session conventions, sizing or exposure cap, fees/slippage, whether to add a true crossing event, and policy for gaps, missing bars, and corporate actions. The code's dates are a historical example range, not a recommended evaluation period.

2. **Front-month futures EMA regime — numerical example.** The Gold futures example uses 100- and 300-period EMAs registered on minute data, a 0.1% threshold, and a 10% target holding. It enters if the fast EMA is sufficiently above the slow EMA while flat, and liquidates an open position otherwise. It rolls to the selected front-month contract and resets/re-registers the indicators when the contract changes. [4]
   **Still needs app-level choices:** whether futures are in scope, contract/universe and roll rules, bar resolution and session, whether the rule is intended to be intraday or slower, sizing/leverage, and costs. Treat the explicit front-month and indicator-reset behavior as an engineering pattern, not as a complete futures risk model.

3. **MACD/signal-line threshold filter — numerical example.** The SPY daily sample sets MACD to (12, 26, 9) with exponential averages. Its implemented signal is the MACD-minus-signal difference divided by the fast EMA: enter long above +0.25%; liquidate when below −0.25%. This gives the app a concrete example of a normalized, two-threshold signal with a dead band. Despite a source comment mentioning “short,” the shown branch calls `liquidate`; it does not establish a short position. [5]
   **Still needs app-level choices:** whether to normalize by the fast EMA or another denominator, indicator warm-up/readiness handling, whether the negative threshold means flat or short, allocation, instrument/universe, and costs. Do not infer from the sample's historical date range or code that the signal has performed well.

4. **Donchian channel breakout — numerical indicator, app-defined trade rule.** LEAN defines the upper channel as the highest high and lower channel as the lowest low over their respective lookbacks. Its docs demonstrate a symmetric 20/20 channel and show how to read/plot both bands. Those docs demonstrate the indicator, not an entry/exit strategy. A simple paper-analysis variation could test a close above a prior N-bar upper band and an exit below a prior M-bar lower band; that crossing rule is a proposed app option, not a Lean-published rule. [6] [7]
   **Status:** numeric indicator/lookbacks are available; breakout entry, exit, and prior-bar handling are not specified in the source and should be explicit user-configurable fields. **Still needs app-level choices:** N and M, whether to exclude the current bar from the channel used for the signal (to avoid same-bar self-inclusion), close-vs-intrabar confirmation, instrument/timeframe, long-only vs. short treatment, position sizing, stops, and costs.

These are numeric examples or explicitly labeled indicator-based adaptations, not manual/discretionary setups. For the owner-only Expo/React Native app, they are suitable as compact paper-analysis templates with editable parameters and clear “not a recommendation / no performance validation” labeling; they do not justify order execution. No Lean code was installed or executed, no trading bot was run, and no app code, configuration, or git state was changed.

## License and reuse cautions

The repository root identifies Apache License 2.0, and the repository's `LICENSE` contains the Apache-2.0 terms. In broad terms, the license permits use, modification, and redistribution subject to its conditions. If source code is copied or a derivative is distributed, review the requirements to provide the license, mark modified files, and preserve applicable notices; include any relevant `NOTICE` attributions if applicable. The Apache license does not grant QuantConnect trademark or product-name rights. This is a practical summary, not legal advice; verify the exact files and notices before copying code. [2] [8]

## References

[1]: https://github.com/QuantConnect/Lean "QuantConnect/Lean repository"
[2]: https://github.com/QuantConnect/Lean/blob/master/LICENSE "LEAN repository LICENSE"
[3]: https://github.com/QuantConnect/Lean/blob/master/Algorithm.Python/MovingAverageCrossAlgorithm.py "LEAN MovingAverageCrossAlgorithm.py"
[4]: https://github.com/QuantConnect/Lean/blob/master/Algorithm.Python/EmaCrossFuturesFrontMonthAlgorithm.py "LEAN EmaCrossFuturesFrontMonthAlgorithm.py"
[5]: https://github.com/QuantConnect/Lean/blob/master/Algorithm.Python/MACDTrendAlgorithm.py "LEAN MACDTrendAlgorithm.py"
[6]: https://www.quantconnect.com/docs/v2/writing-algorithms/indicators/supported-indicators/donchian-channel "QuantConnect Donchian Channel documentation"
[7]: https://github.com/QuantConnect/Lean/blob/master/Indicators/DonchianChannel.cs "LEAN DonchianChannel indicator source"
[8]: https://www.apache.org/licenses/LICENSE-2.0 "Apache License, Version 2.0"
