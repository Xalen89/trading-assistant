import { AiRateControls } from "@/components/trading/ai-rate-controls";
import { OwnedWorkspaceTools } from "@/components/trading/owned-workspace-tools";
import { OwnedSourceAnalysis } from "@/components/trading/owned-source-analysis";
import { OwnedSourcePreview } from "@/components/trading/owned-source-preview";
import { TradeScreenshotPanel } from "@/components/trading/trade-screenshot-panel";
import { trpc } from "@/lib/trpc";
import { TradingLessons } from "@/components/trading/trading-lessons";
import { LearningDashboard } from "@/components/trading/learning-dashboard";
import { useMemo, useState } from "react";
import { LibraryAiPanel } from "@/components/trading/library-ai-panel";
import { Pressable, StyleSheet, Text, View } from "react-native";
import * as DocumentPicker from "expo-document-picker";
import { File } from "expo-file-system";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useWorkspace } from "@/hooks/use-workspace";
import {
  historicalStudy,
  parseHistory,
  statistics,
} from "@/lib/trading/engine";
import {
  type Candle,
  type Timeframe,
  type Pattern,
  type Strategy,
  uid,
} from "@/lib/trading/model";
import {
  useSourceQuery,
  usePhotoSearchMutation,
  useReferenceRevisionMutation,
  useSourceVersionsQuery,
  useReindexMutation,
} from "@/lib/trading/client";
import { ResearchPanel } from "@/components/trading/research-panel";
import { AccountControls } from "@/components/trading/account-controls";
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
import { C } from "@/components/trading/theme";
import { PatternCatalog } from "@/components/trading/pattern-catalog";
import {
  MAX_PHOTO_SEARCH_BYTES,
  MAX_UPLOAD_BYTES,
  assertBase64PhotoSearchLimits,
  assertBase64UploadLimits,
  assertPhotoSearchByteLimit,
  assertUploadByteLimit,
  assertUtf8ByteLimit,
} from "@/lib/trading/upload-byte-limits";
import {
  isGenericLibrarySource,
  isReviewOnlySource,
} from "@/lib/trading/source-purpose";
const ACCEPTED = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "application/pdf",
  "text/plain",
  "text/markdown",
  "application/json",
];
type Candidate = {
  name: string;
  mime: string;
  size: number;
  base64: string;
  filename: string;
};
async function readAsset(
  asset: DocumentPicker.DocumentPickerAsset,
  limit: "upload" | "photo-search" = "upload",
): Promise<Candidate> {
  const maxBytes =
    limit === "photo-search" ? MAX_PHOTO_SEARCH_BYTES : MAX_UPLOAD_BYTES;
  const limitMessage =
    limit === "photo-search"
      ? "Photo search images are limited to 8 MiB."
      : "Files are limited to 25 MiB.";
  const mime =
    asset.mimeType && asset.mimeType !== "application/octet-stream"
      ? asset.mimeType
      : mimeFromName(asset.name);
  if (!ACCEPTED.includes(mime))
    throw new Error("Choose PNG, JPEG, WebP, PDF, TXT, Markdown or JSON.");
  if ((asset.size || 0) > maxBytes) throw new Error(limitMessage);
  let base64: string;
  let size: number;
  if ((asset as any).file?.arrayBuffer) {
    const bytes = new Uint8Array(await (asset as any).file.arrayBuffer());
    size =
      limit === "photo-search"
        ? assertPhotoSearchByteLimit(bytes.length, limitMessage)
        : assertUploadByteLimit(bytes.length, limitMessage);
    let binary = "";
    for (let i = 0; i < bytes.length; i += 0x8000)
      binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    base64 = btoa(binary);
    if (limit === "photo-search")
      assertBase64PhotoSearchLimits(base64, limitMessage);
    else assertBase64UploadLimits(base64, limitMessage);
  } else {
    base64 = await new File(asset.uri).base64();
    size =
      limit === "photo-search"
        ? assertBase64PhotoSearchLimits(base64, limitMessage)
        : assertBase64UploadLimits(base64, limitMessage);
  }
  return {
    name: asset.name,
    mime,
    size,
    base64,
    filename: asset.name,
  };
}
export default function LibraryScreen() {
  const { workspace, update } = useWorkspace(),
    params = useLocalSearchParams<{ patternId?: string }>(),
    router = useRouter(),
    utils = trpc.useUtils();
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [tab, setTab] = useState<"patterns" | "styles">("patterns"),
    [term, setTerm] = useState(""),
    [uploadOpen, setUploadOpen] = useState(false),
    [candidate, setCandidate] = useState<Candidate | null>(null),
    [label, setLabel] = useState(""),
    [notes, setNotes] = useState(""),
    [uploadKind, setUploadKind] = useState<"pattern" | "style">("pattern"),
    [notice, setNotice] = useState<string>();
  const routeId =
    typeof params.patternId === "string" ? params.patternId : undefined;
  const [selection, setSelection] = useState<{
    id: string | null;
    route?: string;
  }>(() => ({ id: routeId || null, route: routeId }));
  const selectedId =
    selection.route === routeId ? selection.id : routeId || null;
  const scope = `${routeId || ""}:${selectedId || ""}`;
  const [sourceScope, setSourceScope] = useState<string | null>(null),
    [trainerDraft, setTrainerDraft] = useState<{
      scope: string;
      note: string;
      rules: string;
    } | null>(null);
  const sourceOpen = Boolean(selectedId) && sourceScope === scope;
  const setSelectedId = (id: string | null) => {
    setSelection({ id, route: routeId });
    setSourceScope(null);
    setTrainerDraft(null);
  };
  const setSourceOpen = (open: boolean) => setSourceScope(open ? scope : null);
  const [history, setHistory] = useState<Candle[] | null>(null),
    [historyOpen, setHistoryOpen] = useState(false);
  const reindex = useReindexMutation(),
    photo = usePhotoSearchMutation(),
    revision = useReferenceRevisionMutation();
  const selected = workspace.patterns.find((p) => p.id === selectedId) || null,
    source = useSourceQuery(sourceOpen ? selected?.id : undefined);
  const versions = useSourceVersionsQuery(
    sourceOpen && selected?.filename ? selected.id : undefined,
  );
  const activeStrategy =
    workspace.strategies.find((s) => s.id === workspace.activeStrategyId) ??
    workspace.strategies[0];
  const shown = useMemo(
    () =>
      workspace.patterns.filter(
        (p) =>
          p.kind === (tab === "patterns" ? "pattern" : "style") &&
          isGenericLibrarySource(p) &&
          `${p.name} ${p.tags.join(" ")} ${p.notes} ${p.description || ""}`
            .toLowerCase()
            .includes(term.toLowerCase()),
      ),
    [workspace.patterns, tab, term],
  );
  const reloadSelectedSource = async () => {
    if (!selected?.filename) return;
    const latest = await utils.learning.definition.fetch({ id: selected.id });
    update((current) => ({
      ...current,
      patterns: current.patterns.map((pattern) =>
        pattern.id === latest.id ? latest : pattern,
      ),
    }));
  };
  const trainerNote = trainerDraft?.scope === scope ? trainerDraft.note : "";
  const correctedRules =
    trainerDraft?.scope === scope
      ? trainerDraft.rules
      : selected?.rules?.join("\n") || "";
  const setTrainerNote = (note: string) =>
    setTrainerDraft({ scope, note, rules: correctedRules });
  const setCorrectedRules = (rules: string) =>
    setTrainerDraft({ scope, note: trainerNote, rules });
  const pick = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ACCEPTED,
        copyToCacheDirectory: true,
      });
      if (result.canceled) return;
      const file = await readAsset(result.assets[0]);
      setCandidate(file);
      setLabel(file.name.replace(/\.[^.]+$/, ""));
      setNotice(undefined);
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Unable to read file.");
    }
  };
  const queuedUpload = trpc.sourceAnalysis.upload.useMutation();
  const send = async () => {
    if (!candidate || !activeStrategy) return;
    const optimistic: Pattern = {
      id: uid("upload"),
      name: label.trim() || candidate.name,
      tags: [],
      kind: uploadKind,
      strategyId: activeStrategy.id,
      market: workspace.market,
      timeframe: workspace.timeframe,
      notes,
      filename: candidate.filename,
      mime: candidate.mime,
      status: "analyzing",
      createdAt: 0,
      version: 1,
      feedback: [],
    };
    update((w) => ({ ...w, patterns: [optimistic, ...w.patterns] }));
    setNotice("Retaining the encrypted original before background analysis…");
    try {
      const retainedUpload = await queuedUpload.mutateAsync({
        name: optimistic.name,
        kind: uploadKind,
        strategyId: activeStrategy.id,
        market: workspace.market,
        timeframe: workspace.timeframe,
        notes,
        filename: candidate.filename,
        mime: candidate.mime,
        base64: candidate.base64,
      });
      const result = retainedUpload.source;
      update((w) => ({
        ...w,
        patterns: w.patterns.map((p) => (p.id === optimistic.id ? result : p)),
      }));
      setCandidate(null);
      setUploadOpen(false);
      setSelectedId(result.id);
      setNotice(
        retainedUpload.error ||
          "Original retained; background analysis started. Progress and retry remain available in this source record.",
      );
    } catch (e) {
      const message = e instanceof Error ? e.message : "Upload failed";
      update((w) => ({
        ...w,
        patterns: w.patterns.map((p) =>
          p.id === optimistic.id
            ? { ...p, status: "failed", description: message }
            : p,
        ),
      }));
      setNotice(message);
    }
  };
  const manual = () => {
    if (!label.trim() || !activeStrategy)
      return setNotice("Give your manual reference a name.");
    const p: Pattern = {
      id: uid("manual"),
      name: label.trim(),
      tags: ["manual"],
      kind: uploadKind,
      strategyId: activeStrategy.id,
      market: workspace.market,
      timeframe: workspace.timeframe,
      notes,
      description: notes || "Manual local definition — not AI-analyzed.",
      rules: notes ? notes.split("\n").filter(Boolean) : [],
      status: "review",
      createdAt: Date.now(),
      version: 1,
      feedback: [],
    };
    update((w) => ({ ...w, patterns: [p, ...w.patterns] }));
    setUploadOpen(false);
    setSelectedId(p.id);
  };
  const persistReference = async (next: Pattern, expectedVersion: number) =>
    next.filename
      ? await revision.mutateAsync({ pattern: next, expectedVersion })
      : next;
  const feedback = async (kind: string, at: number) => {
    if (!selected || revision.isPending) return;
    try {
      const next = await persistReference(
        {
          ...selected,
          version: selected.version + 1,
          feedback: [
            ...selected.feedback,
            { label: kind, note: trainerNote, at },
          ],
        },
        selected.version,
      );
      update((w) => ({
        ...w,
        patterns: w.patterns.map((p) => (p.id === next.id ? next : p)),
      }));
      setTrainerNote("");
      void versions.refetch();
    } catch (e) {
      setNotice(
        e instanceof Error
          ? e.message
          : "Source revision failed; local definition was not changed.",
      );
    }
  };
  const accept = async (at: number) => {
    if (!selected || revision.isPending) return;
    if (isReviewOnlySource(selected)) {
      setNotice(
        "Dedicated screenshot reviews cannot be promoted into generic library references.",
      );
      return;
    }
    const rules = correctedRules
      .split("\n")
      .map((v) => v.trim())
      .filter(Boolean)
      .slice(0, 30);
    const linked = workspace.strategies.find(
      (s) => s.kind === "style" && s.source === `source:${selected.id}`,
    );
    const styleId = linked?.id || uid("style");
    const style: Strategy = {
      id: styleId,
      name: selected.name,
      description: selected.description || selected.notes,
      color: "#D8F36A",
      kind: "style",
      visible: true,
      version: linked ? linked.version + 1 : 1,
      history: linked
        ? [
            ...(linked.history || []),
            {
              version: linked.version,
              name: linked.name,
              description: linked.description,
              factors: linked.factors.map((f) => ({ ...f })),
              at,
            },
          ].slice(-20)
        : [],
      source: `source:${selected.id}`,
      factors: rules.map((rule, i) => ({
        id: `rule_${i}`,
        name: rule.slice(0, 140),
        group: "Reviewed style rule",
        weight: 10,
        enabled: true,
        description: rule,
      })),
    };
    try {
      const next = await persistReference(
        {
          ...selected,
          status: "ready",
          version: selected.version + 1,
          rules,
          strategyId: selected.kind === "style" ? styleId : selected.strategyId,
          feedback: [
            ...selected.feedback,
            { label: "accepted definition", note: trainerNote, at },
          ],
        },
        selected.version,
      );
      update((w) => ({
        ...w,
        strategies:
          selected.kind === "style"
            ? [...w.strategies.filter((s) => s.id !== styleId), style]
            : w.strategies,
        activeStrategyId:
          selected.kind === "style" ? styleId : w.activeStrategyId,
        patterns: w.patterns.map((p) => (p.id === next.id ? next : p)),
      }));
      setSelectedId(null);
    } catch (e) {
      setNotice(
        e instanceof Error
          ? e.message
          : "Source revision failed; style was not changed.",
      );
    }
  };
  const photoSearch = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ["image/png", "image/jpeg", "image/webp"],
        copyToCacheDirectory: true,
      });
      if (result.canceled) return;
      const file = await readAsset(result.assets[0], "photo-search");
      setNotice(
        "Describing your selected image for personal-library retrieval…",
      );
      await photo.mutateAsync({ ...file, patterns: workspace.patterns });
      setNotice(
        "Photo query compared with your own library. Retrieval is not proof of live detection.",
      );
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Photo search unavailable.");
    }
  };
  const importHistory = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ["text/csv", "application/json", "text/plain"],
        copyToCacheDirectory: true,
      });
      if (result.canceled) return;
      const a = result.assets[0];
      if ((a.size || 0) > MAX_UPLOAD_BYTES)
        throw new Error("History imports are limited to 25 MiB.");
      const text = (a as any).file?.text
        ? await (a as any).file.text()
        : await new File(a.uri).text();
      assertUtf8ByteLimit(text, "History imports are limited to 25 MiB.");
      setHistory(parseHistory(text));
      setHistoryOpen(true);
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "History import invalid.");
    }
  };
  return (
    <Screen>
      <Header
        title="My Library"
        subtitle="Your references remain separate from WR1"
        right={
          <View style={styles.headerActions}>
            <ActionButton
              label="Guide"
              compact
              kind="ghost"
              icon="compass-outline"
              onPress={() => router.navigate("/features")}
            />
            <ActionButton
              label="Files"
              compact
              icon="attach-outline"
              onPress={() => {
                setUploadKind(tab === "styles" ? "style" : "pattern");
                setCandidate(null);
                setLabel("");
                setNotes("");
                setUploadOpen(true);
              }}
            />
          </View>
        }
      />
      <Card>
        <View style={styles.choices}>
          {(["patterns", "styles"] as const).map((t) => (
            <ActionButton
              key={t}
              compact
              label={`${t === "patterns" ? "Patterns" : "Styles"} · ${workspace.patterns.filter((p) => p.kind === (t === "patterns" ? "pattern" : "style")).length}`}
              kind={tab === t ? "primary" : "secondary"}
              onPress={() => setTab(t)}
            />
          ))}
        </View>
        <Input
          value={term}
          onChangeText={setTerm}
          placeholder="Find FVG, IFVG CE, Order Block CE…"
        />
        <Text style={styles.meta}>
          Search names, labels, source descriptions and personal styles.
        </Text>
        <Text style={styles.meta}>
          {workspace.patterns.length} / 500 retained library records
        </Text>
      </Card>
      <View style={styles.choices}>
        <ActionButton
          label="AI Coach"
          compact
          kind="secondary"
          onPress={() =>
            router.navigate({
              pathname: "/coach",
              params: { scope: "library" },
            })
          }
        />
        <ActionButton
          label={
            photo.isPending ? "Searching…" : "Photo search: keyword & shape"
          }
          compact
          kind="secondary"
          disabled={photo.isPending}
          icon="images-outline"
          onPress={photoSearch}
        />
        <ActionButton
          label="Historical CSV / JSON"
          compact
          kind="secondary"
          onPress={importHistory}
        />
      </View>
      <ActionButton
        label="Browse pattern & style reference catalog"
        compact
        kind="secondary"
        icon="book-outline"
        onPress={() => setCatalogOpen(true)}
      />
      <TradeScreenshotPanel
        renderSourcePreview={(source, evidence) => (
          <OwnedSourcePreview sourceId={source.id} evidence={evidence} />
        )}
        compact
      />
      <TradingLessons />
      <LearningDashboard />
      {notice ? (
        <Card>
          <Text style={styles.notice}>{notice}</Text>
        </Card>
      ) : null}
      {photo.data ? (
        <Card>
          <Text style={styles.title}>
            Find by keyword — extracted term overlap
          </Text>
          <Text style={styles.desc}>{photo.data.description}</Text>
          {photo.data.results.length ? (
            photo.data.results.map((r) => (
              <Pressable
                key={r.patternId}
                onPress={() => setSelectedId(r.patternId)}
              >
                <Text style={styles.link}>{r.name} →</Text>
                <Text style={styles.meta}>
                  Shared extracted terms: {r.sharedTerms.join(", ")}
                </Text>
              </Pressable>
            ))
          ) : (
            <Text style={styles.meta}>No supported in-library result.</Text>
          )}
          <Text style={styles.notice}>{photo.data.limitations}</Text>
        </Card>
      ) : null}
      {photo.data?.visual ? (
        <Card>
          <Text style={styles.title}>
            Find by visual similarity — HOG shape cosine
          </Text>
          {photo.data.visual.results.map((r) => (
            <Pressable
              key={r.patternId}
              onPress={() => setSelectedId(r.patternId)}
            >
              <Text style={styles.link}>
                {r.name} v{r.sourceVersion} · cosine {r.similarity.toFixed(3)} →
              </Text>
            </Pressable>
          ))}
          <Text style={styles.notice}>{photo.data.visual.limitations}</Text>
        </Card>
      ) : null}
      <SectionLabel>
        {tab === "patterns" ? "Pattern references" : "Style sources"}
      </SectionLabel>
      {shown.length ? (
        shown.map((p) => (
          <Pressable key={p.id} onPress={() => setSelectedId(p.id)}>
            <Card>
              <View style={styles.head}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.title}>{p.name}</Text>
                  <Text style={styles.meta}>
                    {p.market} · {p.timeframe} ·{" "}
                    {p.filename || "Manual definition"}
                  </Text>
                </View>
                <Pill
                  label={statusLabel(p.status)}
                  tone={
                    p.status === "ready"
                      ? "mint"
                      : p.status === "failed"
                        ? "rose"
                        : "amber"
                  }
                />
              </View>
              <Text style={styles.link}>
                {p.tags.map((t) => "#" + t).join(" ")}
              </Text>
              <Text style={styles.desc} numberOfLines={3}>
                {p.description || p.notes || "Extraction pending."}
              </Text>
              <Text style={styles.meta}>
                Visual index: {p.visualIndex?.status || "not indexed"}
              </Text>
              <Text style={styles.meta}>
                {p.feedback.length} labeled corrections · reference v{p.version}
              </Text>
            </Card>
          </Pressable>
        ))
      ) : (
        <EmptyState
          title={`No ${tab} yet`}
          detail="Upload a source, label what matters, review its definition, then apply it to your strategy."
        />
      )}
      <SectionLabel>Cloud learning account</SectionLabel>
      <AccountControls />
      <OwnedWorkspaceTools />
      <AiRateControls />
      <Card>
        <Text style={styles.meta}>
          Accepted references and feedback guide subsequent analysis. Versions
          record your changes. This is a growing reference library, not
          automatic foundation-model retraining or a verified improvement in
          profitability.
        </Text>
      </Card>
      <Sheet
        visible={uploadOpen}
        title="Learn from my files"
        onClose={() => setUploadOpen(false)}
      >
        {candidate ? (
          <Card>
            <Text style={styles.title}>{candidate.name}</Text>
            <Text style={styles.meta}>
              {candidate.mime} · {(candidate.size / 1024).toFixed(1)} KiB
            </Text>
          </Card>
        ) : (
          <ActionButton
            label="Choose compatible file"
            icon="folder-open-outline"
            onPress={pick}
          />
        )}
        <View style={styles.choices}>
          {(["pattern", "style"] as const).map((k) => (
            <ActionButton
              key={k}
              label={k === "pattern" ? "Pattern picture" : "Trading style"}
              compact
              kind={uploadKind === k ? "primary" : "secondary"}
              onPress={() => setUploadKind(k)}
            />
          ))}
        </View>
        <Input
          label="Name / pattern label"
          value={label}
          onChangeText={setLabel}
        />
        <Input
          label="Annotation / rules / what should be learned"
          value={notes}
          onChangeText={setNotes}
          multiline
        />
        <Text style={styles.meta}>
          {workspace.market} · {workspace.timeframe} · {activeStrategy?.name} v
          {activeStrategy?.version}
        </Text>
        <Text style={styles.notice}>
          Your selected file is sent to the server-side AI service for
          extraction. Original bytes are encrypted in storage; definitions
          remain review-only until you accept them.
        </Text>
        {candidate ? (
          <ActionButton
            label={
              queuedUpload.isPending
                ? "Retaining original…"
                : "Upload & analyze source"
            }
            disabled={queuedUpload.isPending}
            onPress={send}
          />
        ) : (
          <ActionButton
            label="Save local manual definition"
            kind="secondary"
            onPress={manual}
          />
        )}
      </Sheet>
      <Sheet
        visible={Boolean(selected)}
        title={selected?.name || "Pattern trainer"}
        onClose={() => setSelectedId(null)}
      >
        {selected ? (
          <>
            <Pill
              label={`${statusLabel(selected.status)} · v${selected.version}`}
              tone="amber"
            />
            <Text style={styles.desc}>
              {selected.description || selected.notes}
            </Text>
            {isReviewOnlySource(selected) ? (
              <Card>
                <Text style={styles.notice}>
                  This protected screenshot is reserved for its dedicated
                  trade-review flow. It cannot be indexed, searched, analyzed as
                  a library blueprint, or promoted into a pattern/style.
                </Text>
              </Card>
            ) : (
              <>
                <OwnedSourceAnalysis
                  sourceId={selected.id}
                  sourceVersion={selected.version}
                  onReload={reloadSelectedSource}
                />
                <LibraryAiPanel
                  key={`${selected.id}:${selected.version}`}
                  source={selected}
                  renderSourcePreview={(source, evidence) => (
                    <OwnedSourcePreview
                      sourceId={source.id}
                      evidence={evidence}
                    />
                  )}
                  onAccept={(style) => {
                    if (
                      workspace.strategies.filter(
                        (strategy) => !strategy.archived,
                      ).length >= 100
                    ) {
                      return setNotice(
                        "Strategy limit reached; review proposal retained.",
                      );
                    }
                    if (
                      workspace.strategies.some(
                        (strategy) => strategy.id === style.id,
                      )
                    ) {
                      return setNotice(
                        "This source-version review style already exists; no saved rules were overwritten.",
                      );
                    }
                    update((current) => ({
                      ...current,
                      strategies: [...current.strategies, style],
                    }));
                    setNotice(
                      "Review style saved inactive. Configure supported data and approve its confluence gate before strategy paper use.",
                    );
                  }}
                />
              </>
            )}
            <Input
              label="Candidate rules — edit one per line"
              value={correctedRules}
              onChangeText={setCorrectedRules}
              multiline
            />
            <Card>
              <Text style={styles.title}>Pattern source & strategy</Text>
              <Text style={styles.meta}>
                {selected.filename || "Manual source"} ·{" "}
                {selected.mime || "text"} ·{" "}
                {
                  workspace.strategies.find((s) => s.id === selected.strategyId)
                    ?.name
                }
              </Text>
              {selected.filename ? (
                <ActionButton
                  label={
                    sourceOpen ? "Source requested" : "Saved source versions"
                  }
                  compact
                  kind="secondary"
                  onPress={() => setSourceOpen(true)}
                />
              ) : null}
              {sourceOpen && source.isLoading ? (
                <Text style={styles.meta}>
                  Requesting owner-authorized source…
                </Text>
              ) : null}
              {sourceOpen && source.error ? (
                <Text style={styles.notice}>{source.error.message}</Text>
              ) : null}
              {sourceOpen &&
              source.data?.pattern &&
              source.data.pattern.version !== selected.version ? (
                <ActionButton
                  label={`Load authoritative source v${source.data.pattern.version}`}
                  compact
                  kind="secondary"
                  onPress={() => {
                    const latest = source.data!.pattern;
                    update((w) => ({
                      ...w,
                      patterns: w.patterns.map((p) =>
                        p.id === latest.id ? latest : p,
                      ),
                    }));
                    setCorrectedRules(latest.rules?.join("\n") || "");
                  }}
                />
              ) : null}
              {sourceOpen &&
                versions.data?.map((v) => (
                  <Text key={v.version} style={styles.meta}>
                    Durable reference v{v.version} · {v.status} ·{" "}
                    {v.feedback.length} labels
                  </Text>
                ))}
              {isGenericLibrarySource(selected) &&
              selected.mime?.startsWith("image/") ? (
                <>
                  <Text style={styles.meta}>
                    OpenCV: {selected.visualIndex?.status || "not indexed"} ·{" "}
                    {selected.visualIndex?.message ||
                      "Geometric neighbors only, not a probability."}
                  </Text>
                  <ActionButton
                    label={
                      reindex.isPending
                        ? "Indexing…"
                        : "Reindex protected image"
                    }
                    compact
                    kind="secondary"
                    disabled={reindex.isPending}
                    onPress={async () => {
                      try {
                        const p = await reindex.mutateAsync({
                          id: selected.id,
                        });
                        update((w) => ({
                          ...w,
                          patterns: w.patterns.map((old) =>
                            old.id === p.id ? p : old,
                          ),
                        }));
                        setNotice(
                          "Authoritative source vector indexed. Review is still required.",
                        );
                      } catch (e) {
                        setNotice(
                          e instanceof Error ? e.message : "Index unavailable.",
                        );
                      }
                    }}
                  />
                </>
              ) : null}
            </Card>
            <Input
              label="Correction / positive or negative label notes"
              value={trainerNote}
              onChangeText={setTrainerNote}
              multiline
            />
            <View style={styles.choices}>
              <ActionButton
                label="Positive"
                compact
                kind="secondary"
                onPress={() => feedback("positive", Date.now())}
              />
              <ActionButton
                label="Negative"
                compact
                kind="secondary"
                onPress={() => feedback("negative", Date.now())}
              />
              <ActionButton
                label="Correction"
                compact
                kind="secondary"
                onPress={() => feedback("correction", Date.now())}
              />
            </View>
            <Text style={styles.meta}>
              {selected.feedback.length} recorded labels. Corrections accompany
              this reference on future comparisons.
            </Text>
            <ActionButton
              label={
                selected.kind === "style"
                  ? "Accept rules & apply style"
                  : "Accept reviewed pattern"
              }
              disabled={
                selected.status === "failed" || selected.status === "analyzing"
              }
              onPress={() => accept(Date.now())}
            />
            {selected.kind === "style" && selected.status === "ready" ? (
              <ActionButton
                label="Open applied strategy"
                kind="secondary"
                onPress={() => {
                  setSelectedId(null);
                  router.navigate("/strategies");
                }}
              />
            ) : null}
          </>
        ) : null}
      </Sheet>
      <HistorySheet
        visible={historyOpen}
        candles={history}
        onClose={() => setHistoryOpen(false)}
      />
      <PatternCatalog
        visible={catalogOpen}
        onClose={() => setCatalogOpen(false)}
      />
    </Screen>
  );
}
function HistorySheet({
  visible,
  candles,
  onClose,
}: {
  visible: boolean;
  candles: Candle[] | null;
  onClose: () => void;
}) {
  const [frame, setFrame] = useState<Timeframe>("5m"),
    [second, setSecond] = useState<Candle[] | null>(null),
    [extraError, setExtraError] = useState<string>();
  const addAsset = async () => {
    try {
      const pick = await DocumentPicker.getDocumentAsync({
        type: ["text/csv", "application/json", "text/plain"],
        copyToCacheDirectory: true,
      });
      if (pick.canceled) return;
      const a = pick.assets[0];
      if ((a.size || 0) > MAX_UPLOAD_BYTES) throw new Error("25 MiB maximum.");
      const text = (a as any).file?.text
        ? await (a as any).file.text()
        : await new File(a.uri).text();
      assertUtf8ByteLimit(text, "25 MiB maximum.");
      setSecond(parseHistory(text));
      setExtraError(undefined);
    } catch (e) {
      setExtraError(e instanceof Error ? e.message : "Invalid second dataset.");
    }
  };
  const [stop, setStop] = useState("0.5"),
    [target, setTarget] = useState("1"),
    [side, setSide] = useState<"long" | "short">("long");
  const stats = candles ? statistics(candles) : null;
  const study =
    candles && Number(stop) > 0 && Number(target) > 0
      ? historicalStudy(candles, side, Number(stop) / 100, Number(target) / 100)
      : null;
  return (
    <Sheet
      visible={visible}
      title="Historical pattern laboratory"
      onClose={onClose}
    >
      <Card>
        <Text style={styles.title}>
          {candles?.length || 0} validated historical OHLC bars
        </Text>
        <Text style={styles.meta}>
          CSV/JSON headers: time,open,high,low,close,volume. Unix seconds;
          chronological and unique. Imported data stays in device component
          state.
        </Text>
        {stats ? (
          <Text style={styles.desc}>
            Volatility {stats.volatility.toFixed(3)}%/bar · Lag-1 rhythm{" "}
            {stats.autocorrelation.toFixed(3)} · Lookback momentum{" "}
            {stats.momentum.toFixed(2)}%.
          </Text>
        ) : (
          <Text style={styles.meta}>
            At least 31 bars needed for descriptive statistics.
          </Text>
        )}
      </Card>
      <SectionLabel>Nearest historical shapes</SectionLabel>
      <Text style={styles.meta}>
        Compare the final 12 bars with older non-overlapping windows. Evaluate
        only their subsequent 12 bars, entirely before the query window.
      </Text>
      <View style={styles.choices}>
        {(["long", "short"] as const).map((s) => (
          <ActionButton
            key={s}
            label={s.toUpperCase()}
            compact
            kind={side === s ? "primary" : "secondary"}
            onPress={() => setSide(s)}
          />
        ))}
      </View>
      <Input
        label="Hypothetical stop distance %"
        value={stop}
        onChangeText={setStop}
        keyboardType="numeric"
      />
      <Input
        label="Hypothetical target distance %"
        value={target}
        onChangeText={setTarget}
        keyboardType="numeric"
      />
      {study ? (
        <Card>
          <Text style={styles.title}>
            {study.samples} analogs · {study.resolved} resolved · {study.wins}{" "}
            targets first
          </Text>
          {study.analogs.map((a) => (
            <Text key={a.index} style={styles.meta}>
              {new Date(a.at * 1000).toLocaleString()} · shape distance{" "}
              {a.distance.toFixed(3)} · {a.outcome}
              {a.ambiguous ? " (same-bar ambiguity → loss)" : ""}
            </Text>
          ))}
          <Text style={styles.notice}>{study.warning}</Text>
        </Card>
      ) : null}
      <Text style={styles.meta}>
        Select the actual interval used by both imports; irregular session gaps
        are not filled.
      </Text>
      <View style={styles.choices}>
        {(
          ["1m", "5m", "15m", "30m", "1h", "4h", "1d", "1w"] as Timeframe[]
        ).map((f) => (
          <ActionButton
            key={f}
            compact
            label={f}
            kind={frame === f ? "primary" : "secondary"}
            onPress={() => setFrame(f)}
          />
        ))}
      </View>
      <ActionButton
        label={
          second ? "Replace second asset CSV" : "Add second asset CSV / JSON"
        }
        compact
        kind="secondary"
        onPress={addAsset}
      />
      {second ? (
        <Text style={styles.meta}>
          {second.length} second-asset bars (independent portfolio experiment)
        </Text>
      ) : null}
      {extraError ? <Text style={styles.notice}>{extraError}</Text> : null}
      {candles ? (
        <ResearchPanel
          series={[
            {
              symbol: "Imported asset 1",
              timeframe: frame,
              source: "User CSV / JSON; user-selected interval",
              candles,
            },
            ...(second
              ? [
                  {
                    symbol: "Imported asset 2",
                    timeframe: frame,
                    source: "Second user CSV / JSON; same selected interval",
                    candles: second,
                  },
                ]
              : []),
          ]}
        />
      ) : null}
      <Text style={styles.notice}>
        Success probability: not calibrated. This exploratory nearest-neighbor
        study is not strategy backtesting, out-of-sample validation or a
        hedge-fund performance claim.
      </Text>
    </Sheet>
  );
}
function mimeFromName(name: string) {
  const ext = name.split(".").pop()?.toLowerCase();
  return ext === "png"
    ? "image/png"
    : ext === "jpg" || ext === "jpeg"
      ? "image/jpeg"
      : ext === "webp"
        ? "image/webp"
        : ext === "pdf"
          ? "application/pdf"
          : ext === "json"
            ? "application/json"
            : ext === "md"
              ? "text/markdown"
              : "text/plain";
}
function statusLabel(status: Pattern["status"]) {
  return {
    uploaded: "UPLOADED",
    analyzing: "ANALYZING",
    review: "REVIEW",
    ready: "REFERENCE READY",
    failed: "FAILED",
  }[status];
}
const styles = StyleSheet.create({
  headerActions: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  head: { flexDirection: "row", gap: 8, alignItems: "flex-start" },
  choices: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  title: { color: C.text, fontWeight: "800", fontSize: 14 },
  desc: { color: C.text, fontSize: 12, lineHeight: 18 },
  meta: { color: C.muted, fontSize: 11, lineHeight: 17 },
  link: { color: C.lime, fontSize: 12, lineHeight: 18, fontWeight: "700" },
  notice: { color: C.amber, fontSize: 11, lineHeight: 17 },
  preview: {
    width: "100%",
    height: 260,
    resizeMode: "contain",
    backgroundColor: C.black,
    borderRadius: 10,
  },
});
