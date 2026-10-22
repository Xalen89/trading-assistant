import { LearningDashboard } from "./learning-dashboard";
import { TradingLessons } from "./trading-lessons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Ionicons } from "@expo/vector-icons";
import { randomUUID } from "expo-crypto";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useAuth } from "@/hooks/use-auth";
import { useWorkspace } from "@/hooks/use-workspace";
import {
  cleanCoachMessage,
  coachStorageKey,
  commitCoachExchange,
  continuationHistory,
  parseCoachConversation,
  serializeCoachConversation,
  type CoachTurn,
} from "@/lib/trading/coach-ui-state";
import { resolveAIQuality } from "@/lib/trading/ai-quality";
import {
  fixedAIServiceFailureCopy,
  readAIServiceFailureKind,
  type AIServiceFailureKind,
} from "@/lib/trading/ai-request-lifecycle";
import type {
  CoachAskInput,
  CoachQuota,
  CoachReply,
  CoachStatus,
} from "@/lib/trading/coach-types";
import { trpc } from "@/lib/trpc";
import { AIQualitySelector } from "./ai-quality-selector";
import { C, mono } from "./theme";
import { Card, Pill } from "./ui";

// The server has one 75-second deadline; this leaves a small network/UI margin.
const REQUEST_TIMEOUT_MS = 80_000;
const MAX_COACH_MESSAGE_LENGTH = 1600;
const MANUS_HELP_URL = "https://help.manus.im";
let fallbackExchangeSequence = 0;

/** Separate durable transcript identity from the lifecycle-only request counter. */
function createCoachExchangeId() {
  try {
    return `coach-exchange-${randomUUID()}`;
  } catch {
    fallbackExchangeSequence += 1;
    return `coach-exchange-${Date.now().toString(36)}-${fallbackExchangeSequence}-${Math.random().toString(36).slice(2, 10)}`;
  }
}

type CoachStatusWithFailure = CoachStatus & {
  failureKind?: AIServiceFailureKind;
};

type CoachStatusQuery = {
  data?: CoachStatusWithFailure;
  isLoading: boolean;
  error: { message: string } | null;
  refetch: () => Promise<unknown>;
};

type FailedTurn = {
  content: string;
  message: string;
  createdAt: number;
  failureKind?: AIServiceFailureKind;
};

type PendingTurn = { id: number; content: string };

function ManusHelpLink() {
  return (
    <Pressable
      accessibilityLabel="Open Manus Help"
      accessibilityRole="link"
      onPress={() =>
        void Linking.openURL(MANUS_HELP_URL).catch(() => undefined)
      }
    >
      <Text style={styles.helpLink}>Manus Help</Text>
    </Pressable>
  );
}

function isCoachQuota(value: unknown): value is CoachQuota {
  if (!value || typeof value !== "object") return false;
  const quota = value as Partial<CoachQuota>;
  return (
    [
      quota.limit,
      quota.used,
      quota.remaining,
      quota.resetAt,
      quota.retryAfterSeconds,
    ].every((item) => typeof item === "number" && Number.isFinite(item)) &&
    (quota.limit ?? -1) >= 0 &&
    (quota.used ?? -1) >= 0 &&
    (quota.remaining ?? -1) >= 0 &&
    (quota.resetAt ?? 0) > 0
  );
}

function rateLimitQuota(error: unknown): CoachQuota | undefined {
  if (!error || typeof error !== "object") return undefined;
  const data = (error as { data?: { appRateLimit?: unknown } }).data;
  return isCoachQuota(data?.appRateLimit) ? data.appRateLimit : undefined;
}

