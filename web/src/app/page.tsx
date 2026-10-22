"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Icon } from "../components/icons";
import { PriceChart } from "../components/price-chart";
import { BacktestPanel, Journal, Message, SavedAnalyses, Strategies } from "../components/workspace-panels";
import { api, dateTime, errorMessage, number } from "../lib/api";
import { useWorkspace } from "../lib/store";
import type { Analysis, Prices, Strategy, Timeframe } from "../lib/types";

type Tab = "strategies" | "journal" | "backtest" | "saved";
const tabs: { id: Tab; name: string; icon: string }[] = [
  { id: "strategies", name: "Strategies", icon: "layers" },
  { id: "journal", name: "Trade journal", icon: "book" },
  { id: "backtest", name: "Backtesting", icon: "flask" },
  { id: "saved", name: "Saved analyses", icon: "history" },
];

export default function Home() {
  const { instrument, setInstrument, timeframe, strategyId, setStrategyId } = useWorkspace();
  const [tab, setTab] = useState<Tab>("strategies");
  const [strategies, setStrategies] = useState<Strategy[]>([]);
  const [health, setHealth] = useState<{ mode: "demo" | "live"; aiConfigured: boolean } | null>(null);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const workspaceRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const controller = new AbortController();
    Promise.allSettled([
      api<{ strategies: Strategy[] }>("/strategies", { signal: controller.signal }),
      api<{ mode: "demo" | "live"; aiConfigured: boolean }>("/health", { signal: controller.signal }),
    ]).then(([strategyResult, healthResult]) => {
      if (controller.signal.aborted) return;
      const errors: string[] = [];
      if (strategyResult.status === "fulfilled") {
        setStrategies(strategyResult.value.strategies);
        const current = useWorkspace.getState().strategyId;
        if (!strategyResult.value.strategies.some((strategy) => strategy.id === current)) setStrategyId(strategyResult.value.strategies[0]?.id ?? "");
      } else errors.push(`Strategies: ${errorMessage(strategyResult.reason)}`);
      if (healthResult.status === "fulfilled") setHealth(healthResult.value);
      else errors.push(`Service status: ${errorMessage(healthResult.reason)}`);
      setError(errors.join(" "));
    });
    return () => controller.abort();
  }, [revision, setStrategyId]);
  function navigate(next: Tab) {
    setTab(next); workspaceRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  return <div className="app-shell">
    <aside className="sidebar">
      <Link className="brand" href="/" aria-label="TradeLens home"><span className="brand-mark"><Icon name="chart" size={23} /></span><span>trade<span className="brand-light">lens</span><span className="brand-dot">.</span></span></Link>
      <div className="workspace-label">PERSONAL WORKSPACE</div>
      <nav aria-label="Main navigation">
        <button className="nav-item active" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}><Icon name="grid" /><span>Overview</span><span className="nav-active-dot" /></button>
        <div className="nav-label">RESEARCH & EXECUTION</div>
        {tabs.map((item) => <button className="nav-item" key={item.id} onClick={() => navigate(item.id)}><Icon name={item.icon} /><span>{item.name}</span>{item.id === "strategies" && <span className="nav-count">{strategies.length}</span>}</button>)}
      </nav>
      <div className="sidebar-bottom"><div className="research-card"><span className="research-icon"><Icon name="shield" size={21} /></span><h3>Process over prediction.</h3><p>Build conviction with research.<br />Trade with a plan, not a promise.</p><span>YOUR EDGE STARTS HERE <Icon name="arrow" size={14} /></span></div><div className="profile"><div className="avatar">TR</div><div><strong>Trading workspace</strong><span>Independent researcher</span></div><span className="profile-dot" /></div></div>
    </aside>
    <div className="main-shell">
      <header className="topbar"><div className="breadcrumb">Workspace <span>/</span> <strong>Overview</strong></div><div className="topbar-right"><span className="session-label"><span className="status-dot" />Research workspace</span><span className={`badge ${health?.mode === "demo" ? "amber" : "neutral"}`}>{health ? health.mode === "demo" ? "IN-MEMORY STORAGE" : "POSTGRESQL STORAGE" : "CONNECTING"}</span><div className="avatar small">TR</div></div></header>
      <main>
        <div className="page-heading"><div><div className="eyebrow">A LITTLE CLARITY. A BETTER PROCESS.</div><h1>Your edge, in focus<span>.</span></h1><p>The markets move fast. Make your next decision a considered one.</p></div><div className="heading-date"><Icon name="clock" size={16} /><span>Research. Review. Refine.</span></div></div>
        <div className="demo-banner"><span className="banner-icon"><Icon name="info" size={18} /></span><div><strong>{health?.mode === "live" ? "PostgreSQL research workspace" : health?.mode === "demo" ? "In-memory research workspace" : "Checking workspace status"}</strong><span>{health?.mode === "demo" ? "Your strategies, analyses, and trades are temporary and reset when the API restarts. Market-data source is shown on the chart." : health?.mode === "live" ? "Your research is stored in PostgreSQL. Market-data source is shown on the chart. Research only, not financial advice." : "Market-data source is shown on the chart. AI output is research assistance, never an investment guarantee."}</span></div><span className="banner-tag">RESEARCH ONLY</span></div>
        {error && <div className="connection-error"><Message error={error} /><button className="button secondary small" onClick={() => setRevision((value) => value + 1)}>Retry connection</button></div>}
        <div className="market-strip"><div className="market-strip-label"><Icon name="chart" size={17} /><span>YOUR WATCHLIST</span></div>{(["NAS100", "XAUUSD"] as const).map((value) => <button className={`watchlist-item ${instrument === value ? "selected" : ""}`} key={value} onClick={() => setInstrument(value)}><span className={`instrument-icon ${value === "XAUUSD" ? "gold" : ""}`}>{value === "NAS100" ? "N" : "Au"}</span><span><strong>{value}</strong><small>{value === "NAS100" ? "US Nasdaq 100" : "Gold / US Dollar"}</small></span><Icon name="arrow" size={16} /></button>)}<div className="watchlist-note"><Icon name="shield" size={16} /><span>Two markets.<br />One focused workspace.</span></div></div>
        <MarketWorkspace key={`${instrument}-${timeframe}`} strategies={strategies} health={health} tab={tab} setTab={setTab} workspaceRef={workspaceRef} onSaved={(strategy) => setStrategies((current) => [...current.filter((item) => item.id !== strategy.id), strategy])} strategyId={strategyId} />
        <footer className="page-footer"><span><span className="footer-logo">tradelens.</span> Built for a more intentional trading process.</span><span>Research only. Not financial advice. Capital is at risk.</span></footer>
      </main>
    </div>
  </div>;
}

