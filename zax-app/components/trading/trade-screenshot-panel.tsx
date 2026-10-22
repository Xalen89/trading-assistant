import * as DocumentPicker from "expo-document-picker";
import { EncodingType, readAsStringAsync } from "expo-file-system/legacy";
import { useState, type ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useWorkspace } from "@/hooks/use-workspace";
import { trpc } from "@/lib/trpc";
import {
  type ScreenshotStage,
  type TradeScreenshotSourceContext,
  type TradeScreenshotReview,
} from "@/lib/trading/trade-screenshot-types";
import {
  MAX_UPLOAD_BYTES,
  assertBase64UploadLimits,
  assertUploadByteLimit,
} from "@/lib/trading/upload-byte-limits";
import { ActionButton, Card, Input, Pill, SectionLabel } from "./ui";
import { C } from "./theme";

type Candidate = {
  filename: string;
  mime: "image/png" | "image/jpeg" | "image/webp";
  base64: string;
  size: number;
};

type SourceSummary = {
  id: string;
  version: number;
  filename?: string;
  mime?: string;
  createdAt?: number;
  sourceContext?: TradeScreenshotSourceContext;
};

export type TradeScreenshotPanelProps = {
  /** When supplied, the owner can explicitly link this review to that canonical paper record. */
  tradeId?: string;
  /** Compatibility alias for per-trade sheets; `tradeId` takes precedence. */
  canonicalTradeId?: string;
  initialStage?: ScreenshotStage;
  compact?: boolean;
  onRetained?: (result: {
    source: SourceSummary;
    review: TradeScreenshotReview;
  }) => void;
  /** Parent mounts SourcePreview after it has registered the sourcePreview router. */
  renderSourcePreview?: (source: SourceSummary, evidence?: string) => ReactNode;
};

const ACCEPTED_IMAGES = ["image/png", "image/jpeg", "image/webp"] as const;
const STAGES: { value: ScreenshotStage; label: string }[] = [
  { value: "before", label: "Before" },
  { value: "during", label: "During" },
  { value: "after", label: "After" },
  { value: "unknown", label: "Unknown" },
];
const SCREENSHOT_ANALYSIS_CLIENT_TIMEOUT_MS = 100_000;

/** Keeps the UI deadline slightly above the server's 90-second bounded provider deadline. */
function withScreenshotClientDeadline<T>(operation: Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () =>
        reject(
          new Error(
            "Screenshot analysis exceeded the 90-second service window. The original remains retained for retry.",
          ),
        ),
      SCREENSHOT_ANALYSIS_CLIENT_TIMEOUT_MS,
    );
    operation.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

function mimeFromName(name: string): Candidate["mime"] | undefined {
  const lower = name.toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".webp")) return "image/webp";
  return undefined;
}

async function readImage(
  asset: DocumentPicker.DocumentPickerAsset,
): Promise<Candidate> {
  const mime = ACCEPTED_IMAGES.includes(asset.mimeType as Candidate["mime"])
    ? (asset.mimeType as Candidate["mime"])
    : mimeFromName(asset.name);
  if (!mime) throw new Error("Choose a PNG, JPEG, or WebP screenshot.");
  if ((asset.size || 0) > MAX_UPLOAD_BYTES)
    throw new Error("Screenshots are limited to 8 MiB.");
  let base64: string;
  let size: number;
  if ((asset as any).file?.arrayBuffer) {
    const bytes = new Uint8Array(await (asset as any).file.arrayBuffer());
    if (!bytes.length) throw new Error("Screenshots are limited to 8 MiB.");
    size = assertUploadByteLimit(
      bytes.length,
      "Screenshots are limited to 8 MiB.",
    );
    let binary = "";
    for (let offset = 0; offset < bytes.length; offset += 0x8000) {
      binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
    }
    base64 = btoa(binary);
    assertBase64UploadLimits(base64, "Screenshots are limited to 8 MiB.");
  } else {
    base64 = await readAsStringAsync(asset.uri, {
      encoding: EncodingType.Base64,
    });
    if (!base64) throw new Error("Screenshots are limited to 8 MiB.");
    size = assertBase64UploadLimits(
      base64,
      "Screenshots are limited to 8 MiB.",
    );
  }
  return { filename: asset.name, mime, base64, size };
}

