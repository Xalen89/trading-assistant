export type Market = 'XAUUSD' | 'NAS100'
export type Strategy = 'OTE' | 'WR1'

export interface Candle {
  time: number
  open: number
  high: number
  low: number
  close: number
  volume?: number
}

export interface ScanOptions {
  rewardRisk: number
  holdingBars: number
}

export interface Setup {
  id: string
  market: Market
  strategy: Strategy | 'WR1 + OTE'
  direction: 'Long' | 'Short'
  pattern: string
  signalIndex: number
  entryIndex: number
  exitIndex: number
  entry: number
  exit: number
  stop: number
  target: number
  result: 'Win' | 'Loss' | 'Breakeven' | 'Unresolved'
  pnl: number
  confluences: string[]
  lastSign: string
  rMultiple: number
}

const DAY = 24 * 60 * 60 * 1000
const SESSION_WINDOWS = [
  { name: 'London open', start: 2 * 60, end: 3 * 60 + 15 },
  { name: 'London continuation', start: 4 * 60, end: 4 * 60 + 45 },
  { name: 'New York AM', start: 9 * 60 + 30, end: 11 * 60 + 15 },
]

function parseTime(value: string): number | null {
  const trimmed = value.trim()
  if (!trimmed) return null
  if (/^\d{10,13}$/.test(trimmed)) {
    const numeric = Number(trimmed)
    return trimmed.length === 10 ? numeric * 1000 : numeric
  }
  const parsed = Date.parse(trimmed)
  return Number.isFinite(parsed) ? parsed : null
}

function splitCsvRow(row: string): string[] {
  const values: string[] = []
  let value = ''
  let quoted = false
  for (let i = 0; i < row.length; i += 1) {
    const character = row[i]
    if (character === '"' && quoted && row[i + 1] === '"') {
      value += '"'
      i += 1
    } else if (character === '"') {
      quoted = !quoted
    } else if (character === ',' && !quoted) {
      values.push(value.trim())
      value = ''
    } else {
      value += character
    }
  }
  values.push(value.trim())
  return values
}

export function parseCandlesCsv(text: string): Candle[] {
  const rows = text.replace(/^\uFEFF/, '').split(/\r?\n/).filter((row) => row.trim())
  if (rows.length < 2) throw new Error('The CSV needs a header row and at least one candle.')

  const headers = splitCsvRow(rows[0]).map((header) => header.toLowerCase().replace(/[\s_-]/g, ''))
  const findColumn = (...names: string[]) => headers.findIndex((header) => names.includes(header))
  const timeColumn = findColumn('time', 'timestamp', 'date', 'datetime')
  const openColumn = findColumn('open', 'o')
  const highColumn = findColumn('high', 'h')
  const lowColumn = findColumn('low', 'l')
  const closeColumn = findColumn('close', 'c')
  const volumeColumn = findColumn('volume', 'vol', 'v')
  if ([timeColumn, openColumn, highColumn, lowColumn, closeColumn].some((column) => column < 0)) {
    throw new Error('Required CSV columns: timestamp, open, high, low, close. Volume is optional.')
  }

  const candles: Candle[] = []
  for (const row of rows.slice(1)) {
    const fields = splitCsvRow(row)
    const time = parseTime(fields[timeColumn] ?? '')
    const open = Number(fields[openColumn])
    const high = Number(fields[highColumn])
    const low = Number(fields[lowColumn])
    const close = Number(fields[closeColumn])
    const volume = volumeColumn < 0 ? undefined : Number(fields[volumeColumn])
    if (
      time === null ||
      ![open, high, low, close].every(Number.isFinite) ||
      open <= 0 ||
      low <= 0 ||
      high < Math.max(open, close, low) ||
      low > Math.min(open, close)
    ) {
      continue
    }
    candles.push({
      time,
      open,
      high,
      low,
      close,
      ...(volume !== undefined && Number.isFinite(volume) ? { volume } : {}),
    })
  }

  const uniqueCandles = new Map<number, Candle>()
  candles.forEach((candle) => uniqueCandles.set(candle.time, candle))
  const sorted = [...uniqueCandles.values()].sort((a, b) => a.time - b.time)
  if (sorted.length < 45) {
    throw new Error(`Only ${sorted.length} valid unique candles found; at least 45 are needed for context.`)
  }
  return sorted
}

function newYorkMinutes(timestamp: number): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(timestamp)
  const hour = Number(parts.find((part) => part.type === 'hour')?.value ?? 0)
  const minute = Number(parts.find((part) => part.type === 'minute')?.value ?? 0)
  return hour * 60 + minute
}

