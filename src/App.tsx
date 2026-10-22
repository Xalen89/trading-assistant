import { useMemo, useRef, useState } from 'react'
import type { ChangeEvent } from 'react'
import {
  formatDate,
  formatPrice,
  parseCandlesCsv,
  scanSetups,
} from './scanner'
import type { Candle, Market, ScanOptions, Setup, Strategy } from './scanner'
import './App.css'

type WorkspaceData = Record<Market, Candle[]>
type StrategyFilter = 'Both' | Strategy

const STORAGE_KEY = 'tape-room-workspace-v1'
const EMPTY_DATA: WorkspaceData = { XAUUSD: [], NAS100: [] }
const DEFAULT_OPTIONS: ScanOptions = { rewardRisk: 2, holdingBars: 24 }

function loadWorkspace(): WorkspaceData {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (!saved) return EMPTY_DATA
    const parsed = JSON.parse(saved) as Partial<WorkspaceData>
    return {
      XAUUSD: Array.isArray(parsed.XAUUSD) ? parsed.XAUUSD.slice(-25000) : [],
      NAS100: Array.isArray(parsed.NAS100) ? parsed.NAS100.slice(-25000) : [],
    }
  } catch {
    return EMPTY_DATA
  }
}

function ChartSnapshot({ candles, setup }: { candles: Candle[]; setup: Setup }) {
  const svgRef = useRef<SVGSVGElement>(null)
  const start = Math.max(0, setup.entryIndex - 28)
  const end = Math.min(candles.length - 1, Math.max(setup.exitIndex + 4, setup.entryIndex + 8))
  const visible = candles.slice(start, end + 1)
  const allPrices = visible.flatMap((candle) => [candle.high, candle.low])
  allPrices.push(setup.entry, setup.stop, setup.target)
  const min = Math.min(...allPrices)
  const max = Math.max(...allPrices)
  const padding = (max - min || 1) * 0.1
  const low = min - padding
  const high = max + padding
  const chartWidth = 760
  const chartHeight = 254
  const plotLeft = 64
  const plotRight = 700
  const plotTop = 16
  const plotBottom = 220
  const x = (index: number) => plotLeft + (index / Math.max(visible.length - 1, 1)) * (plotRight - plotLeft)
  const y = (price: number) => plotBottom - ((price - low) / (high - low)) * (plotBottom - plotTop)
  const candleWidth = Math.max(3, Math.min(9, (plotRight - plotLeft) / visible.length * 0.52))

  function downloadImage() {
    if (!svgRef.current) return
    const serialized = new XMLSerializer().serializeToString(svgRef.current)
    const blob = new Blob([serialized], { type: 'image/svg+xml;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${setup.market.toLowerCase()}-${setup.direction.toLowerCase()}-${new Date(candles[setup.entryIndex].time).toISOString().slice(0, 10)}.svg`
    link.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="chart-shell">
      <div className="chart-toolbar">
        <div>
          <span className="chart-symbol">{setup.market}</span>
          <span className="chart-time">{formatDate(candles[setup.entryIndex].time)} ET</span>
        </div>
        <button className="button button-small button-quiet" onClick={downloadImage} type="button">
          <span aria-hidden="true">↗</span> Save chart image
        </button>
      </div>
      <svg
        aria-label={`${setup.market} candlestick chart with entry, stop and target levels`}
        className="price-chart"
        ref={svgRef}
        role="img"
        viewBox={`0 0 ${chartWidth} ${chartHeight}`}
        xmlns="http://www.w3.org/2000/svg"
      >
        <rect width={chartWidth} height={chartHeight} fill="#101715" rx="8" />
        {[0, 1, 2, 3].map((line) => {
          const gridY = plotTop + (line / 3) * (plotBottom - plotTop)
          const price = high - (line / 3) * (high - low)
          return (
            <g key={line}>
              <line x1={plotLeft} x2={plotRight} y1={gridY} y2={gridY} stroke="#26312d" strokeDasharray="3 5" />
              <text x="5" y={gridY + 4} fill="#82918a" fontSize="10">{formatPrice(price, setup.market)}</text>
            </g>
          )
        })}
        <rect
          fill="rgba(121, 190, 150, .08)"
          height={Math.max(4, Math.abs(y(setup.entry) - y(setup.stop)))}
          x={plotLeft}
          y={Math.min(y(setup.entry), y(setup.stop))}
          width={plotRight - plotLeft}
        />
        {visible.map((candle, visibleIndex) => {
          const bullish = candle.close >= candle.open
          const candleX = x(visibleIndex)
          const bodyTop = Math.min(y(candle.open), y(candle.close))
          const bodyHeight = Math.max(2, Math.abs(y(candle.open) - y(candle.close)))
          return (
            <g key={candle.time}>
              <line
                stroke={bullish ? '#6fc49a' : '#df786e'}
                strokeWidth="1"
                x1={candleX}
                x2={candleX}
                y1={y(candle.high)}
                y2={y(candle.low)}
              />
              <rect
                fill={bullish ? '#6fc49a' : '#df786e'}
                height={bodyHeight}
                width={candleWidth}
                x={candleX - candleWidth / 2}
                y={bodyTop}
              >
                <title>{`${formatDate(candle.time)} · O ${formatPrice(candle.open, setup.market)} · H ${formatPrice(candle.high, setup.market)} · L ${formatPrice(candle.low, setup.market)} · C ${formatPrice(candle.close, setup.market)}`}</title>
              </rect>
            </g>
          )
        })}
        {[
          { label: 'TARGET', price: setup.target, color: '#6fc49a' },
          { label: 'ENTRY', price: setup.entry, color: '#e5bd70' },
          { label: 'STOP', price: setup.stop, color: '#df786e' },
        ].map((level) => (
          <g key={level.label}>
            <line x1={plotLeft} x2={plotRight} y1={y(level.price)} y2={y(level.price)} stroke={level.color} strokeDasharray="5 4" />
            <text fill={level.color} fontSize="9" fontWeight="700" x={plotRight + 7} y={y(level.price) + 3}>{level.label}</text>
          </g>
        ))}
        <line
          stroke="#ffffff"
          strokeDasharray="2 4"
          x1={x(setup.entryIndex - start)}
          x2={x(setup.entryIndex - start)}
          y1={plotTop}
          y2={plotBottom}
        />
        <text fill="#82918a" fontSize="9" x={plotLeft} y="243">{formatDate(visible[0].time)}</text>
        <text fill="#82918a" fontSize="9" textAnchor="end" x={plotRight} y="243">{formatDate(visible[visible.length - 1].time)}</text>
      </svg>
      <p className="chart-note">Chart built from imported candles · dashed line marks hypothetical entry · illustrative backtest levels</p>
    </div>
  )
}

function SetupCard({
  candles,
  onSelect,
  selected,
  setup,
}: {
  candles: Candle[]
  onSelect: (id: string) => void
  selected: boolean
  setup: Setup
}) {
  return (
    <button
      aria-pressed={selected}
      className={`setup-row${selected ? ' selected' : ''}`}
      onClick={() => onSelect(setup.id)}
      type="button"
    >
      <span className={`direction-mark ${setup.direction.toLowerCase()}`}>{setup.direction === 'Long' ? '↗' : '↘'}</span>
      <span className="setup-main">
        <span className="setup-name">{setup.market} <span className="muted-dot">·</span> {setup.direction} <span className="strategy-tag">{setup.strategy}</span></span>
        <span className="setup-meta">{formatDate(candles[setup.entryIndex].time)} ET <span>·</span> {setup.confluences.length} confluences</span>
      </span>
      <span className="setup-price">
        <strong>{formatPrice(setup.pnl, setup.market)} pts</strong>
        <small>entry {formatPrice(setup.entry, setup.market)}</small>
      </span>
      <span className={`result-pill ${setup.result.toLowerCase()}`}>{setup.result}</span>
    </button>
  )
}

function App() {
  const [data, setData] = useState<WorkspaceData>(loadWorkspace)
  const [market, setMarket] = useState<Market>('XAUUSD')
  const [strategy, setStrategy] = useState<StrategyFilter>('Both')
  const [options, setOptions] = useState<ScanOptions>(DEFAULT_OPTIONS)
  const [selectedId, setSelectedId] = useState('')
  const [notice, setNotice] = useState('')
  const fileInput = useRef<HTMLInputElement>(null)
  const bars = data[market]

  const setups = useMemo(() => {
    const all = (['XAUUSD', 'NAS100'] as const).flatMap((symbol) =>
      data[symbol].length ? scanSetups(data[symbol], symbol, strategy, options) : [],
    )
    return all.sort((a, b) => {
      const aTime = data[a.market][a.entryIndex].time
      const bTime = data[b.market][b.entryIndex].time
      return bTime - aTime
    })
  }, [data, strategy, options])
  const selectedSetup = setups.find((setup) => setup.id === selectedId && setup.market === market)
    ?? setups.find((setup) => setup.market === market)
  const marketSetups = setups.filter((setup) => setup.market === market)
  const marketWins = marketSetups.filter((setup) => setup.result === 'Win')
  const selectedCandleData = selectedSetup ? data[selectedSetup.market] : bars
  function updateMarketData(changedMarket: Market, candles: Candle[]) {
    setData((current) => {
      const updated = { ...current, [changedMarket]: candles.slice(-25000) }
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(updated))
      } catch {
        setNotice('The file was scanned, but browser storage is full. Export your data before leaving this page.')
      }
      return updated
    })
  }

  async function importFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return
    try {
      const imported = parseCandlesCsv(await file.text())
      const merged = new Map(data[market].map((candle) => [candle.time, candle]))
      imported.forEach((candle) => merged.set(candle.time, candle))
      const next = [...merged.values()].sort((a, b) => a.time - b.time)
      updateMarketData(market, next)
      setNotice(`${imported.length.toLocaleString()} candles imported for ${market}.`)
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Unable to read this CSV file.')
    } finally {
      event.target.value = ''
    }
  }

  function exportWorkspace() {
    const blob = new Blob([JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), data }, null, 2)], {
      type: 'application/json',
    })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'tape-room-workspace.json'
    link.click()
    URL.revokeObjectURL(url)
  }

  function clearMarket() {
    updateMarketData(market, [])
    setSelectedId('')
    setNotice(`${market} data removed from this browser.`)
  }

  return (
    <div className="app-frame">
      <aside className="sidebar">
        <a className="brand" href="/" aria-label="Tape Room home">
          <span className="brand-icon"><span /><span /><span /></span>
          <span>TAPE<span className="brand-light">ROOM</span></span>
        </a>
        <div className="workspace-label">WORKSPACE</div>
        <nav className="side-nav" aria-label="Workspace sections">
          <a className="nav-link active" href="#review"><span>◫</span> Market review</a>
          <a className="nav-link" href="#patterns"><span>⌁</span> Winning patterns</a>
          <a className="nav-link" href="#playbook"><span>▤</span> Strategy playbook</a>
        </nav>
        <div className="sidebar-bottom">
          <div className="local-status"><i /> Private workspace</div>
          <p>Your files stay in this browser. No account or broker connection.</p>
          <button className="sidebar-button" onClick={exportWorkspace} type="button">Export workspace <span>↗</span></button>
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div className="breadcrumb">WORKSPACE <span>/</span> MARKET REVIEW</div>
          <div className="topbar-right">
            <span className="market-data-state"><i /> USER-SUPPLIED DATA</span>
            <button className="avatar" type="button" aria-label="Local workspace">TR</button>
          </div>
        </header>

        <div className="content-wrap" id="review">
          <section className="page-heading">
            <div>
              <div className="eyebrow">LATEST 7 DAYS IN DATA <span className="live-dot" /></div>
              <h1>Setups that <em>played out.</em></h1>
              <p>Review strategy-aligned price action on your imported charts. Your history, your rules.</p>
            </div>
            <div className="heading-actions">
              <button className="button button-outline" onClick={() => fileInput.current?.click()} type="button">
                <span className="upload-glyph">↑</span> Import candles
              </button>
              <input accept=".csv,text/csv" className="hidden-input" onChange={importFile} ref={fileInput} type="file" />
            </div>
          </section>

          {notice && <div className="notice" role="status"><span>i</span> {notice}<button aria-label="Dismiss" onClick={() => setNotice('')} type="button">×</button></div>}

          <section aria-label="Market and scan settings" className="scan-controls">
            <div className="market-tabs" role="tablist" aria-label="Choose market">
              {(['XAUUSD', 'NAS100'] as const).map((symbol) => (
                <button
                  aria-selected={market === symbol}
                  className={`market-tab${market === symbol ? ' active' : ''}`}
                  key={symbol}
                  onClick={() => { setMarket(symbol); setSelectedId('') }}
                  role="tab"
                  type="button"
                >
                  <span className={`market-symbol ${symbol.toLowerCase()}`}>{symbol === 'XAUUSD' ? 'Au' : 'N'}</span>
                  <span>{symbol}<small>{symbol === 'XAUUSD' ? 'Gold · Spot' : 'Nasdaq · CFD'}</small></span>
                </button>
              ))}
            </div>
            <div className="control-divider" />
            <label className="select-control">
              <span>STRATEGY</span>
              <select onChange={(event) => setStrategy(event.target.value as StrategyFilter)} value={strategy}>
                <option value="Both">WR1 + OTE</option>
                <option value="OTE">OTE</option>
                <option value="WR1">WR1</option>
              </select>
            </label>
            <label className="select-control compact">
              <span>TARGET</span>
              <select onChange={(event) => setOptions({ ...options, rewardRisk: Number(event.target.value) })} value={options.rewardRisk}>
                <option value={1}>1R</option>
                <option value={1.5}>1.5R</option>
                <option value={2}>2R</option>
                <option value={3}>3R</option>
              </select>
            </label>
            <label className="select-control compact">
              <span>MAX HOLD</span>
              <select onChange={(event) => setOptions({ ...options, holdingBars: Number(event.target.value) })} value={options.holdingBars}>
                <option value={12}>12 bars</option>
                <option value={24}>24 bars</option>
                <option value={48}>48 bars</option>
              </select>
            </label>
            <button aria-label={`Remove ${market} data`} className="clear-data" disabled={!bars.length} onClick={clearMarket} title={`Remove ${market} data from this browser`} type="button">⌫</button>
          </section>

          <section aria-label="Seven day results" className="metrics-grid">
            <article className="metric-card">
              <div className="metric-top"><span>PROFITABLE SETUPS</span><span className="metric-icon green">↗</span></div>
              <div className="metric-value">{marketWins.length}<span className="metric-unit"> setups</span></div>
              <div className="metric-foot">Only positive hypothetical outcomes</div>
            </article>
            <article className="metric-card">
              <div className="metric-top"><span>WIN RATE</span><span className="metric-icon gold">%</span></div>
              <div className="metric-value">{marketSetups.length ? `${Math.round((marketWins.length / Math.max(1, marketSetups.filter((setup) => setup.result !== 'Unresolved').length)) * 100)}%` : '—'}</div>
              <div className="metric-foot">Resolved hypothetical setups</div>
            </article>
            <article className="metric-card">
              <div className="metric-top"><span>CONFLUENCES</span><span className="metric-icon blue">◎</span></div>
              <div className="metric-value">{marketWins.length ? (marketWins.reduce((sum, setup) => sum + setup.confluences.length, 0) / marketWins.length).toFixed(1) : '—'}<span className="metric-unit">{marketWins.length ? ' avg / win' : ' no wins yet'}</span></div>
              <div className="metric-foot">Count includes the required sweep and OTE</div>
            </article>
            <article className="metric-card">
              <div className="metric-top"><span>CANDLES LOADED</span><span className="metric-icon muted">◷</span></div>
              <div className="metric-value">{bars.length.toLocaleString()}<span className="metric-unit"> {market}</span></div>
              <div className="metric-foot">Stored locally · {bars.length ? 'latest 7 days scanned' : 'import a CSV to begin'}</div>
            </article>
          </section>

          {!bars.length ? (
            <section className="empty-state">
              <div className="empty-art" aria-hidden="true"><span /><span /><span /><span /><span /></div>
              <span className="eyebrow">START WITH YOUR DATA</span>
              <h2>Bring your charts to the table.</h2>
              <p>Import an OHLC CSV for {market}. We’ll scan its latest seven days for WR1 and OTE setups, score visible confluences, and build chart snapshots.</p>
              <button className="button button-primary" onClick={() => fileInput.current?.click()} type="button">↑ &nbsp; Import {market} candles</button>
              <div className="csv-hint"><strong>CSV columns</strong><code>timestamp, open, high, low, close, volume</code><span>45+ candles required · timestamps should include a timezone</span></div>
            </section>
          ) : (
            <>
              <section className="review-grid">
                <div className="panel setups-panel">
                  <div className="panel-heading">
                    <div><span className="eyebrow">SCAN RESULTS</span><h2>Potential setups <span className="count-badge">{marketSetups.length}</span></h2></div>
                    <span className="period-label">LATEST 7 DAYS · ET</span>
                  </div>
                  <div className="table-head"><span>SETUP / ENTRY TIME</span><span>PRICE / P&L</span><span>OUTCOME</span></div>
                  {marketSetups.length ? (
                    <div className="setup-list">
                      {marketSetups.map((setup) => (
                        <SetupCard
                          candles={data[setup.market]}
                          key={setup.id}
                          onSelect={setSelectedId}
                          selected={selectedSetup?.id === setup.id}
                          setup={setup}
                        />
                      ))}
                    </div>
                  ) : (
                    <div className="no-setups">
                      <div className="no-setups-icon">⌕</div>
                      <strong>No matching setups in this scan.</strong>
                      <span>Try the other strategy filter, or import more candle history.</span>
                    </div>
                  )}
                  <div className="panel-foot">{marketSetups.filter((setup) => setup.result === 'Unresolved').length} unresolved setups are excluded from wins. No spread, fees, or slippage included.</div>
                </div>

                <div className="panel detail-panel">
                  {selectedSetup && selectedCandleData.length ? (
                    <>
                      <div className="panel-heading detail-heading">
                        <div><span className="eyebrow">SETUP EVIDENCE</span><h2>Why it worked</h2></div>
                        <span className={`result-pill ${selectedSetup.result.toLowerCase()}`}>{selectedSetup.result}</span>
                      </div>
                      <ChartSnapshot candles={selectedCandleData} setup={selectedSetup} />
                      <div className="trade-levels">
                        <div><span>ENTRY</span><strong>{formatPrice(selectedSetup.entry, selectedSetup.market)}</strong><small>{formatDate(selectedCandleData[selectedSetup.entryIndex].time)} ET</small></div>
                        <div><span>EXIT</span><strong>{formatPrice(selectedSetup.exit, selectedSetup.market)}</strong><small>{formatDate(selectedCandleData[selectedSetup.exitIndex].time)} ET</small></div>
                        <div><span>STOP / TARGET</span><strong>{formatPrice(selectedSetup.stop, selectedSetup.market)} / {formatPrice(selectedSetup.target, selectedSetup.market)}</strong><small>{selectedSetup.rMultiple.toFixed(2)}R outcome · price points, not account P&amp;L</small></div>
                      </div>
                      <div className="evidence-block">
                        <div className="evidence-title"><span>◈</span> CONFLUENCE CHECKLIST <strong>{selectedSetup.confluences.length}</strong></div>
                        <div className="confluence-list">{selectedSetup.confluences.map((item, index) => <span className="confluence-chip" key={item}><i>{index < 2 ? '✓' : '·'}</i>{item}</span>)}</div>
                      </div>
                      <div className="last-sign"><span className="last-sign-icon">✳</span><div><small>LAST SIGN BEFORE ENTRY</small><strong>{selectedSetup.lastSign}</strong><p>{selectedSetup.pattern}</p></div></div>
                    </>
                  ) : (
                    <div className="detail-empty"><span className="eyebrow">SETUP EVIDENCE</span><h2>Chart evidence will appear here.</h2><p>No qualifying setup was found in the selected market’s seven-day window.</p></div>
                  )}
                </div>
              </section>

              <section className="patterns-section" id="patterns">
                <div className="section-heading">
                  <div><span className="eyebrow">REPEATABLE PRICE ACTION</span><h2>Winning patterns</h2><p>Successful historical candidates from the imported data—not signals or a forecast.</p></div>
                  <span className="pattern-count">{marketWins.length} profitable examples</span>
                </div>
                {marketWins.length ? (
                  <div className="pattern-grid">
                    {marketWins.slice(0, 6).map((setup, index) => {
                      const patternCandles = data[market].slice(
                        Math.max(0, setup.signalIndex - 4),
                        Math.min(data[market].length, setup.exitIndex + 1),
                      ).slice(-20)
                      const patternMin = Math.min(...patternCandles.map((candle) => candle.low))
                      const patternMax = Math.max(...patternCandles.map((candle) => candle.high))
                      const patternY = (price: number) => 45 - ((price - patternMin) / (patternMax - patternMin || 1)) * 37
                      return (
                        <button
                          className="pattern-card"
                          key={setup.id}
                          onClick={() => setSelectedId(setup.id)}
                          type="button"
                        >
                          <div className="pattern-card-top"><span className="pattern-index">0{index + 1}</span><span className="pattern-profit">+{formatPrice(setup.pnl, setup.market)} pts</span></div>
                          <svg aria-label="Candlestick thumbnail from imported price data" className="pattern-spark" role="img" viewBox="0 0 300 59">
                            {patternCandles.map((candle, candleIndex) => {
                              const candleX = 5 + (candleIndex / Math.max(patternCandles.length - 1, 1)) * 288
                              const bullish = candle.close >= candle.open
                              const color = bullish ? '#6fc49a' : '#d47769'
                              const candleBodyY = Math.min(patternY(candle.open), patternY(candle.close))
                              return (
                                <g key={candle.time}>
                                  <line stroke={color} strokeWidth="1" x1={candleX} x2={candleX} y1={patternY(candle.high)} y2={patternY(candle.low)} />
                                  <rect fill={color} height={Math.max(1.5, Math.abs(patternY(candle.open) - patternY(candle.close)))} width="4" x={candleX - 2} y={candleBodyY} />
                                </g>
                              )
                            })}
                          </svg>
                          <strong>{setup.pattern}</strong>
                          <span className="pattern-sub">{setup.direction} · {setup.confluences.length} confluences · {formatDate(data[market][setup.entryIndex].time)} ET</span>
                          <span className="pattern-link">View chart evidence <b>→</b></span>
                        </button>
                      )
                    })}
                  </div>
                ) : (
                  <div className="pattern-empty"><span>⌁</span><div><strong>Pattern library is waiting for a profitable match.</strong><p>Import real OHLC candles to discover examples. A win means a positive price-point outcome under the selected stop, target, and holding rules.</p></div></div>
                )}
              </section>
            </>
          )}

          <section className="playbook-section" id="playbook">
            <div className="playbook-head"><div><span className="eyebrow">HOW THE SCAN WORKS</span><h2>Rules before results.</h2></div><span className="playbook-mark">TR / 01</span></div>
            <div className="rules-grid">
              <article><span>01</span><strong>Liquidity sweep</strong><p>Looks for a break of the prior 20-bar high/low that closes back inside, aligned with the recent 20-bar drift.</p></article>
              <article><span>02</span><strong>Retrace into OTE</strong><p>Measures the next 8 bars as the displacement leg, then waits up to 12 bars for a 70.5% retracement (inside 61.8–79%).</p></article>
              <article><span>03</span><strong>Defined exit</strong><p>Stop is the sweep extreme. Target is configurable in R; otherwise closes at the selected bar limit. Same-bar stop/target ties assume stop first.</p></article>
              <article><span>04</span><strong>Evidence, not advice</strong><p>FVG, opposing-candle OB proxy, New York session, and time-number checks are heuristic. Gaps, spread, and fees are not modeled.</p></article>
            </div>
            <div className="disclaimer"><span>ⓘ</span><p><strong>Research tool, not financial advice.</strong> This scanner infers candidate setups from historical candles; it does not connect to a broker, guarantee results, or reproduce every discretionary WR1/OTE rule. Positive price points are not the same as account profit.</p></div>
          </section>
          <footer className="page-footer"><span>TAPE ROOM <i>·</i> LOCAL STRATEGY JOURNAL</span><button onClick={exportWorkspace} type="button">Export data</button></footer>
        </div>
      </main>
    </div>
  )
}

export default App
