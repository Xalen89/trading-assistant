import { sanitizeScenarioLayers } from "@/lib/trading/scenario-layer-storage";
import { TimeframeBiasTable } from "@/components/trading/timeframe-bias-table";
import { ScenarioLayerManager } from "@/components/trading/scenario-layer-manager";
import type { ScenarioLayer } from "@/lib/trading/scenario-layer-types";
import { trpc } from "@/lib/trpc";
import { persistMatchFeedback } from "@/lib/trading/match-feedback";
import {
  useEffect,
  useRef,
  useMemo,
  useState,
  useCallback,
  type SetStateAction,
} from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { CandleChart } from "@/components/trading/candle-chart";
import { Disclosure } from "@/components/trading/disclosure";
import {
  strategyIndicatorLayers,
  attachedIndicatorNames,
} from "@/lib/trading/strategy-indicators";
import { IndicatorCard } from "@/components/trading/indicator-card";
import { indicatorSnapshot } from "@/lib/trading/indicators";
import {
  boundedRequest,
  PROPOSAL_CLIENT_MS,
} from "@/lib/trading/request-deadline";
import { candleShapeObservations } from "@/lib/trading/pattern-catalog";
import { PaperPlanSheet } from "@/components/trading/paper-plan-sheet";
import { SetupPanel } from "@/components/trading/setup-panel";
import {
  ActionButton,
  Card,
  Divider,
  Header,
  IconButton,
  Input,
  Pill,
  Screen,
  SectionLabel,
  Sheet,
  ToggleRow,
} from "@/components/trading/ui";
import { C, formatAge, formatPrice, mono } from "@/components/trading/theme";
import { useWorkspace } from "@/hooks/use-workspace";
import {
  DISCLAIMER,
  uid,
  type Level,
  type Trade,
  type Timeframe,
} from "@/lib/trading/model";
import {
  mergeCanonicalPaperTrade,
  storedExecutionTimeframe,
} from "@/lib/trading/trade-chart";
import type { PaperProposal } from "@/lib/trading/setup-model";
import {
  confluence,
  gaps,
  sampleCandles,
  tradeMetrics,
} from "@/lib/trading/engine";
import {
  useMatchMutation,
  useVisualMatchMutation,
  useReferenceRevisionMutation,
  useAccumulatedCandles,
  useAlertEventQuery,
  useCandlesQuery,
  useCoinbaseTicker,
  useMarketContextQuery,
  usePaperProposalMutation,
  usePaperDetailQuery,
  useQuotesQuery,
  useSetupQuery,
  useTradingMarket,
} from "@/lib/trading/client";
import { useRouter, useLocalSearchParams } from "expo-router";
import { MarketContextTable } from "@/components/trading/market-context-table";
import { WeeklyContext } from "@/components/trading/weekly-context";
import { ResearchPanel } from "@/components/trading/research-panel";

const FRAMES: Timeframe[] = ["1m", "5m", "15m", "30m", "1h", "4h", "1d", "1w"];

