import { useState } from "react";
import { Text, View, StyleSheet } from "react-native";
import { useAuth } from "@/hooks/use-auth";
import { useWorkspace } from "@/hooks/use-workspace";
import {
  useResearchStartMutation,
  useResearchJobQuery,
} from "@/lib/trading/client";
import {
  DEFAULT_BACKTEST,
  type BacktestReport,
  type DiscussionReport,
  type ResearchSeries,
} from "@/lib/trading/research";
import { Card, ActionButton, Input, Pill, SectionLabel } from "./ui";
import { C, mono } from "./theme";
import { OrderBookControls, OrderBookResult } from "./orderbook-research";
export function ResearchPanel({ series }: { series?: ResearchSeries[] }) {
  const { workspace } = useWorkspace(),
    auth = useAuth(),
    start = useResearchStartMutation();
  const [id, setId] = useState<string>(),
    [message, setMessage] = useState<string>();
  const [fees, setFees] = useState("5"),
    [slippage, setSlippage] = useState("5"),
    [model, setModel] = useState<"ma-cross" | "fvg">("ma-cross");
  const job = useResearchJobQuery(id, auth.isAuthenticated),
    busy =
      start.isPending ||
      Boolean(job.data && ["queued", "running"].includes(job.data.status));
  const launch = async (kind: "backtest" | "discussion") => {
    const strategy = workspace.strategies.find(
      (s) => s.id === workspace.activeStrategyId,
    );
    if (!strategy) return;
    if (!Number.isFinite(Number(fees)) || !Number.isFinite(Number(slippage)))
      return setMessage("Enter finite fee/slippage assumptions.");
    try {
      setMessage(undefined);
      const result = await start.mutateAsync({
        kind,
        market: workspace.market,
        timeframe: workspace.timeframe,
        strategy,
        confirmations: workspace.confirmations,
        weeklyBias: workspace.settings.weeklyBias,
        trades: workspace.trades.map((t) => ({
          ...t,
          journal: {},
          review: undefined,
          aiReview: undefined,
        })),
        startingBalance: workspace.paperStartingBalance,
        dailyDrawdownLimitPct: workspace.settings.dailyDrawdownLimitPct,
        spec: {
          ...DEFAULT_BACKTEST,
          model,
          feesBps: Number(fees),
          slippageBps: Number(slippage),
        },
        series: kind === "backtest" ? series : undefined,
      });
      setId(result.id);
    } catch (e) {
      setMessage(
        e instanceof Error
          ? e.message
          : "Research unavailable; no result invented.",
      );
    }
  };
  const result = job.data?.result;
  return (
    <Card>
      <SectionLabel>Research laboratory</SectionLabel>
      <Text style={styles.title}>Test assumptions. Preserve the evidence.</Text>
      <Text style={styles.meta}>
        {series ? "Imported historical data" : "Selected server feed"} · MA/FVG
        baseline experiments, not full discretionary WR1 or uploaded-style
        backtests.
      </Text>
      <View style={styles.row}>
        {(["ma-cross", "fvg"] as const).map((m) => (
          <ActionButton
            key={m}
            compact
            label={m === "ma-cross" ? "MA cross" : "3-bar FVG"}
            kind={model === m ? "primary" : "secondary"}
            onPress={() => setModel(m)}
          />
        ))}
      </View>
      <View style={styles.row}>
        <View style={{ flex: 1 }}>
          <Input
            label="Fees per side · bps"
            value={fees}
            onChangeText={setFees}
            keyboardType="numeric"
          />
        </View>
        <View style={{ flex: 1 }}>
          <Input
            label="Slippage · bps"
            value={slippage}
            onChangeText={setSlippage}
            keyboardType="numeric"
          />
        </View>
      </View>
      <View style={styles.row}>
        <ActionButton
          label="Walk-forward test"
          compact
          disabled={
            !auth.isAuthenticated ||
            busy ||
            (workspace.settings.sampleMode && !series)
          }
          onPress={() => void launch("backtest")}
        />
        <ActionButton
          label="Analyst discussion"
          compact
          kind="secondary"
          disabled={
            !auth.isAuthenticated || busy || workspace.settings.sampleMode
          }
          onPress={() => void launch("discussion")}
        />
      </View>
      <Text style={styles.meta}>
        Earlier training only → frozen parameters → later test. Four LLM calls
        for discussion; absent fundamentals/sentiment abstain. No execution or
        success-probability claim.
      </Text>
      <OrderBookControls busy={busy} onStarted={setId} />
      {!auth.isAuthenticated ? (
        <Text style={styles.note}>
          Sign in through your browser tab for private research.
        </Text>
      ) : null}
      {workspace.settings.sampleMode ? (
        <Text style={styles.note}>
          {series
            ? "Imported history remains available. Turn off Sample mode for the separate server-feed discussion."
            : "Turn off Sample mode before server-feed research."}
        </Text>
      ) : null}
      {message || job.error ? (
        <Text style={styles.note}>{message || job.error?.message}</Text>
      ) : null}
      {job.data ? (
        <>
          <Pill
            label={`${job.data.kind.toUpperCase()} · ${job.data.status.toUpperCase()}`}
            tone={job.data.status === "failed" ? "rose" : "amber"}
          />
          <Text style={styles.meta}>
            Snapshot {job.data.strategy.name} v{job.data.strategy.version} ·{" "}
            {job.data.market} {job.data.timeframe}
          </Text>
          {job.data.error ? (
            <Text style={styles.note}>{job.data.error}</Text>
          ) : null}
        </>
      ) : null}
      {result && "assets" in result ? (
        <BacktestResult report={result} />
      ) : result && "roles" in result ? (
        <DiscussionResult report={result} />
      ) : result && "kind" in result && result.kind === "orderbook-ml" ? (
        <OrderBookResult report={result} />
      ) : null}
    </Card>
  );
}
function BacktestResult({ report }: { report: BacktestReport }) {
  return (
    <View style={{ gap: 9 }}>
      {report.assets.map((a) => (
        <Card key={a.symbol}>
          <Text style={styles.title}>{a.symbol} · out-of-sample only</Text>
          <Text style={styles.value}>
            Return {a.metrics.returnPct.toFixed(2)}% · DD{" "}
            {a.metrics.maxDrawdownPct.toFixed(2)}%
          </Text>
          <Text style={styles.meta}>
            {a.metrics.trades} completed simulated trades · trade hit rate{" "}
            {a.metrics.winRatePct === null
              ? "—"
              : a.metrics.winRatePct.toFixed(1) + "%"}{" "}
            · PF {a.metrics.profitFactor?.toFixed(2) ?? "—"}
          </Text>
          <Text style={styles.meta}>
            {a.source} · {a.bars} supplied bars
          </Text>
          {a.folds.map((f, i) => (
            <Text key={i} style={styles.meta}>
              Fold {i + 1}: train{" "}
              {new Date(f.trainStart * 1000).toLocaleDateString()}–
              {new Date(f.trainEnd * 1000).toLocaleDateString()} → test{" "}
              {new Date(f.testStart * 1000).toLocaleString()}–
              {new Date(f.testEnd * 1000).toLocaleString()} · MA{" "}
              {f.selected.fast}/{f.selected.slow}
            </Text>
          ))}
          <Text style={styles.meta}>
            {a.labels.length} forward labels; labelEnd is future target
            availability, not a live prediction.
          </Text>
          {a.quantstats ? (
            <Text style={styles.meta}>QuantStats: {a.quantstats.unit}</Text>
          ) : null}
        </Card>
      ))}
      {report.assumptions.map((s, i) => (
        <Text key={`a${i}`} style={styles.meta}>
          {s}
        </Text>
      ))}
      {report.limitations.map((s, i) => (
        <Text key={`l${i}`} style={styles.note}>
          {s}
        </Text>
      ))}
      <Text style={styles.note}>Success probability: Not calibrated.</Text>
    </View>
  );
}
function DiscussionResult({ report }: { report: DiscussionReport }) {
  return (
    <View style={{ gap: 9 }}>
      <Pill
        label={`${report.decision.toUpperCase()} · ${report.riskVeto ? "RISK VETO" : "PAPER REVIEW ONLY"}`}
        tone="amber"
      />
      <Text style={styles.meta}>
        {report.source} · bars as of{" "}
        {new Date(report.candleAsOf * 1000).toLocaleString()} · {report.model}
      </Text>
      {report.roles.map((role) => (
        <Card key={role.role}>
          <Text style={styles.title}>
            {role.role.toUpperCase()} · {role.status}
          </Text>
          <Text style={styles.meta}>{role.summary}</Text>
          <Text style={styles.meta}>
            Evidence: {role.evidenceIds.join(", ") || "none"}
          </Text>
          {role.missing.map((s, i) => (
            <Text key={i} style={styles.note}>
              Missing: {s}
            </Text>
          ))}
        </Card>
      ))}
      {report.limitations.map((s, i) => (
        <Text key={i} style={styles.note}>
          {s}
        </Text>
      ))}
    </View>
  );
}
const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  title: { color: C.text, fontWeight: "800", fontSize: 14 },
  meta: { color: C.muted, fontSize: 11, lineHeight: 17 },
  note: { color: C.amber, fontSize: 11, lineHeight: 17 },
  value: { color: C.text, fontFamily: mono, fontSize: 13 },
});