function sessionAt(timestamp: number): string | null {
  const minutes = newYorkMinutes(timestamp)
  return SESSION_WINDOWS.find((window) => minutes >= window.start && minutes <= window.end)?.name ?? null
}

function wr1TimeAt(timestamp: number): string | null {
  const minutes = newYorkMinutes(timestamp)
  const session = sessionAt(timestamp)
  if (session) return session
  const injections = [
    { name: 'Midnight injection', start: 0, end: 14 },
    { name: '02:00 injection', start: 120, end: 134 },
    { name: '08:30 reversal window', start: 510, end: 524 },
    { name: '10:00 4H candle', start: 600, end: 614 },
    { name: '10:30 reversal window', start: 630, end: 644 },
  ]
  return injections.find((window) => minutes >= window.start && minutes <= window.end)?.name ?? null
}

function hasNearbyFvg(
  candles: Candle[],
  startIndex: number,
  endIndex: number,
  direction: 'Long' | 'Short',
  entry: number,
  tolerance: number,
): boolean {
  for (let i = startIndex + 2; i <= endIndex; i += 1) {
    const left = candles[i - 2]
    const right = candles[i]
    const gapMid = direction === 'Long'
      ? (right.low + left.high) / 2
      : (left.low + right.high) / 2
    const exists = direction === 'Long' ? right.low > left.high : left.low > right.high
    if (exists && Math.abs(gapMid - entry) <= tolerance) return true
  }
  return false
}

function hasNearbyOrderBlock(
  candles: Candle[],
  startIndex: number,
  legIndex: number,
  direction: 'Long' | 'Short',
  zoneLow: number,
  zoneHigh: number,
): boolean {
  for (let i = legIndex; i >= startIndex; i -= 1) {
    const candle = candles[i]
    const isOpposing = direction === 'Long' ? candle.close < candle.open : candle.close > candle.open
    if (isOpposing && candle.low <= zoneHigh && candle.high >= zoneLow) return true
  }
  return false
}

function countDirectionChanges(candles: Candle[], start: number, end: number): number {
  let changes = 0
  let previous = 0
  for (let i = start; i <= end; i += 1) {
    const direction = Math.sign(candles[i].close - candles[i].open)
    if (direction && previous && direction !== previous) changes += 1
    if (direction) previous = direction
  }
  return changes
}

function evaluateExit(
  candles: Candle[],
  entryIndex: number,
  entry: number,
  stop: number,
  target: number,
  direction: 'Long' | 'Short',
  options: ScanOptions,
): { exitIndex: number; exit: number; result: Setup['result']; pnl: number; rMultiple: number } {
  const endIndex = Math.min(candles.length - 1, entryIndex + options.holdingBars - 1)
  for (let index = entryIndex; index <= endIndex; index += 1) {
    const candle = candles[index]
    const stopped = direction === 'Long' ? candle.low <= stop : candle.high >= stop
    const targeted = index > entryIndex && (direction === 'Long' ? candle.high >= target : candle.low <= target)
    // When both levels appear inside one bar, assume the less favorable stop happened first.
    if (stopped) {
      const pnl = direction === 'Long' ? stop - entry : entry - stop
      return { exitIndex: index, exit: stop, result: 'Loss', pnl, rMultiple: -1 }
    }
    if (targeted) {
      const pnl = direction === 'Long' ? target - entry : entry - target
      return { exitIndex: index, exit: target, result: 'Win', pnl, rMultiple: options.rewardRisk }
    }
  }
  if (endIndex < entryIndex + options.holdingBars - 1) {
    return { exitIndex: endIndex, exit: candles[endIndex].close, result: 'Unresolved', pnl: 0, rMultiple: 0 }
  }
  const exit = candles[endIndex].close
  const pnl = direction === 'Long' ? exit - entry : entry - exit
  return {
    exitIndex: endIndex,
    exit,
    result: pnl > 0 ? 'Win' : pnl < 0 ? 'Loss' : 'Breakeven',
    pnl,
    rMultiple: pnl / Math.abs(entry - stop),
  }
}