function formatCountdown(resetAt: number, now: number) {
  const seconds = Math.max(0, Math.ceil((resetAt - now) / 1000));
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, "0")}`;
}

type AiCoachProps = {
  /** A protected library record ID; file bytes are never passed from the client. */
  sourceId?: string;
  initialQuestion?: string;
  scope?: "general" | "library";
};

const BASE_PROMPTS = [
  {
    label: "Explain strategy",
    message:
      "Explain my active strategy in plain language and list the conditions I should verify manually before a paper trade.",
  },
  {
    label: "Break down confluence",
    message:
      "Break down the current context into confluence factors. Separate observations from assumptions and unknowns.",
  },
  {
    label: "Compare pairs",
    message:
      "How should I compare two markets or pairs without treating correlation as a prediction? Give me a small review checklist.",
  },
  {
    label: "Trading discipline",
    message:
      "Help me review trading discipline for a paper session: process, risk limits, and a stop condition. Do not give an execution instruction.",
  },
];

/** A compact, native-only private learning chat. It has no order-entry actions. */
export function AiCoach({
  sourceId,
  initialQuestion,
  scope = "general",
}: AiCoachProps) {
  const auth = useAuth();
  const { workspace } = useWorkspace();
  const ownerId = auth.user?.id;
  const aiQuality = resolveAIQuality(workspace.settings.aiQuality);
  const activeStrategy =
    workspace.strategies.find(
      (item) => item.id === workspace.activeStrategyId,
    ) ?? workspace.strategies[0];
  const activeStrategyId = activeStrategy?.id;
  const storageKey = useMemo(
    () => (ownerId ? coachStorageKey(ownerId, scope, sourceId) : null),
    [ownerId, scope, sourceId],
  );
  const status = trpc.coach.status.useQuery(
    { aiQuality },
    {
      enabled: Boolean(storageKey),
      retry: false,
    },
  );
  const ask = trpc.coach.ask.useMutation();

  const [turns, setTurns] = useState<CoachTurn[]>([]);
  const [draft, setDraft] = useState(() =>
    cleanCoachMessage(initialQuestion || "", MAX_COACH_MESSAGE_LENGTH),
  );
  const [failed, setFailed] = useState<FailedTurn>();
  const [pending, setPending] = useState<PendingTurn>();
  const [notice, setNotice] = useState<string>();
  const [replyQuota, setQuota] = useState<CoachQuota>();
  const statusQuota = isCoachQuota(status.data?.quota)
    ? status.data.quota
    : undefined;
  const quota =
    replyQuota && (!statusQuota || replyQuota.resetAt >= statusQuota.resetAt)
      ? replyQuota
      : statusQuota;
  const [clock, setClock] = useState(() => Date.now());
  const [loadedStorageKey, setLoadedStorageKey] = useState<string | null>(null);

  const transcriptRef = useRef<ScrollView>(null);
  const turnsRef = useRef<CoachTurn[]>([]);
  const requestIdRef = useRef(0);
  const inFlightRef = useRef(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const initialQuestionRef = useRef(initialQuestion);

  useEffect(() => {
    turnsRef.current = turns;
  }, [turns]);

  useEffect(() => {
    initialQuestionRef.current = initialQuestion;
  }, [initialQuestion]);

  const quotaBlocked = Boolean(
    quota && quota.remaining <= 0 && quota.resetAt > clock,
  );
  const quotaCountdown =
    quotaBlocked && quota ? formatCountdown(quota.resetAt, clock) : undefined;

  useEffect(() => {
    if (!quotaBlocked || !quota) return;
    const tick = setInterval(() => setClock(Date.now()), 1_000);
    return () => clearInterval(tick);
  }, [quota, quotaBlocked]);

  const clearRequestTimer = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  // Reset before an identity/scope storage load so a previous owner's chat is never visible.
  useEffect(() => {
    let current = true;
    requestIdRef.current += 1;
    inFlightRef.current = false;
    clearRequestTimer();

    void (async () => {
      // Until this task finishes, derived render state is blank and disabled for
      // the new owner or scope, so prior private text never flashes onscreen.
      await Promise.resolve();
      let restored: CoachTurn[] = [];
      let loadNotice: string | undefined;
      if (storageKey) {
        try {
          restored = parseCoachConversation(
            await AsyncStorage.getItem(storageKey),
          );
        } catch {
          loadNotice = "This device could not load the private conversation.";
        }
      }
      if (!current) return;
      setTurns(restored);
      setFailed(undefined);
      setPending(undefined);
      setNotice(loadNotice);
      setDraft(
        cleanCoachMessage(
          initialQuestionRef.current || "",
          MAX_COACH_MESSAGE_LENGTH,
        ),
      );
      setLoadedStorageKey(storageKey);
    })();

    return () => {
      current = false;
    };
  }, [clearRequestTimer, storageKey]);

  useEffect(() => {
    if (!storageKey || loadedStorageKey !== storageKey) return;
    void AsyncStorage.setItem(
      storageKey,
      serializeCoachConversation(turns),
    ).catch(() =>
      setNotice("This device could not save the private conversation."),
    );
  }, [loadedStorageKey, storageKey, turns]);

  useEffect(() => {
    return () => {
      requestIdRef.current += 1;
      inFlightRef.current = false;
      clearRequestTimer();
    };
  }, [clearRequestTimer]);

  useEffect(() => {
    if (scope !== "general") return;
    const frame = requestAnimationFrame(() => {
      transcriptRef.current?.scrollToEnd({ animated: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [failed, pending, scope, turns]);

  const prompts = useMemo(
    () =>
      sourceId
        ? [
            ...BASE_PROMPTS,
            {
              label: "Ask about selected source",
              message:
                "Explain the selected library source in plain language. Distinguish what the source says from what remains unverified.",
            },
          ]
        : BASE_PROMPTS,
    [sourceId],
  );

  const failRequest = useCallback(
    (requestId: number, content: string, error: unknown) => {
      if (requestId !== requestIdRef.current) return;
      clearRequestTimer();
      inFlightRef.current = false;
      setPending(undefined);
      const receivedQuota = rateLimitQuota(error);
      if (receivedQuota) {
        setQuota(receivedQuota);
      }
      setDraft(content);
      const failureKind = readAIServiceFailureKind(error);
      const message = fixedAIServiceFailureCopy(failureKind, "coach");
      setFailed({ content, message, createdAt: Date.now(), failureKind });
      setNotice(message);
    },
    [clearRequestTimer],
  );

  const submit = useCallback(
    (candidate?: string) => {
      const message = cleanCoachMessage(
        candidate === undefined ? draft : candidate,
        MAX_COACH_MESSAGE_LENGTH,
      );
      if (inFlightRef.current) return;
      if (quotaBlocked) {
        setNotice(
          `Coach request limit reached. Retry in ${quotaCountdown || "a moment"}. Your question is kept below.`,
        );
        return;
      }
      if (!message) {
        setNotice("Write a question before sending it to the coach.");
        return;
      }
      if (
        !storageKey ||
        !auth.isAuthenticated ||
        loadedStorageKey !== storageKey
      ) {
        setNotice(
          "A verified owner session is required before asking the coach.",
        );
        return;
      }

      const requestId = requestIdRef.current + 1;
      requestIdRef.current = requestId;
      inFlightRef.current = true;
      setDraft("");
      setFailed(undefined);
      setNotice(undefined);
      setPending({ id: requestId, content: message });

      const history = continuationHistory(turnsRef.current);
      const exchangeId = createCoachExchangeId();
      const input: CoachAskInput = {
        message,
        aiQuality,
      };
      if (history.length) input.history = history;
      if (workspace.market) input.market = workspace.market;
      if (workspace.timeframe) input.timeframe = workspace.timeframe;
      if (activeStrategyId) input.strategyId = activeStrategyId;
      if (sourceId) input.sourceId = sourceId;

      timeoutRef.current = setTimeout(() => {
        if (requestId !== requestIdRef.current) return;
        // Invalidate a late transport response. A retry starts a fresh request and memory stays intact.
        requestIdRef.current += 1;
        clearRequestTimer();
        inFlightRef.current = false;
        setPending(undefined);
        const timeoutMessage =
          "The coach request timed out. Your conversation was not changed.";
        setFailed({
          content: message,
          message: timeoutMessage,
          createdAt: Date.now(),
        });
        setDraft(message);
        setNotice(timeoutMessage);
      }, REQUEST_TIMEOUT_MS);

      void ask
        .mutateAsync(input)
        .then((reply) => {
          if (requestId !== requestIdRef.current) return;
          const normalized = normalizeReply(reply);
          clearRequestTimer();
          inFlightRef.current = false;
          setQuota(normalized.quota);
          setTurns((current) =>
            commitCoachExchange(current, {
              id: exchangeId,
              user: message,
              assistant: normalized.answer,
              createdAt: normalizeTimestamp(normalized.createdAt),
              model: normalized.model,
              sources: normalized.sources,
              contextStatus: normalized.contextStatus,
            }),
          );
          setPending(undefined);
          setFailed(undefined);
          setNotice(undefined);
        })
        .catch((error: unknown) => failRequest(requestId, message, error));
    },
    [
      activeStrategyId,
      aiQuality,
      ask,
      auth.isAuthenticated,
      clearRequestTimer,
      draft,
      failRequest,
      loadedStorageKey,
      sourceId,
      storageKey,
      workspace.market,
      workspace.timeframe,
      quotaBlocked,
      quotaCountdown,
    ],
  );

  const retry = useCallback(() => {
    if (failed) submit(failed.content);
  }, [failed, submit]);

  const cancelPending = useCallback(() => {
    const canceled = pending;
    if (!canceled) return;
    // The configured tRPC batch mutation does not expose a per-request AbortSignal. This is
    // intentionally client-only cancellation: it invalidates the response and does not claim
    // to stop an already-started server/model job.
    requestIdRef.current += 1;
    inFlightRef.current = false;
    clearRequestTimer();
    setPending(undefined);
    setFailed(undefined);
    setDraft((current) => current.trim() || canceled.content);
    setNotice(
      "Response canceled on this device. Your unsent question is restored and any late reply is ignored.",
    );
  }, [clearRequestTimer, pending]);

  const clearConversation = useCallback(() => {
    requestIdRef.current += 1;
    inFlightRef.current = false;
    clearRequestTimer();
    setTurns([]);
    setFailed(undefined);
    setPending(undefined);
    setNotice(undefined);
    if (storageKey) {
      void AsyncStorage.removeItem(storageKey).catch(() =>
        setNotice("This device could not clear the private conversation."),
      );
    }
  }, [clearRequestTimer, storageKey]);

  const conversationReady = Boolean(
    storageKey && loadedStorageKey === storageKey,
  );
  const visibleTurns = conversationReady ? turns : [];
  const visibleFailed = conversationReady ? failed : undefined;
  const visiblePending = conversationReady ? pending : undefined;
  const visibleDraft = conversationReady ? draft : "";
  const visibleNotice = conversationReady ? notice : undefined;
  const coachUnavailable = status.data?.available === false;
  const interactionDisabled =
    Boolean(visiblePending) ||
    !conversationReady ||
    coachUnavailable ||
    quotaBlocked;
  const sendDisabled = !visibleDraft.trim() || interactionDisabled;
  const quotaSummary = quota
    ? quotaBlocked
      ? `Limit reached · retry in ${quotaCountdown}`
      : `${quota.remaining}/${quota.limit} coach replies left · resets ${new Date(quota.resetAt).toLocaleTimeString()}`
    : undefined;

  const transcript = (
    <>
      <CoachIntro
        sourceId={sourceId}
        status={status}
        prompts={prompts}
        disabled={interactionDisabled}
        qualityDisabled={Boolean(visiblePending)}
        quotaSummary={quotaSummary}
        onPrompt={submit}
      />
      <View style={styles.transcriptContent}>
        {!visibleTurns.length && !visiblePending && !visibleFailed ? (
          <Text style={styles.emptyCopy}>
            Ask for an explanation, a review checklist, or a disciplined way to
            think through a paper-trading decision.
          </Text>
        ) : null}
        {visibleTurns.map((turn) => (
          <ChatTurn key={turn.id} turn={turn} />
        ))}
        {visiblePending ? <PendingReply onCancel={cancelPending} /> : null}
        {visibleFailed ? (
          <FailedReply
            failed={visibleFailed}
            disabled={Boolean(visiblePending) || quotaBlocked}
            disabledLabel={
              quotaBlocked ? `Retry in ${quotaCountdown}` : undefined
            }
            onRetry={retry}
            retryable={
              !visibleFailed.failureKind ||
              visibleFailed.failureKind === "temporarily-unavailable"
            }
          />
        ) : null}
      </View>
    </>
  );

  const composer = (
    <View style={styles.composer}>
      {visibleNotice ? (
        <Text accessibilityLiveRegion="polite" style={styles.notice}>
          {visibleNotice}
        </Text>
      ) : null}
      {quotaSummary ? (
        <Text style={styles.quotaNotice}>{quotaSummary}</Text>
      ) : null}
      <View style={styles.inputRow}>
        <TextInput
          accessibilityLabel="Question for Trading Coach"
          editable={!interactionDisabled}
          maxLength={MAX_COACH_MESSAGE_LENGTH}
          multiline
          onChangeText={setDraft}
          placeholder={
            sourceId
              ? "Ask about this selected source…"
              : "Ask a trading-learning question…"
          }
          placeholderTextColor={C.muted}
          style={styles.input}
          textAlignVertical="top"
          value={visibleDraft}
        />
        <Pressable
          accessibilityLabel="Send question to Trading Coach"
          accessibilityRole="button"
          accessibilityState={{
            disabled: sendDisabled,
          }}
          disabled={sendDisabled}
          onPress={() => submit()}
          style={({ pressed }) => [
            styles.send,
            {
              opacity: sendDisabled ? 0.42 : pressed ? 0.72 : 1,
            },
          ]}
        >
          {visiblePending ? (
            <ActivityIndicator color={C.black} size="small" />
          ) : (
            <Ionicons color={C.black} name="arrow-up" size={19} />
          )}
        </Pressable>
      </View>
      <View style={styles.composerMeta}>
        <Text style={styles.composerHint}>
          {visibleDraft.length}/{MAX_COACH_MESSAGE_LENGTH} · current workspace
          context is sent only with this request
        </Text>
        <Pressable
          accessibilityLabel="Clear this private coach conversation"
          accessibilityRole="button"
          disabled={!visibleTurns.length && !visibleFailed && !visiblePending}
          onPress={clearConversation}
          style={({ pressed }) => [
            styles.clearButton,
            {
              opacity:
                !visibleTurns.length && !visibleFailed && !visiblePending
                  ? 0.42
                  : pressed
                    ? 0.7
                    : 1,
            },
          ]}
        >
          <Text style={styles.clearText}>Clear</Text>
        </Pressable>
      </View>
    </View>
  );

  const content = (
    <View style={[styles.root, scope === "general" && styles.fullRoot]}>
      {scope === "general" ? (
        <ScrollView
          ref={transcriptRef}
          contentContainerStyle={styles.fullScrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          style={styles.transcriptScroll}
        >
          <TradingLessons />
          <LearningDashboard />
          {transcript}
        </ScrollView>
      ) : (
        <View style={styles.compactContent}>{transcript}</View>
      )}
      {composer}
    </View>
  );

  return scope === "general" ? (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={styles.keyboardAvoider}
    >
      {content}
    </KeyboardAvoidingView>
  ) : (
    content
  );
}

function CoachIntro({
  sourceId,
  status,
  prompts,
  disabled,
  qualityDisabled,
  quotaSummary,
  onPrompt,
}: {
  sourceId?: string;
  status: CoachStatusQuery;
  prompts: typeof BASE_PROMPTS;
  disabled: boolean;
  qualityDisabled: boolean;
  quotaSummary?: string;
  onPrompt: (message: string) => void;
}) {
  const serviceUnavailable = Boolean(
    status.error || status.data?.available === false,
  );
  const failureKind =
    status.data?.failureKind ?? readAIServiceFailureKind(status.error);
  const unavailableCopy = fixedAIServiceFailureCopy(failureKind, "coach");
  const contextStatus = serviceUnavailable
    ? [unavailableCopy]
    : cleanLabels(status.data?.contextStatus);
  const capabilities = cleanLabels(status.data?.capabilities);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const available = status.data?.available === true;
  const compactStatus = status.isLoading
    ? "Checking coach…"
    : status.error
      ? "Context check unavailable"
      : status.data?.available === false
        ? "Coach unavailable"
        : available
          ? "Coach ready"
          : "Coach status unavailable";
  return (
    <View style={styles.intro}>
      <Card style={styles.introCard}>
        <View style={styles.introTopline}>
          <Text style={styles.eyebrow}>PRIVATE LEARNING CHAT</Text>
          {sourceId ? <Pill label="LIBRARY CONTEXT" tone="amber" /> : null}
        </View>
        <Text style={styles.introTitle}>Ask, inspect, and verify.</Text>
        <Text style={styles.introCopy}>
          The coach receives this request’s selected market, timeframe, active
          strategy, and optional protected library ID. It cannot place, edit, or
          submit orders.
        </Text>
        <View style={styles.compactStatus}>
          {status.isLoading ? (
            <ActivityIndicator color={C.lime} size="small" />
          ) : (
            <View
              style={[
                styles.statusDot,
                available ? styles.statusReady : styles.statusUnavailable,
              ]}
            />
          )}
          <Text style={styles.compactStatusText}>{compactStatus}</Text>
          {status.data?.model ? (
            <Text numberOfLines={1} style={styles.compactModel}>
              {status.data.model}
            </Text>
          ) : null}
        </View>
        {status.error ? (
          <View style={styles.statusError}>
            <Text accessibilityLiveRegion="polite" style={styles.errorText}>
              {unavailableCopy}
            </Text>
            {!failureKind || failureKind === "temporarily-unavailable" ? (
              <SmallButton
                label="Retry context"
                onPress={() => void status.refetch()}
              />
            ) : null}
            <ManusHelpLink />
          </View>
        ) : null}
        {status.data?.available === false ? (
          <View style={styles.statusError}>
            <Text style={styles.errorText}>{unavailableCopy}</Text>
            {!failureKind || failureKind === "temporarily-unavailable" ? (
              <SmallButton
                label="Retry context"
                onPress={() => void status.refetch()}
              />
            ) : null}
            <ManusHelpLink />
          </View>
        ) : null}
        {quotaSummary ? (
          <Text style={styles.quotaText}>{quotaSummary}</Text>
        ) : null}
        {contextStatus.length || capabilities.length ? (
          <View style={styles.detailsBlock}>
            <Pressable
              accessibilityLabel={
                detailsOpen ? "Hide coach details" : "Show coach details"
              }
              accessibilityRole="button"
              accessibilityState={{ expanded: detailsOpen }}
              onPress={() => setDetailsOpen((open) => !open)}
              style={({ pressed }) => [
                styles.detailsToggle,
                { opacity: pressed ? 0.7 : 1 },
              ]}
            >
              <Text style={styles.detailsToggleText}>
                {detailsOpen ? "Hide details" : "Details"}
              </Text>
              <Ionicons
                color={C.muted}
                name={detailsOpen ? "chevron-up" : "chevron-down"}
                size={14}
              />
            </Pressable>
            {detailsOpen ? (
              <View style={styles.detailsContent}>
                {contextStatus.length ? (
                  <CoachDetailList label="Context" values={contextStatus} />
                ) : null}
                {capabilities.length ? (
                  <CoachDetailList label="Capabilities" values={capabilities} />
                ) : null}
              </View>
            ) : null}
          </View>
        ) : null}
      </Card>
      <AIQualitySelector disabled={qualityDisabled} />
      <View style={styles.promptHeader}>
        <Text style={styles.sectionLabel}>LEARNING PROMPTS</Text>
      </View>
      <View style={styles.promptRow}>
        {prompts.map((prompt) => (
          <Pressable
            key={prompt.label}
            accessibilityLabel={`Ask Trading Coach: ${prompt.label}`}
            accessibilityRole="button"
            disabled={disabled}
            onPress={() => onPrompt(prompt.message)}
            style={({ pressed }) => [
              styles.prompt,
              { opacity: disabled ? 0.42 : pressed ? 0.7 : 1 },
            ]}
          >
            <Text style={styles.promptText}>{prompt.label}</Text>
          </Pressable>
        ))}
      </View>
      <Text style={styles.disclosure}>
        Educational, simulated, and paper-trading support only. Review source
        material and make independent decisions; neither an answer nor a
        citation validates a setup.
      </Text>
    </View>
  );
}

function CoachDetailList({
  label,
  values,
}: {
  label: string;
  values: string[];
}) {
  return (
    <View style={styles.detailList}>
      <Text style={styles.metadataLabel}>{label.toUpperCase()}</Text>
      {values.map((value, index) => (
        <View key={`${value}-${index}`} style={styles.detailRow}>
          <Text style={styles.detailBullet}>•</Text>
          <Text style={styles.detailText}>{value}</Text>
        </View>
      ))}
    </View>
  );
}

function ChatTurn({ turn }: { turn: CoachTurn }) {
  const assistant = turn.role === "assistant";
  return (
    <View
      style={[
        styles.bubble,
        assistant ? styles.assistantBubble : styles.userBubble,
      ]}
    >
      <Text
        style={[
          styles.turnLabel,
          assistant ? styles.assistantLabel : styles.userLabel,
        ]}
      >
        {assistant ? "TRADING COACH" : "YOU"}
      </Text>
      {assistant ? (
        <MarkdownText text={turn.content} />
      ) : (
        <Text style={styles.userText}>{turn.content}</Text>
      )}
      {assistant ? <ReplyMetadata turn={turn} /> : null}
    </View>
  );
}

function PendingReply({ onCancel }: { onCancel: () => void }) {
  return (
    <View
      accessibilityLiveRegion="polite"
      style={[styles.bubble, styles.assistantBubble, styles.pendingBubble]}
    >
      <ActivityIndicator color={C.lime} size="small" />
      <Text style={styles.pendingText}>Coach is preparing a response…</Text>
      <SmallButton label="Cancel response" onPress={onCancel} />
    </View>
  );
}

function FailedReply({
  failed,
  disabled,
  disabledLabel,
  onRetry,
  retryable,
}: {
  failed: FailedTurn;
  disabled: boolean;
  disabledLabel?: string;
  onRetry: () => void;
  retryable: boolean;
}) {
  return (
    <View style={[styles.bubble, styles.failedBubble]}>
      <Text style={[styles.turnLabel, styles.failedLabel]}>
        UNSENT QUESTION
      </Text>
      <Text style={styles.userText}>{failed.content}</Text>
      <Text style={styles.errorText}>{failed.message}</Text>
      <ManusHelpLink />
      {retryable ? (
        <SmallButton
          disabled={disabled}
          label={disabled ? disabledLabel || "Retrying…" : "Retry question"}
          onPress={onRetry}
        />
      ) : null}
    </View>
  );
}

function ReplyMetadata({ turn }: { turn: CoachTurn }) {
  return (
    <View style={styles.replyMeta}>
      {turn.model ? (
        <Text style={styles.modelText}>Model · {turn.model}</Text>
      ) : null}
      {turn.contextStatus?.length ? (
        <MetadataPills
          label="Context"
          tone="mint"
          values={turn.contextStatus}
        />
      ) : null}
      {turn.sources?.length ? (
        <View style={styles.citations}>
          <Text style={styles.metadataLabel}>SOURCES</Text>
          {turn.sources.map((source, index) => (
            <View key={`${source.id}-${index}`} style={styles.citation}>
              <Ionicons color={C.blue} name="document-text-outline" size={14} />
              <Text style={styles.citationText}>
                {source.label} · {source.kind}
                {source.asOf !== undefined
                  ? ` · as of ${formatSourceAsOf(source.asOf)}`
                  : ""}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

function MetadataPills({
  label,
  values,
  tone,
}: {
  label: string;
  values: string[];
  tone: "mint" | "muted";
}) {
  const color = tone === "mint" ? C.mint : C.muted;
  return (
    <View style={styles.metadataBlock}>
      <Text style={styles.metadataLabel}>{label.toUpperCase()}</Text>
      <View style={styles.metadataPills}>
        {values.slice(0, 8).map((value, index) => (
          <View
            key={`${value}-${index}`}
            style={[
              styles.metadataPill,
              { borderColor: color + "55", backgroundColor: color + "13" },
            ]}
          >
            <Text style={[styles.metadataPillText, { color }]}>{value}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function SmallButton({
  label,
  onPress,
  disabled = false,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.smallButton,
        { opacity: disabled ? 0.42 : pressed ? 0.7 : 1 },
      ]}
    >
      <Text style={styles.smallButtonText}>{label}</Text>
    </Pressable>
  );
}

/** Safe subset renderer for assistant text; it renders no HTML, links, or WebViews. */
function MarkdownText({ text }: { text: string }) {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  let inCodeBlock = false;
  const nodes: ReactNode[] = [];

  lines.forEach((line, index) => {
    if (line.trim().startsWith("```")) {
      inCodeBlock = !inCodeBlock;
      return;
    }
    if (inCodeBlock) {
      nodes.push(
        <Text key={`code-${index}`} style={styles.codeBlock}>
          {line || " "}
        </Text>,
      );
      return;
    }
    if (!line.trim()) {
      nodes.push(<View key={`space-${index}`} style={styles.markdownSpace} />);
      return;
    }
    const heading = line.match(/^#{1,3}\s+(.+)$/);
    const bullet = line.match(/^\s*(?:[-*]|\d+\.)\s+(.+)$/);
    if (heading) {
      nodes.push(
        <Text key={`heading-${index}`} style={styles.markdownHeading}>
          {inlineText(heading[1])}
        </Text>,
      );
    } else if (bullet) {
      nodes.push(
        <View key={`bullet-${index}`} style={styles.bulletRow}>
          <Text style={styles.bulletMark}>•</Text>
          <Text style={styles.markdownText}>{inlineText(bullet[1])}</Text>
        </View>,
      );
    } else {
      nodes.push(
        <Text key={`text-${index}`} style={styles.markdownText}>
          {inlineText(line)}
        </Text>,
      );
    }
  });

  return <View style={styles.markdown}>{nodes}</View>;
}

