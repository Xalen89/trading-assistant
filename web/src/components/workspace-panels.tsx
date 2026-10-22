"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { api, dateTime, errorMessage, number } from "../lib/api";
import { useWorkspace } from "../lib/store";
import type { Analysis, Backtest, Strategy, Trade } from "../lib/types";
import { Icon } from "./icons";

export function Message({ error, success }: { error?: string; success?: string }) {
  if (!error && !success) return null;
  return <div className={`message ${error ? "error" : "success"}`} role={error ? "alert" : "status"}><Icon name={error ? "info" : "check"} size={16} />{error || success}</div>;
}

export function Strategies({ strategies, onSaved }: { strategies: Strategy[]; onSaved: (strategy: Strategy) => void }) {
  const { strategyId, setStrategyId } = useWorkspace();
  const [draft, setDraft] = useState<Strategy | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [busy, setBusy] = useState(false);
  const selected = strategies.find((strategy) => strategy.id === strategyId);
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setError(""); setSuccess("");
    try {
      const parameters: unknown = JSON.parse(String(data.get("parameters")));
      if (!parameters || typeof parameters !== "object" || Array.isArray(parameters) || Object.values(parameters).some((value) => !["string", "number", "boolean"].includes(typeof value))) {
        throw new Error("Parameters must be a JSON object with number, string, or boolean values.");
      }
      const rules = String(data.get("rules")).split("\n").map((rule) => rule.trim()).filter(Boolean);
      if (!rules.length) throw new Error("Add at least one strategy rule.");
      setBusy(true);
      const result = await api<{ strategy: Strategy }>("/strategies", {
        method: "POST", body: JSON.stringify({ ...(draft?.id ? { id: draft.id } : {}), name: String(data.get("name")).trim(), description: String(data.get("description")).trim(), rules, parameters }),
      });
      onSaved(result.strategy); setStrategyId(result.strategy.id); setDraft(null); setSuccess("Strategy saved. Ready for your next analysis.");
    } catch (error) { setError(errorMessage(error)); } finally { setBusy(false); }
  }
  return <section aria-label="Strategy workspace">
    <div className="section-heading"><div><h2>Strategy workspace</h2><p>A repeatable process starts with clearly defined rules.</p></div><button className="button secondary small" onClick={() => { setDraft({ id: "", name: "", description: "", rules: [], parameters: {} }); setError(""); setSuccess(""); }}><Icon name="plus" size={16} /> New strategy</button></div>
    <Message error={error} success={success} />
    {draft ? <form onSubmit={save} className="editor-form" key={draft.id}>
      <div className="form-grid"><label>Strategy name<input name="name" required maxLength={100} defaultValue={draft.name} placeholder="e.g. London breakout" /></label><label>Description<input name="description" required maxLength={1000} defaultValue={draft.description} placeholder="Describe your approach" /></label></div>
      <div className="form-grid"><label>Entry & exit rules <span className="muted">One rule per line</span><textarea name="rules" rows={5} required defaultValue={draft.rules.join("\n")} placeholder={"Wait for a confirmed breakout\nDefine risk before entering"} /></label><label>Parameters <span className="muted">JSON object</span><textarea className="mono" name="parameters" rows={5} required defaultValue={JSON.stringify(draft.parameters, null, 2)} spellCheck={false} /></label></div>
      <div className="form-actions"><button className="button secondary" type="button" onClick={() => { setDraft(null); setError(""); }}>Cancel</button><button className="button primary" disabled={busy}>{busy ? "Saving…" : "Save strategy"}</button></div>
    </form> : selected ? <div className="strategy-content">
      <div className="strategy-intro"><div className="strategy-icon"><Icon name="layers" size={24} /></div><div><div className="inline"><h3>{selected.name}</h3><span className="badge neutral">CONFIGURABLE TEMPLATE</span></div><p>{selected.description}</p><span className="tiny muted">Unverified strategy template · No promised performance</span></div><button className="button ghost small edit-strategy" onClick={() => { setDraft(selected); setError(""); setSuccess(""); }}><Icon name="code" size={15} /> Edit rules</button></div>
      <div className="rule-list">{selected.rules.map((rule, index) => <div className="rule" key={`${index}-${rule}`}><span className="rule-number">{String(index + 1).padStart(2, "0")}</span><span>{rule}</span><Icon name="check" size={15} /></div>)}</div>
      {Object.keys(selected.parameters).length > 0 && <div className="parameter-list">{Object.entries(selected.parameters).map(([key, value]) => <span key={key}>{key}: <strong>{String(value)}</strong></span>)}</div>}
    </div> : <div className="empty-state"><Icon name="layers" size={28} /><h3>Your process, your rules</h3><p>Create a strategy to start researching setups.</p></div>}
    {!draft && strategies.length > 1 && <div className="strategy-switch"><span className="tiny muted">YOUR STRATEGIES</span>{strategies.map((strategy) => <button key={strategy.id} className={`button small ${strategy.id === strategyId ? "selected" : "ghost"}`} onClick={() => setStrategyId(strategy.id)}>{strategy.name}</button>)}</div>}
  </section>;
}