export function scanSetups(
  candles: Candle[],
  market: Market,
  strategy: Strategy | 'Both',
  options: ScanOptions,
): Setup[] {
  if (candles.length < 45) return []
  const cutoff = candles[candles.length - 1].time - 7 * DAY
  const setups: Setup[] = []
  let nextSignalIndex = 40

  for (let index = 40; index < candles.length; index += 1) {
    if (index < nextSignalIndex) continue
    const prior = candles.slice(index - 20, index)
    const priorHigh = Math.max(...prior.map((candle) => candle.high))
    const priorLow = Math.min(...prior.map((candle) => candle.low))
    const trend = candles[index - 1].close - candles[index - 21].close
    const current = candles[index]
    const direction: Setup['direction'] | null =
      current.low < priorLow && current.close > priorLow && trend >= 0
        ? 'Long'
        : current.high > priorHigh && current.close < priorHigh && trend <= 0
          ? 'Short'
          : null
    if (!direction) continue

    const legEnd = Math.min(index + 8, candles.length - 1)
    let legIndex = index
    for (let i = index + 1; i <= legEnd; i += 1) {
      if (
        (direction === 'Long' && candles[i].high > candles[legIndex].high) ||
        (direction === 'Short' && candles[i].low < candles[legIndex].low)
      ) legIndex = i
    }
    const legStart = direction === 'Long' ? current.low : current.high
    const legFinish = direction === 'Long' ? candles[legIndex].high : candles[legIndex].low
    const legSize = Math.abs(legFinish - legStart)
    if (legSize <= 0) continue
    const zoneLow = direction === 'Long'
      ? legFinish - 0.79 * legSize
      : legStart + 0.618 * legSize
    const zoneHigh = direction === 'Long'
      ? legFinish - 0.618 * legSize
      : legStart + 0.79 * legSize
    const entry = (zoneLow + zoneHigh) / 2
    const entryLimit = Math.min(legIndex + 12, candles.length - 1)
    let entryIndex = -1
    for (let i = legIndex + 1; i <= entryLimit; i += 1) {
      if (candles[i].low <= entry && candles[i].high >= entry) {
        entryIndex = i
        break
      }
    }
    if (entryIndex < 0 || candles[entryIndex].time < cutoff) continue
    const wr1Window = wr1TimeAt(candles[entryIndex].time)
    if (strategy === 'WR1' && !wr1Window) continue

    const stop = direction === 'Long' ? current.low : current.high
    const risk = Math.abs(entry - stop)
    if (risk <= 0) continue
    const target = direction === 'Long'
      ? entry + options.rewardRisk * risk
      : entry - options.rewardRisk * risk
    const confluences = ['Liquidity sweep + reclaim', 'OTE retracement 61.8–79%']
    if (hasNearbyFvg(candles, index, entryIndex, direction, entry, legSize * 0.15)) {
      confluences.push('FVG midpoint near entry')
    }
    if (hasNearbyOrderBlock(candles, index, legIndex, direction, zoneLow, zoneHigh)) {
      confluences.push('Opposing-candle OB proxy overlaps OTE')
    }
    const session = sessionAt(candles[entryIndex].time)
    if (session) confluences.push(`${session} entry window (New York time)`)
    if (wr1Window) confluences.push(`${wr1Window} timing`)
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York',
      minute: '2-digit',
    }).formatToParts(candles[entryIndex].time)
    const minute = Number(parts.find((part) => part.type === 'minute')?.value ?? 0)
    if ([0, 1, 5, 6, 8].includes(minute % 10)) {
      confluences.push('Strategy time-number minute (X0/X1/X5/X6/X8)')
    }

    const changes = countDirectionChanges(candles, Math.max(0, entryIndex - 8), entryIndex - 1)
    const patternWindow = candles.slice(Math.max(0, entryIndex - 8), entryIndex + 1)
    const localRange =
      Math.max(...patternWindow.map((candle) => candle.high)) -
      Math.min(...patternWindow.map((candle) => candle.low))
    const pattern = changes >= 3 && localRange <= legSize
      ? `${changes} direction changes inside ≤1 leg range`
      : 'Sweep → displacement → OTE retracement'
    const exit = evaluateExit(candles, entryIndex, entry, stop, target, direction, options)
    setups.push({
      id: `${market}-${candles[index].time}-${direction}`,
      market,
      strategy: strategy === 'Both' ? (wr1Window ? 'WR1 + OTE' : 'OTE') : strategy,
      direction,
      pattern,
      signalIndex: index,
      entryIndex,
      exitIndex: exit.exitIndex,
      entry,
      exit: exit.exit,
      stop,
      target,
      result: exit.result,
      pnl: exit.pnl,
      confluences,
      lastSign: confluences[confluences.length - 1],
      rMultiple: exit.rMultiple,
    })
    nextSignalIndex = entryIndex + 1
  }
  // Older closes establish directional context, but are not part of the displayed seven-day scan.
  return setups.sort((a, b) => candles[b.entryIndex].time - candles[a.entryIndex].time)
}

export function formatPrice(price: number, market: Market): string {
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: market === 'XAUUSD' ? 2 : 1,
    maximumFractionDigits: market === 'XAUUSD' ? 2 : 1,
  }).format(price)
}

export function formatDate(timestamp: number): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'America/New_York',
  }).format(timestamp)
}