function inlineText(value: string): ReactNode[] {
  const parts = value.split(/(\*\*[^*]+\*\*|`[^`]+`|\*[^*]+\*)/g);
  return parts.filter(Boolean).map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return (
        <Text key={index} style={styles.bold}>
          {part.slice(2, -2)}
        </Text>
      );
    }
    if (part.startsWith("`") && part.endsWith("`")) {
      return (
        <Text key={index} style={styles.inlineCode}>
          {part.slice(1, -1)}
        </Text>
      );
    }
    if (part.startsWith("*") && part.endsWith("*")) {
      return (
        <Text key={index} style={styles.italic}>
          {part.slice(1, -1)}
        </Text>
      );
    }
    return <Text key={index}>{part}</Text>;
  });
}

function cleanLabels(values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  return values
    .filter((value): value is string => typeof value === "string")
    .map((value) => value.trim().slice(0, 480))
    .filter(Boolean)
    .slice(0, 8);
}

function normalizeReply(reply: CoachReply): CoachReply {
  if (!reply || typeof reply.answer !== "string" || !reply.answer.trim()) {
    throw new Error(
      "The coach did not return an answer. Your conversation was not changed.",
    );
  }
  if (typeof reply.model !== "string" || !reply.model.trim()) {
    throw new Error(
      "The coach response did not identify a model. Your conversation was not changed.",
    );
  }
  const quota = isCoachQuota(reply.quota) ? reply.quota : undefined;
  return {
    answer: cleanCoachMessage(reply.answer, 12000),
    model: reply.model.trim().slice(0, 160),
    createdAt: Number.isFinite(reply.createdAt) ? reply.createdAt : Date.now(),
    sources: Array.isArray(reply.sources) ? reply.sources : [],
    contextStatus: cleanLabels(reply.contextStatus),
    capabilities: cleanLabels(reply.capabilities),
    ...(quota ? { quota } : {}),
  };
}

function normalizeTimestamp(value: number) {
  return value > 0 && value < 1_000_000_000_000 ? value * 1000 : value;
}

function formatSourceAsOf(value: number) {
  if (!Number.isFinite(value)) return "unavailable";
  return new Date(normalizeTimestamp(value)).toLocaleString();
}

const styles = StyleSheet.create({
  keyboardAvoider: { flex: 1 },
  root: { gap: 10, minWidth: 0 },
  fullRoot: { flex: 1, minHeight: 0, backgroundColor: C.bg },
  transcriptScroll: { flex: 1 },
  fullScrollContent: { paddingHorizontal: 14, paddingBottom: 10, gap: 12 },
  compactContent: { gap: 12, minWidth: 0 },
  intro: { gap: 9 },
  introCard: { gap: 9, minWidth: 0 },
  introTopline: {
    flexDirection: "row",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: 8,
    alignItems: "center",
  },
  eyebrow: {
    color: C.lime,
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 1.1,
    flexShrink: 1,
  },
  introTitle: {
    color: C.text,
    fontSize: 18,
    fontWeight: "800",
    letterSpacing: -0.2,
  },
  introCopy: { color: C.muted, fontSize: 11, lineHeight: 17 },
  compactStatus: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    minWidth: 0,
  },
  statusDot: { width: 7, height: 7, borderRadius: 4, flexShrink: 0 },
  statusReady: { backgroundColor: C.lime },
  statusUnavailable: { backgroundColor: C.rose },
  compactStatusText: {
    color: C.text,
    fontSize: 10,
    fontWeight: "800",
    flexShrink: 0,
  },
  compactModel: {
    color: C.muted,
    fontFamily: mono,
    fontSize: 9,
    flex: 1,
    minWidth: 0,
    textAlign: "right",
  },
  statusError: { gap: 7, minWidth: 0 },
  helpLink: { color: C.lime, fontSize: 10, fontWeight: "800" },
  detailsBlock: { gap: 6, minWidth: 0 },
  detailsToggle: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    minHeight: 30,
    paddingHorizontal: 8,
  },
  detailsToggleText: { color: C.muted, fontSize: 10, fontWeight: "800" },
  detailsContent: {
    gap: 8,
    borderLeftWidth: 1,
    borderLeftColor: C.border,
    paddingLeft: 9,
    minWidth: 0,
  },
  detailList: { gap: 4, minWidth: 0 },
  detailRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 5,
    minWidth: 0,
  },
  detailBullet: { color: C.lime, fontSize: 11, lineHeight: 15, flexShrink: 0 },
  detailText: {
    color: C.muted,
    fontSize: 10,
    lineHeight: 15,
    flex: 1,
    flexShrink: 1,
  },
  promptHeader: { flexDirection: "row", justifyContent: "space-between" },
  sectionLabel: {
    color: C.muted,
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 1,
  },
  promptRow: { flexDirection: "row", flexWrap: "wrap", gap: 7, minWidth: 0 },
  prompt: {
    minHeight: 36,
    justifyContent: "center",
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.surface2,
    borderRadius: 4,
    maxWidth: "100%",
  },
  promptText: { color: C.text, fontSize: 10, fontWeight: "700", flexShrink: 1 },
  disclosure: { color: C.muted, fontSize: 10, lineHeight: 15 },
  transcriptContent: { gap: 9 },
  emptyCopy: {
    color: C.muted,
    fontSize: 11,
    lineHeight: 17,
    paddingVertical: 8,
  },
  bubble: { borderWidth: 1, borderRadius: 5, padding: 11, gap: 7 },
  userBubble: {
    alignSelf: "flex-end",
    maxWidth: "92%",
    backgroundColor: C.surface2,
    borderColor: C.border,
  },
  assistantBubble: {
    alignSelf: "flex-start",
    width: "100%",
    backgroundColor: C.surface,
    borderColor: C.border,
  },
  pendingBubble: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    minWidth: 0,
  },
  failedBubble: { backgroundColor: C.rose + "10", borderColor: C.rose + "99" },
  turnLabel: { fontSize: 9, fontWeight: "900", letterSpacing: 0.9 },
  userLabel: { color: C.blue },
  assistantLabel: { color: C.lime },
  failedLabel: { color: C.rose },
  userText: { color: C.text, fontSize: 12, lineHeight: 18 },
  pendingText: { color: C.muted, fontSize: 11 },
  errorText: {
    color: C.rose,
    fontSize: 10,
    lineHeight: 15,
    flexShrink: 1,
    minWidth: 0,
  },
  replyMeta: { gap: 7, paddingTop: 2, minWidth: 0 },
  modelText: {
    color: C.muted,
    fontSize: 9,
    fontFamily: mono,
    flexShrink: 1,
    maxWidth: "100%",
  },
  metadataBlock: { gap: 4, minWidth: 0 },
  metadataLabel: {
    color: C.muted,
    fontSize: 8,
    fontWeight: "900",
    letterSpacing: 0.9,
  },
  metadataPills: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 5,
    minWidth: 0,
  },
  metadataPill: {
    alignSelf: "flex-start",
    borderWidth: 1,
    borderRadius: 3,
    maxWidth: "100%",
    minWidth: 0,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  metadataPillText: {
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 0.3,
    flexShrink: 1,
    minWidth: 0,
  },
  citations: { gap: 5, minWidth: 0 },
  citation: {
    flexDirection: "row",
    gap: 6,
    alignItems: "flex-start",
    minWidth: 0,
  },
  citationText: {
    flex: 1,
    flexShrink: 1,
    minWidth: 0,
    color: C.blue,
    fontSize: 10,
    lineHeight: 15,
  },
  composer: {
    borderTopWidth: 1,
    borderTopColor: C.border,
    backgroundColor: C.bg,
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: Platform.OS === "web" ? 12 : 8,
    gap: 7,
  },
  inputRow: { flexDirection: "row", alignItems: "flex-end", gap: 8 },
  input: {
    flex: 1,
    minHeight: 48,
    maxHeight: 112,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 5,
    backgroundColor: C.black + "99",
    color: C.text,
    fontSize: 12,
    lineHeight: 17,
    paddingHorizontal: 10,
    paddingVertical: 9,
  },
  send: {
    width: 44,
    minHeight: 44,
    borderRadius: 5,
    backgroundColor: C.lime,
    alignItems: "center",
    justifyContent: "center",
  },
  composerMeta: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  composerHint: { flex: 1, color: C.muted, fontSize: 9, lineHeight: 13 },
  clearButton: {
    minHeight: 36,
    justifyContent: "center",
    paddingHorizontal: 8,
  },
  clearText: { color: C.muted, fontSize: 10, fontWeight: "800" },
  notice: { color: C.amber, fontSize: 10, lineHeight: 15, flexShrink: 1 },
  quotaNotice: { color: C.muted, fontSize: 9, lineHeight: 14, flexShrink: 1 },
  quotaText: { color: C.muted, fontSize: 9, lineHeight: 14, flexShrink: 1 },
  smallButton: {
    alignSelf: "flex-start",
    minHeight: 36,
    justifyContent: "center",
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 4,
    backgroundColor: C.surface2,
    paddingHorizontal: 10,
  },
  smallButtonText: { color: C.text, fontSize: 10, fontWeight: "800" },
  markdown: { gap: 3, minWidth: 0 },
  markdownText: {
    color: C.text,
    fontSize: 12,
    lineHeight: 18,
    flexShrink: 1,
    minWidth: 0,
  },
  markdownHeading: {
    color: C.text,
    fontSize: 13,
    lineHeight: 19,
    fontWeight: "800",
    marginTop: 2,
  },
  markdownSpace: { height: 4 },
  bulletRow: { flexDirection: "row", gap: 7, paddingLeft: 2, minWidth: 0 },
  bulletMark: { color: C.lime, fontSize: 12, lineHeight: 18 },
  codeBlock: {
    color: C.blue,
    backgroundColor: C.black + "88",
    fontFamily: mono,
    fontSize: 10,
    lineHeight: 15,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  inlineCode: {
    color: C.blue,
    fontFamily: mono,
    fontSize: 11,
    backgroundColor: C.black + "88",
  },
  bold: { fontWeight: "800", color: C.text },
  italic: { fontStyle: "italic" },
});
