# Native Private Paper App — Bounded Catalog Decision

## Decision

Keep the catalog deliberately **bounded**. Add the three distinct, close-of-completed-bar reference recipes below rather than trying to expose every candlestick pattern or indicator combination:

1. **Trend / crossover:** SMA 20/50 crossover
2. **Momentum:** MACD 12/26/9 signal-line crossover
3. **Breakout / channel:** prior-20-bar Donchian channel

These are **numerical paper-analysis recipes, not validated strategies, investment recommendations, or performance claims**. Indicator definitions and example source code/documentation are references only. Implement calculations natively; **do not import packages or copy repository strategy code**.

Existing catalog items remain separate: EMA 20/50 pullback; breakout with RVOL/news missing; BB 20/RSI 14 rebound; reference-only scalp; and SMC Core Sequence, SilverBullet, OB, STDV, and WR1. The new items intentionally avoid duplicating those categories.

## Common evaluation contract

Apply all three recipes only to an ordered, finite OHLC stream for a selected instrument and interval.

- Evaluate once after a **completed bar close**. Do not emit or revise a signal intrabar.
- Treat the rules as long-only paper annotations: a bullish/entry condition is a **long candidate**; an opposing condition is **neutral/review/exit**, not an instruction to sell short.
- Do not silently fill missing, duplicate, out-of-order, or non-finite bars. Mark the result **unknown** until the selected data policy resolves the input.
- Use the source’s chosen price adjustment convention consistently. The supplied research does not select adjusted versus unadjusted prices, session/calendar, time zone, candle aggregation, gap policy, fills, sizing, costs, slippage, borrowing, exposure limits, or overlapping-signal policy.
- A recipe’s numerical condition does not establish trend context, expected return, suitability, or a trading action.

## Add exactly these three reference recipes

### 1. SMA 20/50 completed-close crossover

**Category:** Trend / crossover  
**Status:** Native numerical paper rule; not a source-provided validated trading system.

**Parameters (fixed reference defaults):** `fast=20`, `slow=50`, `price=completed close`, `direction=long-only annotation`.

**Calculation and rule wording**

1. Compute `SMA20[t]` as the arithmetic mean of the latest 20 completed closes through bar `t`; compute `SMA50[t]` likewise from the latest 50 completed closes.
2. Mark **Long candidate — bullish crossover** only when `SMA20[t] > SMA50[t]` **and** `SMA20[t-1] <= SMA50[t-1]`.
3. Mark **Neutral/review — bearish crossover** only when `SMA20[t] < SMA50[t]` **and** `SMA20[t-1] >= SMA50[t-1]`.
4. Otherwise emit no new event. Equality is not itself a crossover.
5. Require **51 completed closes** to evaluate the current and prior 50-period values. Before then, output warm-up/unknown; do not infer a crossover merely because the first available fast value is already above the slow value.

**Deliberately unselected/unknown conditions:** whether a bearish event merely closes a paper state or can open a short; sizing; initial-state treatment; stop/target; data-adjustment/session rules; and all fill/cost assumptions.