function MarketWorkspace({ strategies, health, tab, setTab, workspaceRef, onSaved, strategyId }: {
  strategies: Strategy[]; health: { mode: "demo" | "live"; aiConfigured: boolean } | null;
  tab: Tab; setTab: (tab: Tab) => void; workspaceRef: React.RefObject<HTMLDivElement | null>;
  onSaved: (strategy: Strategy) => void; strategyId: string;
}) {
  const { instrument, timeframe, setTimeframe, setStrategyId, overlays, toggleOverlays } = useWorkspace();
  const [prices, setPrices] = useState<Prices | null>(null);
  const [priceError, setPriceError] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [priceRevision, setPriceRevision] = useState(0);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [analysisError, setAnalysisError] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzingStrategy, setAnalyzingStrategy] = useState("");
  const [now, setNow] = useState(0);
  const analysisRequest = useRef(0);
  const activeController = useRef<AbortController | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    let inFlight = false;
    async function refresh() {
      if (inFlight) return;
      inFlight = true; setRefreshing(true);
      try {
        const result = await api<Prices>(`/price-data?instrument=${instrument}&timeframe=${timeframe}&limit=300`, { signal: controller.signal });
        if (!controller.signal.aborted) { setPrices(result); setPriceError(""); setNow(Date.now()); }
      } catch (error) { if (!controller.signal.aborted) setPriceError(errorMessage(error)); }
      finally { inFlight = false; if (!controller.signal.aborted) { setLoading(false); setRefreshing(false); } }
    }
    void refresh();
    const polling = setInterval(refresh, 30000);
    const clock = setInterval(() => setNow(Date.now()), 10000);
    return () => { controller.abort(); clearInterval(polling); clearInterval(clock); };
  }, [instrument, timeframe, priceRevision]);
  useEffect(() => {
    return () => { analysisRequest.current += 1; activeController.current?.abort(); };
  }, [strategyId]);
  const matchingAnalysis = analysis && analysis.strategyId === strategyId ? analysis : null;
  const candles = prices?.candles ?? [];
  const last = candles.at(-1);
  const first = candles[0];
  const change = last && first ? last.close - first.open : 0;
  const changePercent = first?.open ? change / first.open * 100 : 0;
  const high = candles.length ? Math.max(...candles.map((candle) => candle.high)) : null;
  const low = candles.length ? Math.min(...candles.map((candle) => candle.low)) : null;
  const stale = !!prices && (now - new Date(prices.asOf).getTime() > 90000 || !!priceError);
  const selectedStrategy = strategies.find((strategy) => strategy.id === strategyId);
  async function analyze() {
    const id = ++analysisRequest.current;
    activeController.current?.abort();
    const controller = new AbortController();
    activeController.current = controller;
    setAnalyzing(true); setAnalyzingStrategy(strategyId); setAnalysisError("");
    try {
      const result = await api<{ analysis: Analysis }>("/analyze", { method: "POST", signal: controller.signal, body: JSON.stringify({ instrument, timeframe, strategyId }) });
      if (id === analysisRequest.current) setAnalysis(result.analysis);
    } catch (error) { if (id === analysisRequest.current && !controller.signal.aborted) setAnalysisError(errorMessage(error)); }
    finally { if (activeController.current === controller) setAnalyzing(false); }
  }
  function selectAnalysis(value: Analysis) {
    analysisRequest.current += 1; activeController.current?.abort(); setAnalyzing(false); setAnalysisError("");
    setStrategyId(value.strategyId); setAnalysis(value); window.scrollTo({ top: 250, behavior: "smooth" });
  }
  const analysisBusy = analyzing && analyzingStrategy === strategyId;
  return <>
    <div className="trading-grid">
      <section className="chart-panel panel">
        <div className="chart-heading"><div className="inline"><span className={`instrument-icon large ${instrument === "XAUUSD" ? "gold" : ""}`}>{instrument === "NAS100" ? "N" : "Au"}</span><div><div className="inline"><h2>{instrument}</h2><span className="asset-type">{instrument === "NAS100" ? "INDEX" : "COMMODITY"}</span></div><p>{instrument === "NAS100" ? "US Nasdaq 100" : "Gold / US Dollar"} <span className="muted">· USD</span></p></div></div><div className="quote"><strong>{last ? number(last.close) : "—"}</strong><span className={change >= 0 ? "positive" : "negative"}>{last ? `${change >= 0 ? "+" : ""}${number(change)} (${change >= 0 ? "+" : ""}${number(changePercent)}%)` : "Waiting for data"}</span></div></div>
        <div className="chart-toolbar"><div className="timeframes" role="group" aria-label="Chart timeframe">{(["5m", "15m", "1h", "4h", "1d"] as Timeframe[]).map((value) => <button className={timeframe === value ? "selected" : ""} key={value} aria-pressed={timeframe === value} onClick={() => setTimeframe(value)}>{value}</button>)}</div><div className="chart-actions"><span className="candlestick-label"><Icon name="chart" size={15} />Candles</span><button className={`overlay-toggle ${overlays ? "on" : ""}`} aria-pressed={overlays} onClick={toggleOverlays} title="Toggle analysis levels and markers"><Icon name="layers" size={15} /><span>AI levels</span><span className="switch-track"><span /></span></button><button className="icon-button" aria-label="Refresh chart data" disabled={refreshing} onClick={() => setPriceRevision((value) => value + 1)}><Icon name="refresh" size={15} className={refreshing ? "spin" : ""} /></button></div></div>
        <div className="ohlc"><span>O <b>{last ? number(last.open) : "—"}</b></span><span>H <b>{last ? number(last.high) : "—"}</b></span><span>L <b>{last ? number(last.low) : "—"}</b></span><span>C <b className={last && last.close >= last.open ? "positive" : "negative"}>{last ? number(last.close) : "—"}</b></span><span className="chart-source">{prices ? prices.source === "demo" ? "SYNTHETIC DATA" : "OANDA DATA" : "AWAITING PROVIDER"}</span></div>
        <div className="chart-canvas">{candles.length ? <PriceChart candles={candles} analysis={matchingAnalysis} overlays={overlays} /> : <div className="chart-empty"><Icon name="chart" size={38} /><strong>{loading ? "Bringing your market into focus…" : "No candles available"}</strong><p>{loading ? "Connecting to the price-data provider" : "Try refreshing or choosing another timeframe."}</p></div>}</div>
        {priceError && <div className="chart-error"><Message error={`Price provider: ${priceError}`} /></div>}
        <div className="chart-footer"><span><span className={`status-dot ${stale || priceError ? "warning" : !prices ? "pending" : ""}`} />{stale ? "Stale data" : priceError ? "Provider unavailable" : prices ? prices.source === "demo" ? "Synthetic demo feed" : "Provider connected" : "Connecting"}<span className="footer-divider">·</span>Refreshes every 30s</span><span>{prices ? `As of ${dateTime(prices.asOf)}` : "No data received"}</span></div>
        <div className="market-stats"><div><span>WINDOW HIGH</span><strong>{high === null ? "—" : number(high)}</strong></div><div><span>WINDOW LOW</span><strong>{low === null ? "—" : number(low)}</strong></div><div><span>CANDLES</span><strong>{candles.length || "—"}</strong></div><div><span>CHARTING</span><a href="https://www.tradingview.com/" target="_blank" rel="noreferrer">TradingView ↗</a></div></div>
      </section>
      <aside className="analysis-panel panel">
        <div className="analysis-heading"><div className="inline"><span className="ai-icon"><Icon name="spark" size={19} /></span><h2>AI market analysis</h2></div><span className="badge purple">RESEARCH</span></div>
        <div className="analysis-body"><p className="analysis-intro">A second perspective.<br /><span>Not a substitute for your judgment.</span></p><label className="strategy-select">STRATEGY<select value={strategyId} onChange={(event) => { setStrategyId(event.target.value); setAnalyzing(false); setAnalysisError(""); }} disabled={!strategies.length}>{!strategies.length && <option value="">No strategies available</option>}{strategies.map((strategy) => <option key={strategy.id} value={strategy.id}>{strategy.name}</option>)}</select></label>
          <div className="selected-strategy-note"><Icon name="shield" size={14} /><span>Configurable, unverified template</span></div>
          <button className="button analyze-button" disabled={analysisBusy || !strategyId || loading || !candles.length} onClick={analyze}><Icon name={analysisBusy ? "refresh" : "spark"} size={18} className={analysisBusy ? "spin" : ""} />{analysisBusy ? "Researching the setup…" : "Analyze market"}{!analysisBusy && <Icon name="arrow" size={17} />}</button>
          <Message error={analysisError} />
          {matchingAnalysis ? <AnalysisResult analysis={matchingAnalysis} /> : <div className="analysis-placeholder"><div className="orb"><Icon name="spark" size={26} /></div><h3>A clearer view of the setup</h3><p>Explore price structure, potential levels, and patterns through your strategy.</p><div className="analysis-features"><span><Icon name="check" size={14} />Pattern recognition</span><span><Icon name="check" size={14} />Key price levels</span><span><Icon name="check" size={14} />Strategy-based context</span></div></div>}
          <div className="ai-disclaimer"><Icon name="info" size={15} /><span>{health?.aiConfigured ? "Claude-assisted research" : "Demo analysis may use scripted output"}. AI confidence is not win probability. No investment guarantees.</span></div>
        </div>
      </aside>
    </div>
    <div className="workspace-panel panel" ref={workspaceRef}>
      <div className="workspace-tabs" role="tablist" aria-label="Research tools">{tabs.map((item) => <button key={item.id} role="tab" aria-selected={tab === item.id} aria-controls={`panel-${item.id}`} id={`tab-${item.id}`} tabIndex={tab === item.id ? 0 : -1} onKeyDown={(event) => {
        if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) {
          event.preventDefault();
          const index = event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : (tabs.findIndex((value) => value.id === tab) + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
          setTab(tabs[index].id); document.getElementById(`tab-${tabs[index].id}`)?.focus();
        }
      }} onClick={() => setTab(item.id)} className={tab === item.id ? "active" : ""}><Icon name={item.icon} size={17} />{item.name}{item.id === "strategies" && <span>{strategies.length}</span>}</button>)}<div className="workspace-context"><span className="status-dot" />{instrument} / {timeframe}</div></div>
      <div className="workspace-content" role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
        {tab === "strategies" && <Strategies strategies={strategies} onSaved={onSaved} />}
        {tab === "journal" && <Journal strategies={strategies} />}
        {tab === "backtest" && <BacktestPanel key={strategyId} />}
        {tab === "saved" && <SavedAnalyses onSelect={selectAnalysis} />}
      </div>
    </div>
    <div className="bottom-note"><Icon name="shield" size={16} /><span><strong>A strategy is a framework, not a forecast.</strong> {selectedStrategy?.name ?? "Your template"} is configurable and unverified. Always validate independently and manage your risk.</span></div>
  </>;
}

