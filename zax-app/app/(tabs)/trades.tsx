import { OwnedSourcePreview } from "@/components/trading/owned-source-preview";
import { TradeScreenshotPanel } from "@/components/trading/trade-screenshot-panel";
import { useRouter } from "expo-router";
import {
  StoredPaperHistory,
  ManagedPaperDetail,
} from "@/components/trading/stored-paper-history";
import { useMemo, useState } from "react";
import {
  Alert,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useWorkspace } from "@/hooks/use-workspace";
import { trpc } from "@/lib/trpc";
import { JOURNAL_STEPS, type Trade } from "@/lib/trading/model";
import { tradeMetrics } from "@/lib/trading/engine";
import {
  useQuotesQuery,
  useReviewMutation,
  useTradingMarket,
} from "@/lib/trading/client";
import {
  ActionButton,
  Card,
  EmptyState,
  Header,
  Input,
  Pill,
  Screen,
  SectionLabel,
  Sheet,
} from "@/components/trading/ui";
import { PerformanceDashboard } from "@/components/trading/performance-dashboard";
import { C, formatPrice, mono } from "@/components/trading/theme";

type Segment = Trade["status"];
export default function TradesScreen() {
  const router = useRouter();
  const { workspace, update } = useWorkspace();
  const utils = trpc.useUtils(),
    cancel = trpc.paper.cancel.useMutation();
  const [segment, setSegment] = useState<Segment>("pending");
  const [selected, setSelected] = useState<Trade | null>(null);
  const [message, setMessage] = useState<string>();
  const [limit, setLimit] = useState(
    () => workspace.settings.dailyDrawdownLimitPct?.toString() || "",
  );
  const saveLimit = () => {
    const value = limit.trim() ? Number(limit) : undefined;
    if (
      value !== undefined &&
      (!Number.isFinite(value) || value <= 0 || value > 100)
    )
      return setMessage(
        "Paper cap must be greater than 0% and no more than 100%, or blank to unset.",
      );
    update((w) => ({
      ...w,
      settings: { ...w.settings, dailyDrawdownLimitPct: value },
    }));
    setMessage("Local paper cap updated. No broker risk setting was changed.");
  };
  const market = useTradingMarket(workspace.market);
  const quoteQuery = useQuotesQuery(
    [
      ...new Set([
        market.id,
        ...workspace.trades
          .filter((t) => t.status === "pending" || t.status === "open")
          .map((t) => t.market),
      ]),
    ].slice(0, 40),
  );
  const shown = workspace.trades.filter((trade) => trade.status === segment);
  const balance = useMemo(
    () =>
      workspace.paperStartingBalance +
      workspace.trades.reduce(
        (total, trade) =>
          total +
          (trade.status === "closed"
            ? tradeMetrics(trade).pnl || 0
            : trade.status === "open"
              ? trade.realizedPnl || 0
              : 0),
        0,
      ),
    [workspace],
  );
  const transition = (
    trade: Trade,
    type: "fill" | "close",
    checkedAt: number,
  ) => {
    if (type === "fill")
      return setMessage(
        "Legacy pending entries are archival only. Create a validated paper order from Chart Buy/Sell.",
      );
    const ownQuote = quoteQuery.data?.find((q) => q.symbol === trade.market);
    const price =
      ownQuote?.status === "live" &&
      checkedAt - ownQuote.timestamp * 1000 < 120000
        ? trade.side === "long"
          ? ownQuote.bid || ownQuote.price
          : ownQuote.ask || ownQuote.price
        : undefined;
    if (!price)
      return setMessage(
        `A fresh ${trade.market} quote is required. No synthetic fill was created.`,
      );

    const provenance = `${ownQuote!.source}; ${ownQuote!.timestampKind === "received" ? "received time (no provider timestamp)" : "provider time"} ${new Date(ownQuote!.timestamp * 1000).toISOString()}`;
    const text = `Close this legacy paper record ${trade.market} at ${formatPrice(price)} from ${ownQuote!.source}? This archives a manual simulated exit; no broker order is sent.`;
    const apply = () =>
      update((w) => ({
        ...w,
        trades: w.trades.map((item) =>
          item.id !== trade.id
            ? item
            : {
                ...item,
                status: "closed",
                exit: price,
                closedAt: Date.now(),
                journal: { ...item.journal, "Paper exit source": provenance },
              },
        ),
      }));
    if (Platform.OS === "web") {
      if (typeof window !== "undefined" && window.confirm(text)) apply();
    } else
      Alert.alert("Archive paper close", text, [
        { text: "Cancel", style: "cancel" },
        { text: "Close paper", onPress: apply },
      ]);
  };
  const cancelPending = (trade: Trade) => {
    if (trade.status !== "pending" || !trade.orderType) return;
    const text = `Cancel the pending ${trade.market} paper plan? A fresh source quote will be required before its terminal cancellation is saved. It will never create a paper fill or broker action.`;
    const apply = async () => {
      try {
        const next = await cancel.mutateAsync({
          id: trade.id,
          version: trade.version || 1,
        });
        update((w) => ({
          ...w,
          trades: w.trades.map((item) => (item.id === next.id ? next : item)),
        }));
        void utils.paper.invalidate();
        setMessage(
          "Pending paper plan cancelled. No fill or broker action was created.",
        );
      } catch (error) {
        setMessage(
          error instanceof Error ? error.message : "Paper cancellation failed.",
        );
      }
    };
    if (Platform.OS === "web") {
      if (typeof window !== "undefined" && window.confirm(text)) void apply();
    } else
      Alert.alert("Cancel pending paper plan", text, [
        { text: "Keep plan", style: "cancel" },
        {
          text: "Cancel plan",
          style: "destructive",
          onPress: () => void apply(),
        },
      ]);
  };
  return (
    <Screen>
      <Header
        title="Trades"
        subtitle="Simulated plans, fills, and balance — no brokerage orders"
        right={
          <ActionButton
            label="Chart order"
            compact
            icon="add"
            onPress={() => router.navigate("/")}
          />
        }
      />
      <Card style={styles.balance}>
        <View>
          <Text style={styles.balanceLabel}>PAPER BALANCE</Text>
          <Text style={styles.balanceValue}>
            ${balance.toLocaleString(undefined, { maximumFractionDigits: 2 })}
          </Text>
          <Text style={styles.balanceNote}>
            Starting balance ${workspace.paperStartingBalance.toLocaleString()}{" "}
            + recorded realised paper P/L
          </Text>
        </View>
        <Pill label="DEMO ONLY" tone="amber" />
      </Card>
      <PerformanceDashboard
        trades={workspace.trades}
        startingBalance={workspace.paperStartingBalance}
        dailyDrawdownLimitPct={workspace.settings.dailyDrawdownLimitPct}
      />
      <Card>
        <Input
          label="Optional paper daily realised-drawdown cap %"
          value={limit}
          onChangeText={setLimit}
          keyboardType="numeric"
        />
        <ActionButton
          label="Save paper limit"
          compact
          kind="secondary"
          onPress={saveLimit}
        />
      </Card>
      {message ? (
        <Card style={styles.message}>
          <Text style={styles.messageText}>{message}</Text>
        </Card>
      ) : null}
      <View style={styles.segments}>
        {(["pending", "open", "closed", "cancelled"] as Segment[]).map(
          (item) => (
            <Pressable
              key={item}
              onPress={() => setSegment(item)}
              style={[styles.segment, segment === item && styles.segmentActive]}
            >
              <Text
                style={[
                  styles.segmentText,
                  segment === item && styles.segmentTextActive,
                ]}
              >
                {item[0].toUpperCase() + item.slice(1)} ·{" "}
                {
                  workspace.trades.filter((trade) => trade.status === item)
                    .length
                }
              </Text>
            </Pressable>
          ),
        )}
      </View>
      {shown.length ? (
        shown.map((trade) => (
          <TradeCard
            key={trade.id}
            trade={trade}
            onOpen={() => setSelected(trade)}
            onChart={() =>
              router.navigate({
                pathname: "/",
                params: { tradeId: trade.id, market: trade.market },
              })
            }
            onClose={(checkedAt) => transition(trade, "close", checkedAt)}
            onCancel={() => cancelPending(trade)}
            cancelling={cancel.isPending}
          />
        ))
      ) : (
        <EmptyState
          title={`No ${segment} paper trades`}
          detail={
            segment === "pending"
              ? "Create a validated plan with a pre-trade journal."
              : "Your actual paper fills and exits will appear here."
          }
          action={
            segment === "pending" ? (
              <ActionButton
                label="Create paper plan"
                kind="secondary"
                onPress={() => router.navigate("/")}
              />
            ) : undefined
          }
        />
      )}
      <StoredPaperHistory />
      {selected?.orderType ? (
        <ManagedPaperDetail
          key={selected.id}
          trade={selected}
          onClose={() => setSelected(null)}
        />
      ) : (
        <TradeDetail
          key={selected?.id || "none"}
          trade={selected}
          onClose={() => setSelected(null)}
          onUpdate={update}
        />
      )}
    </Screen>
  );
}
function TradeCard({
  trade,
  onOpen,
  onChart,
  onClose,
  onCancel,
  cancelling,
}: {
  trade: Trade;
  onOpen: () => void;
  onChart: () => void;
  onClose: (checkedAt: number) => void;
  onCancel: () => void;
  cancelling: boolean;
}) {
  const metrics = tradeMetrics(trade);
  return (
    <Card style={styles.trade}>
      <Pressable onPress={trade.status === "open" ? onChart : onOpen}>
        <View style={styles.tradeTop}>
          <View>
            <Text style={styles.tradeName}>
              {trade.market} · {trade.side.toUpperCase()}
            </Text>
            <Text style={styles.tradeMeta}>
              {trade.strategyName} v{trade.strategyVersion} ·{" "}
              {new Date(trade.createdAt).toLocaleDateString()}
            </Text>
          </View>
          <Pill
            label={trade.status.toUpperCase()}
            tone={
              trade.status === "closed"
                ? (metrics.pnl ?? 0) >= 0
                  ? "mint"
                  : "rose"
                : trade.status === "open"
                  ? "lime"
                  : "amber"
            }
          />
          {trade.status === "pending" || trade.status === "open" ? (
            <Pill label="FOREGROUND ONLY" tone="amber" />
          ) : null}
        </View>
        <View style={styles.metrics}>
          <Metric label="ENTRY" value={formatPrice(trade.entry)} />
          <Metric label="RISK" value={`$${metrics.risk.toFixed(2)}`} />
          <Metric label="R:R" value={metrics.rr.toFixed(2)} />
          {trade.status === "closed" ? (
            <Metric label="P/L" value={`$${(metrics.pnl ?? 0).toFixed(2)}`} />
          ) : null}
        </View>
      </Pressable>
      {trade.orderType ? (
        <>
          <ActionButton
            label="Details / working bracket / review"
            kind="secondary"
            onPress={onOpen}
          />
          {trade.status === "pending" ? (
            <ActionButton
              label={
                cancelling
                  ? "Cancelling pending plan…"
                  : "Cancel pending paper plan"
              }
              kind="danger"
              disabled={cancelling}
              onPress={onCancel}
            />
          ) : null}
        </>
      ) : trade.status === "pending" ? (
        <ActionButton
          label="Legacy pending archive · inspect"
          kind="secondary"
          onPress={onOpen}
        />
      ) : trade.status === "open" ? (
        <ActionButton
          label="Close at live quote"
          kind="danger"
          icon="stop-circle-outline"
          onPress={() => onClose(Date.now())}
        />
      ) : null}
    </Card>
  );
}
function Metric({ label, value }: { label: string; value: string }) {
  return (
    <View>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue}>{value}</Text>
    </View>
  );
}
function TradeDetail({
  trade,
  onClose,
  onUpdate,
}: {
  trade: Trade | null;
  onClose: () => void;
  onUpdate: any;
}) {
  const review = useReviewMutation(),
    [note, setNote] = useState(() => trade?.review || ""),
    [result, setResult] = useState<string>();
  if (!trade) return null;
  const metrics = tradeMetrics(trade);
  const saveNote = () => {
    onUpdate((w: any) => ({
      ...w,
      trades: w.trades.map((t: Trade) =>
        t.id === trade.id ? { ...t, review: note } : t,
      ),
    }));
    setResult(
      "Your post-trade review was saved locally. Cloud sync is explicit.",
    );
  };
  const askReview = async () => {
    try {
      const r = await review.mutateAsync({ trade: { ...trade, review: note } });
      onUpdate((w: any) => ({
        ...w,
        trades: w.trades.map((t: Trade) =>
          t.id === trade.id ? { ...t, aiReview: r.text, review: note } : t,
        ),
      }));
      setResult(r.text);
    } catch (e) {
      setResult(e instanceof Error ? e.message : "AI review unavailable.");
    }
  };
  return (
    <Sheet visible title="Paper trade deep dive" onClose={onClose}>
      <Pill label={`${trade.status.toUpperCase()} · PAPER ONLY`} tone="amber" />
      <Text style={styles.deepTitle}>
        {trade.market} {trade.side.toUpperCase()} · {trade.strategyName} v
        {trade.strategyVersion}
      </Text>
      <Text style={styles.deepMetrics}>
        Entry {formatPrice(trade.entry)} · Stop {formatPrice(trade.stop)} ·
        Target {formatPrice(trade.target)}
        {trade.exit ? ` · Exit ${formatPrice(trade.exit)}` : ""}
      </Text>
      <Text style={styles.disclosure}>
        Recorded outcome:{" "}
        {trade.status === "closed"
          ? `${formatPrice(metrics.pnl)} P/L / ${metrics.r?.toFixed(2)}R`
          : trade.status === "cancelled"
            ? "cancelled before fill"
            : "not closed"}
        . Quote simulation excludes spread, fees and slippage.
      </Text>
      <TradeScreenshotPanel
        renderSourcePreview={(source,evidence) => <OwnedSourcePreview sourceId={source.id} evidence={evidence} />}
        tradeId={trade.id}
        initialStage={
          trade.status === "closed"
            ? "after"
            : trade.status === "open"
              ? "during"
              : "before"
        }
        compact
      />
      <SectionLabel>Pre-trade journal snapshot</SectionLabel>
      {JOURNAL_STEPS.map((step) => (
        <View key={step}>
          <Text style={styles.journalLabel}>{step}</Text>
          <Text style={styles.journalValue}>
            {trade.journal[step] || "Not recorded"}
          </Text>
        </View>
      ))}
      <Input
        label="Your post-trade review"
        value={note}
        onChangeText={setNote}
        multiline
      />
      <ActionButton
        label="Save my review"
        kind="secondary"
        onPress={saveNote}
      />
      <ActionButton
        label={
          review.isPending ? "Reviewing record…" : "AI review closed record"
        }
        disabled={trade.status !== "closed" || review.isPending}
        icon="sparkles-outline"
        onPress={askReview}
      />
      {result || trade.aiReview ? (
        <Card>
          <Text style={styles.journalValue}>{result || trade.aiReview}</Text>
        </Card>
      ) : null}
    </Sheet>
  );
}
const styles = StyleSheet.create({
  balance: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    borderColor: C.lime + "66",
  },
  balanceLabel: {
    color: C.muted,
    fontWeight: "800",
    fontSize: 10,
    letterSpacing: 1,
  },
  balanceValue: {
    color: C.lime,
    fontFamily: mono,
    fontWeight: "800",
    fontSize: 27,
    marginTop: 4,
  },
  balanceNote: { color: C.muted, fontSize: 10, marginTop: 3 },
  message: { borderColor: C.amber + "66" },
  messageText: { color: C.amber, fontSize: 12, lineHeight: 17 },
  segments: { flexDirection: "row", gap: 6 },
  segment: {
    flex: 1,
    paddingVertical: 9,
    alignItems: "center",
    borderRadius: 10,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
  },
  segmentActive: { backgroundColor: C.lime, borderColor: C.lime },
  segmentText: { color: C.muted, fontWeight: "800", fontSize: 11 },
  segmentTextActive: { color: C.black },
  trade: { gap: 11 },
  tradeTop: { flexDirection: "row", justifyContent: "space-between", gap: 8 },
  tradeName: {
    color: C.text,
    fontFamily: mono,
    fontSize: 15,
    fontWeight: "800",
  },
  tradeMeta: { color: C.muted, fontSize: 11, marginTop: 3 },
  metrics: { flexDirection: "row", justifyContent: "space-between", gap: 6 },
  metricLabel: { color: C.muted, fontSize: 9, fontWeight: "800" },
  metricValue: {
    color: C.text,
    fontFamily: mono,
    fontSize: 11,
    fontWeight: "700",
    marginTop: 2,
  },
  disclosure: { color: C.amber, fontSize: 12, lineHeight: 17 },
  sideRow: { flexDirection: "row", gap: 8 },
  formPair: { flexDirection: "row", gap: 10 },
  deepTitle: { color: C.text, fontWeight: "800", fontSize: 17 },
  deepMetrics: { color: C.text, fontFamily: mono, fontSize: 12 },
  journalLabel: {
    color: C.muted,
    fontSize: 10,
    fontWeight: "800",
    marginTop: 3,
  },
  journalValue: { color: C.text, fontSize: 12, lineHeight: 17, marginTop: 2 },
});