const localDate = (date: Date) => new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
export function Journal({ strategies }: { strategies: Strategy[] }) {
  const { instrument, timeframe, strategyId } = useWorkspace();
  const [trades, setTrades] = useState<Trade[]>([]);
  const [filter, setFilter] = useState("");
  const [strategyFilter, setStrategyFilter] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState("");
  const [saveError, setSaveError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    const query = new URLSearchParams();
    if (filter) query.set("instrument", filter);
    if (strategyFilter) query.set("strategyId", strategyFilter);
    api<{ trades: Trade[] }>(`/trades?${query}`, { signal: controller.signal }).then((result) => { setTrades(result.trades); setError(""); }).catch((error) => {
      if (!controller.signal.aborted) setError(errorMessage(error));
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [filter, strategyFilter, revision]);
  const pnl = trades.reduce((sum, trade) => sum + (trade.exit - trade.entry) * trade.quantity * (trade.direction === "long" ? 1 : -1), 0);
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaveError(""); setSuccess("");
    const form = event.currentTarget;
    const data = new FormData(form);
    try {
      const entryTime = new Date(String(data.get("entryTime"))).toISOString();
      const exitTime = new Date(String(data.get("exitTime"))).toISOString();
      if (exitTime < entryTime) throw new Error("Exit time must be after entry time.");
      setSaving(true);
      await api("/trades", { method: "POST", body: JSON.stringify({
        strategyId: data.get("strategyId"), instrument: data.get("instrument"), timeframe: data.get("timeframe"), direction: data.get("direction"),
        entry: Number(data.get("entry")), exit: Number(data.get("exit")), quantity: Number(data.get("quantity")),
        entryTime, exitTime, notes: data.get("notes"),
      }) });
      setShowForm(false); setSuccess("Trade logged successfully."); setLoading(true); setRevision((value) => value + 1);
    } catch (error) { setSaveError(errorMessage(error)); } finally { setSaving(false); }
  }
  return <section aria-label="Trade journal">
    <div className="section-heading"><div><h2>Trade journal</h2><p>Document the execution. Learn from the outcome.</p></div><button className="button primary small" disabled={!strategies.length} onClick={() => { setShowForm(!showForm); setSaveError(""); }}><Icon name={showForm ? "close" : "plus"} size={16} />{showForm ? "Close form" : "Log trade"}</button></div>
    <Message error={error} success={success} />
    {showForm && <form className="editor-form journal-form" onSubmit={save}>
      <div className="form-grid four"><label>Instrument<select name="instrument" defaultValue={instrument}><option>NAS100</option><option>XAUUSD</option></select></label><label>Timeframe<select name="timeframe" defaultValue={timeframe}>{["5m", "15m", "1h", "4h", "1d"].map((value) => <option key={value}>{value}</option>)}</select></label><label>Strategy<select name="strategyId" required defaultValue={strategyId}>{strategies.map((strategy) => <option key={strategy.id} value={strategy.id}>{strategy.name}</option>)}</select></label><label>Direction<select name="direction"><option value="long">Long</option><option value="short">Short</option></select></label></div>
      <div className="form-grid three"><label>Entry price<input name="entry" type="number" min="0.000001" step="any" required /></label><label>Exit price<input name="exit" type="number" min="0.000001" step="any" required /></label><label>Quantity<input name="quantity" type="number" min="0.000001" step="any" defaultValue={1} required /></label></div>
      <div className="form-grid"><label>Entry time (local)<input name="entryTime" type="datetime-local" defaultValue={localDate(new Date(Date.now() - 3600000))} required /></label><label>Exit time (local)<input name="exitTime" type="datetime-local" defaultValue={localDate(new Date())} required /></label></div>
      <label>Trade notes<textarea name="notes" rows={2} placeholder="What did you see? What would you change?" maxLength={5000} /></label>
      <Message error={saveError} /><div className="form-actions"><button className="button primary" disabled={saving}>{saving ? "Saving…" : "Save trade"}</button></div>
    </form>}
    <div className="filter-row"><select aria-label="Filter trades by instrument" value={filter} onChange={(event) => { setFilter(event.target.value); setLoading(true); }}><option value="">All instruments</option><option>NAS100</option><option>XAUUSD</option></select><select aria-label="Filter trades by strategy" value={strategyFilter} onChange={(event) => { setStrategyFilter(event.target.value); setLoading(true); }}><option value="">All strategies</option>{strategies.map((strategy) => <option value={strategy.id} key={strategy.id}>{strategy.name}</option>)}</select><span className="journal-total">{trades.length} trades <span className={pnl >= 0 ? "positive" : "negative"}>{pnl >= 0 ? "+" : ""}{number(pnl)} P&L</span></span></div>
    {loading ? <div className="empty-state compact">Loading journal…</div> : trades.length ? <div className="table-scroll"><table><thead><tr><th>Instrument</th><th>Direction</th><th>Entry / Exit</th><th>Quantity</th><th>Exited</th><th>P&L*</th><th>Notes</th></tr></thead><tbody>{trades.map((trade) => {
      const result = (trade.exit - trade.entry) * trade.quantity * (trade.direction === "long" ? 1 : -1);
      return <tr key={trade.id}><td><strong>{trade.instrument}</strong><small>{trade.timeframe} · {strategies.find((strategy) => strategy.id === trade.strategyId)?.name ?? trade.strategyId}</small></td><td><span className={`badge ${trade.direction === "long" ? "green" : "red"}`}>{trade.direction}</span></td><td className="mono">{number(trade.entry)}<small>{number(trade.exit)}</small></td><td>{trade.quantity}</td><td>{dateTime(trade.exitTime)}</td><td className={`mono ${result >= 0 ? "positive" : "negative"}`}>{result >= 0 ? "+" : ""}{number(result)}</td><td className="notes-cell">{trade.notes || "—"}</td></tr>;
    })}</tbody></table><p className="tiny muted footnote">* Raw price difference × quantity; excludes fees, spread, financing, and contract multipliers.</p></div> : <div className="empty-state"><Icon name="book" size={28} /><h3>A fresh page for your next trade</h3><p>No trades match these filters. Log a closed trade to get started.</p></div>}
  </section>;
}

export function BacktestPanel() {
  const { instrument, timeframe, strategyId } = useWorkspace();
  const [result, setResult] = useState<Backtest | null>(null);
  const [resultContext, setResultContext] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const request = useRef(0);
  useEffect(() => () => { request.current += 1; }, []);
  async function run(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(""); setBusy(true);
    const id = ++request.current;
    const data = new FormData(event.currentTarget);
    const from = `${data.get("from")}T00:00:00.000Z`;
    const to = `${data.get("to")}T23:59:59.999Z`;
    try {
      if (new Date(from) >= new Date(to)) throw new Error("Choose an end date on or after the start date.");
      const response = await api<Backtest>("/backtest", { method: "POST", body: JSON.stringify({ instrument, timeframe, strategyId, from, to }) });
      if (id === request.current) { setResult(response); setResultContext(`${instrument} · ${timeframe} · ${data.get("from")} → ${data.get("to")}`); }
    } catch (error) { if (id === request.current) setError(errorMessage(error)); } finally { if (id === request.current) setBusy(false); }
  }
  return <section>
    <div className="section-heading"><div><h2>Historical review</h2><p>Review observed journal outcomes within a date window.</p></div><span className="badge purple">RESEARCH TOOL</span></div>
    <div className="notice"><Icon name="info" size={17} /><span>This is a review of recorded trades, not an automated strategy simulation. Unlogged setups are not tested. Past outcomes do not predict future returns.</span></div>
    <form onSubmit={run} className="backtest-form"><label>From (UTC)<input type="date" name="from" defaultValue={new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10)} required /></label><label>To (UTC)<input type="date" name="to" defaultValue={new Date().toISOString().slice(0, 10)} required /></label><button className="button primary" disabled={busy || !strategyId}><Icon name="flask" size={17} />{busy ? "Reviewing…" : "Run review"}</button></form>
    <Message error={error} />
    {result ? <div className="backtest-results"><div className="inline space-between"><span className="tiny muted">{resultContext}</span><span className={`badge ${result.source === "demo" ? "amber" : "purple"}`}>{result.source === "demo" ? "DEMO REVIEW" : "AI-ASSISTED REVIEW"}</span></div><div className="stats-grid">{[["Recorded trades", result.totalTrades], ["Wins / losses", `${result.wins} / ${result.losses}`], ["Observed win rate", result.winRate === null ? "N/A" : `${number(result.winRate, 1)}%`], ["Raw net P&L", number(result.netPnl)]].map(([label, value]) => <div key={label}><span>{label}</span><strong>{value}</strong></div>)}</div><p className="body-copy">{result.summary}</p><div className="pattern-tags">{result.patterns.map((pattern) => <span key={pattern}>{pattern}</span>)}</div><h4 className="limitations-title">Know the limitations</h4><ul className="limitations">{result.limitations.map((limitation, index) => <li key={index}>{limitation}</li>)}</ul></div> : <div className="empty-state compact"><Icon name="flask" size={28} /><h3>Turn hindsight into insight</h3><p>Select a date window and review your recorded trades.</p></div>}
  </section>;
}

