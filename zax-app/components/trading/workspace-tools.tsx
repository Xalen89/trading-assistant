import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  StyleSheet,
  Text,
  View,
} from "react-native";
import type { Workspace } from "@/lib/trading/model";
import {
  WORKSPACE_CAPACITY_LIMITS,
  workspaceCapacity,
} from "@/lib/trading/workspace-capacity";
import {
  createPortableExport,
  downloadPortableExportOnWeb,
  previewPortableImport,
  type PortableArtifact,
  type PortableImportPreview,
} from "@/lib/trading/workspace-portability";
import type {
  LibraryRemovalPreview,
  StrategyRemovalPreview,
  VersionedSource,
} from "@/lib/trading/workspace-removal";
import { C } from "./theme";
import { ActionButton, Card, Input, Pill, SectionLabel, Sheet } from "./ui";

type ArchivedStrategyDeleteInput = {
  strategyId: string;
  expectedStrategyVersion: number;
  expectedWorkspaceRevision: number;
  confirmation: string;
  dependentSourceVersions: VersionedSource[];
};
type LibraryDeleteInput = {
  sourceId: string;
  expectedSourceVersion: number;
  expectedWorkspaceRevision: number;
  confirmation: string;
};

export type WorkspaceToolsActions = {
  /** Parent should use archiveStrategyForCapacity + its normal owner save path. */
  onArchiveStrategy?: (strategyId: string) => Promise<void> | void;
  getStrategyRemovalPreview?: (strategyId: string) => Promise<{
    workspaceRevision: number;
    preview: StrategyRemovalPreview;
    requiredSourceVersions: VersionedSource[];
  }>;
  deleteArchivedStrategy?: (input: ArchivedStrategyDeleteInput) => Promise<{
    retainedCanonicalPaperRecords: number;
    detachedSourceRecords: number;
  }>;
  getLibraryRemovalPreview?: (
    sourceId: string,
  ) => Promise<{ workspaceRevision: number; preview: LibraryRemovalPreview }>;
  deleteLibraryRecord?: (
    input: LibraryDeleteInput,
  ) => Promise<{ retainedOriginalNotice: string }>;
  /** Must remove AsyncStorage only, never cloud data; caller owns this side effect. */
  onClearLocalData?: () => Promise<void> | void;
  /** Receives only a validated, staged data preview; it must not create paper orders. */
  onApplyPortableImport?: (
    preview: PortableImportPreview,
    confirmation: string,
  ) => Promise<void> | void;
  /** Native app bridge, normally expo-sharing after the parent adds that dependency. */
  onNativeShare?: (file: {
    uri: string;
    filename: string;
    mime: string;
  }) => Promise<void>;
  /** Optional test/custom picker. The default uses Expo File.pickFileAsync. */
  pickPortableImport?: () => Promise<Uint8Array | undefined>;
};

export type WorkspaceToolsProps = {
  workspace: Workspace;
  /** Last confirmed cloud snapshot, supplied separately so local/saved counts are never conflated. */
  savedWorkspace?: Workspace | null;
  revision: number;
  savedRevision?: number;
  lastSyncedAt?: number;
  actions: WorkspaceToolsActions;
};

type PendingAction =
  | {
      kind: "strategy";
      revision: number;
      preview: StrategyRemovalPreview;
      sources: VersionedSource[];
    }
  | { kind: "library"; revision: number; preview: LibraryRemovalPreview }
  | { kind: "clear-local" }
  | { kind: "import"; preview: PortableImportPreview };

function syncLabel(lastSyncedAt?: number) {
  if (!lastSyncedAt) return "Not synced in this session";
  return `Last synced ${new Date(lastSyncedAt).toLocaleString()}`;
}

function Progress({ used, limit }: { used: number; limit: number }) {
  const percent = Math.min(100, Math.max(0, (used / limit) * 100));
  return (
    <View style={styles.progressTrack} accessibilityRole="progressbar">
      <View style={[styles.progressFill, { width: `${percent}%` }]} />
    </View>
  );
}

