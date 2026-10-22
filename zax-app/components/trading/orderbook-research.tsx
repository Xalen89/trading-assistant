import { useState } from "react";
import { Platform, StyleSheet, Text, View } from "react-native";
import * as DocumentPicker from "expo-document-picker";
import { File } from "expo-file-system";
import type {
  OrderBookInput,
  OrderBookReport,
  BookDisclosure,
} from "@/lib/trading/orderbook-model";
import { useWorkspace } from "@/hooks/use-workspace";
import { useAuth } from "@/hooks/use-auth";
import { useResearchStartMutation } from "@/lib/trading/client";
import { Card, ActionButton, Pill, ToggleRow } from "./ui";
import { C, mono } from "./theme";
const rate = (v: number | null) =>
  v === null ? "—" : `${(v * 100).toFixed(1)}%`;
export function OrderBookControls({
  busy,
  onStarted,
}: {
  busy: boolean;
  onStarted: (id: string) => void;
}) {
  const { workspace } = useWorkspace(),
    auth = useAuth(),
    start = useResearchStartMutation(),
    [book, setBook] = useState<OrderBookInput>(),
    [rights, setRights] = useState(false),
    [message, setMessage] = useState<string>();
  const choose = async () => {
    try {
      const pick = await DocumentPicker.getDocumentAsync({
        type: ["application/json", "text/plain"],
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (pick.canceled) return;
      const asset = pick.assets[0];
      if (asset.size && asset.size > 8 * 1024 * 1024)
        throw new Error(
          "Use a top3 snapshot JSON≤8MB, not OHLC or a repository dataset.",
        );
      const text =
        Platform.OS === "web" && asset.file
          ? await asset.file.text()
          : await new File(asset.uri).text();
      if (text.length > 8 * 1024 * 1024)
        throw new Error("Book file exceeds8MB.");
      const parsed = JSON.parse(text);
      if (
        !Array.isArray(parsed.snapshots) ||
        parsed.snapshots.length < 500 ||
        parsed.snapshots.length > 12000 ||
        typeof parsed.instrument !== "string" ||
        typeof parsed.source !== "string" ||
        !parsed.snapshots.every(
          (s: any) =>
            typeof s.time === "number" &&
            Array.isArray(s.bids) &&
            s.bids.length === 3 &&
            Array.isArray(s.asks) &&
            s.asks.length === 3,
        )
      )
        throw new Error(
          "Require {instrument,source,snapshots:[{time:Unixseconds,bids:[{price,quantity}×3],asks:[{price,quantity}×3]}]};500–12000 actual snapshots, no candle/tape substitution.",
        );
      setBook({
        ...parsed,
        rightsConfirmed: true,
        spec: {
          horizonSeconds: 600,
          trainingSeconds: 1800,
          testSeconds: 10,
          maxFolds: 1,
        },
      });
      setRights(false);
      setMessage(
        "Parsed locally only. Server and worker verify strict timestamps/book geometry before any experiment. No model has been trained.",
      );
    } catch (e) {
      setBook(undefined);
      setRights(false);
      setMessage(
        e instanceof Error ? e.message : "Book file could not be read.",
      );
    }
  };
  const launch = async () => {
    const strategy = workspace.strategies.find(
      (s) => s.id === workspace.activeStrategyId,
    );
    if (!book || !rights || !strategy) return;
    try {
      setMessage(undefined);
      const result = await start.mutateAsync({
        kind: "orderbook",
        market: workspace.market,
        timeframe: workspace.timeframe,
        strategy,
        confirmations: {},
        weeklyBias: workspace.settings.weeklyBias,
        trades: [],
        startingBalance: workspace.paperStartingBalance,
        book: { ...book, rightsConfirmed: true },
      });
      onStarted(result.id);
    } catch (e) {
      setMessage(
        e instanceof Error
          ? e.message
          : "Offline experiment unavailable; no result invented.",
      );
    }
  };
  return (
    <Card>
      <Pill label="ORDER-BOOK ML · OFFLINE ONLY" tone="amber" />
      <Text style={styles.title}>Real depth in. Purged labels out.</Text>
      <Text style={styles.meta}>
        Independent top3-depth experiment inspired by SGX methodology, not
        copied unlicensed code/data.64 feature concepts,600s forward labels, RF
        / ExtraTrees / AdaBoost / GradientBoosting / SVC comparisons.
        Chronological holdout and future-label purge; no live HFT/DMA, queue
        fills, profits or success score.
      </Text>
      <ActionButton
        label="Choose my top3 book snapshot JSON"
        compact
        kind="secondary"
        disabled={busy || start.isPending}
        onPress={() => void choose()}
      />
      {book ? (
        <Text style={styles.meta}>
          {book.instrument} · {book.snapshots.length} actual supplied snapshots
          · {book.source}.600s label horizon,1800s training window,10s test,one
          fold. Sufficient time coverage/classes may still be unavailable.
        </Text>
      ) : null}
      <ToggleRow
        label="I have permission to use this actual order-book dataset"
        detail="Your own authorized source. Repository data rights were not granted. Stored only in your private research record; not sent to an LLM or market-data vendor."
        value={rights}
        onChange={() => setRights((v) => !v)}
      />
      <ActionButton
        label={
          start.isPending
            ? "Starting offline experiment…"
            : "Run bounded offline book comparison"
        }
        compact
        disabled={
          !auth.isAuthenticated || !book || !rights || busy || start.isPending
        }
        onPress={() => void launch()}
      />
      {message ? <Text style={styles.note}>{message}</Text> : null}
    </Card>
  );
}
export function OrderBookResult({ report }: { report: OrderBookReport }) {
  const disclosure = report as OrderBookReport & BookDisclosure;
  return (
    <View style={{ gap: 9 }}>
      <Text style={styles.title}>
        {report.instrument} · offline label classification
      </Text>
      <Text style={styles.meta}>
        {report.source} · {report.snapshots} snapshots · {report.featureRows}{" "}
        eligible feature rows / {report.features} features · horizon
        {report.horizonSeconds}s
      </Text>
      <Card>
        <Text style={styles.note}>
          Five classifier families / six fixed configurations; no best-model
          selection, fitted model storage or live deployment.
        </Text>
        {disclosure.sampling ? (
          <Text style={styles.meta}>
            Actual event gaps min/median/max:{" "}
            {disclosure.sampling.gapDisclosure.minimumSeconds}s /
            {disclosure.sampling.gapDisclosure.medianSeconds}s /
            {disclosure.sampling.gapDisclosure.maximumSeconds}s. No synthetic
            one-second filling.
          </Text>
        ) : null}
        {disclosure.dataset ? (
          <Text style={styles.meta}>
            Labelled rows {disclosure.dataset.labelledRows}; excluded for
            lookback {disclosure.dataset.excludedForLookback}; excluded future
            tails/coverage {disclosure.dataset.excludedForFutureTailOrCoverage}.
          </Text>
        ) : null}
        {disclosure.evaluation ? (
          <Text style={styles.meta}>
            {disclosure.evaluation.selection}{" "}
            {disclosure.evaluation.trainingBound}
          </Text>
        ) : null}
      </Card>
      {report.models.map((model) => (
        <Card key={model.name}>
          <Text style={styles.title}>
            {model.name} · {model.status}
          </Text>
          <Text style={styles.meta}>
            Fixed configuration{" "}
            {model.configuration
              ? JSON.stringify(model.configuration)
              : "Not captured in legacy report; no settings inferred."}
          </Text>
          {model.reason ? (
            <Text style={styles.note}>{model.reason}</Text>
          ) : null}
          {model.folds.map((f, i) => (
            <View key={i}>
              {f.reason ? <Text style={styles.note}>{f.reason}</Text> : null}
              <Text style={styles.value}>
                Label accuracy {rate(f.accuracy)} · majority baseline{" "}
                {rate(f.baselineAccuracy)}
              </Text>
              <Text style={styles.meta}>
                Balanced label accuracy {rate(f.balancedAccuracy)} · Precision{" "}
                {rate(f.precision)} / Recall {rate(f.recall)} · train
                {f.trainRows} / test{f.testRows} / purged{f.purgedRows}
              </Text>
              <Text style={styles.meta}>
                Train {new Date(f.trainStart * 1000).toLocaleString()}–
                {new Date(f.trainEnd * 1000).toLocaleString()} → test{" "}
                {new Date(f.testStart * 1000).toLocaleString()}–
                {new Date(f.testEnd * 1000).toLocaleString()}. Confusion
                TN/FP/FN/TP: {f.confusion[0].join("/")} /{" "}
                {f.confusion[1].join("/")}
              </Text>
            </View>
          ))}
        </Card>
      ))}
      {report.limitations.map((m, i) => (
        <Text key={i} style={styles.note}>
          {m}
        </Text>
      ))}
      <Text style={styles.note}>
        Label metrics are not trading win rate, calibrated future probability,
        cost-adjusted P/L or a live model. No paper/broker orders.
      </Text>
    </View>
  );
}
const styles = StyleSheet.create({
  title: { color: C.text, fontWeight: "800", fontSize: 13 },
  meta: { color: C.muted, fontSize: 10, lineHeight: 16 },
  note: { color: C.amber, fontSize: 10, lineHeight: 16 },
  value: { color: C.text, fontFamily: mono, fontSize: 11 },
});
