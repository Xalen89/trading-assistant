import {
  quantStarter,
  QUANT_PURPOSE,
} from "@/lib/trading/quant-workbench-config";
import * as DocumentPicker from "expo-document-picker";
import { File } from "expo-file-system";
import { useRouter } from "expo-router";
import { useMemo, useState, useRef } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useWorkspace } from "@/hooks/use-workspace";
import { trpc } from "@/lib/trpc";
import { parseHistory } from "@/lib/trading/engine";
import { MARKETS, type Market, type Timeframe } from "@/lib/trading/model";
import {
  type QuantBook,
  type QuantFamily,
  type QuantLabResult,
  type QuantSeries,
  type QuantSettings,
} from "@/lib/trading/quant-lab-types";
import { ActionButton, Card, Input, Pill, SectionLabel, Sheet } from "./ui";
import { C, formatPrice, mono } from "./theme";

export type QuantWorkbenchProps = {
  visible: boolean;
  onClose: () => void;
  initialFamily?: QuantFamily;
};

type FamilyEducation = {
  label: string;
  summary: string;
  requirements: string;
};

/** Compact, educational labels kept local until the Quant workbench becomes a shared feature. */
export const QUANT_FAMILY_EDUCATION: Record<QuantFamily, FamilyEducation> = {
  pairs: {
    label: "Pairs / relative value",
    summary:
      "Compares two selected market histories for a relative-value relationship; a model state is not an execution instruction.",
    requirements:
      "Requires two distinct catalog markets with aligned usable history.",
  },
  momentum: {
    label: "Cross / time-series momentum",
    summary:
      "Tests a rule-based trend or momentum hypothesis over the selected historical bars.",
    requirements:
      "Requires at least two selected histories for the fixed-universe ranking model.",
  },
  making: {
    label: "Market making",
    summary:
      "Evaluates inventory settings only against a venue book actually returned by the model service.",
    requirements:
      "Requires a selected market and a returned venue book; synthetic L2, queue fills, and costs are not inferred.",
  },
  macro: {
    label: "Multi-asset trend research",
    summary:
      "Runs systematic slow-trend and volatility scaling; macro releases remain a separate data requirement.",
    requirements:
      "Macro vintage and revision data are not connected in this workbench, so historical vintage availability is unavailable.",
  },
  ml: {
    label: "Forward-return classifier",
    summary:
      "Reports a chronological forward-return classification experiment; it is not a trade-success probability.",
    requirements:
      "Requires enough observations for a separated train/test split and the service's stated feature eligibility.",
  },
};

export const quantFamilyLabel = (family: QuantFamily) =>
  QUANT_FAMILY_EDUCATION[family].label;

type NumericSetting = "lookback"|"entryZ"|"exitZ"|"holdingBars"|"startingEquity"|"inventory"|"orderSize"|"maxInventory"|"feeBps"|"slippageBps";
type SettingsDraft = Record<NumericSetting, string>;
type QuantRunInput = {
  family: QuantFamily;
  symbols: string[];
  timeframe: Timeframe;
  bars: number;
  settings: QuantSettings;
  imports?: QuantSeries[];
};
type QuantSource = {
  symbol: string;
  source: string;
  barCount: number;
  asOf: number;
  provenance: "provider" | "user-import";
};
type QuantRunResponse = {
  result: QuantLabResult;
  series: QuantSource[];
  book?: QuantBook;
};

const TIMEFRAMES: Timeframe[] = ["1m", "5m", "15m", "30m", "1h", "4h", "1d", "1w"];
const MAX_IMPORT_BYTES = 8 * 1024 * 1024;

function settingsDraft(settings: QuantSettings): SettingsDraft {
  return {
    lookback: String(settings.lookback),
    entryZ: String(settings.entryZ),
    exitZ: String(settings.exitZ),
    feeBps: String(settings.feeBps),
    slippageBps: String(settings.slippageBps),
    holdingBars: String(settings.holdingBars),
    startingEquity: String(settings.startingEquity),
    inventory: String(settings.inventory),
    orderSize: String(settings.orderSize),
    maxInventory: String(settings.maxInventory),
  };
}

function asFinite(value: string) {
  const parsed = Number(value.trim());
  return Number.isFinite(parsed) ? parsed : undefined;
}

function timeText(timestamp: number) {
  if (!Number.isFinite(timestamp) || timestamp <= 0) return "unavailable";
  const milliseconds =
    timestamp > 100_000_000_000 ? timestamp : timestamp * 1000;
  return new Date(milliseconds).toLocaleString();
}

function metricText(value: number | string | null, unit?: string) {
  if (value === null || value === undefined) return "—";
  if (typeof value === "string") return unit ? `${value} ${unit}` : value;
  const numeric = Number.isInteger(value)
    ? value.toLocaleString()
    : value.toLocaleString(undefined, { maximumFractionDigits: 4 });
  return unit ? `${numeric} ${unit}` : numeric;
}

function familySettings(family: QuantFamily): (NumericSetting)[] {
  if (family === "pairs") return ["lookback", "entryZ", "exitZ", "holdingBars"];
  if (family === "making") return ["inventory", "orderSize", "maxInventory"];
  return ["lookback", "holdingBars"];
}

function settingMeta(key: NumericSetting) {
  const definitions: Record<
    NumericSetting,
    { label: string; note?: string }
  > = {
    lookback: { label: "Lookback bars" },
    entryZ: { label: "Entry z-score" },
    exitZ: { label: "Exit z-score" },
    holdingBars: { label: "Holding bars" },
    startingEquity: { label: "Starting equity (model assumption)" },
    inventory: { label: "Starting inventory" },
    orderSize: { label: "Order size" },
    maxInventory: { label: "Maximum absolute inventory" },
    feeBps: { label: "Fee assumption (bps; 0 = excluded)" },
    slippageBps: { label: "Slippage assumption (bps; 0 = excluded)" },
  };
  return definitions[key];
}