export function SavedAnalyses({ onSelect }: { onSelect: (analysis: Analysis) => void }) {
  const { instrument, timeframe } = useWorkspace();
  const [analyses, setAnalyses] = useState<Analysis[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    api<{ analyses: Analysis[] }>(`/analyses?instrument=${instrument}&timeframe=${timeframe}`, { signal: controller.signal }).then((result) => { setAnalyses(result.analyses); setError(""); }).catch((error) => { if (!controller.signal.aborted) setError(errorMessage(error)); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [instrument, timeframe, revision]);
  return <section>
    <div className="section-heading"><div><h2>Saved analyses</h2><p>Your research trail for {instrument} · {timeframe}.</p></div><button className="button secondary small" disabled={loading} onClick={() => { setLoading(true); setRevision((value) => value + 1); }}><Icon name="refresh" size={15} /> Refresh</button></div>
    <Message error={error} />
    {loading ? <div className="empty-state compact">Loading saved analyses…</div> : analyses.length ? <div className="saved-list">{analyses.map((analysis) => <button key={analysis.id} className="saved-item" onClick={() => onSelect(analysis)}><div className="inline"><Icon name="spark" size={18} /><strong>{analysis.instrument} <span className="muted">{analysis.timeframe}</span></strong><span className={`badge ${analysis.direction === "long" ? "green" : analysis.direction === "short" ? "red" : "neutral"}`}>{analysis.direction}</span><span className="tiny muted">{analysis.source === "demo" ? "Synthetic demo" : "Claude"}</span></div><p>{analysis.summary}</p><div className="inline space-between tiny muted"><span>{dateTime(analysis.createdAt)}</span><span>{analysis.confidence}% AI confidence · View <Icon name="arrow" size={13} /></span></div></button>)}</div> : <div className="empty-state"><Icon name="history" size={28} /><h3>Keep your perspective</h3><p>Run an analysis to save your first research snapshot.</p></div>}
  </section>;
}