function ownerTimestamp(value: string): number | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (!/(?:Z|[+-]\d{2}:\d{2})$/i.test(trimmed)) {
    throw new Error(
      "Use an ISO time with Z or an offset, for example 2026-10-17T09:30:00-04:00.",
    );
  }
  const parsed = Date.parse(trimmed);
  if (!Number.isFinite(parsed))
    throw new Error(
      "Use a valid known ISO date/time, for example 2026-10-17T09:30:00-04:00.",
    );
  return parsed;
}

/**
 * Compact disclosure-style panel. It never reads an existing original on the
 * client; the server retrieves protected bytes by source ID after upload.
 */
export function TradeScreenshotPanel({
  tradeId,
  canonicalTradeId,
  initialStage = "unknown",
  compact = false,
  onRetained,
  renderSourcePreview,
}: TradeScreenshotPanelProps) {
  const { workspace } = useWorkspace();
  const activeStrategy =
    workspace.strategies.find(
      (item) => item.id === workspace.activeStrategyId,
    ) ?? workspace.strategies[0];
  const linkedRecordId = tradeId ?? canonicalTradeId;
  const utils = trpc.useUtils();
  const retainedSources = trpc.tradeScreenshot.list.useQuery(
    { tradeId: linkedRecordId },
    { retry: false, staleTime: 10000 },
  );
  const [openingSource, setOpeningSource] = useState(false);
  const api = trpc.tradeScreenshot;
  const upload = api.upload.useMutation();
  const analyze = api.analyze.useMutation();
  const confirm = api.confirm.useMutation();
  const [expanded, setExpanded] = useState(!compact);
  const [candidate, setCandidate] = useState<Candidate>();
  const [source, setSource] = useState<SourceSummary>();
  const [stage, setStage] = useState<ScreenshotStage>(initialStage);
  const [linkToTrade, setLinkToTrade] = useState(Boolean(linkedRecordId));
  const [knownTime, setKnownTime] = useState("");
  const [timezone, setTimezone] = useState("");
  const [review, setReview] = useState<TradeScreenshotReview>();
  const [notice, setNotice] = useState<string>();
  const [retainedLimit, setRetainedLimit] = useState(20);

  const busy =
    upload.isPending || analyze.isPending || confirm.isPending || openingSource;
  const canUpload = Boolean(candidate && activeStrategy && !busy);
  const linkedTradeId =
    linkToTrade && linkedRecordId ? linkedRecordId : undefined;

  const pick = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: [...ACCEPTED_IMAGES],
        copyToCacheDirectory: true,
      });
      if (result.canceled) return;
      const next = await readImage(result.assets[0]);
      setCandidate(next);
      setSource(undefined);
      setReview(undefined);
      setNotice(`Selected ${next.filename}. It has not been uploaded yet.`);
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : "Unable to read the screenshot.",
      );
    }
  };

  const runAnalysis = async (current: SourceSummary) => {
    try {
      const capturedAt = ownerTimestamp(knownTime);
      setNotice("Analyzing the retained private source…");
      const next = await withScreenshotClientDeadline(
        analyze.mutateAsync({
          sourceId: current.id,
          expectedSourceVersion: current.version,
          stage,
          ...(linkedTradeId ? { canonicalTradeId: linkedTradeId } : {}),
          ...(capturedAt === undefined ? {} : { ownerCapturedAt: capturedAt }),
          ...(timezone.trim() ? { ownerTimezone: timezone.trim() } : {}),
        }),
      );
      setReview(next);
      setNotice(
        "Draft review ready. Confirm to retain it as a new protected source revision.",
      );
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : "Screenshot analysis could not finish. The original remains retained for retry.",
      );
    }
  };

  const uploadAndAnalyze = async () => {
    if (!candidate || !activeStrategy) return;
    try {
      setNotice("Uploading encrypted screenshot source…");
      const uploaded = await upload.mutateAsync({
        filename: candidate.filename,
        mime: candidate.mime,
        base64: candidate.base64,
        label: candidate.filename.replace(/\.[^.]+$/, ""),
        market: workspace.market,
        timeframe: workspace.timeframe,
        strategyId: activeStrategy.id,
        strategyVersion: activeStrategy.version,
        ...(linkedTradeId ? { canonicalTradeId: linkedTradeId } : {}),
      });
      const next = {
        id: uploaded.id,
        version: uploaded.version,
        filename: uploaded.filename,
        mime: uploaded.mime,
        createdAt: uploaded.createdAt,
      };
      setSource(next);
      setCandidate(undefined);
      void utils.tradeScreenshot.list.invalidate();
      await runAnalysis(next);
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : "Screenshot upload could not finish. No review was retained.",
      );
    }
  };

  const retain = async () => {
    if (!review || !source) return;
    try {
      setNotice("Confirming a protected source revision…");
      const result = await confirm.mutateAsync({
        review,
        expectedSourceVersion: source.version,
      });
      const nextSource = {
        id: result.source.id,
        version: result.source.version,
        filename: result.source.filename,
        mime: result.source.mime,
        createdAt: result.source.createdAt,
      };
      setSource(nextSource);
      setReview(result.review);
      setNotice(
        "Review retained. It is coaching material only; no canonical trade fields changed.",
      );
      void utils.tradeScreenshot.list.invalidate();
      onRetained?.({ source: nextSource, review: result.review });
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : "The review was not retained. Reload if the source changed elsewhere.",
      );
    }
  };

  const reopen = async (id: string) => {
    setOpeningSource(true);
    try {
      const record = await utils.tradeScreenshot.definition.fetch({
        sourceId: id,
      });
      setSource({
        id: record.id,
        version: record.version,
        filename: record.filename,
        mime: record.mime,
        createdAt: record.uploadedAt,
        sourceContext: record.sourceContext,
      });
      setCandidate(undefined);
      setReview(record.tradeReview);
      if (record.sourceContext) {
        setLinkToTrade(
          record.sourceContext.canonicalTradeId === linkedRecordId,
        );
      }
      if (record.tradeReview) {
        setStage(record.tradeReview.stage);
        setKnownTime(
          record.tradeReview.ownerTime.captureOrTradeAt === null
            ? ""
            : new Date(
                record.tradeReview.ownerTime.captureOrTradeAt,
              ).toISOString(),
        );
        setTimezone(record.tradeReview.ownerTime.timezone ?? "");
      }
      setNotice(
        record.tradeReview
          ? "Retained source review reopened. It is not a verified fill/outcome."
          : "Original retained screenshot selected; choose stage and analyze.",
      );
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : "Retained review unavailable.",
      );
    } finally {
      setOpeningSource(false);
    }
  };
  return (
    <Card style={styles.root}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Toggle trade screenshot review"
        onPress={() => setExpanded((value) => !value)}
        style={styles.heading}
      >
        <View style={styles.headingCopy}>
          <SectionLabel>Screenshot review</SectionLabel>
          <Text style={styles.title}>
            Private chart evidence, not a trade record
          </Text>
        </View>
        <Pill label={expanded ? "HIDE" : "OPEN"} tone="muted" />
      </Pressable>
      {!expanded ? null : (
        <View style={styles.content}>
          <Text style={styles.copy}>
            Upload a screenshot before, during, or after a trade. The review
            separates visible facts from uncertainty and never changes canonical
            fills, SL/TP, or outcomes.
          </Text>
          {retainedSources.data?.length ? (
            <View>
              <SectionLabel>Retained screenshots</SectionLabel>
              {retainedSources.data
                .slice(0, Math.min(retainedLimit, 100))
                .map((record) => (
                  <Pressable
                    key={record.id}
                    onPress={() => void reopen(record.id)}
                    disabled={busy}
                    accessibilityRole="button"
                    style={styles.linkRow}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={styles.linkText} numberOfLines={2}>
                        {record.name} · v{record.version}
                      </Text>
                      <Text style={styles.muted} numberOfLines={2}>
                        {record.stage ?? "Not analyzed"} ·{" "}
                        {record.approval ?? "Original retained"} ·{" "}
                        {record.summary ?? "Tap to review original source"}
                      </Text>
                    </View>
                  </Pressable>
                ))}
              {retainedSources.data.length > retainedLimit &&
              retainedLimit < 100 ? (
                <ActionButton
                  compact
                  kind="ghost"
                  label={`Show more (${Math.min(retainedLimit, 100)} of ${Math.min(retainedSources.data.length, 100)})`}
                  onPress={() =>
                    setRetainedLimit((current) => Math.min(current + 20, 100))
                  }
                />
              ) : retainedSources.data.length > 100 ? (
                <Text style={styles.muted}>
                  Showing the first 100 locally loaded retained sources.
                </Text>
              ) : null}
            </View>
          ) : null}
          {retainedSources.isError ? (
            <Text style={styles.muted}>
              Retained source list unavailable: {retainedSources.error.message}
            </Text>
          ) : null}
          <View style={styles.stageRow}>
            {STAGES.map((option) => (
              <Pressable
                key={option.value}
                accessibilityRole="button"
                accessibilityState={{ selected: stage === option.value }}
                disabled={busy}
                onPress={() => setStage(option.value)}
                style={({ pressed }) => [
                  styles.stage,
                  stage === option.value && styles.stageSelected,
                  { opacity: busy ? 0.42 : pressed ? 0.72 : 1 },
                ]}
              >
                <Text
                  style={[
                    styles.stageText,
                    stage === option.value && styles.stageTextSelected,
                  ]}
                >
                  {option.label}
                </Text>
              </Pressable>
            ))}
          </View>
          {linkedRecordId ? (
            <Pressable
              accessibilityRole="checkbox"
              accessibilityState={{ checked: linkToTrade }}
              disabled={busy}
              onPress={() => setLinkToTrade((value) => !value)}
              style={styles.linkRow}
            >
              <View style={[styles.check, linkToTrade && styles.checkOn]} />
              <Text style={styles.linkText}>
                Link to this canonical paper trade (owner-scoped verification
                only)
              </Text>
            </Pressable>
          ) : (
            <Text style={styles.muted}>
              Standalone mode · no canonical trade is linked.
            </Text>
          )}
          <Input
            label="Known capture/trade time (optional)"
            value={knownTime}
            onChangeText={setKnownTime}
            placeholder="2026-10-17T09:30:00-04:00"
          />
          <Input
            label="Known timezone (optional)"
            value={timezone}
            onChangeText={setTimezone}
            placeholder="America/New_York"
          />
          <View style={styles.actions}>
            <ActionButton
              compact
              icon="image-outline"
              kind="secondary"
              label={candidate ? "Choose another" : "Choose screenshot"}
              disabled={busy}
              onPress={() => void pick()}
            />
            <ActionButton
              compact
              icon="sparkles-outline"
              label={
                upload.isPending
                  ? "Uploading…"
                  : analyze.isPending
                    ? "Analyzing…"
                    : "Upload & analyze"
              }
              disabled={!canUpload}
              onPress={() => void uploadAndAnalyze()}
            />
          </View>
          {source ? (
            <View style={styles.sourceSummary}>
              <Text style={styles.summaryLabel}>RETAINED SOURCE</Text>
              <Text style={styles.summaryText}>
                {source.filename || source.id} · v{source.version} ·{" "}
                {source.mime || "private image"}
              </Text>
              <Text style={styles.muted}>
                Uploaded{" "}
                {source.createdAt
                  ? new Date(source.createdAt).toLocaleString()
                  : "time unavailable"}
                . Retry reuses this original; it does not upload another file.
              </Text>
              {renderSourcePreview
                ? renderSourcePreview(source, review?.textualEvidence[0]?.text)
                : null}
              {!review ? (
                <ActionButton
                  compact
                  kind="secondary"
                  label={analyze.isPending ? "Analyzing…" : "Retry analysis"}
                  disabled={busy}
                  onPress={() => void runAnalysis(source)}
                />
              ) : null}
            </View>
          ) : null}
          {notice ? (
            <Text
              accessibilityRole={notice.includes("ready") ? undefined : "alert"}
              accessibilityLiveRegion="polite"
              style={styles.notice}
            >
              {notice}
            </Text>
          ) : null}
          {review ? (
            <ReviewDraft
              review={review}
              busy={busy}
              onConfirm={() => void retain()}
            />
          ) : null}
        </View>
      )}
    </Card>
  );
}