function AnalysisResult({ analysis }: { analysis: Analysis }) {
  return <div className="analysis-result"><div className="analysis-result-heading"><span className={`badge ${analysis.direction === "long" ? "green" : analysis.direction === "short" ? "red" : "neutral"}`}>{analysis.direction === "wait" ? "WAIT / NO BIAS" : `${analysis.direction.toUpperCase()} BIAS`}</span><span className="tiny muted">{analysis.source === "demo" ? "DEMO ANALYSIS" : "CLAUDE"}</span></div><p className="analysis-summary">{analysis.summary}</p><div className="confidence-label"><span>AI confidence</span><strong>{analysis.confidence}<small>/100</small></strong></div><div className="confidence-track"><span style={{ width: `${Math.min(100, Math.max(0, analysis.confidence))}%` }} /></div><p className="tiny muted confidence-note">Assessment confidence, not a probability of profit.</p>
    <h4>DETECTED PATTERNS</h4><div className="pattern-tags">{analysis.patterns.length ? analysis.patterns.map((pattern) => <span key={pattern}>{pattern}</span>) : <span>No clear patterns identified</span>}</div>
    <h4>KEY LEVELS</h4><div className="level-list">{analysis.levels.length ? analysis.levels.map((level, index) => <div key={`${level.label}-${index}`}><span><i style={{ background: ["#a78bfa", "#e7b95f", "#5eb7f7"][index % 3] }} />{level.label}</span><strong className="mono">{number(level.price)}</strong></div>) : <p className="tiny muted">No levels identified for this setup.</p>}</div>
    <div className="analysis-history"><span>Observed historical win rate<strong>{analysis.historicalWinRate === null ? "Not enough data" : `${number(analysis.historicalWinRate, 1)}%`}</strong></span><small>{analysis.sampleSize} recorded trades · Not a forecast</small></div><p className="tiny muted analysis-timestamp"><Icon name="clock" size={12} />{dateTime(analysis.createdAt)}</p>
  </div>;
}