function validationInput({
  family,
  symbols,
  timeframe,
  barsText,
  draft,
  imports,
  markets,
}: {
  family: QuantFamily;
  symbols: string[];
  timeframe: Timeframe;
  barsText: string;
  draft: SettingsDraft;
  imports: QuantSeries[] | undefined;
  markets: Market[];
}): { input: QuantRunInput } | { error: string } {
  const selected = [...new Set(symbols)].filter(Boolean);
  if (!selected.length)
    return { error: "Select at least one market from the catalog." };
  if (selected.length > 8)
    return { error: "A model run supports at most eight selected markets." };
  if (
    selected.some((symbol) => !markets.some((market) => market.id === symbol))
  )
    return {
      error: "Choose markets from the connected catalog before running.",
    };
  if (family === "pairs" && selected.length !== 2)
    return {
      error:
        "Pairs / relative value requires exactly two selected catalog markets.",
    };

  if ((family === "momentum" || family === "macro") && selected.length < 2)
    return {
      error:
        "Select at least two assets for multi-asset momentum or systematic trend.",
    };
  if (family === "macro" && timeframe !== "1d" && timeframe !== "1w")
    return {
      error: "Systematic slow-trend research uses daily or weekly data.",
    };
  if ((family === "making" || family === "ml") && selected.length !== 1)
    return {
      error:
        "Venue quote and classification research each use one actual product.",
    };

  const bars = asFinite(barsText);
  if (!bars || !Number.isInteger(bars) || bars < 60 || bars > 1800)
    return { error: "Bars must be a whole number from 60 to 1,800." };

  const parsed = Object.fromEntries(
    Object.entries(draft).map(([key, value]) => [key, asFinite(value)]),
  ) as Record<NumericSetting, number | undefined>;
  if (Object.values(parsed).some((value) => value === undefined))
    return { error: "Every numeric assumption must be a finite number." };

  const settings: QuantSettings = {
    lookback: parsed.lookback!,
    entryZ: parsed.entryZ!,
    exitZ: parsed.exitZ!,
    feeBps: parsed.feeBps!,
    slippageBps: parsed.slippageBps!,
    holdingBars: parsed.holdingBars!,
    startingEquity: parsed.startingEquity!,
    inventory: parsed.inventory!,
    orderSize: parsed.orderSize!,
    maxInventory: parsed.maxInventory!,
  };
  if (
    !Number.isInteger(settings.lookback) ||
    settings.lookback < 10 ||
    settings.lookback > Math.min(400, bars)
  )
    return {
      error:
        "Lookback must be a whole number from 10 to 400 and no greater than Bars.",
    };
  const minLookback = family === "pairs" ? 30 : family === "macro" ? 20 : 10;
  const maxLookback =
    family === "ml"
      ? 60
      : family === "momentum" || family === "macro"
        ? 252
        : 400;
  if (settings.lookback < minLookback || settings.lookback > maxLookback)
    return {
      error: `${quantFamilyLabel(family)} lookback must be ${minLookback}–${maxLookback} bars.`,
    };
  if (family === "ml" && settings.holdingBars > 20)
    return { error: "Classifier holding horizon must be 1–20 bars." };
  if (
    !Number.isInteger(settings.holdingBars) ||
    settings.holdingBars < 1 ||
    settings.holdingBars > 100
  )
    return { error: "Holding bars must be a whole number from 1 to 100." };
  if (
    settings.entryZ <= 0 ||
    settings.entryZ > 10 ||
    settings.exitZ > 5 ||
    settings.exitZ < 0 ||
    settings.exitZ >= settings.entryZ
  )
    return {
      error:
        "Entry z-score must be positive and larger than a non-negative exit z-score.",
    };
  if (
    settings.feeBps < 0 ||
    settings.slippageBps < 0 ||
    settings.feeBps > 1000 ||
    settings.slippageBps > 1000
  )
    return {
      error:
        "Fee and slippage assumptions range from 0 to 1000 bps; 0 excludes each assumption.",
    };
  if (settings.startingEquity <= 0 || settings.startingEquity > 1e12)
    return { error: "Starting equity must be greater than zero." };
  if (
    settings.orderSize <= 0 ||
    settings.maxInventory <= 0 ||
    settings.orderSize > 1e9 ||
    settings.maxInventory > 1e9 ||
    Math.abs(settings.inventory) > 1e9
  )
    return {
      error:
        "Order size and maximum absolute inventory must be greater than zero.",
    };
  if (
    family === "making" &&
    Math.abs(settings.inventory) > settings.maxInventory
  )
    return {
      error: "Starting inventory cannot exceed the maximum absolute inventory.",
    };

  return {
    input: {
      family,
      symbols: selected,
      timeframe,
      bars,
      settings,
      ...(imports?.length ? { imports } : {}),
    },
  };
}