export default function ChartScreen() {
  const {
    workspace,
    update,
    setTimeframe,
    saveCloud,
    loadCloud,
    cloudState,
    cloudMessage,
  } = useWorkspace();
  const safeScenarioLayers = useMemo(
    () => sanitizeScenarioLayers(workspace.settings.scenarioLayers),
    [workspace.settings.scenarioLayers],
  );
  const setScenarioLayers = useCallback(
    (action: SetStateAction<ScenarioLayer[]>) => {
      update((current) => ({
        ...current,
        settings: {
          ...current.settings,
          scenarioLayers:
            typeof action === "function"
              ? action(
                  sanitizeScenarioLayers(current.settings.scenarioLayers)
                    .layers,
                )
              : action,
        },
      }));
    },
    [update],
  );
  const router = useRouter(),
    sourceUtils = trpc.useUtils(),
    referenceRevision = useReferenceRevisionMutation(),
    matcher = useMatchMutation(),
    visual = useVisualMatchMutation();
  const [analysisState, setAnalysisState] = useState<string>();
  const [contextOpen, setContextOpen] = useState(false);
  const [factorsOpen, setFactorsOpen] = useState(false);
  const [levelOpen, setLevelOpen] = useState(false);
  const [levelName, setLevelName] = useState("Order block CE");
  const [levelPrice, setLevelPrice] = useState("");
  const [referencePatternId, setReferencePatternId] = useState<string>();
  const [paperOpen, setPaperOpen] = useState(false);
  const [paperSide, setPaperSide] = useState<"long" | "short">("long");
  const [paperProposal, setPaperProposal] =
    useState<import("@/lib/trading/setup-model").PaperProposal>();
  const [paperError, setPaperError] = useState<string>();
  const [paperPendingKey, setPaperPendingKey] = useState<string>();
  const [createdTrade, setCreatedTrade] = useState<Trade>();
  const routeParams = useLocalSearchParams<{
    alertId?: string;
    tradeId?: string;
    market?: string;
  }>();
  const alertEvidence = useAlertEventQuery(routeParams.alertId);
  // Detail is owner-protected. Do not infer an overlay from URL values or local strategy output.
  const paperDetail = usePaperDetailQuery(routeParams.tradeId);
  const requestedTradeMarket = routeParams.market?.trim() || undefined;
  const detailTrade = paperDetail.data?.trade;
  const syncedTrade = workspace.trades.find(
    (trade) => trade.id === routeParams.tradeId,
  );
  const routeTrade = detailTrade
    ? mergeCanonicalPaperTrade(syncedTrade, detailTrade)
    : undefined;
  const routeTradeMatchesRequest = Boolean(
    routeTrade &&
    routeTrade.id === routeParams.tradeId &&
    (!requestedTradeMarket || routeTrade.market === requestedTradeMarket),
  );
  const routeExecutionTimeframe = storedExecutionTimeframe(
    paperDetail.data?.proposal as PaperProposal | undefined,
  );
  const appliedTradeNavigation = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (!routeParams.tradeId) {
      appliedTradeNavigation.current = undefined;
      return;
    }
    if (!routeTradeMatchesRequest || !routeTrade) return;
    const navigationKey = `${routeParams.tradeId}:${requestedTradeMarket || routeTrade.market}`;
    if (appliedTradeNavigation.current === navigationKey) return;
    appliedTradeNavigation.current = navigationKey;
    if (
      workspace.market === routeTrade.market &&
      (!routeExecutionTimeframe ||
        workspace.timeframe === routeExecutionTimeframe)
    )
      return;
    update((current) => ({
      ...current,
      market: routeTrade.market,
      timeframe: routeExecutionTimeframe ?? current.timeframe,
    }));
  }, [
    routeTradeMatchesRequest,
    routeTrade,
    routeExecutionTimeframe,
    routeParams.tradeId,
    requestedTradeMarket,
    update,
    workspace.market,
    workspace.timeframe,
  ]);
  const market = useTradingMarket(workspace.market);
  const focusedTrade =
    routeTradeMatchesRequest && routeTrade?.market === market.id
      ? routeTrade
      : createdTrade &&
          createdTrade.market === market.id &&
          (!routeParams.tradeId || routeParams.tradeId === createdTrade.id)
        ? createdTrade
        : undefined;
  const activeStrategy =
    workspace.strategies.find(
      (item) => item.id === workspace.activeStrategyId,
    ) ?? workspace.strategies[0];
  const visibleStrategies = workspace.strategies.filter(
    (strategy) => strategy.visible && !strategy.archived,
  );
  const configuredIds =
    workspace.settings.analysisStrategyIds
      ?.filter((id) =>
        workspace.strategies.some(
          (strategy) => strategy.id === id && !strategy.archived,
        ),
      )
      .slice(0, 3) ?? [];
  const selectedStrategyIds = configuredIds.length
    ? configuredIds
    : activeStrategy
      ? [activeStrategy.id]
      : [];
  const selectedSnapshots = workspace.strategies.filter((s) =>
    selectedStrategyIds.includes(s.id),
  );
  const combination = workspace.settings.combination ?? "all";
  const riskPct = workspace.settings.paperRiskPct ?? 0.5;
  const setup = useSetupQuery(
    {
      market: market.id,
      timeframe: workspace.timeframe,
      strategyIds: selectedStrategyIds,
      strategies: selectedSnapshots,
      combination,
      timezone: workspace.settings.timezone,
    },
    !workspace.settings.sampleMode && selectedStrategyIds.length > 0,
  );
  const liveAnalysis = setup.data;
  const [showCaptured, setShowCaptured] = useState(true);
  const analysis =
    routeParams.alertId && showCaptured && alertEvidence.data?.setup
      ? alertEvidence.data.setup
      : liveAnalysis;
  const drawingAnalysis = analysis
    ? {
        ...analysis,
        candidates: analysis.candidates.map((c) => ({
          ...c,
          zones: visibleStrategies.some((s) => s.id === c.strategyId)
            ? c.zones
            : [],
        })),
      }
    : undefined;
  const source = trpc.sourcePreview.page.useQuery(
    { sourceId: referencePatternId || "", page: 1, maxDimension: 1200 },
    { enabled: Boolean(referencePatternId), retry: false },
  );
  const proposalMutation = usePaperProposalMutation();
  const quotes = useQuotesQuery([market.id]);
  const quote = (quotes.data ?? []).find(
    (item: any) =>
      item.symbol === market.id || item.symbol === market.providerSymbol,
  );
  const candleQuery = useCandlesQuery(
    market.id,
    workspace.timeframe,
    !workspace.settings.sampleMode,
  );
  const ticker = useCoinbaseTicker(
    market.provider === "coinbase" && !workspace.settings.sampleMode
      ? market.id
      : "",
    true,
  );
  const context = useMarketContextQuery();
  const serverCandles = useMemo(
    () => candleQuery.data?.candles ?? [],
    [candleQuery.data],
  );
  const liveCandles = useAccumulatedCandles(
    serverCandles,
    ticker,
    workspace.timeframe,
    market.id,
  );
  const candles = useMemo(
    () =>
      workspace.settings.sampleMode
        ? sampleCandles(
            quote?.price && quote.price > 0
              ? quote.price
              : market.category === "Forex"
                ? 1.2
                : market.id === "XAUUSD"
                  ? 2500
                  : market.category === "Futures"
                    ? 20000
                    : 60000,
            workspace.timeframe,
          )
        : liveCandles,
    [
      workspace.settings.sampleMode,
      workspace.timeframe,
      quote,
      liveCandles,
      market,
    ],
  );
  const manualScore = activeStrategy
    ? confluence(activeStrategy, workspace.confirmations)
    : { score: 0, count: 0, total: 0, earned: 0, possible: 0 };
  const automaticConfluences = analysis?.confluences ?? [];
  const automaticMet = automaticConfluences.filter(
    (step) => step.status === "met",
  ).length;
  const automaticWaiting = automaticConfluences.filter(
    (step) => step.status === "waiting",
  ).length;
  const setupStatus = workspace.settings.sampleMode
    ? "SAMPLE MODE"
    : setup.error instanceof Error
      ? "UNAVAILABLE"
      : setup.isLoading || setup.isFetching
        ? "CHECKING"
        : analysis
          ? `${automaticMet}/${automaticConfluences.length} MET`
          : "NO ANALYSIS";
  const setupStatusTone = workspace.settings.sampleMode
    ? "amber"
    : setup.error instanceof Error
      ? "rose"
      : setup.isLoading || setup.isFetching
        ? "amber"
        : analysis && automaticMet
          ? "mint"
          : "muted";
  const setupStatusDetail = workspace.settings.sampleMode
    ? "Automatic setup evidence is unavailable in Sample mode."
    : setup.error instanceof Error
      ? `Setup unavailable: ${setup.error.message}`
      : setup.isLoading || setup.isFetching
        ? "Checking completed provider bars. A live price does not make setup evidence live."
        : analysis
          ? `${automaticWaiting} waiting · ${automaticConfluences.filter((step) => step.status === "unknown").length} unknown. Evidence is not trade eligibility.`
          : "No completed setup analysis is available; no condition is treated as passed.";
  const displayedIndicatorSnapshot = useMemo(() => {
    if (routeParams.alertId && showCaptured && alertEvidence.data?.setup)
      return alertEvidence.data.setup.indicators;
    if (workspace.settings.sampleMode) return undefined;
    return (
      analysis?.indicators ||
      indicatorSnapshot(
        candles,
        workspace.timeframe,
        candleQuery.data?.source || "Source checking",
        candleQuery.data?.fetchedAt || 0,
      )
    );
  }, [
    routeParams.alertId,
    showCaptured,
    alertEvidence.data,
    workspace.settings.sampleMode,
    analysis,
    candles,
    workspace.timeframe,
    candleQuery.data,
  ]);
  const shapeObservations = candleShapeObservations(
    workspace.settings.sampleMode ? [] : analysis?.candles || [],
  );
  const indicatorStrategies = selectedSnapshots.filter(
    (s) => s.visible && !s.archived,
  );
  const indicatorLayers =
    routeParams.alertId && showCaptured && analysis?.attachedIndicators
      ? analysis.attachedIndicators
      : strategyIndicatorLayers(indicatorStrategies);
  const attachedNames = attachedIndicatorNames(indicatorLayers);
  const numericalVisible = attachedNames.length > 0;
  const capturedScenarioVisible = Boolean(
    routeParams.alertId && showCaptured && analysis?.scenario,
  );
  const historicalVisible =
    workspace.settings.futureOverlay || capturedScenarioVisible;
  const visibleLevels = workspace.levels.filter(
    (level) =>
      level.market === market.id &&
      visibleStrategies.some((strategy) => strategy.id === level.strategyId),
  );
  const displayMatches = workspace.matches.filter(
    (match) =>
      match.market === market.id &&
      match.timeframe === workspace.timeframe &&
      visibleStrategies.some((strategy) => strategy.id === match.strategyId),
  );
  const referenceChoices = workspace.patterns.filter(
    (pattern) =>
      pattern.status === "ready" &&
      pattern.mime?.startsWith("image/") &&
      (pattern.market === market.id ||
        displayMatches.some((match) => match.patternId === pattern.id)),
  );
  const selectedReference = referenceChoices.find(
    (pattern) => pattern.id === referencePatternId,
  );
  const referenceImage =
    source.data && selectedReference
      ? {
          uri: `data:${source.data.mime};base64,${source.data.base64}`,
          label: selectedReference.name,
        }
      : undefined;
  const reviewMatch = async (id: string, accepted: boolean, at: number) => {
    if (referenceRevision.isPending) return;
    const match = workspace.matches.find((m) => m.id === id);
    if (!match) return;
    try {
      const result = await persistMatchFeedback(
        match,
        accepted,
        at,
        (sourceId) =>
          sourceUtils.learning.definition.fetch(
            { id: sourceId },
            { staleTime: 0 },
          ),
        (pattern, expectedVersion) =>
          referenceRevision.mutateAsync({ pattern, expectedVersion }),
      );
      update((w) => ({
        ...w,
        matches: w.matches.map((m) =>
          m.id === id ? { ...m, status: result.status } : m,
        ),
        patterns: w.patterns.some((p) => p.id === result.pattern.id)
          ? w.patterns.map((p) =>
              p.id === result.pattern.id ? result.pattern : p,
            )
          : [...w.patterns, result.pattern],
      }));
    } catch (e) {
      setAnalysisState(
        e instanceof Error
          ? e.message
          : "Feedback could not be saved. Match status was not changed.",
      );
    }
  };
  const fvgCount = gaps(candles).length;
  const automaticLevels: Level[] = (analysis?.levels ?? []).filter(
    (l) =>
      l.strategyId !== "daily-profile" &&
      visibleStrategies.some((s) => s.id === l.strategyId),
  );
  const providerDayLevels: Level[] =
    analysis?.previousDay && workspace.overlays.pdh
      ? [
          {
            id: "provider-pdh",
            strategyId: selectedStrategyIds[0] ?? "setup",
            market: market.id,
            name: "PDH · provider day",
            price: analysis.previousDay.high,
            color: C.blue,
          },
          {
            id: "provider-pdl",
            strategyId: selectedStrategyIds[0] ?? "setup",
            market: market.id,
            name: "PDL · provider day",
            price: analysis.previousDay.low,
            color: C.blue,
          },
        ]
      : [];
  const chartLevels: Level[] = [
    ...(workspace.overlays.levels ? visibleLevels : []),
    ...automaticLevels,
    ...providerDayLevels,
  ];
  const livePrice =
    ticker?.price ??
    (quote?.status !== "unavailable" && quote?.price && quote.price > 0
      ? quote.price
      : undefined);

  const watchDirection = () => {
    if (!selectedStrategyIds.length) return;
    const scope = [...selectedStrategyIds].sort().join("|");
    const existing = workspace.alerts.find(
      (r) =>
        r.kind === "scenario-direction" &&
        r.market === market.id &&
        r.timeframe === workspace.timeframe &&
        [
          ...(r.combinedStrategyIds?.length
            ? r.combinedStrategyIds
            : [r.strategyId]),
        ]
          .sort()
          .join("|") === scope,
    );
    if (!existing && workspace.alerts.length >= 100) {
      setAnalysisState(
        "Alert capacity reached (100). Remove an unused rule in Alerts before creating another; no rule was discarded.",
      );
      return;
    }
    if (existing)
      update((w) => ({
        ...w,
        alerts: w.alerts.map((r) =>
          r.id === existing.id ? { ...r, enabled: true } : r,
        ),
      }));
    else
      update((w) => ({
        ...w,
        alerts: [
          {
            id: uid("alert"),
            name: `${market.providerSymbol} · historical direction`,
            market: market.id,
            timeframe: workspace.timeframe,
            strategyId: selectedStrategyIds[0],
            combinedStrategyIds: selectedStrategyIds,
            kind: "scenario-direction",
            price: 0,
            enabled: true,
            cooldownMinutes: 1,
            createdAt: Date.now(),
          },
          ...w.alerts,
        ],
      }));
    setAnalysisState(
      "Direction watch enabled locally. Save rules to cloud in Alerts, then activate your native device/deployed scans. First observation seeds the baseline.",
    );
  };

  const setOverlay = (key: string, value: boolean) =>
    update((current) => ({
      ...current,
      overlays: { ...current.overlays, [key]: value },
    }));
  const setAnalysisStrategyIds = (ids: string[]) =>
    update((current) => ({
      ...current,
      settings: { ...current.settings, analysisStrategyIds: ids.slice(0, 3) },
    }));
  const setCombination = (value: "all" | "any") =>
    update((current) => ({
      ...current,
      settings: { ...current.settings, combination: value },
    }));
  const setRiskPct = (value: number) => {
    update((current) => ({
      ...current,
      settings: { ...current.settings, paperRiskPct: value },
    }));
    void requestProposal(paperSide, value);
  };
  const addLevel = () => {
    const price = Number(levelPrice);
    if (!Number.isFinite(price) || price <= 0 || !activeStrategy) return;
    const level: Level = {
      id: `level_${Date.now()}`,
      strategyId: activeStrategy.id,
      market: market.id,
      name: levelName.trim() || "Manual level",
      price,
      color: C.amber,
    };
    update((current) => ({ ...current, levels: [...current.levels, level] }));
    setLevelOpen(false);
  };
  const requestEpoch = useRef(0),
    contextKey = JSON.stringify([
      market.id,
      workspace.timeframe,
      selectedSnapshots.map((s) => [s.id, s.version]),
      combination,
    ]);
  useEffect(() => {
    requestEpoch.current++;
  }, [contextKey]);
  const requestProposal = async (
    side: "long" | "short",
    nextRisk = riskPct,
  ) => {
    const ticket = ++requestEpoch.current;
    setPaperSide(side);
    setPaperOpen(true);
    setPaperProposal(undefined);
    setPaperError(undefined);
    setPaperPendingKey(contextKey);
    if (workspace.settings.sampleMode) {
      setPaperError(
        "Disable Sample mode before requesting a server paper proposal. Demo bars cannot create a plan.",
      );
      setPaperPendingKey(undefined);
      return;
    }
    try {
      const proposal = await boundedRequest(
        proposalMutation.mutateAsync({
          market: market.id,
          timeframe: workspace.timeframe,
          strategyIds: selectedStrategyIds,
          strategies: selectedSnapshots,
          combination,
          timezone: workspace.settings.timezone,
          side,
          balance:
            workspace.paperStartingBalance +
            workspace.trades.reduce(
              (sum, t) =>
                sum +
                (t.status === "cancelled"
                  ? 0
                  : t.status === "closed"
                    ? tradeMetrics(t).pnl || 0
                    : t.realizedPnl || 0),
              0,
            ),
          riskPct: nextRisk,
        }),
        PROPOSAL_CLIENT_MS,
        "Paper proposal did not return within35seconds. Check your browser/API connection and tap Retry. No paper order was created.",
      );
      if (ticket === requestEpoch.current) setPaperProposal(proposal);
    } catch (error) {
      if (ticket === requestEpoch.current)
        setPaperError(
          error instanceof Error
            ? error.message
            : "Unable to obtain a fresh paper proposal. No local bracket was created.",
        );
    } finally {
      if (ticket === requestEpoch.current) setPaperPendingKey(undefined);
    }
  };

  const analyze = async () => {
    const ready = workspace.patterns.filter(
      (pattern) => pattern.status === "ready",
    );
    if (!activeStrategy || !candles.length || !ready.length) {
      setAnalysisState(
        ready.length
          ? "Live bars are required before analysis."
          : "Add and review a reference in My Library before AI analysis.",
      );
      return;
    }
    setAnalysisState(
      "Comparing reviewed references with the active candle window…",
    );
    try {
      const result = await matcher.mutateAsync({
        patterns: ready,
        strategy: activeStrategy,
        candles,
        market: market.id,
        timeframe: workspace.timeframe,
      });
      update((current) => ({
        ...current,
        matches: [
          ...current.matches.filter(
            (match) =>
              match.market !== market.id ||
              match.timeframe !== workspace.timeframe ||
              match.strategyId !== activeStrategy.id ||
              match.status !== "candidate",
          ),
          ...result,
        ],
      }));
      setAnalysisState(
        `${result.length} reference candidate${result.length === 1 ? "" : "s"} returned. Visual confidence is not a success probability.`,
      );
    } catch (error) {
      setAnalysisState(
        error instanceof Error
          ? error.message
          : "Analysis is unavailable; no match was invented.",
      );
    }
  };

  const analyzeVisual = async () => {
    if (workspace.settings.sampleMode)
      return setAnalysisState(
        "Disable Sample mode for actual feed image matching.",
      );
    try {
      const r = await visual.mutateAsync({
        market: market.id,
        timeframe: workspace.timeframe,
        strategyId: activeStrategy.id,
        strategyVersion: activeStrategy.version,
      });
      update((w) => ({
        ...w,
        matches: [
          ...w.matches.filter(
            (m) =>
              m.method !== "opencv" ||
              m.status !== "candidate" ||
              m.market !== market.id ||
              m.strategyId !== activeStrategy.id,
          ),
          ...r.matches,
        ],
      }));
      setAnalysisState(
        `${r.search.examined} reviewed visual references; ${r.matches.length} shape neighbors. ${r.search.limitations}`,
      );
    } catch (e) {
      setAnalysisState(
        e instanceof Error ? e.message : "Visual search unavailable.",
      );
    }
  };
  return (
    <Screen
      pinned={
        <WeeklyContext
          analysis={analysis}
          timezone={workspace.settings.timezone}
          precision={market.precision}
        />
      }
    >
      <Header
        title="Chart"
        subtitle="Paper workspace · closed-bar evidence"
        right={
          <View style={{ flexDirection: "row", gap: 6 }}>
            <IconButton
              icon="chatbubble-ellipses-outline"
              label="Ask AI Coach"
              onPress={() => router.navigate("/coach")}
            />
            <IconButton
              icon="options-outline"
              label="Open context"
              onPress={() => setContextOpen(true)}
            />
          </View>
        }
      />
      {routeParams.tradeId ? (
        <Card>
          {focusedTrade ? (
            <>
              <Pill
                label={`PAPER · ${focusedTrade.side.toUpperCase()} · ${focusedTrade.status.toUpperCase()} · MANAGEMENT ${focusedTrade.autoManage ? "ON" : "OFF"}`}
                tone="amber"
              />
              <Text style={styles.provenance}>
                Saved entry and working bracket are shown on this exact market
                scale. Original levels remain marked only when a saved revision
                changed them.
              </Text>
            </>
          ) : paperDetail.isLoading ? (
            <Text style={styles.provenance}>
              Loading the owner-authorized paper trade for this chart…
            </Text>
          ) : (
            <Text style={styles.errorText}>
              {paperDetail.error?.message ||
                "This paper trade is unavailable for the requested market. No bracket levels were shown."}
            </Text>
          )}
        </Card>
      ) : null}
      {routeParams.alertId ? (
        <Card>
          <Pill label="TRIGGERED ALERT · CAPTURED EVIDENCE" tone="amber" />
          {alertEvidence.data ? (
            <>
              <Text style={styles.cardTitle}>{alertEvidence.data.title}</Text>
              <Text style={styles.cardDetail}>
                {alertEvidence.data.source} · strategy v
                {alertEvidence.data.strategyVersion || "not recorded"} ·{" "}
                {new Date(alertEvidence.data.createdAt).toLocaleString()}
              </Text>
              {alertEvidence.data.evidence?.map((e, index) => (
                <Text key={index} style={styles.provenance}>
                  {e}
                </Text>
              ))}
            </>
          ) : (
            <Text style={styles.provenance}>
              {alertEvidence.error?.message ||
                "Loading owner-authorized captured alert record…"}
            </Text>
          )}
          <Text style={styles.provenance}>
            Captured evidence and shape can be viewed independently of the live
            chart.
          </Text>
          {alertEvidence.data?.setup ? (
            <ToggleRow
              label="Show captured alert candles and scenario"
              value={showCaptured}
              onChange={setShowCaptured}
            />
          ) : null}
        </Card>
      ) : null}
      <Card style={styles.marketCard}>
        <View style={styles.marketTop}>
          <View>
            <Text style={styles.symbol}>{market.providerSymbol}</Text>
            <Text style={styles.marketName}>
              {market.name} ·{" "}
              {market.provider === "coinbase"
                ? "Coinbase public"
                : market.provider === "fmp"
                  ? "FMP server feed"
                  : market.provider === "tradelocker"
                    ? "Private TradeLocker"
                    : "Feed pending"}
            </Text>
          </View>
          <Pill
            label={
              workspace.settings.sampleMode
                ? "SAMPLE"
                : quote?.status === "live" || ticker
                  ? market.provider === "tradelocker"
                    ? "POLLED"
                    : "LIVE"
                  : (quote?.status?.toUpperCase() ?? "CHECKING")
            }
            tone={
              workspace.settings.sampleMode
                ? "amber"
                : quote?.status === "unavailable"
                  ? "rose"
                  : "mint"
            }
          />
        </View>
        <View style={styles.priceRow}>
          <Text style={styles.price}>
            {formatPrice(livePrice, market.precision)}
          </Text>
          <View>
            <Text
              style={[
                styles.change,
                { color: (quote?.change ?? 0) >= 0 ? C.mint : C.rose },
              ]}
            >
              {quote && quote.changeAvailable !== false
                ? `${quote.change >= 0 ? "+" : ""}${quote.change.toFixed(2)}%`
                : "—"}
            </Text>
            <Text style={styles.source} numberOfLines={1}>
              {ticker
                ? ticker.source
                : quote
                  ? `${quote.source} · ${quote.timestampKind === "received" ? "received " : ""}${formatAge(quote.timestamp)}`
                  : quotes.error?.message || "Awaiting source"}
            </Text>
          </View>
        </View>
        {market.provider === "tradelocker" ? (
          <Text style={styles.provenance}>
            Private REST quotes ~15s; broker candles retain their BID/ASK basis.
            The visible price is not a synthetic candle.
          </Text>
        ) : null}
        {!workspace.settings.sampleMode && quote?.status === "unavailable" ? (
          <View style={styles.connect}>
            <Ionicons name="cloud-offline-outline" size={16} color={C.amber} />
            <Text style={styles.connectText}>
              Quote source unavailable. Retry the provider or select another
              connected market. Sample mode is separate practice data.
            </Text>
          </View>
        ) : null}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.rail}
        >
          {FRAMES.map((frame) => (
            <Pressable
              key={frame}
              onPress={() => setTimeframe(frame)}
              style={[
                styles.frame,
                workspace.timeframe === frame && styles.frameActive,
              ]}
            >
              <Text
                style={[
                  styles.frameText,
                  workspace.timeframe === frame && styles.frameTextActive,
                ]}
              >
                {frame}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      </Card>
      <Card style={styles.chartCard}>
        <View style={styles.chartCaption}>
          <Text style={styles.caption}>
            {workspace.settings.sampleMode
              ? "SAMPLE CANDLES"
              : "HISTORICAL CANDLES + ZONES"}
          </Text>
          <Text style={styles.captionRight}>
            {workspace.settings.sampleMode
              ? "Explicit sample"
              : candleQuery.isFetching
                ? "Refreshing…"
                : `Historical · ${candleQuery.data?.status ?? "checking"}`}
          </Text>
        </View>
        {candleQuery.isLoading && !workspace.settings.sampleMode ? (
          <View style={styles.loading}>
            <ActivityIndicator color={C.lime} />
            <Text style={styles.loadingText}>Loading server candles…</Text>
          </View>
        ) : (
          <CandleChart
            candles={
              routeParams.alertId && showCaptured && alertEvidence.data?.setup
                ? alertEvidence.data.setup.candles
                : candles
            }
            market={market.id}
            timeframe={workspace.timeframe}
            precision={market.precision}
            sessionOverlay={workspace.settings.chartSessions}
            onSessionOverlayChange={(preferences) =>
              update((current) => ({
                ...current,
                settings: { ...current.settings, chartSessions: preferences },
              }))
            }
            levels={chartLevels}
            showFvg={
              Boolean(workspace.overlays.fvg) &&
              visibleStrategies.some((strategy) =>
                strategy.factors.some(
                  (factor) =>
                    factor.enabled && /fvg/i.test(factor.id + factor.name),
                ),
              )
            }
            showRanges={
              Boolean(workspace.overlays.ranges) && visibleStrategies.length > 0
            }
            showLevels={chartLevels.length > 0}
            scenarioLayers={
              !workspace.settings.sampleMode &&
              !(routeParams.alertId && showCaptured)
                ? safeScenarioLayers.layers
                : undefined
            }
            future={historicalVisible}
            analysis={drawingAnalysis}
            scenarioStyle={workspace.settings.scenarioStyle ?? "both"}
            indicators={displayedIndicatorSnapshot}
            indicatorLayers={indicatorLayers}
            referenceImage={referenceImage}
            focusedTrade={focusedTrade}
            onBuy={() => void requestProposal("long")}
            onSell={() => void requestProposal("short")}
          />
        )}
        {!workspace.settings.sampleMode && candleQuery.isError ? (
          <Text style={styles.errorText}>
            {candleQuery.error instanceof Error
              ? candleQuery.error.message
              : "Live historical bars are unavailable."}
          </Text>
        ) : null}
      </Card>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.strategyRail}
      >
        {workspace.strategies
          .filter((strategy) => !strategy.archived)
          .map((strategy) => (
            <Pressable
              key={strategy.id}
              onPress={() =>
                update((current) => ({
                  ...current,
                  activeStrategyId: strategy.id,
                  strategies: current.strategies.map((s) =>
                    s.id === strategy.id ? { ...s, visible: true } : s,
                  ),
                  settings: {
                    ...current.settings,
                    analysisStrategyIds: [strategy.id],
                  },
                }))
              }
              style={[
                styles.strategyChip,
                activeStrategy?.id === strategy.id && {
                  borderColor: strategy.color,
                  backgroundColor: strategy.color + "18",
                },
              ]}
            >
              <View style={[styles.dot, { backgroundColor: strategy.color }]} />
              <Text style={styles.strategyText}>{strategy.name}</Text>
              <Text style={styles.version}>v{strategy.version}</Text>
            </Pressable>
          ))}
      </ScrollView>
      <Card style={styles.confluenceCard}>
        <View style={styles.confluenceHead}>
          <View style={{ flex: 1 }}>
            <Text style={styles.compactLabel}>
              AUTOMATIC CONFLUENCE · CLOSED BARS
            </Text>
            <Text style={styles.confluenceStatus}>{setupStatus}</Text>
          </View>
          <Pill label={setupStatus} tone={setupStatusTone} />
        </View>
        <Text
          style={[
            styles.confluenceDetail,
            setup.error instanceof Error && { color: C.rose },
          ]}
        >
          {setupStatusDetail}
        </Text>
      </Card>
      <Disclosure
        title="Setup evidence & rulebooks"
        summary="Choose up to three rulebooks, inspect closed-bar evidence, history, and source detail"
      >
        <SetupPanel
          strategies={workspace.strategies}
          selectedIds={selectedStrategyIds}
          combination={combination}
          analysis={analysis}
          loading={setup.isLoading || setup.isFetching}
          error={setup.error instanceof Error ? setup.error.message : undefined}
          sampleMode={workspace.settings.sampleMode}
          precision={market.precision}
          onSelectedIdsChange={setAnalysisStrategyIds}
          onCombinationChange={setCombination}
        />
      </Disclosure>
      {numericalVisible ? (
        <Disclosure
          title="Indicators & formulas"
          summary="Strategy-attached values, warm-up states, and closed-bar source formulas"
        >
          <Text style={styles.provenance}>
            Attached to selected visible strategy: {attachedNames.join(" · ")}.
            Tools follow strategy visibility automatically.
          </Text>
          <IndicatorCard
            snapshot={displayedIndicatorSnapshot}
            precision={market.precision}
            layers={indicatorLayers}
          />
        </Disclosure>
      ) : null}
      <Disclosure
        title="Candle observations"
        summary="Latest closed-bar morphology only; not a signal or ready trade"
      >
        {shapeObservations.length ? (
          shapeObservations.map((shape, i) => (
            <View key={i}>
              <Text style={styles.cardDetail}>
                {shape.name} · {shape.side}
              </Text>
              <Text style={styles.provenance}>{shape.evidence}</Text>
            </View>
          ))
        ) : (
          <Text style={styles.provenance}>
            No supported latest closed-candle shape observation. This is not a
            missing signal or a ready trade.
          </Text>
        )}
        <Text style={styles.provenance}>
          Shapes are explicit app morphology, not TA-Lib-equivalent thresholds,
          reviewed photo matches or strategy confluence. A library name does not
          automatically train live recognition.
        </Text>
        <ActionButton
          label="Open pattern catalog / uploads"
          compact
          kind="secondary"
          onPress={() => router.navigate("/library")}
        />
      </Disclosure>
      <Disclosure
        title="Reference picture / template"
        summary={
          referenceImage
            ? "Protected owner-authorized source is loaded for the chart"
            : "Optional owner-authorized source image; never price/time recognition"
        }
        defaultOpen={Boolean(referencePatternId && source.error)}
      >
        <View style={styles.matchHead}>
          <View>
            <Text style={styles.cardTitle}>Reference image / template</Text>
            <Text style={styles.cardDetail}>
              Select only an owner-authorized source image. It preserves
              pixels/aspect ratio and is labelled reference, not price/time
              recognition.
            </Text>
          </View>
          <Pill
            label={referenceImage ? "SOURCE LOADED" : "OPTIONAL"}
            tone={referenceImage ? "mint" : "muted"}
          />
        </View>
        {referenceChoices.length ? (
          <View style={styles.choices}>
            <ActionButton
              label="No reference"
              compact
              kind={!referencePatternId ? "primary" : "secondary"}
              onPress={() => setReferencePatternId(undefined)}
            />
            {referenceChoices.map((pattern) => (
              <ActionButton
                key={pattern.id}
                label={pattern.name.slice(0, 24)}
                compact
                kind={
                  referencePatternId === pattern.id ? "primary" : "secondary"
                }
                onPress={() => setReferencePatternId(pattern.id)}
              />
            ))}
          </View>
        ) : (
          <Text style={styles.provenance}>
            No reviewed, matching image source is available for this
            market/timeframe. Upload and review one in My Library.
          </Text>
        )}
        {referencePatternId && source.isLoading ? (
          <Text style={styles.provenance}>
            Requesting protected source image…
          </Text>
        ) : null}
        {referencePatternId && source.error ? (
          <Text style={styles.errorText}>{source.error.message}</Text>
        ) : null}
      </Disclosure>
      {referencePatternId && source.error ? (
        <Text style={styles.errorText}>{source.error.message}</Text>
      ) : null}
      <TimeframeBiasTable
        onExitSampleMode={() =>
          update((w) => ({
            ...w,
            settings: { ...w.settings, sampleMode: false },
          }))
        }
        market={market.id}
        disabled={workspace.settings.sampleMode}
      />
      {safeScenarioLayers.invalidCount > 0 ? (
        <Text style={styles.errorText}>
          Invalid saved scenario entries were ignored. Your next layer change
          repairs the stored list; other workspace records were not changed.
        </Text>
      ) : null}
      {(["ai", "historical"] as const).map((kind) => (
        <ScenarioLayerManager
          key={`layers:${kind}:${market.id}`}
          kind={kind}
          market={market.id}
          timeframe={workspace.timeframe}
          strategyId={workspace.activeStrategyId}
          strategyIds={selectedStrategyIds}
          strategies={workspace.strategies}
          combination={workspace.settings.combination ?? "all"}
          timezone={workspace.settings.timezone}
          disabled={workspace.settings.sampleMode}
          layers={safeScenarioLayers.layers}
          onChange={setScenarioLayers}
        />
      ))}
      <Disclosure
        title="Current historical replay"
        summary={
          historicalVisible
            ? "Source replay is visible on the chart; it is not a forecast"
            : "Optional source replay when completed history is available"
        }
      >
        <ToggleRow
          label="Historical source scenario"
          detail="Available with every selected strategy when real history exists. Strategy-matched case when possible, otherwise explicitly labeled context replay; never a forecast."
          value={historicalVisible}
          onChange={(value) => {
            if (!value && capturedScenarioVisible) setShowCaptured(false);
            update((current) => ({
              ...current,
              settings: { ...current.settings, futureOverlay: value },
            }));
          }}
        />
        <ActionButton
          label="Notify me when scenario direction flips"
          kind="secondary"
          compact
          onPress={watchDirection}
          disabled={
            workspace.settings.sampleMode || !selectedStrategyIds.length
          }
        />
        {historicalVisible ? (
          <View style={styles.choices}>
            {(["line", "candles", "both"] as const).map((style) => (
              <ActionButton
                key={style}
                compact
                label={
                  style === "line"
                    ? "Line"
                    : style === "candles"
                      ? "Ghost OHLC"
                      : "Both"
                }
                kind={
                  (workspace.settings.scenarioStyle ?? "both") === style
                    ? "primary"
                    : "secondary"
                }
                onPress={() =>
                  update((current) => ({
                    ...current,
                    settings: { ...current.settings, scenarioStyle: style },
                  }))
                }
              />
            ))}
          </View>
        ) : null}
      </Disclosure>
      <Disclosure
        title="Chart tools & levels"
        summary={`${fvgCount} deterministic gaps · manual levels and provider-day markers remain source-scoped`}
      >
        <ToggleRow
          label="Regular FVG + CE zones"
          detail={`${fvgCount} deterministic three-bar gaps. Automatic setup zones are drawn separately with their source.`}
          value={Boolean(workspace.overlays.fvg)}
          onChange={(value) => setOverlay("fvg", value)}
        />
        <Divider />
        <ToggleRow
          label="Range quarters + OTE"
          detail="Visible-bar ratios; separate from automatic setup evidence."
          value={Boolean(workspace.overlays.ranges)}
          onChange={(value) => setOverlay("ranges", value)}
        />
        <Divider />
        <ToggleRow
          label="Manual named levels"
          detail={`${visibleLevels.length} user levels from independently visible strategies`}
          value={Boolean(workspace.overlays.levels)}
          onChange={(value) => setOverlay("levels", value)}
        />
        <Divider />
        <ToggleRow
          label="Previous provider day PDH / PDL"
          detail={
            analysis?.previousDay
              ? analysis.previousDay.source
              : "Unavailable until a completed provider daily bar is returned."
          }
          value={Boolean(workspace.overlays.pdh)}
          onChange={(value) => setOverlay("pdh", value)}
        />
        <ActionButton
          label="Add named level"
          compact
          kind="secondary"
          onPress={() => {
            if (livePrice && !levelPrice) setLevelPrice(String(livePrice));
            setLevelOpen(true);
          }}
        />
      </Disclosure>
      {analysisState ? (
        <Card style={styles.scoreCard}>
          <Pill
            label={matcher.isPending ? "ANALYZING" : "REFERENCE-BASED"}
            tone="amber"
          />
          <Text style={styles.cardDetail}>{analysisState}</Text>
        </Card>
      ) : null}
      <Disclosure
        title="Reference matching"
        summary={`${displayMatches.length} current reviewed match${displayMatches.length === 1 ? "" : "es"} · similarity is not a probability`}
      >
        <ActionButton
          label={
            visual.isPending
              ? "Comparing image vectors…"
              : "Compare live chart geometry"
          }
          kind="secondary"
          onPress={analyzeVisual}
          disabled={
            visual.isPending || !candles.length || workspace.settings.sampleMode
          }
        />
        {displayMatches.map((match) => (
          <Card key={match.id}>
            <Pill
              label={`${match.status.toUpperCase()} · ${match.method === "opencv" ? "CV SHAPE NEIGHBOR" : "AI REFERENCE MATCH"}`}
              tone="amber"
            />
            <Text style={styles.cardTitle}>{match.name}</Text>
            <Text style={styles.cardDetail}>
              {
                workspace.strategies.find((s) => s.id === match.strategyId)
                  ?.name
              }{" "}
              v{match.strategyVersion} · {match.market} {match.timeframe}
            </Text>
            {match.confidence !== undefined ? (
              <Text style={styles.provenance}>
                Visual/rule similarity {match.confidence.toFixed(0)}/100 — not
                trade success probability
              </Text>
            ) : null}
            {match.evidence.map((e, i) => (
              <Text key={i} style={styles.cardDetail}>
                Evidence: {e}
              </Text>
            ))}
            {match.missing.map((e, i) => (
              <Text key={i} style={styles.provenance}>
                Missing: {e}
              </Text>
            ))}
            <View style={styles.choices}>
              <ActionButton
                label="Confirm pattern"
                compact
                kind="secondary"
                onPress={() => reviewMatch(match.id, true, Date.now())}
              />
              <ActionButton
                label="Reject pattern"
                compact
                kind="danger"
                onPress={() => reviewMatch(match.id, false, Date.now())}
              />
              <ActionButton
                label="Source & trainer"
                compact
                kind="secondary"
                onPress={() =>
                  router.navigate({
                    pathname: "/library",
                    params: { patternId: match.patternId || "" },
                  })
                }
              />
            </View>
          </Card>
        ))}
        <ActionButton
          label={
            matcher.isPending
              ? "Analyzing reviewed sources…"
              : "AI compare reviewed sources"
          }
          kind="secondary"
          onPress={analyze}
          disabled={
            matcher.isPending ||
            !candles.length ||
            workspace.settings.sampleMode
          }
        />
      </Disclosure>
      <Disclosure
        title="Manual confluence & overlays"
        summary={`${manualScore.count}/${manualScore.total} manual confirmations · visibility stays independent from analysis`}
      >
        <Text style={styles.cardDetail}>
          {manualScore.earned}/{manualScore.possible} enabled manual weight. It
          does not alter automatic setup evidence.
        </Text>
        <ActionButton
          label="Review manual factors"
          compact
          kind="secondary"
          onPress={() => setFactorsOpen(true)}
        />
        <Divider />
        <Text style={styles.cardTitle}>Strategy overlay visibility</Text>
        {workspace.strategies
          .filter((strategy) => !strategy.archived)
          .map((strategy) => (
            <ToggleRow
              key={strategy.id}
              label={`${strategy.name} overlays`}
              detail="Visibility does not select it for automatic analysis."
              value={strategy.visible}
              onChange={(visible) =>
                update((current) => ({
                  ...current,
                  strategies: current.strategies.map((item) =>
                    item.id === strategy.id ? { ...item, visible } : item,
                  ),
                }))
              }
            />
          ))}
      </Disclosure>
      <Disclosure
        title="Research laboratory"
        summary="Optional baseline experiments and evidence discussion"
      >
        <ResearchPanel />
      </Disclosure>
      <Disclosure
        title="Calendar & COT context"
        summary={
          context.data?.events.length || context.data?.cot.length
            ? "Source-attributed dated records"
            : (context.data?.message ??
              "Calendar and COT sources are not connected")
        }
      >
        {context.data?.events.length || context.data?.cot.length ? (
          <>
            <Text style={styles.provenance}>{context.data.message}</Text>
            <MarketContextTable
              events={context.data.events}
              cot={context.data.cot}
            />
          </>
        ) : (
          <Text style={styles.provenance}>
            {context.data?.message ??
              "Calendar and COT context are not connected; no records are fabricated."}
          </Text>
        )}
      </Disclosure>
      <Disclosure
        title="Paper-trading notice"
        summary="Evidence and scenarios inform review; they do not guarantee an outcome"
      >
        <Text style={styles.disclaimer}>{DISCLAIMER}</Text>
      </Disclosure>
      <Sheet
        visible={contextOpen}
        title="Market context"
        onClose={() => setContextOpen(false)}
      >
        <ToggleRow
          label="Explicit Sample chart"
          detail="Generated demonstration bars only. Sample mode disables automatic setup evidence and paper proposals."
          value={workspace.settings.sampleMode}
          onChange={(value) =>
            update((current) => ({
              ...current,
              settings: { ...current.settings, sampleMode: value },
            }))
          }
        />
        <SectionLabel>Strategy clock basis</SectionLabel>
        <Text style={styles.provenance}>
          New York is DST-aware. Fixed EST remains UTC−5 because the source
          names EST. Device timezone is displayed in the pinned strip and does
          not alter source bars.
        </Text>
        <View style={styles.choices}>
          {(["America/New_York", "Etc/GMT+5"] as const).map((zone) => (
            <ActionButton
              key={zone}
              label={
                zone === "America/New_York" ? "New York (DST)" : "Fixed EST"
              }
              compact
              kind={
                workspace.settings.timezone === zone ? "primary" : "secondary"
              }
              onPress={() =>
                update((current) => ({
                  ...current,
                  settings: { ...current.settings, timezone: zone },
                }))
              }
            />
          ))}
        </View>
        <SectionLabel>Workspace & settings</SectionLabel>
        <Text style={styles.provenance}>
          Cloud actions are explicit. Save/load does not run automatically and
          no source image is public.
        </Text>
        <View style={styles.choices}>
          <ActionButton
            label={cloudState === "saving" ? "Working…" : "Save to cloud"}
            compact
            kind="secondary"
            disabled={cloudState === "saving"}
            onPress={() => void saveCloud()}
          />
          <ActionButton
            label={cloudState === "saving" ? "Working…" : "Load cloud"}
            compact
            kind="secondary"
            disabled={cloudState === "saving"}
            onPress={() => void loadCloud()}
          />
        </View>
        {cloudMessage ? (
          <Text style={styles.provenance}>{cloudMessage}</Text>
        ) : null}
      </Sheet>
      <Sheet
        visible={factorsOpen}
        title="Manual confluence"
        onClose={() => setFactorsOpen(false)}
      >
        {activeStrategy?.factors.map((factor) => {
          const key = `${activeStrategy.id}:v${activeStrategy.version}:${factor.id}`;
          return (
            <ToggleRow
              key={factor.id}
              label={`${factor.name} · ${factor.weight}w`}
              detail={`${factor.group} · ${factor.description}${factor.page ? ` (source p.${factor.page})` : ""}`}
              value={Boolean(workspace.confirmations[key])}
              onChange={(value) =>
                update((current) => ({
                  ...current,
                  confirmations: { ...current.confirmations, [key]: value },
                }))
              }
            />
          );
        })}
        <Card style={styles.scoreCard}>
          <Text style={styles.score}>{manualScore.score}</Text>
          <View>
            <Text style={styles.cardTitle}>Manual score</Text>
            <Text style={styles.cardDetail}>
              {manualScore.count}/{manualScore.total} manually confirmed ·{" "}
              {manualScore.earned}/{manualScore.possible} enabled weight
            </Text>
            <Text style={styles.provenance}>
              User confirmations only. Not a probability and not automatic setup
              status.
            </Text>
          </View>
        </Card>
      </Sheet>
      <Sheet
        visible={levelOpen}
        title="Add named level"
        onClose={() => setLevelOpen(false)}
      >
        <Input
          label="Level name"
          value={levelName}
          onChangeText={setLevelName}
          placeholder="e.g. London high"
        />
        <Input
          label={`Price (${market.id})`}
          value={levelPrice}
          onChangeText={setLevelPrice}
          keyboardType="numeric"
        />
        <Text style={styles.provenance}>
          This manual annotation is scoped to {market.id}, {workspace.timeframe}
          , and {activeStrategy?.name}.
        </Text>
        <ActionButton label="Save manual level" onPress={addLevel} />
      </Sheet>
      <PaperPlanSheet
        visible={paperOpen}
        proposal={
          paperProposal?.analysis.market === market.id &&
          paperProposal.analysis.timeframe === workspace.timeframe
            ? paperProposal
            : undefined
        }
        market={market.id}
        precision={market.precision}
        riskPct={riskPct}
        defaultAutoManage={Boolean(workspace.settings.autoPaperManage)}
        proposalLoading={paperPendingKey === contextKey}
        proposalError={paperError}
        onRetry={() => void requestProposal(paperSide)}
        onClose={() => {
          requestEpoch.current++;
          setPaperOpen(false);
          setPaperPendingKey(undefined);
        }}
        onRiskPctChange={setRiskPct}
        onAutoManageChange={(value) =>
          update((current) => ({
            ...current,
            settings: { ...current.settings, autoPaperManage: value },
          }))
        }
        onTradeCreated={(trade) => {
          // The returned record is the server-confirmed paper order; never rebuild
          // a bracket from the proposal or strategy on the client.
          setCreatedTrade(trade);
          update((current) => ({
            ...current,
            market: trade.market,
            trades: current.trades.some((existing) => existing.id === trade.id)
              ? current.trades.map((existing) =>
                  existing.id === trade.id
                    ? mergeCanonicalPaperTrade(existing, trade)
                    : existing,
                )
              : [trade, ...current.trades].slice(0, 2000),
          }));
          router.replace({
            pathname: "/",
            params: { tradeId: trade.id, market: trade.market },
          });
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  marketCard: { gap: 8, padding: 9 },
  marketTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 10,
  },
  symbol: { color: C.text, fontWeight: "900", fontSize: 17 },
  marketName: { color: C.muted, fontSize: 10, marginTop: 1 },
  priceRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
  },
  price: {
    color: C.price,
    fontSize: 28,
    lineHeight: 32,
    fontFamily: mono,
    fontWeight: "800",
  },
  change: {
    fontFamily: mono,
    fontWeight: "800",
    fontSize: 13,
    textAlign: "right",
  },
  source: {
    color: C.muted,
    fontSize: 9,
    marginTop: 2,
    textAlign: "right",
    maxWidth: 172,
  },
  connect: {
    flexDirection: "row",
    gap: 7,
    padding: 7,
    borderRadius: 4,
    backgroundColor: C.amber + "12",
  },
  connectText: { color: C.amber, flex: 1, fontSize: 11, lineHeight: 15 },
  rail: { gap: 6 },
  frame: {
    minWidth: 44,
    paddingVertical: 7,
    paddingHorizontal: 11,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.black + "88",
    alignItems: "center",
  },
  frameActive: { backgroundColor: C.lime, borderColor: C.lime },
  frameText: {
    color: C.muted,
    fontSize: 12,
    fontFamily: mono,
    fontWeight: "800",
  },
  frameTextActive: { color: C.black },
  chartCard: {
    paddingHorizontal: 8,
    paddingVertical: 10,
    gap: 4,
    borderColor: C.border,
  },
  chartCaption: {
    flexDirection: "row",
    paddingHorizontal: 5,
    justifyContent: "space-between",
    gap: 8,
  },
  caption: {
    color: C.muted,
    fontSize: 9,
    letterSpacing: 0.9,
    fontWeight: "800",
  },
  captionRight: { color: C.muted, fontSize: 9, textAlign: "right", flex: 1 },
  loading: {
    height: 284,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  loadingText: { color: C.muted, fontSize: 12 },
  errorText: {
    color: C.rose,
    paddingHorizontal: 7,
    fontSize: 11,
    lineHeight: 16,
  },
  strategyRail: { gap: 7, paddingHorizontal: 1 },
  strategyChip: {
    minHeight: 40,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.surface,
    paddingHorizontal: 10,
    alignItems: "center",
    flexDirection: "row",
    gap: 6,
  },
  dot: { width: 7, height: 7, borderRadius: 8 },
  strategyText: { color: C.text, fontSize: 12, fontWeight: "700" },
  version: { color: C.muted, fontSize: 10, fontFamily: mono },
  confluenceCard: { gap: 5, paddingVertical: 9, borderColor: C.lime + "55" },
  confluenceHead: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 10,
  },
  compactLabel: {
    color: C.muted,
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 0.8,
  },
  confluenceStatus: {
    color: C.text,
    fontSize: 15,
    fontWeight: "900",
    marginTop: 1,
  },
  confluenceDetail: { color: C.muted, fontSize: 10, lineHeight: 14 },
  matchHead: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 10,
  },
  cardTitle: { color: C.text, fontSize: 14, fontWeight: "900" },
  cardDetail: { color: C.muted, fontSize: 11, lineHeight: 16, marginTop: 3 },
  provenance: { color: C.muted, fontSize: 11, lineHeight: 16 },
  disclaimer: { color: C.amber, fontSize: 11, lineHeight: 16 },
  choices: { flexDirection: "row", flexWrap: "wrap", gap: 7 },
  scoreCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 13,
    borderColor: C.lime + "66",
  },
  score: { color: C.lime, fontSize: 34, fontFamily: mono, fontWeight: "800" },
});