async function writeNativeArtifact(artifact: PortableArtifact) {
  const module = await import("expo-file-system");
  const file = new module.File(module.Paths.document, artifact.filename);
  file.create({ intermediates: true, overwrite: true });
  file.write(artifact.bytes);
  return file.uri;
}

async function pickPortableFile(): Promise<Uint8Array | undefined> {
  const module = await import("expo-file-system");
  const result = (await module.File.pickFileAsync({
    mimeTypes: ["application/zip"],
  })) as unknown as {
    canceled?: boolean;
    result?: { arrayBuffer: () => Promise<ArrayBuffer> };
  };
  if (result.canceled || !result.result) return undefined;
  return new Uint8Array(await result.result.arrayBuffer());
}

function CapacityRow({
  label,
  localUsed,
  savedUsed,
  limit,
  detail,
}: {
  label: string;
  localUsed: number;
  savedUsed?: number;
  limit: number;
  detail: string;
}) {
  return (
    <View style={styles.capacityRow}>
      <View style={styles.capacityHead}>
        <Text style={styles.title}>{label}</Text>
        <Text style={styles.count}>
          Local {localUsed} / {limit}
          {savedUsed === undefined
            ? " · Saved not loaded"
            : ` · Saved ${savedUsed} / ${limit}`}
        </Text>
      </View>
      <Progress used={localUsed} limit={limit} />
      <Text style={styles.meta}>{detail}</Text>
    </View>
  );
}

/**
 * This intentionally has injected actions instead of importing useWorkspace or
 * trpc. Parent mounts it under OwnerTools and supplies the sole persistence
 * path, keeping local/saved state and owner writes explicit.
 */