function VenueBook({ book }: { book?: QuantBook }) {
  if (!book)
    return (
      <Card>
        <Text style={styles.cardTitle}>Venue book</Text>
        <Text style={styles.note}>
          No venue book was returned. No synthetic L2, queue position, fills, or
          costs are shown.
        </Text>
      </Card>
    );

  const levels = Math.max(book.bids.length, book.asks.length, 0);
  return (
    <Card>
      <View style={styles.cardHead}>
        <Text style={styles.cardTitle}>Venue book · top 5 levels</Text>
        <Pill
          label={book.status === "streamed" ? "STREAMED BOOK" : "POLLED BOOK"}
          tone={book.status === "streamed" ? "mint" : "amber"}
        />
      </View>
      <Text style={styles.meta}>
        {book.symbol} · {book.source} · received {timeText(book.receivedAt)} ·
        tick {book.tickSize} · lot {book.lotSize}
        {book.sequence === undefined ? "" : ` · sequence ${book.sequence}`}
      </Text>
      {levels ? (
        <View style={styles.bookTable}>
          <View style={[styles.bookRow, styles.bookHead]}>
            <Text style={styles.bookHeader}>BID SIZE</Text>
            <Text style={styles.bookHeader}>BID PRICE</Text>
            <Text style={[styles.bookHeader, styles.bookAsk]}>ASK PRICE</Text>
            <Text style={[styles.bookHeader, styles.bookAsk]}>ASK SIZE</Text>
          </View>
          {Array.from({ length: Math.min(5, levels) }).map((_, index) => {
            const bid = book.bids[index];
            const ask = book.asks[index];
            return (
              <View key={`${book.symbol}-${index}`} style={styles.bookRow}>
                <Text style={[styles.bookValue, { color: C.mint }]}>
                  {bid?.[1] ?? "—"}
                </Text>
                <Text style={[styles.bookValue, { color: C.mint }]}>
                  {bid ? formatPrice(bid[0], 8) : "—"}
                </Text>
                <Text
                  style={[styles.bookValue, styles.bookAsk, { color: C.rose }]}
                >
                  {ask ? formatPrice(ask[0], 8) : "—"}
                </Text>
                <Text
                  style={[styles.bookValue, styles.bookAsk, { color: C.rose }]}
                >
                  {ask?.[1] ?? "—"}
                </Text>
              </View>
            );
          })}
        </View>
      ) : (
        <Text style={styles.note}>
          The returned book contained no displayed price levels.
        </Text>
      )}
      <Text style={styles.note}>
        This is a received venue-book snapshot, not a simulated queue, fill, or
        cost model.
      </Text>
    </Card>
  );
}