function ReviewDraft({
  review,
  busy,
  onConfirm,
}: {
  review: TradeScreenshotReview;
  busy: boolean;
  onConfirm: () => void;
}) {
  const approved = review.approval.status === "approved";
  return (
    <View style={styles.review}>
      <View style={styles.reviewHead}>
        <Text style={styles.summaryLabel}>
          {approved ? "RETAINED REVIEW" : "UNAPPROVED REVIEW"}
        </Text>
        <Pill
          label={approved ? "APPROVED" : "REVIEW FIRST"}
          tone={approved ? "mint" : "amber"}
        />
      </View>
      <Text style={styles.reviewSummary}>{review.summary}</Text>
      <Text style={styles.muted}>
        Stage: {review.stage} · visible time: {review.visibleTime.status} ·
        outcome: unverified from screenshot
      </Text>
      <EvidenceList
        title="Visible facts"
        values={review.visibleFacts.map(
          (item) =>
            `${item.observation} — ${item.evidence} (${item.certainty})`,
        )}
      />
      <TextualEvidenceList values={review.textualEvidence} />
      <EvidenceList
        title="Confluence observations"
        values={review.confluences.map(
          (item) => `${item.observation} — ${item.missing}`,
        )}
      />
      <EvidenceList
        title="Bounded process lessons"
        values={review.processLessons.map((item) => item.lesson)}
      />
      <EvidenceList
        title="Limits / unknowns"
        values={review.limitations}
        tone="amber"
      />
      {!approved ? (
        <ActionButton
          compact
          icon="checkmark-circle-outline"
          label={busy ? "Confirming…" : "Confirm & retain review"}
          disabled={busy}
          onPress={onConfirm}
        />
      ) : null}
      <Text style={styles.disclosure}>
        Confirming creates a protected source revision only. It does not
        validate a strategy, fill, SL/TP, or outcome.
      </Text>
    </View>
  );
}