export function WorkspaceTools({
  workspace,
  savedWorkspace,
  revision,
  savedRevision,
  lastSyncedAt,
  actions,
}: WorkspaceToolsProps) {
  const local = useMemo(() => workspaceCapacity(workspace), [workspace]);
  const saved = useMemo(
    () => (savedWorkspace ? workspaceCapacity(savedWorkspace) : undefined),
    [savedWorkspace],
  );
  const [pending, setPending] = useState<PendingAction>();
  const [confirmation, setConfirmation] = useState("");
  const [notice, setNotice] = useState<string>();
  const [busy, setBusy] = useState(false);

  const archive = async (strategyId: string) => {
    if (!actions.onArchiveStrategy) return;
    setBusy(true);
    setNotice(undefined);
    try {
      await actions.onArchiveStrategy(strategyId);
      setNotice(
        "Strategy archived. Active capacity is now available after the owner save completes.",
      );
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : "Strategy was not archived.",
      );
    } finally {
      setBusy(false);
    }
  };

  const previewStrategyDelete = async (strategyId: string) => {
    if (!actions.getStrategyRemovalPreview) return;
    setBusy(true);
    setNotice(undefined);
    try {
      const result = await actions.getStrategyRemovalPreview(strategyId);
      setConfirmation("");
      setPending({
        kind: "strategy",
        revision: result.workspaceRevision,
        preview: result.preview,
        sources: result.requiredSourceVersions,
      });
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : "Deletion preview was unavailable.",
      );
    } finally {
      setBusy(false);
    }
  };

  const previewLibraryDelete = async (sourceId: string) => {
    if (!actions.getLibraryRemovalPreview) return;
    setBusy(true);
    setNotice(undefined);
    try {
      const result = await actions.getLibraryRemovalPreview(sourceId);
      setConfirmation("");
      setPending({
        kind: "library",
        revision: result.workspaceRevision,
        preview: result.preview,
      });
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : "Library deletion preview was unavailable.",
      );
    } finally {
      setBusy(false);
    }
  };

  const exportEverything = async () => {
    setBusy(true);
    setNotice(undefined);
    try {
      const artifact = createPortableExport(workspace);
      if (Platform.OS === "web") {
        downloadPortableExportOnWeb(artifact);
        setNotice(`Export downloaded: ${artifact.filename}.`);
      } else {
        const uri = await writeNativeArtifact(artifact);
        if (!actions.onNativeShare)
          throw new Error(
            "Export was saved locally, but native sharing needs the parent Expo Sharing bridge.",
          );
        await actions.onNativeShare({
          uri,
          filename: artifact.filename,
          mime: artifact.mime,
        });
        setNotice("Export saved and handed to the native share sheet.");
      }
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : "Export could not be created.",
      );
    } finally {
      setBusy(false);
    }
  };

  const beginImport = async () => {
    setBusy(true);
    setNotice(undefined);
    try {
      const data = actions.pickPortableImport
        ? await actions.pickPortableImport()
        : await pickPortableFile();
      if (!data) {
        setNotice("Import was cancelled. No local records changed.");
        return;
      }
      const preview = previewPortableImport(data);
      setConfirmation("");
      setPending({ kind: "import", preview });
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : "Import file was rejected.",
      );
    } finally {
      setBusy(false);
    }
  };

  const confirmPending = async () => {
    if (!pending) return;
    setBusy(true);
    setNotice(undefined);
    try {
      if (pending.kind === "strategy") {
        if (!actions.deleteArchivedStrategy)
          throw new Error("Owner deletion action is unavailable.");
        if (confirmation !== pending.preview.confirmation)
          throw new Error("Type the displayed strategy confirmation exactly.");
        const result = await actions.deleteArchivedStrategy({
          strategyId: pending.preview.strategy.id,
          expectedStrategyVersion: pending.preview.strategy.version,
          expectedWorkspaceRevision: pending.revision,
          confirmation,
          dependentSourceVersions: pending.sources,
        });
        setNotice(
          `Archived strategy removed. ${result.retainedCanonicalPaperRecords} canonical paper record(s) retained; ${result.detachedSourceRecords} source record(s) detached with originals protected.`,
        );
      }
      if (pending.kind === "library") {
        if (!actions.deleteLibraryRecord)
          throw new Error("Owner deletion action is unavailable.");
        if (confirmation !== pending.preview.confirmation)
          throw new Error("Type the displayed library confirmation exactly.");
        const result = await actions.deleteLibraryRecord({
          sourceId: pending.preview.source.id,
          expectedSourceVersion: pending.preview.source.version,
          expectedWorkspaceRevision: pending.revision,
          confirmation,
        });
        setNotice(result.retainedOriginalNotice);
      }
      if (pending.kind === "clear-local") {
        if (!actions.onClearLocalData)
          throw new Error("Clear-local action is unavailable.");
        if (confirmation !== "CLEAR LOCAL DATA")
          throw new Error("Type CLEAR LOCAL DATA exactly.");
        await actions.onClearLocalData();
        setNotice(
          "Local device data was cleared. Cloud records were not touched.",
        );
      }
      if (pending.kind === "import") {
        if (!actions.onApplyPortableImport)
          throw new Error("Import action is unavailable.");
        if (confirmation !== pending.preview.confirmation)
          throw new Error("Type the displayed import confirmation exactly.");
        await actions.onApplyPortableImport(pending.preview, confirmation);
        setNotice(
          "Portable records staged into local workspace. No paper order was created.",
        );
      }
      setPending(undefined);
      setConfirmation("");
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : "Requested action did not complete.",
      );
    } finally {
      setBusy(false);
    }
  };

  const activeStrategies = workspace.strategies.filter(
    (strategy) => !strategy.archived,
  );
  const archivedStrategies = workspace.strategies.filter(
    (strategy) => strategy.archived,
  );

  return (
    <View style={styles.wrap}>
      <Card>
        <View style={styles.head}>
          <View style={styles.grow}>
            <SectionLabel>Workspace capacity</SectionLabel>
            <Text style={styles.heading}>
              Local and saved pools stay distinct.
            </Text>
          </View>
          <Pill label="OWNER TOOLS" tone="amber" />
        </View>
        <Text style={styles.meta}>
          {syncLabel(lastSyncedAt)} · local revision {revision}
          {savedRevision === undefined
            ? ""
            : ` · saved revision ${savedRevision}`}
        </Text>
        <CapacityRow
          label="Active strategies"
          localUsed={local.activeStrategies.used}
          savedUsed={saved?.activeStrategies.used}
          limit={WORKSPACE_CAPACITY_LIMITS.activeStrategies}
          detail={local.activeStrategies.detail}
        />
        <CapacityRow
          label="Archived strategies"
          localUsed={local.archivedStrategies.used}
          savedUsed={saved?.archivedStrategies.used}
          limit={WORKSPACE_CAPACITY_LIMITS.archivedStrategies}
          detail={local.archivedStrategies.detail}
        />
        <CapacityRow
          label="Source library"
          localUsed={local.sourceLibrary.used}
          savedUsed={saved?.sourceLibrary.used}
          limit={WORKSPACE_CAPACITY_LIMITS.sourceLibrary}
          detail={local.sourceLibrary.detail}
        />
        <CapacityRow
          label="Alert rules"
          localUsed={local.alertRules.used}
          savedUsed={saved?.alertRules.used}
          limit={WORKSPACE_CAPACITY_LIMITS.alertRules}
          detail={local.alertRules.detail}
        />
      </Card>

      <Card>
        <SectionLabel>Archive and removal summary</SectionLabel>
        <Text style={styles.body}>
          Archive moves a strategy out of the 100 active records into the
          separate 500 archived-record allowance. Hard deletion is available
          only for an archived strategy and always previews alerts, canonical
          paper history, and source screenshots first.
        </Text>
        {activeStrategies.slice(0, 8).map((strategy) => (
          <View key={strategy.id} style={styles.toolRow}>
            <Text style={styles.title}>{strategy.name}</Text>
            <ActionButton
              compact
              label="Archive"
              kind="secondary"
              disabled={busy || !actions.onArchiveStrategy}
              onPress={() => void archive(strategy.id)}
            />
          </View>
        ))}
        {activeStrategies.length > 8 ? (
          <Text style={styles.meta}>
            Only the first 8 active strategies are shown here.
          </Text>
        ) : null}
        {archivedStrategies.length ? (
          archivedStrategies.slice(0, 12).map((strategy) => (
            <View key={strategy.id} style={styles.toolRow}>
              <View style={styles.grow}>
                <Text style={styles.title}>{strategy.name}</Text>
                <Text style={styles.meta}>Archived · v{strategy.version}</Text>
              </View>
              <ActionButton
                compact
                label="Preview hard delete"
                kind="danger"
                disabled={busy || !actions.getStrategyRemovalPreview}
                onPress={() => void previewStrategyDelete(strategy.id)}
              />
            </View>
          ))
        ) : (
          <Text style={styles.meta}>
            No archived strategy is eligible for hard deletion.
          </Text>
        )}
      </Card>

      <Card>
        <SectionLabel>Library metadata removal</SectionLabel>
        <Text style={styles.body}>
          Usage is {local.sourceLibrary.used} /{" "}
          {WORKSPACE_CAPACITY_LIMITS.sourceLibrary}. Removal clears authorized
          metadata and indexes only after a versioned preview. It never claims
          to erase encrypted source originals from object storage.
        </Text>
        {workspace.patterns.slice(0, 12).map((source) => (
          <View key={source.id} style={styles.toolRow}>
            <View style={styles.grow}>
              <Text style={styles.title}>{source.name}</Text>
              <Text style={styles.meta}>
                v{source.version} · {source.filename || "metadata only"}
              </Text>
            </View>
            <ActionButton
              compact
              label="Preview delete"
              kind="danger"
              disabled={busy || !actions.getLibraryRemovalPreview}
              onPress={() => void previewLibraryDelete(source.id)}
            />
          </View>
        ))}
        {workspace.patterns.length > 12 ? (
          <Text style={styles.meta}>
            Only the first 12 source records are shown here.
          </Text>
        ) : null}
      </Card>

      <Card>
        <SectionLabel>Portable export and import</SectionLabel>
        <Text style={styles.body}>
          Export creates a real ZIP containing CSV trades/events plus JSON
          strategies, rules, journal, workspace, and library metadata. No
          cookies, environment values, keys, file keys, internal URIs, source
          bytes, or executable code are included.
        </Text>
        <View style={styles.actions}>
          <ActionButton
            label="Export everything"
            disabled={busy}
            onPress={() => void exportEverything()}
          />
          <ActionButton
            label="Preview import"
            kind="secondary"
            disabled={busy}
            onPress={() => void beginImport()}
          />
        </View>
        <Text style={styles.meta}>
          Import is bounded and data-only. Open/pending trades are excluded,
          imported alerts are disabled, and no import can create a paper order
          automatically.
        </Text>
      </Card>

      <Card>
        <SectionLabel>Clear local data</SectionLabel>
        <Text style={[styles.body, styles.warning]}>
          This permanently clears data stored on this device only. Unsaved local
          records cannot be recovered. Cloud workspace records, canonical paper
          history, and encrypted library originals are not deleted.
        </Text>
        <ActionButton
          label="Clear local data"
          kind="danger"
          disabled={busy || !actions.onClearLocalData}
          onPress={() => {
            setConfirmation("");
            setPending({ kind: "clear-local" });
          }}
        />
      </Card>

      {notice ? <Text style={styles.notice}>{notice}</Text> : null}
      {busy ? <ActivityIndicator color={C.lime} /> : null}

      <Sheet
        visible={Boolean(pending)}
        title={
          pending?.kind === "import"
            ? "Review portable import"
            : pending?.kind === "clear-local"
              ? "Clear this device"
              : "Confirm owner deletion"
        }
        subtitle="No action occurs until the exact confirmation is entered."
        onClose={() => {
          if (!busy) {
            setPending(undefined);
            setConfirmation("");
          }
        }}
      >
        {pending?.kind === "strategy" ? (
          <>
            <Pill label="ARCHIVED STRATEGY ONLY" tone="amber" />
            <Text style={styles.body}>
              {pending.preview.strategy.name} · version{" "}
              {pending.preview.strategy.version}
            </Text>
            <SectionLabel>Dependent alerts · remove</SectionLabel>
            {pending.preview.dependentAlerts.length ? (
              pending.preview.dependentAlerts.map((alert) => (
                <Text key={alert.id} style={styles.meta}>
                  • {alert.name} · {alert.id} ·{" "}
                  {alert.enabled ? "enabled" : "disabled"} → removed; it cannot
                  evaluate without this strategy.
                </Text>
              ))
            ) : (
              <Text style={styles.meta}>No dependent alerts.</Text>
            )}
            <SectionLabel>
              Canonical paper records · retain unchanged
            </SectionLabel>
            {pending.preview.canonicalPaperRecords.length ? (
              pending.preview.canonicalPaperRecords.map((trade) => (
                <Text key={trade.id} style={styles.meta}>
                  • {trade.id} · strategy v{trade.strategyVersion} ·{" "}
                  {trade.status} → retained with immutable entry snapshot and
                  actual history.
                </Text>
              ))
            ) : (
              <Text style={styles.meta}>
                No canonical paper records reference this strategy.
              </Text>
            )}
            <SectionLabel>Dependent screenshots · detach metadata</SectionLabel>
            {pending.preview.sourceScreenshots.length ? (
              pending.preview.sourceScreenshots.map((source) => (
                <Text key={source.id} style={styles.meta}>
                  • {source.name} · source v{source.sourceVersion}
                  {source.linkedCanonicalTradeId
                    ? ` · canonical trade ${source.linkedCanonicalTradeId}`
                    : " · direct strategy link"}
                  {" → strategy link detached; encrypted original retained."}
                </Text>
              ))
            ) : (
              <Text style={styles.meta}>
                No screenshot records require detachment.
              </Text>
            )}
            <SectionLabel>Other library records · detach metadata</SectionLabel>
            {pending.preview.sourceLibraryRecords.length ? (
              pending.preview.sourceLibraryRecords.map((source) => (
                <Text key={source.id} style={styles.meta}>
                  • {source.name} · source v{source.sourceVersion} → strategy
                  link detached; encrypted original retained.
                </Text>
              ))
            ) : (
              <Text style={styles.meta}>
                No other library records require detachment.
              </Text>
            )}
            {pending.preview.effects.map((effect) => (
              <Text key={effect} style={styles.meta}>
                • {effect}
              </Text>
            ))}
            <Text style={styles.confirmation}>
              Type: {pending.preview.confirmation}
            </Text>
          </>
        ) : null}
        {pending?.kind === "library" ? (
          <>
            <Pill label="METADATA / INDEX ONLY" tone="amber" />
            <Text style={styles.body}>
              {pending.preview.source.name} · version{" "}
              {pending.preview.source.version}
            </Text>
            {pending.preview.effects.map((effect) => (
              <Text key={effect} style={styles.meta}>
                • {effect}
              </Text>
            ))}
            <Text style={styles.confirmation}>
              Type: {pending.preview.confirmation}
            </Text>
          </>
        ) : null}
        {pending?.kind === "clear-local" ? (
          <>
            <Pill label="UNSAVED LOCAL RECORDS ARE LOST" tone="rose" />
            <Text style={styles.body}>
              Cloud records are unaffected. The app must not call a cloud delete
              or a paper-history delete for this action.
            </Text>
            <Text style={styles.confirmation}>Type: CLEAR LOCAL DATA</Text>
          </>
        ) : null}
        {pending?.kind === "import" ? (
          <>
            <Pill label="STAGED · NO ORDER CREATION" tone="mint" />
            <Text style={styles.body}>
              {pending.preview.strategies.length} strategies,{" "}
              {pending.preview.alerts.length} disabled rules,{" "}
              {pending.preview.closedTrades.length} closed trade-history
              records, and {pending.preview.events.length} events are valid for
              staging.
            </Text>
            <Text style={styles.body}>
              {pending.preview.sourceMetadataCount} library metadata records are
              informational only; original files are not imported.
            </Text>
            {pending.preview.warnings.map((warning) => (
              <Text key={warning} style={styles.meta}>
                • {warning}
              </Text>
            ))}
            <Text style={styles.confirmation}>
              Type: {pending.preview.confirmation}
            </Text>
          </>
        ) : null}
        <Input
          label="Exact confirmation"
          value={confirmation}
          onChangeText={setConfirmation}
        />
        <ActionButton
          label={busy ? "Working…" : "Confirm explicit action"}
          kind="danger"
          disabled={busy}
          onPress={() => void confirmPending()}
        />
      </Sheet>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 10 },
  head: { flexDirection: "row", justifyContent: "space-between", gap: 10 },
  grow: { flex: 1, gap: 2 },
  heading: { color: C.text, fontSize: 15, fontWeight: "800" },
  title: { color: C.text, fontSize: 12, fontWeight: "800" },
  count: { color: C.lime, fontSize: 10, fontWeight: "800" },
  body: { color: C.muted, fontSize: 11, lineHeight: 17 },
  meta: { color: C.muted, fontSize: 10, lineHeight: 15 },
  notice: { color: C.amber, fontSize: 11, lineHeight: 17 },
  warning: { color: C.amber },
  capacityRow: { gap: 5, paddingTop: 4 },
  capacityHead: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 10,
    alignItems: "baseline",
  },
  progressTrack: {
    height: 7,
    borderRadius: 8,
    backgroundColor: C.black,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: C.border,
  },
  progressFill: { height: "100%", backgroundColor: C.lime },
  toolRow: {
    minHeight: 42,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: C.border,
    paddingTop: 8,
  },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  confirmation: {
    color: C.text,
    fontSize: 11,
    fontWeight: "800",
    lineHeight: 17,
  },
});