function ResultPanel({ response }: { response: QuantRunResponse }) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const { result, series, book } = response;
  const provenanceCounts = series.reduce<Record<string, number>>(
    (counts, item) => {
      counts[item.provenance] = (counts[item.provenance] || 0) + 1;
      return counts;
    },
    {},
  );
  const equityStart = result.equity[0];
  const equityEnd = result.equity.at(-1);
  const multiLegPlan = result.paperPlan && result.paperPlan.legs.length >= 2;

  return (
    <>
      <SectionLabel>What the result means</SectionLabel>
      <Card>
        <Text style={styles.cardTitle}>
          {result.status === "ready"
            ? "Calculation completed"
            : "This run needs attention"}
        </Text>
        <Text style={styles.detail}>
          {result.status === "ready"
            ? QUANT_PURPOSE[result.family].output
            : result.summary}
        </Text>
        <Text style={styles.meta}>
          {result.status === "ready"
            ? QUANT_PURPOSE[result.family].next
            : "Correct the data/parameters or source requirement stated below, then rerun. Publishing does not supply missing history."}
        </Text>
      </Card>
      <Card>
        <View style={styles.cardHead}>
          <View style={{ flex: 1 }}>
            <Text style={styles.cardTitle}>{result.title}</Text>
            <Text style={styles.meta}>As of {timeText(result.asOf)}</Text>
          </View>
          <Pill
            label={
              result.status === "ready"
                ? "MODEL OUTPUT AVAILABLE"
                : result.status === "insufficient-data"
                  ? "INSUFFICIENT DATA"
                  : "UNAVAILABLE"
            }
            tone={result.status === "ready" ? "mint" : "amber"}
          />
        </View>
        <Text style={styles.detail}>{result.summary}</Text>
        <Text style={styles.note}>
          A ready model output means the service completed its data check; it
          does not establish profitability.
        </Text>
      </Card>

      {result.metrics.length ? (
        <Card>
          <Text style={styles.cardTitle}>Metrics reported by the model</Text>
          <View style={styles.metricGrid}>
            {result.metrics.map((metric) => (
              <View key={metric.key} style={styles.metric}>
                <Text style={styles.metricLabel}>{metric.label}</Text>
                <Text style={styles.metricValue}>
                  {metricText(metric.value, metric.unit)}
                </Text>
              </View>
            ))}
          </View>
        </Card>
      ) : null}

      {!result.signals.length ? (
        <Card>
          <Text style={styles.cardTitle}>No current candidate</Text>
          <Text style={styles.meta}>
            {result.status === "ready"
              ? QUANT_PURPOSE[result.family].noSignal
              : result.summary}
          </Text>
        </Card>
      ) : null}
      {result.signals.length ? (
        <Card>
          <Text style={styles.cardTitle}>Model signals</Text>
          <Text style={styles.note}>
            Signals are model states, not live orders or broker instructions.
          </Text>
          {result.signals.slice(0, 12).map((signal, index) => (
            <View
              key={`${signal.symbol}-${signal.at}-${index}`}
              style={styles.signal}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.signalTitle}>
                  {signal.symbol} · {signal.direction.toUpperCase()} · strength{" "}
                  {signal.strength.toFixed(2)}
                </Text>
                <Text style={styles.meta}>{signal.reason}</Text>
              </View>
              <Text style={styles.signalTime}>{timeText(signal.at)}</Text>
            </View>
          ))}
        </Card>
      ) : null}

      {result.equity.length ? (
        <Card>
          <Text style={styles.cardTitle}>Equity series (text summary)</Text>
          <Text style={styles.detail}>
            {result.equity.length} model observations
            {equityStart && equityEnd
              ? ` · ${metricText(equityStart.value)} at ${timeText(equityStart.time)} → ${metricText(equityEnd.value)} at ${timeText(equityEnd.time)}`
              : ""}
          </Text>
          <Text style={styles.note}>
            No decorative chart is drawn; values are returned model output, not
            a profit claim.
          </Text>
        </Card>
      ) : null}

      {result.family === "making" ? <VenueBook book={book} /> : null}

      {result.paperPlan ? (
        <Card>
          <Text style={styles.cardTitle}>
            {multiLegPlan ? "Two-leg paper plan" : "Paper plan"}
          </Text>
          <Text style={styles.detail}>{result.paperPlan.description}</Text>
          {result.paperPlan.legs.map((leg, index) => (
            <View key={`${leg.symbol}-${index}`} style={styles.paperLeg}>
              <Text style={styles.paperLegMain}>
                {leg.side.toUpperCase()} {leg.symbol} · {leg.quantity}
              </Text>
              <Text style={styles.meta}>
                Source reference price {metricText(leg.referencePrice)}
              </Text>
            </View>
          ))}
          <Text style={styles.note}>
            {multiLegPlan
              ? "Actual two-leg paper execution is not wired. These source reference prices do not submit an order."
              : "This is an educational paper-plan reference only. It does not submit an order."}
          </Text>
        </Card>
      ) : null}

      <ActionButton
        label={detailsOpen ? "Hide details" : "Show details"}
        compact
        kind="secondary"
        onPress={() => setDetailsOpen((open) => !open)}
      />
      {detailsOpen ? (
        <Card>
          <Text style={styles.cardTitle}>Run details</Text>
          <Text style={styles.detail}>Source counts</Text>
          <Text style={styles.meta}>
            {Object.keys(provenanceCounts).length
              ? Object.entries(provenanceCounts)
                  .map(
                    ([provenance, count]) =>
                      `${count} ${provenance === "user-import" ? "owner import" : "provider"}`,
                  )
                  .join(" · ")
              : "No source metadata was returned."}
          </Text>
          {series.map((item) => (
            <Text key={`${item.symbol}-${item.source}`} style={styles.meta}>
              {item.symbol} · {item.barCount} bars ·{" "}
              {item.provenance === "user-import" ? "owner import" : "provider"}{" "}
              · {item.source} · as of {timeText(item.asOf)}
            </Text>
          ))}
          <Text style={[styles.detail, styles.detailTop]}>Validation</Text>
          <Pill
            label={
              result.validation.status === "unconfirmed"
                ? "VALIDATION PENDING"
                : "EXPLORATORY VALIDATION"
            }
            tone={
              result.validation.status === "unconfirmed" ? "amber" : "muted"
            }
          />
          <Text style={styles.meta}>
            Samples: {result.validation.actualSamples} total ·{" "}
            {result.validation.trainSamples} train ·{" "}
            {result.validation.testSamples} test · walk-forward{" "}
            {result.validation.walkForward ? "yes" : "no"} · OOS untouched
            holdout {result.validation.untouchedHoldout ? "yes" : "no"}
          </Text>
          {result.mlValidation?.assets.map(asset => <View key={asset.symbol} style={{gap:6}}><Text style={styles.detail}>{asset.symbol} · {asset.diagnostics.mode} · {asset.diagnostics.fittingJobs} actual fits</Text><Text style={styles.note}>{asset.diagnostics.validationRows} label intervals · embargo {(asset.diagnostics.embargoPct*100).toFixed(1)}% · holdout scores {asset.diagnostics.holdoutReliability?.scoredSamples ?? 0}</Text>{Object.entries(asset.diagnostics.foldReliability).map(([id,stats])=><Text key={id} style={styles.meta}>{id}: n={stats.scoredSamples} · Brier {stats.scoredSamples < 30 || stats.brierScore===null ? "insufficient" : stats.brierScore.toFixed(4)}</Text>)}</View>)}
          {result.validation.reasons.map((reason, index) => (
            <Text key={`validation-${index}`} style={styles.note}>
              • {reason}
            </Text>
          ))}
          <Text style={[styles.detail, styles.detailTop]}>
            Data requirements
          </Text>
          {result.dataRequirements.length ? (
            result.dataRequirements.map((item, index) => (
              <Text key={`requirement-${index}`} style={styles.meta}>
                • {item}
              </Text>
            ))
          ) : (
            <Text style={styles.meta}>
              No additional requirements reported.
            </Text>
          )}
          <Text style={[styles.detail, styles.detailTop]}>
            Limits and provenance
          </Text>
          {result.limitations.length ? (
            result.limitations.map((item, index) => (
              <Text key={`limit-${index}`} style={styles.note}>
                • {item}
              </Text>
            ))
          ) : (
            <Text style={styles.meta}>
              No additional model limits reported.
            </Text>
          )}
        </Card>
      ) : null}
    </>
  );
}

