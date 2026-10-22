import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { C } from "./theme";

export type SourcePreviewKind = "image" | "pdf" | "text" | "unsupported";

export type SourcePreviewInfo = {
  sourceId: string;
  sourceVersion: number;
  filename?: string;
  mime: string;
  kind: SourcePreviewKind;
  pageCount: number;
  previewPageCount: number;
  evidencePage: number | null;
  evidenceFound: boolean;
  limits: { maxPreviewBytes: number; maxPreviewPages: number; maxTextBytes: number };
  coachImage: { eligible: boolean; maxDimension: number; maxBytes: number };
};

export type SourcePreviewPage = {
  sourceId: string;
  sourceVersion: number;
  page: number;
  pageCount: number;
  mime: "image/jpeg";
  base64: string;
  bytes: number;
  width: number;
  height: number;
};

export type SourcePreviewText = {
  sourceId: string;
  sourceVersion: number;
  page: number | null;
  pageCount: number;
  text: string;
  evidenceStart: number | null;
  evidenceEnd: number | null;
  evidenceFound: boolean;
  truncated: boolean;
};

/** Adapter supplied by the parent where the typed `trpc.sourcePreview` router is mounted. */
export type SourcePreviewApi = {
  info: (input: { sourceId: string; evidence?: string }) => Promise<SourcePreviewInfo>;
  page: (input: {
    sourceId: string;
    page?: number;
    maxDimension?: number;
  }) => Promise<SourcePreviewPage>;
  text: (input: {
    sourceId: string;
    page?: number;
    evidence?: string;
  }) => Promise<SourcePreviewText>;
};

export type SourcePreviewProps = {
  api: SourcePreviewApi;
  sourceId: string;
  /** Literal source quote from a reviewed blueprint/screenshot. It is never sent to a model here. */
  evidence?: string;
  compact?: boolean;
  /** Parent sets true only after its coach request actually included the generated thumbnail. */
  coachAttachment?: { attached: boolean; label?: string };
  onLoaded?: (info: SourcePreviewInfo) => void;
};

type SettledRequest<T> =
  | { key: string; value: T; error?: never }
  | { key: string; value?: never; error: string };

function bytesLabel(bytes: number) {
  return `${Math.max(1, Math.round(bytes / 1024))} KiB`;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Private source preview is unavailable.";
}

function TextEvidence({ value }: { value: SourcePreviewText }) {
  const range =
    value.evidenceStart !== null &&
    value.evidenceEnd !== null &&
    value.evidenceEnd > value.evidenceStart
      ? { start: value.evidenceStart, end: value.evidenceEnd }
      : null;
  if (!range) return <Text style={styles.sourceText}>{value.text || "No extractable text on this page."}</Text>;
  return (
    <Text style={styles.sourceText}>
      {value.text.slice(0, range.start)}
      <Text style={styles.highlight}>{value.text.slice(range.start, range.end)}</Text>
      {value.text.slice(range.end)}
    </Text>
  );
}

/**
 * Displays only bounded owner-authenticated RPC payloads. It never accepts a
 * signed URL, file key, cookie, or original data supplied by a caller.
 */