function TextualEvidenceList({
  values,
}: {
  values: TradeScreenshotReview["textualEvidence"];
}) {
  if (!values.length) return null;
  return (
    <View style={styles.list}>
      <Text style={styles.summaryLabel}>VISIBLE TEXT &amp; UNCERTAINTY</Text>
      {values.slice(0, 5).map((item, index) => (
        <View key={`${item.location}-${index}`} style={styles.evidenceItem}>
          <Text style={styles.listText}>• “{item.text}”</Text>
          <Text style={styles.muted}>
            Location: {item.location} · certainty: {item.certainty}
          </Text>
          <Text style={styles.muted}>Unknowns: {item.uncertainty}</Text>
        </View>
      ))}
    </View>
  );
}

function EvidenceList({
  title,
  values,
  tone = "muted",
}: {
  title: string;
  values: string[];
  tone?: "muted" | "amber";
}) {
  if (!values.length) return null;
  return (
    <View style={styles.list}>
      <Text
        style={[styles.summaryLabel, tone === "amber" && { color: C.amber }]}
      >
        {title.toUpperCase()}
      </Text>
      {values.slice(0, 5).map((value, index) => (
        <Text key={`${title}-${index}`} style={styles.listText}>
          • {value}
        </Text>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: 0, padding: 0, overflow: "hidden" },
  heading: {
    minHeight: 54,
    padding: 11,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8,
  },
  headingCopy: { flex: 1, gap: 2 },
  title: { color: C.text, fontSize: 13, fontWeight: "800" },
  content: { borderTopWidth: 1, borderTopColor: C.border, padding: 11, gap: 9 },
  copy: { color: C.muted, fontSize: 11, lineHeight: 16 },
  stageRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  stage: {
    minHeight: 32,
    justifyContent: "center",
    paddingHorizontal: 9,
    borderRadius: 3,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.surface2,
  },
  stageSelected: { borderColor: C.lime, backgroundColor: C.lime + "1c" },
  stageText: { color: C.muted, fontSize: 10, fontWeight: "800" },
  stageTextSelected: { color: C.lime },
  linkRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minHeight: 32,
  },
  check: {
    width: 16,
    height: 16,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 3,
    backgroundColor: C.black,
  },
  checkOn: { borderColor: C.lime, backgroundColor: C.lime },
  linkText: { flex: 1, color: C.text, fontSize: 10, lineHeight: 15 },
  muted: { color: C.muted, fontSize: 10, lineHeight: 15 },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 7 },
  sourceSummary: {
    gap: 5,
    padding: 9,
    borderRadius: 3,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.black + "44",
  },
  summaryLabel: {
    color: C.muted,
    fontSize: 8,
    fontWeight: "900",
    letterSpacing: 0.9,
  },
  summaryText: { color: C.text, fontSize: 11, fontWeight: "700" },
  notice: { color: C.amber, fontSize: 10, lineHeight: 15 },
  review: {
    gap: 8,
    padding: 10,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 3,
    backgroundColor: C.surface2,
  },
  reviewHead: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8,
  },
  reviewSummary: { color: C.text, fontSize: 12, lineHeight: 18 },
  list: { gap: 3 },
  evidenceItem: { gap: 2, paddingBottom: 3 },
  listText: { color: C.muted, fontSize: 10, lineHeight: 15 },
  disclosure: { color: C.muted, fontSize: 9, lineHeight: 14, marginTop: 2 },
});