export function QuantWorkbench(props: QuantWorkbenchProps) {
  return props.visible ? (
    <WorkbenchForm key={props.initialFamily || "pairs"} {...props} />
  ) : null;
}
function WorkbenchForm({
  visible,
  onClose,
  initialFamily,
}: QuantWorkbenchProps) {
  const { ready } = useWorkspace();
  const router = useRouter();
  const catalog = trpc.market.catalog.useQuery(undefined, {
    enabled: visible,
    staleTime: 30_000,
    retry: false,
  });
  const run = trpc.quant.run.useMutation();
  const [family, setFamily] = useState<QuantFamily>(initialFamily || "pairs");
  const [inputsOpen, setInputsOpen] = useState(false);
  const [methodSettings,setMethodSettings] = useState<Partial<QuantSettings>>({validationMode:"walk-forward",embargoPct:.01,maxFolds:15});
  const starter = quantStarter(initialFamily || "pairs");
  const inputRevision = useRef(0);
  const [symbols, setSymbols] = useState<string[]>(starter.symbols);
  const [timeframe, setTimeframe] = useState<Timeframe>(starter.timeframe);
  const [barsText, setBarsText] = useState(String(starter.bars));
  const [draft, setDraft] = useState<SettingsDraft>(() =>
    settingsDraft(starter.settings),
  );
  const [search, setSearch] = useState("");
  const [imported, setImported] = useState<QuantSeries[]>([]);
  const [importTarget, setImportTarget] = useState(starter.symbols[0]);
  const [error, setError] = useState<string>();
  const [importNotice, setImportNotice] = useState<string>();
  const [response, setResponse] = useState<QuantRunResponse>();

  const markets = catalog.data?.length ? catalog.data : MARKETS;
  const marketById = useMemo(
    () => new Map(markets.map((market) => [market.id, market])),
    [markets],
  );
  const selectableMarkets = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return [];
    return markets
      .filter((market) => !symbols.includes(market.id))
      .filter((market) =>
        `${market.id} ${market.providerSymbol} ${market.name}`
          .toLowerCase()
          .includes(term),
      )
      .slice(0, 6);
  }, [markets, search, symbols]);
  const prepared = useMemo(
    () =>
      validationInput({
        family,
        symbols,
        timeframe,
        barsText,
        draft,
        imports: imported.length ? imported : undefined,
        markets,
      }),
    [barsText, draft, family, imported, markets, symbols, timeframe],
  );

  const clearError = () => {
    inputRevision.current++;
    setError(undefined);
    setResponse(undefined);
  };
  const loadStarter = (next: QuantFamily) => {
    const valid = quantStarter(next);
    setSymbols(valid.symbols);
    setTimeframe(valid.timeframe);
    setBarsText(String(valid.bars));
    setDraft(settingsDraft(valid.settings));
    setImported([]);
    setImportTarget(valid.symbols[0]);
    setImportNotice(
      "Starter uses actual Coinbase data; not sample candles or account/chart changes.",
    );
    clearError();
  };
  const changeFamily = (next: QuantFamily) => {
    setFamily(next);
    loadStarter(next);
    setSearch("");
    clearError();
  };
  const chooseMarket = (id: string) => {
    setSymbols((current) => {
      if (current.includes(id)) return current;
      if (family === "pairs" && current.length >= 2) return current;
      if ((family === "making" || family === "ml") && current.length >= 1)
        return current;
      if (current.length >= 8) return current;
      return [...current, id];
    });
    setSearch("");
    clearError();
  };
  const removeMarket = (id: string) => {
    setSymbols((current) => current.filter((symbol) => symbol !== id));
    clearError();
  };
  const setSetting = (key: NumericSetting, value: string) => {
    setDraft((current) => ({ ...current, [key]: value }));
    clearError();
  };
  const addDeviceImport = async () => {
    try {
      const pick = await DocumentPicker.getDocumentAsync({
        type: ["text/csv", "application/json"],
        copyToCacheDirectory: true,
      });
      if (pick.canceled) return;
      const asset = pick.assets?.[0];
      if (!asset) throw new Error("No import was selected.");
      const name = asset.name || "owner-import";
      const extension = name.split(".").pop()?.toLowerCase();
      if (!["csv", "json"].includes(extension || ""))
        throw new Error("Choose a CSV or JSON OHLC history file.");
      if ((asset.size || 0) > MAX_IMPORT_BYTES)
        throw new Error("Owner imports are limited to 8 MiB.");
      const fileAsset = asset as DocumentPicker.DocumentPickerAsset & {
        file?: { text: () => Promise<string> };
      };
      const text = fileAsset.file?.text
        ? await fileAsset.file.text()
        : await new File(asset.uri).text();
      if (!text.trim()) throw new Error("The selected file is empty.");
      if (text.length > MAX_IMPORT_BYTES)
        throw new Error("Owner imports are limited to 8 MiB.");
      const candles = parseHistory(text);
      const target = symbols.includes(importTarget) ? importTarget : symbols[0];
      if (!target) throw new Error("Select an import target market first.");
      const importedSeries: QuantSeries = {
        symbol: target,
        timeframe,
        source: `Owner import · ${name}`,
        candles,
        fetchedAt: 0, // Unknown client receipt time; authoritative run stamps it on the server.
        provenance: "user-import",
      };
      setImported((current) => [
        ...current.filter((s) => s.symbol !== target),
        importedSeries,
      ]);
      setImportNotice(
        `${candles.length} strict OHLC bars loaded from this device as an owner import.`,
      );
      clearError();
    } catch (caught) {
      setImportNotice(undefined);
      setError(
        caught instanceof Error
          ? caught.message
          : "The owner import could not be parsed.",
      );
    }
  };
  const runModel = async () => {
    if (run.isPending) return;
    if ("error" in prepared) {
      setError(prepared.error);
      return;
    }
    try {
      setError(undefined);
      setResponse(undefined);
      const revision = inputRevision.current;
      const next = await run.mutateAsync({...prepared.input,settings:{...prepared.input.settings,...methodSettings}});
      if (revision === inputRevision.current) setResponse(next);
      else
        setError(
          "Inputs changed during the run. Run again to calculate the current selection.",
        );
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "The model run did not complete. Your inputs are still here to retry.",
      );
    }
  };
  const explain = () => {
    onClose();
    router.navigate({
      pathname: "/coach",
      params: {
        question: `Explain my most recent ${quantFamilyLabel(family)} research result${response ? ` as of ${timeText(response.result.asOf)} for ${response.series.map((s) => s.symbol).join("/")}` : ""}. What was computed, which conditions failed, and what can I learn next? Do not treat it as a validated trade or broker order.`,
      },
    } as never);
  };

  if (!visible) return null;

  const selectedNames = symbols.map((symbol) => marketById.get(symbol));
  const needsSecondPair = family === "pairs" && symbols.length < 2;
  const catalogStatus = catalog.data?.length
    ? "Connected market catalog"
    : catalog.isLoading
      ? "Loading connected market catalog…"
      : "Catalog fallback while connected catalog is unavailable";

  return (
    <Sheet
      visible={visible}
      title="Quant Workbench"
      subtitle="Educational model runs · source-aware inputs · no live or broker orders"
      onClose={onClose}
    >
      <Card>
        <View style={styles.cardHead}>
          <View style={{ flex: 1 }}>
            <Text style={styles.cardTitle}>{quantFamilyLabel(family)}</Text>
            <Text style={styles.detail}>
              {QUANT_FAMILY_EDUCATION[family].summary}
            </Text>
          </View>
          <Pill label="MODEL LAB" tone="muted" />
        </View>
        <Text style={styles.note}>
          {QUANT_FAMILY_EDUCATION[family].requirements}
        </Text>
        {family === "macro" ? (
          <Text style={styles.macroNotice}>
            Macro vintage / revision data unavailable — no historical vintage is
            implied.
          </Text>
        ) : null}
        {family === "ml" ? (
          <Text style={styles.macroNotice}>
            Held-out classification only; do not read any result as a
            trade-success probability.
          </Text>
        ) : null}
      </Card>

      <Card>
        <Text style={styles.cardTitle}>What this tool is for</Text>
        <Text style={styles.detail}>{QUANT_PURPOSE[family].question}</Text>
        <Text style={styles.meta}>{QUANT_PURPOSE[family].steps}</Text>
        <Text style={styles.detail}>
          You get: {QUANT_PURPOSE[family].output}
        </Text>
        <ActionButton
          label="Load real-data starter"
          compact
          kind="secondary"
          disabled={run.isPending}
          onPress={() => loadStarter(family)}
        />
        <Text style={styles.meta}>
          The starter is BTC/ETH Coinbase research, not your chart/account
          selection. Adjust markets if desired.
        </Text>
      </Card>
      <ActionButton
        label={
          inputsOpen ? "Hide input controls" : "Edit model / markets / settings"
        }
        compact
        kind="secondary"
        onPress={() => setInputsOpen((open) => !open)}
      />
      {!inputsOpen ? (
        <Card>
          <Text style={styles.cardTitle}>Current inputs</Text>
          <Text style={styles.detail}>
            {symbols.join(" / ")}
            {family === "making"
              ? " · actual venue book"
              : ` · ${timeframe} · ${barsText} requested bars`}
          </Text>
          <Text style={styles.meta}>
            {imported.length} owner imports · fee {draft.feeBps}bps · slippage{" "}
            {draft.slippageBps}bps (your assumptions)
          </Text>
        </Card>
      ) : null}
      {inputsOpen ? (
        <>
          <SectionLabel>Model family</SectionLabel>
          <View style={styles.familyChoices}>
            {(Object.keys(QUANT_FAMILY_EDUCATION) as QuantFamily[]).map(
              (item) => (
                <ActionButton
                  key={item}
                  label={QUANT_FAMILY_EDUCATION[item].label}
                  compact
                  kind={family === item ? "primary" : "secondary"}
                  disabled={run.isPending}
                  onPress={() => changeFamily(item)}
                />
              ),
            )}
          </View>

          <SectionLabel>Markets & history</SectionLabel>
          <Card>
            <Text style={styles.cardTitle}>
              {family === "pairs"
                ? "Two selected catalog markets"
                : "Selected catalog markets"}
            </Text>
            <Text style={styles.meta}>
              {catalogStatus}. Search and tap a result to select it; no
              oversized all-market picker is rendered.
            </Text>
            {catalog.error ? (
              <Text style={styles.note}>{catalog.error.message}</Text>
            ) : null}
            <View style={styles.selectedMarkets}>
              {symbols.length ? (
                selectedNames.map((market, index) => {
                  const id = symbols[index];
                  return (
                    <Pressable
                      key={id}
                      accessibilityRole="button"
                      accessibilityLabel={`Remove ${market?.providerSymbol || id}`}
                      onPress={() => removeMarket(id)}
                      style={({ pressed }) => [
                        styles.marketChip,
                        { opacity: pressed ? 0.7 : 1 },
                      ]}
                    >
                      <Text style={styles.marketChipText}>
                        {market?.providerSymbol || id} ×
                      </Text>
                    </Pressable>
                  );
                })
              ) : (
                <Text style={styles.note}>
                  {ready
                    ? "Select a market from the catalog."
                    : "Loading workspace market…"}
                </Text>
              )}
            </View>
            {needsSecondPair ? (
              <Text style={styles.pairWarning}>
                Pairs requires a second real market selected from this catalog.
              </Text>
            ) : null}
            <Input
              label={
                family === "pairs"
                  ? "Search a second market"
                  : "Search connected market catalog"
              }
              value={search}
              onChangeText={(value) => {
                setSearch(value);
                clearError();
              }}
              placeholder="Type BTC, XAUUSD, AAPL…"
            />
            {search.trim() && !selectableMarkets.length ? (
              <Text style={styles.note}>
                No additional catalog markets match this search.
              </Text>
            ) : null}
            {selectableMarkets.map((market) => (
              <Pressable
                key={market.id}
                accessibilityRole="button"
                onPress={() => chooseMarket(market.id)}
                style={({ pressed }) => [
                  styles.catalogResult,
                  { opacity: pressed ? 0.7 : 1 },
                ]}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.catalogSymbol}>
                    {market.providerSymbol}
                  </Text>
                  <Text style={styles.meta}>
                    {market.name} · {market.provider}
                  </Text>
                </View>
                <Text style={styles.addLabel}>Add</Text>
              </Pressable>
            ))}
            {family !== "making" ? (
              <>
                <View style={styles.timeframeChoices}>
                  {(family === "macro"
                    ? TIMEFRAMES.filter((f) => f === "1d" || f === "1w")
                    : TIMEFRAMES
                  ).map((frame) => (
                    <ActionButton
                      key={frame}
                      label={frame}
                      compact
                      kind={timeframe === frame ? "primary" : "secondary"}
                      disabled={run.isPending}
                      onPress={() => {
                        setTimeframe(frame);
                        clearError();
                      }}
                    />
                  ))}
                </View>
                <Input
                  label="Bars (60–1,800)"
                  value={barsText}
                  onChangeText={(value) => {
                    setBarsText(value);
                    clearError();
                  }}
                  keyboardType="numeric"
                />
                <Text style={styles.note}>
                  A run requests only the selected symbols, interval, and bar
                  count. It does not place any broker or live order.
                </Text>
              </>
            ) : (
              <Text style={styles.meta}>
                This model uses a current venue book. Timeframe, historical bars
                and OHLC imports are not used.
              </Text>
            )}
          </Card>

          {family !== "making" ? (
            <Card>
              <Text style={styles.cardTitle}>
                Owner imports · one file per market
              </Text>
              <View style={styles.selectedMarkets}>
                {symbols.map((id) => (
                  <ActionButton
                    key={id}
                    compact
                    label={`Import for ${id}`}
                    kind={id === importTarget ? "primary" : "secondary"}
                    onPress={() => setImportTarget(id)}
                  />
                ))}
              </View>
              <Text style={styles.meta}>
                CSV or JSON only. Parsed strictly as OHLC with time, open, high,
                low, close, volume; invalid rows or duplicate timestamps are
                rejected. Import provenance is owner import, never a provider
                claim.
              </Text>
              <ActionButton
                label={
                  imported.some((s) => s.symbol === importTarget)
                    ? "Replace selected market import"
                    : "Add CSV / JSON from device"
                }
                compact
                kind="secondary"
                icon="document-attach-outline"
                disabled={run.isPending}
                onPress={() => void addDeviceImport()}
              />
              {imported.map((s) => (
                <View key={s.symbol}>
                  <Text style={styles.imported}>
                    {s.symbol} · {s.candles.length} bars · {s.timeframe} · owner
                    import
                  </Text>
                  <ActionButton
                    compact
                    kind="ghost"
                    label={`Remove ${s.symbol} import`}
                    onPress={() => {
                      setImported((current) =>
                        current.filter((i) => i.symbol !== s.symbol),
                      );
                      clearError();
                    }}
                  />
                </View>
              ))}
              {importNotice ? (
                <Text style={styles.meta}>{importNotice}</Text>
              ) : null}
            </Card>
          ) : null}

          {family === "ml" ? <Card><Text style={styles.cardTitle}>Label-aware validation</Text><View style={{flexDirection:"row",flexWrap:"wrap",gap:8}}>{(["walk-forward","cpcv"] as const).map(mode => <ActionButton key={mode} compact label={mode} kind={methodSettings.validationMode===mode?"primary":"secondary"} onPress={()=>{setMethodSettings(v=>({...v,validationMode:mode}));clearError();}} />)}</View><Input label="Embargo percentage (0–25)" keyboardType="numeric" value={String((methodSettings.embargoPct ?? .01)*100)} onChangeText={v=>{setMethodSettings(s=>({...s,embargoPct:Number(v)/100}));clearError();}} /><Text style={styles.note}>Actual label intervals are purged. Fold fits are capped at 15; the holdout stays separate. Calibration is a forward-direction label, not trade-win probability.</Text></Card> : null}
          {family === "pairs" ? <Card><Text style={styles.cardTitle}>Non-overlapping formation / trading blocks</Text><View style={{flexDirection:"row",flexWrap:"wrap",gap:8}}>{(["rolling-ols","kalman"] as const).map(mode => <ActionButton key={mode} compact label={mode} kind={(methodSettings.hedgeMethod ?? "rolling-ols")===mode?"primary":"secondary"} onPress={()=>{setMethodSettings(s=>({...s,hedgeMethod:mode}));clearError();}} />)}</View><Input label="Formation bars (30–400)" keyboardType="numeric" value={String(methodSettings.formationWindow ?? 252)} onChangeText={v=>{setMethodSettings(s=>({...s,formationWindow:Number(v)}));clearError();}} /><Input label="Trading bars (1–400)" keyboardType="numeric" value={String(methodSettings.tradingWindow ?? 63)} onChangeText={v=>{setMethodSettings(s=>({...s,tradingWindow:Number(v)}));clearError();}} /></Card> : null}
          <SectionLabel>Settings</SectionLabel>
          <Card>
            <Text style={styles.cardTitle}>Family parameters</Text>
            {familySettings(family).map((key) => (
              <Input
                key={key}
                label={settingMeta(key).label}
                value={draft[key]}
                onChangeText={(value) => setSetting(key, value)}
                keyboardType="numeric"
              />
            ))}
          </Card>
          <Card>
            <Text style={styles.cardTitle}>Assumptions</Text>
            <Text style={styles.note}>
              Costs are only the values you enter here. Zero explicitly excludes
              the assumption; no fixed exchange fee is inserted.
            </Text>
            {(
              (family === "making"
                ? ["feeBps", "slippageBps"]
                : [
                    "feeBps",
                    "slippageBps",
                    "startingEquity",
                  ]) as (NumericSetting)[]
            ).map((key) => (
              <Input
                key={key}
                label={settingMeta(key).label}
                value={draft[key]}
                onChangeText={(value) => setSetting(key, value)}
                keyboardType="numeric"
              />
            ))}
          </Card>
        </>
      ) : null}
      {error ? (
        <Card style={styles.errorCard}>
          <Text style={styles.errorText}>{error}</Text>
          <Text style={styles.meta}>
            Inputs are retained so you can correct them or retry without
            recreating the run.
          </Text>
        </Card>
      ) : null}

      <View style={styles.runActions}>
        <ActionButton
          label={run.isPending ? "Running model…" : "Run model"}
          icon="flask-outline"
          disabled={run.isPending}
          onPress={() => void runModel()}
        />
        {error ? (
          <ActionButton
            label="Retry"
            compact
            kind="secondary"
            disabled={run.isPending}
            onPress={() => void runModel()}
          />
        ) : null}
        <ActionButton
          label="Ask AI Coach"
          compact
          kind="secondary"
          icon="sparkles-outline"
          disabled={run.isPending}
          onPress={explain}
        />
        <ActionButton
          label="Feature guide"
          compact
          kind="secondary"
          icon="help-circle-outline"
          onPress={() => {
            onClose();
            router.navigate({
              pathname: "/features",
              params: { feature: family },
            } as never);
          }}
        />
      </View>
      {"error" in prepared && !error ? (
        <Text style={styles.note}>{prepared.error}</Text>
      ) : null}
      <Text style={styles.note}>
        Run Model fetches the selected real data and computes this model. It
        does not write records, submit paper orders, or call a broker.
      </Text>

      {response ? (
        <>
          <Text style={styles.imported}>
            Result received · {response.result.metrics.length} metrics ·{" "}
            {response.result.signals.length} candidates. Read the result below.
          </Text>
          <ResultPanel response={response} />
        </>
      ) : (
        <Card>
          <Text style={styles.cardTitle}>No completed model run yet</Text>
          <Text style={styles.meta}>
            Choose inputs and run the model. Validation remains pending until
            the service returns sample and holdout details.
          </Text>
        </Card>
      )}
    </Sheet>
  );
}