export function SourcePreview({
  api,
  sourceId,
  evidence,
  compact = false,
  coachAttachment,
  onLoaded,
}: SourcePreviewProps) {
  const evidenceQuery = evidence?.trim() ?? "";
  const sourceKey = JSON.stringify([sourceId, evidenceQuery]);
  const [infoResult, setInfoResult] = useState<SettledRequest<SourcePreviewInfo>>();
  const [page, setPage] = useState(1);
  const [pageResult, setPageResult] = useState<SettledRequest<SourcePreviewPage>>();
  const [textResult, setTextResult] = useState<SettledRequest<SourcePreviewText>>();
  const [mode, setMode] = useState<"original" | "text">("original");
  const [zoom, setZoom] = useState(1);
  const [viewportWidth, setViewportWidth] = useState(300);
  const textScroll = useRef<ScrollView>(null);

  useEffect(() => {
    let live = true;
    void Promise.resolve()
      .then(() =>
        api.info({
          sourceId,
          ...(evidenceQuery ? { evidence: evidenceQuery } : {}),
        }),
      )
      .then((next) => {
        if (!live) return;
        setInfoResult({ key: sourceKey, value: next });
        setPage(next.evidencePage ?? 1);
        setMode(next.kind === "text" ? "text" : "original");
        onLoaded?.(next);
      })
      .catch((nextError) => {
        if (live) setInfoResult({ key: sourceKey, error: errorMessage(nextError) });
      });
    return () => {
      live = false;
    };
  }, [api, evidenceQuery, onLoaded, sourceId, sourceKey]);

  const currentInfoResult =
    infoResult?.key === sourceKey ? infoResult : undefined;
  const info = currentInfoResult?.value;
  const loadingInfo = !currentInfoResult;
  const pageKey = JSON.stringify([
    sourceKey,
    info?.sourceVersion,
    page,
    compact ? 900 : 1_200,
  ]);
  const textKey = JSON.stringify([
    sourceKey,
    info?.sourceVersion,
    info?.kind === "pdf" ? page : null,
  ]);
  const canRenderPage = Boolean(
    info && mode === "original" && (info.kind === "image" || info.kind === "pdf"),
  );
  const canRenderText = Boolean(
    info && mode === "text" && (info.kind === "text" || info.kind === "pdf"),
  );

  useEffect(() => {
    if (!info || mode !== "original" || (info.kind !== "image" && info.kind !== "pdf")) return;
    let live = true;
    void Promise.resolve()
      .then(() => api.page({ sourceId, page, maxDimension: compact ? 900 : 1_200 }))
      .then((next) => {
        if (!live) return;
        setPageResult({ key: pageKey, value: next });
        setZoom(1);
      })
      .catch((nextError) => {
        if (live) setPageResult({ key: pageKey, error: errorMessage(nextError) });
      });
    return () => {
      live = false;
    };
  }, [api, compact, info, mode, page, pageKey, sourceId]);

  useEffect(() => {
    if (!info || mode !== "text" || (info.kind !== "text" && info.kind !== "pdf")) return;
    let live = true;
    void Promise.resolve()
      .then(() =>
        api.text({
          sourceId,
          ...(info.kind === "pdf" ? { page } : {}),
          ...(evidenceQuery ? { evidence: evidenceQuery } : {}),
        }),
      )
      .then((next) => {
        if (!live) return;
        setTextResult({ key: textKey, value: next });
        requestAnimationFrame(() => textScroll.current?.scrollTo({ y: 0, animated: true }));
      })
      .catch((nextError) => {
        if (live) setTextResult({ key: textKey, error: errorMessage(nextError) });
      });
    return () => {
      live = false;
    };
  }, [api, evidenceQuery, info, mode, page, sourceId, textKey]);

  const currentPageResult =
    pageResult?.key === pageKey ? pageResult : undefined;
  const currentTextResult =
    textResult?.key === textKey ? textResult : undefined;
  const preview = currentPageResult?.value;
  const text = currentTextResult?.value;
  const loadingPage = canRenderPage && !currentPageResult;
  const loadingText = canRenderText && !currentTextResult;
  const error =
    currentInfoResult?.error ??
    (mode === "original" ? currentPageResult?.error : currentTextResult?.error);

  const imageUri = useMemo(
    () => (preview ? `data:${preview.mime};base64,${preview.base64}` : undefined),
    [preview],
  );
  const imageWidth = preview
    ? Math.max(220, viewportWidth * zoom)
    : viewportWidth;
  const imageHeight = preview
    ? Math.max(160, (imageWidth * preview.height) / Math.max(1, preview.width))
    : 240;
  const canUseText = info?.kind === "text" || info?.kind === "pdf";
  const canJump = Boolean(evidence?.trim() && canUseText);
  const maxPage = info?.previewPageCount ?? 1;

  const jumpToEvidence = () => {
    if (!info) return;
    if (info.kind === "pdf" && info.evidencePage) setPage(info.evidencePage);
    setMode("text");
  };

  if (loadingInfo) {
    return (
      <View style={styles.loading} accessibilityLiveRegion="polite">
        <ActivityIndicator color={C.lime} size="small" />
        <Text style={styles.muted}>Opening retained private source…</Text>
      </View>
    );
  }

  if (!info) {
    return error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null;
  }

  return (
    <View style={[styles.root, compact && styles.compactRoot]}>
      <View style={styles.header}>
        <View style={styles.headerCopy}>
          <Text style={styles.eyebrow}>AUTHORITATIVE ORIGINAL · PRIVATE</Text>
          <Text numberOfLines={2} style={styles.filename}>{info.filename || "Retained source"}</Text>
          <Text style={styles.muted}>
            {info.kind === "pdf" ? `${info.pageCount} page${info.pageCount === 1 ? "" : "s"}` : info.mime}
            {info.kind === "pdf" && info.pageCount > info.previewPageCount
              ? ` · preview pages 1–${info.previewPageCount}`
              : ""}
          </Text>
        </View>
        {coachAttachment?.attached ? (
          <Text style={styles.attached}>{coachAttachment.label || "COACH IMAGE ATTACHED"}</Text>
        ) : info.coachImage.eligible ? (
          <Text style={styles.ready}>COACH IMAGE READY</Text>
        ) : null}
      </View>

      <Text style={styles.boundary}>
        Rendered from an owner-authenticated, bounded preview. No storage URL or encryption material is exposed.
      </Text>

      {(info.kind === "image" || info.kind === "pdf") ? (
        <View style={styles.controlRow}>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ selected: mode === "original" }}
            onPress={() => setMode("original")}
            style={[styles.control, mode === "original" && styles.controlSelected]}
          >
            <Text style={[styles.controlText, mode === "original" && styles.controlTextSelected]}>Original</Text>
          </Pressable>
          {canUseText ? (
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ selected: mode === "text" }}
              onPress={() => setMode("text")}
              style={[styles.control, mode === "text" && styles.controlSelected]}
            >
              <Text style={[styles.controlText, mode === "text" && styles.controlTextSelected]}>Text evidence</Text>
            </Pressable>
          ) : null}
          {canJump ? (
            <Pressable accessibilityRole="button" onPress={jumpToEvidence} style={styles.jump}>
              <Text style={styles.jumpText}>Jump to quote</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      {info.kind === "unsupported" ? (
        <Text style={styles.error}>This retained file type cannot be rendered in the private preview.</Text>
      ) : mode === "text" ? (
        <View style={styles.textFrame}>
          {loadingText ? (
            <View style={styles.loading}><ActivityIndicator color={C.lime} size="small" /><Text style={styles.muted}>Finding evidence in original text…</Text></View>
          ) : text ? (
            <ScrollView ref={textScroll} nestedScrollEnabled style={styles.textScroll} contentContainerStyle={styles.textContent}>
              {text.evidenceFound ? <Text style={styles.match}>Quoted evidence highlighted below{typeof text.page === "number" ? ` · page ${text.page}` : ""}.</Text> : evidence ? <Text style={styles.warn}>Quote was not found in this bounded text layer.</Text> : null}
              <TextEvidence value={text} />
              {text.truncated ? <Text style={styles.muted}>Text is bounded for private mobile review.</Text> : null}
            </ScrollView>
          ) : null}
        </View>
      ) : (
        <View style={styles.imageFrame} onLayout={(event) => setViewportWidth(Math.max(220, event.nativeEvent.layout.width - 2))}>
          {loadingPage ? (
            <View style={styles.loading}><ActivityIndicator color={C.lime} size="small" /><Text style={styles.muted}>Rendering bounded original preview…</Text></View>
          ) : imageUri ? (
            <ScrollView nestedScrollEnabled style={styles.imageVertical} contentContainerStyle={styles.imageVerticalContent} maximumZoomScale={1} minimumZoomScale={1}>
              <ScrollView horizontal nestedScrollEnabled showsHorizontalScrollIndicator contentContainerStyle={styles.imageHorizontalContent}>
                <Image accessibilityLabel="Bounded private original preview" source={{ uri: imageUri }} resizeMode="contain" style={{ width: imageWidth, height: imageHeight }} />
              </ScrollView>
            </ScrollView>
          ) : null}
        </View>
      )}

      {(info.kind === "image" || info.kind === "pdf") && mode === "original" ? (
        <View style={styles.controlRow}>
          <Pressable accessibilityRole="button" accessibilityLabel="Zoom out original" disabled={zoom <= 0.75} onPress={() => setZoom((value) => Math.max(0.75, Number((value - 0.25).toFixed(2))))} style={styles.control}>
            <Text style={styles.controlText}>− Zoom</Text>
          </Pressable>
          <Text style={styles.zoomText}>{Math.round(zoom * 100)}% · pan by scrolling</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Zoom in original" disabled={zoom >= 2.5} onPress={() => setZoom((value) => Math.min(2.5, Number((value + 0.25).toFixed(2))))} style={styles.control}>
            <Text style={styles.controlText}>+ Zoom</Text>
          </Pressable>
        </View>
      ) : null}

      {info.kind === "pdf" ? (
        <View style={styles.pageRow}>
          <Pressable accessibilityRole="button" disabled={page <= 1} onPress={() => setPage((value) => Math.max(1, value - 1))} style={styles.control}>
            <Text style={styles.controlText}>Previous</Text>
          </Pressable>
          <Text style={styles.pageText}>Page {page} of {maxPage}</Text>
          <Pressable accessibilityRole="button" disabled={page >= maxPage} onPress={() => setPage((value) => Math.min(maxPage, value + 1))} style={styles.control}>
            <Text style={styles.controlText}>Next</Text>
          </Pressable>
        </View>
      ) : null}

      {preview ? <Text style={styles.muted}>Bounded preview · {bytesLabel(preview.bytes)} · JPEG metadata stripped</Text> : null}
      {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: 8, minWidth: 0, borderWidth: 1, borderColor: C.border, borderRadius: 4, padding: 10, backgroundColor: C.surface2 },
  compactRoot: { padding: 8 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 8 },
  headerCopy: { flex: 1, gap: 2, minWidth: 0 },
  eyebrow: { color: C.lime, fontSize: 8, fontWeight: "900", letterSpacing: 0.8 },
  filename: { color: C.text, fontSize: 12, fontWeight: "800" },
  attached: { color: C.lime, fontSize: 8, fontWeight: "900", textAlign: "right", maxWidth: 115 },
  ready: { color: C.blue, fontSize: 8, fontWeight: "900", textAlign: "right", maxWidth: 115 },
  boundary: { color: C.muted, fontSize: 10, lineHeight: 15 },
  controlRow: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 6 },
  control: { minHeight: 32, justifyContent: "center", paddingHorizontal: 9, borderRadius: 3, borderWidth: 1, borderColor: C.border, backgroundColor: C.black + "66" },
  controlSelected: { borderColor: C.lime, backgroundColor: C.lime + "1c" },
  controlText: { color: C.muted, fontSize: 10, fontWeight: "800" },
  controlTextSelected: { color: C.lime },
  jump: { minHeight: 32, justifyContent: "center", paddingHorizontal: 8 },
  jumpText: { color: C.blue, fontSize: 10, fontWeight: "800" },
  imageFrame: { minHeight: 210, maxHeight: 430, overflow: "hidden", borderWidth: 1, borderColor: C.border, borderRadius: 3, backgroundColor: C.black },
  imageVertical: { flex: 1 },
  imageVerticalContent: { alignItems: "flex-start" },
  imageHorizontalContent: { minWidth: "100%", alignItems: "flex-start" },
  textFrame: { minHeight: 180, maxHeight: 360, borderWidth: 1, borderColor: C.border, borderRadius: 3, backgroundColor: C.black },
  textScroll: { flex: 1 },
  textContent: { padding: 9, gap: 7 },
  sourceText: { color: C.text, fontSize: 11, lineHeight: 17 },
  highlight: { color: C.black, backgroundColor: C.amber, fontWeight: "800" },
  loading: { minHeight: 120, alignItems: "center", justifyContent: "center", gap: 8, padding: 12 },
  muted: { color: C.muted, fontSize: 10, lineHeight: 15 },
  error: { color: C.rose, fontSize: 11, lineHeight: 16 },
  warn: { color: C.amber, fontSize: 10, lineHeight: 15 },
  match: { color: C.lime, fontSize: 10, fontWeight: "800", lineHeight: 15 },
  zoomText: { color: C.muted, fontSize: 10, flex: 1, textAlign: "center" },
  pageRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  pageText: { color: C.text, fontSize: 10, fontWeight: "800" },
});
