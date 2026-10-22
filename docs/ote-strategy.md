# OTE Trading Strategy (Adapted from WR1)

## Overview

**The Idea in One Line:** 
Trade in the direction of your higher-timeframe bias, wait for a manipulation move, then enter when price retraces into the OTE zone (61.8% - 79% of the leg) at a spot where several other confluences stack up.

**Note:** The source builds levels from many tools, with OTE as the required base and everything else adding weight.

## Step 1: Bias (No Bias, No Trade)

### HTF Trend
Follow monthly → weekly → daily direction and pick expected weekly/monthly reversal levels.

### Opens
- Price below the weekly open early in the week leans bullish for the week
- Price below the midnight open leans bullish for the day (reverse for bearish)
- The initial move away from the open is the **Judas swing**

### Economic Calendar
- High-impact news on Tuesday points to Tuesday forming the weekly high or low
- If Monday and Tuesday are quiet, look at Wednesday

### Cross-Market Checks
- DXY should lean opposite to NQ
- Bonds (15M) usually turn before DXY, hinting at a DXY reversal

### Optional
- COT (commercial positioning) and seasonality, only if they agree with the rest

## Step 2: Time Windows (EST)

### London Session
- **02:00 - 03:15**
- **04:00 - 04:45**

### New York AM
- **09:30 - 11:15** (preferred)

### Manipulation/Injection Times
- **00:00, 02:00, 08:30, 09:30**, and the **10:00 4H candle**
- Price often sweeps one way, then reverses

### Reversals
- Commonly show up around **:30 marks** (08:30, 09:30, 10:30)
- Bonus rule with a ~15-minute window

### Day Specifics
- On **Tuesdays and Thursdays**, the London high often forms first, followed by a New York retracement entry

## Step 3: Draw the Range and Find the OTE Zone

### Range Selection
Take the manipulation leg (Judas swing or sweep) as your range from swing low to swing high.

### Mark OTE Levels
- **0.618**
- **0.705**
- **0.79**

### Mark Additional Levels
- **Quarters**: 0.25, 0.5, 0.75
- **Midpoints**: 0.375, 0.625

### Apply Across Multiple Range Types
- Swing-to-swing range
- Candle range (each 4H, 1H, and 15M candle)
- Wick range (big news wicks)

## Step 4: Confluence Checklist

### STDV
- -1 to -1.5
- -2 to -2.5
- -4 to -4.5 from the manipulation leg

### FVG/IFVG C.E.
Midpoint of a fair value gap or inverse FVG

### RDRB C.E.
Midpoint of a re-deliver, re-balance area

### Overlap (HIPPO) C.E.
Overlapping candle wicks near an HTF FVG midpoint

### Order Block
Midpoint or body of the OB

### Wick C.E.
Midpoint of a large wick, especially news candles

### HTF Accumulation Candle
Stubby candle with big wicks on both sides

### Turtle Soup
Sweep of a high/low into a PD array, ideally with SMT

### MOP
Midnight open within about a month

### Time Numbers
- Highs, lows, OBs, or FVGs formed at **X8**
- Key highs/lows at **X0, X1, X5, X6**

### News
News highs/lows and news-wick midpoints act as magnets

### Scoring Guide
- **OTE + 1 confluence**: Watch only
- **OTE + 2–3 confluences**: Valid setup
- **OTE + 4+ confluences**: A+ setup

## Step 5: Refine Top-Down

### 1H Analysis
- Find range, OTE zone, and STDV
- Highlight overlap areas

### 15M Analysis
- Look inside the highlighted area for overlaps
- Find FVG/IFVG midpoints and OBs to pick the best level

### 5M/1M Analysis
- Look for X8 order blocks, X8 highs, and 1M OB midpoints for the final entry level

## Step 6-9: Execution, Stop Loss, Targets, and Risk

### Entry Models
- Limit order on the level
- Confirmation via SMT (5M minimum)
- Reaction to an FVG/IFVG/confluence

### Stop Loss
While learning, place above/below:
- 5M candle high/low
- 1M swing high/low

### Targets
- Safe target: 50% of the range
- Intraday targets: STDV levels and previous day high/low

### Risk Rules
- Risk a fixed small percentage per trade (0.5% - 1%)
- Minimum 1:2 risk/reward
- Cap at 2 trades per session