**Verified reference and license:** [QuantConnect Lean `MovingAverageCrossAlgorithm.py`](https://github.com/QuantConnect/Lean/blob/master/Algorithm.Python/MovingAverageCrossAlgorithm.py) (official sample uses different EMA parameters); [Lean repository license](https://github.com/QuantConnect/Lean/blob/master/LICENSE), **Apache-2.0**. The SMA 20/50 parameterization and exact event semantics above are app-authored.

### 2. MACD 12/26/9 completed-close signal crossover

**Category:** Momentum  
**Status:** Native numerical paper rule; not a source-provided validated trading system.

**Parameters (fixed reference defaults):** `fast=12`, `slow=26`, `signal=9`, `price=completed close`, `zero-line filter=off`, `direction=long-only annotation`.

**Calculation and rule wording**

1. For reproducibility, use EMA smoothing `alpha = 2/(N+1)`: seed each price EMA with the simple mean of its first `N` completed closes, then update `EMA[t] = alpha*close[t] + (1-alpha)*EMA[t-1]`.
2. Compute `MACD[t] = EMA12[t] - EMA26[t]`. Seed `Signal9` with the simple mean of its first nine available MACD values, then apply the same EMA update formula to subsequent MACD values. Compute `Histogram[t] = MACD[t] - Signal9[t]` for display only.
3. Mark **Long candidate — bullish MACD cross** only when `MACD[t] > Signal9[t]` **and** `MACD[t-1] <= Signal9[t-1]`.
4. Mark **Neutral/review — bearish MACD cross** only when `MACD[t] < Signal9[t]` **and** `MACD[t-1] >= Signal9[t-1]`.
5. Do not apply a zero-line, histogram-size, price-trend, volume, news, or threshold filter in this reference definition. Equality is not a signal.
6. With the stated SMA seeds, require **35 completed closes** before a current and prior signal-line comparison is available. Until then output warm-up/unknown.

**Deliberately unselected/unknown conditions:** alternate MACD seeding conventions; whether to require the MACD line above zero; entry/exit response and shorting; sizing; stop/target; time/session and price-adjustment policy; and all fill/cost assumptions.

**Verified reference and license:** [QuantConnect Lean `MACDTrendAlgorithm.py`](https://github.com/QuantConnect/Lean/blob/master/Algorithm.Python/MACDTrendAlgorithm.py) (official sample uses MACD 12/26/9 with a different normalized-threshold rule); [Lean repository license](https://github.com/QuantConnect/Lean/blob/master/LICENSE), **Apache-2.0**. The exact close-only crossover and seeding policy above are app-authored.

### 3. Prior-20-bar Donchian channel breakout / channel exit

**Category:** Breakout / channel  
**Status:** Native numerical paper rule; not a source-provided validated trading system.

**Parameters (fixed reference defaults):** `lookback=20`, `entry price=completed close`, `exit price=completed close`, `current bar excluded from thresholds`, `direction=long-only`.

**Calculation and rule wording**

1. At the close of bar `t`, calculate the **prior** upper channel `Upper20[t] = max(high[t-20] … high[t-1])` and prior lower channel `Lower20[t] = min(low[t-20] … low[t-1])`. The active bar is deliberately excluded.
2. If the paper state is flat, mark **Long candidate — channel breakout** and change it to paper-long only when `close[t] > Upper20[t]`. A close equal to the upper channel is not a breakout.
3. If the paper state is long, mark **Neutral/review — channel exit** and change it to flat only when `close[t] < Lower20[t]`. A close equal to the lower channel is not an exit.
4. Otherwise retain the current paper state and emit no new event. No short entry is defined.
5. Require **21 completed bars** before the first threshold can be calculated. Before then output warm-up/unknown. Initialize a newly selected instrument/interval as flat only if the app explicitly chooses that state; it must not reconstruct a historical position from incomplete history.

**Deliberately unselected/unknown conditions:** intrabar break versus close confirmation; gap/open treatment; reversal/short behavior; sizing; stop/target; lookback asymmetry; session and price-adjustment policy; and all fill/cost assumptions.

**Verified reference and license:** [Stock.Indicators Donchian documentation](https://dotnet.stockindicators.dev/indicators/donchian) and [repository license](https://github.com/DaveSkender/Stock.Indicators/blob/main/LICENSE), **Apache-2.0**. The prior-bar exclusion and long-only paper entry/exit recipe above are app-authored; Donchian documentation defines the indicator, not this strategy.

## Pattern catalog: bounded, reference-only review labels

Do **not** turn every known candlestick shape into a strategy catalog. If the UI needs a compact pattern-review list, retain only these numerical OHLC labels and show them as context requiring independent trend/manual review:

| Pattern name | Verified source | License | Important boundary |
|---|---|---|---|
| Engulfing (`CDLENGULFING`) | [TA-Lib function docs](https://ta-lib.org/functions/cdlengulfing.html) | TA-Lib **BSD-3-Clause** | Shape flag; does not verify preceding trend. |
| Hammer (`CDLHAMMER`) | [TA-Lib function docs](https://ta-lib.org/functions/cdlhammer.html) | TA-Lib **BSD-3-Clause** | Shape flag; does not verify preceding decline. |
| Morning Star (`CDLMORNINGSTAR`) | [TA-Lib function docs](https://ta-lib.org/functions/cdlmorningstar.html) | TA-Lib **BSD-3-Clause** | Shape flag; does not verify downtrend context. |
| Doji (`CDLDOJI`) | [TA-Lib function docs](https://ta-lib.org/functions/cdldoji.html) | TA-Lib **BSD-3-Clause** | Non-directional threshold-based detection. |
| Harami (`CDLHARAMI`) | [TA-Lib function docs](https://ta-lib.org/functions/cdlharami.html) | TA-Lib **BSD-3-Clause** | Shape flag; reversal/trend context is separate. |
| Rising/Falling Three Methods (`CDLRISEFALL3METHODS`) | [TA-Lib function docs](https://ta-lib.org/functions/cdlrisefall3methods.html) | TA-Lib **BSD-3-Clause** | Continuation shape; prior trend check is separate. |

TA-Lib licensing covers the core repository, not automatically any wrapper. If a pattern is implemented natively from an independently authored specification, still retain source attribution in the catalog and do not copy source code. This is a product/license note, not legal advice.

## Licensing and implementation boundary

- **No external import and no copied licensed implementation:** use native calculations written for the app.
- **Apache-2.0 references:** preserve relevant license/NOTICE obligations if any Lean or Stock.Indicators code is ever incorporated or redistributed; neither is needed for the definitions above.
- **BSD-3-Clause references:** preserve required notices and avoid prohibited endorsement if TA-Lib code is ever used; wrapper licenses require separate review.
- The references are provenance for definitions, **not evidence that the recipes are validated or suitable**.