export default QuantWorkbench;

const styles = StyleSheet.create({
  cardHead: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  cardTitle: { color: C.text, fontSize: 14, fontWeight: "900" },
  detail: { color: C.text, fontSize: 11, lineHeight: 16 },
  meta: { color: C.muted, fontSize: 10, lineHeight: 15 },
  note: { color: C.amber, fontSize: 10, lineHeight: 15 },
  macroNotice: {
    color: C.rose,
    fontSize: 10,
    lineHeight: 15,
    fontWeight: "700",
  },
  familyChoices: { flexDirection: "row", flexWrap: "wrap", gap: 7 },
  selectedMarkets: { flexDirection: "row", flexWrap: "wrap", gap: 7 },
  marketChip: {
    minHeight: 38,
    justifyContent: "center",
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: C.lime + "88",
    borderRadius: 4,
    backgroundColor: C.lime + "16",
  },
  marketChipText: {
    color: C.lime,
    fontFamily: mono,
    fontSize: 11,
    fontWeight: "800",
  },
  pairWarning: {
    color: C.amber,
    fontSize: 10,
    lineHeight: 15,
    fontWeight: "800",
  },
  catalogResult: {
    minHeight: 46,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 4,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: C.black + "55",
  },
  catalogSymbol: {
    color: C.text,
    fontFamily: mono,
    fontSize: 13,
    fontWeight: "800",
  },
  addLabel: { color: C.lime, fontSize: 11, fontWeight: "900" },
  timeframeChoices: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 7,
    marginTop: 2,
  },
  imported: { color: C.mint, fontSize: 10, lineHeight: 15, fontFamily: mono },
  errorCard: { borderColor: C.rose + "AA", backgroundColor: C.rose + "0D" },
  errorText: { color: C.rose, fontSize: 11, lineHeight: 16, fontWeight: "800" },
  runActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    alignItems: "center",
  },
  metricGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  metric: {
    minWidth: "44%",
    flexGrow: 1,
    padding: 8,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.black + "44",
  },
  metricLabel: {
    color: C.muted,
    fontSize: 9,
    lineHeight: 13,
    fontWeight: "700",
  },
  metricValue: {
    color: C.text,
    fontFamily: mono,
    fontSize: 14,
    marginTop: 3,
    fontWeight: "800",
  },
  signal: {
    flexDirection: "row",
    gap: 10,
    paddingVertical: 8,
    borderBottomColor: C.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  signalTitle: {
    color: C.text,
    fontSize: 11,
    lineHeight: 16,
    fontWeight: "800",
  },
  signalTime: {
    color: C.muted,
    fontSize: 9,
    lineHeight: 14,
    maxWidth: 95,
    textAlign: "right",
  },
  bookTable: {
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 3,
    overflow: "hidden",
  },
  bookRow: {
    flexDirection: "row",
    paddingHorizontal: 7,
    paddingVertical: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: C.border,
  },
  bookHead: { backgroundColor: C.black + "77" },
  bookHeader: {
    color: C.muted,
    flex: 1,
    fontSize: 8,
    fontWeight: "800",
    fontFamily: mono,
  },
  bookValue: { flex: 1, fontSize: 9, fontFamily: mono },
  bookAsk: { textAlign: "right" },
  paperLeg: {
    paddingVertical: 7,
    borderBottomColor: C.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 2,
  },
  paperLegMain: {
    color: C.text,
    fontFamily: mono,
    fontSize: 11,
    fontWeight: "800",
  },
  detailTop: { marginTop: 6, fontWeight: "800" },
});
