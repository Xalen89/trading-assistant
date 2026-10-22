import { LocalLockControls } from "./local-lock-controls";
import { deviceLocalLock } from "@/lib/trading/device-local-lock";
import { useMemo, useRef } from "react";
import { Text, View } from "react-native";
import { trpc } from "@/lib/trpc";
import { useWorkspace } from "@/hooks/use-workspace";
import { archiveStrategyForCapacity } from "@/lib/trading/workspace-capacity";
import { applyPortableImport } from "@/lib/trading/workspace-portability";
import { workspaceDigest } from "@/lib/trading/workspace-sync";
import { WorkspaceTools, type WorkspaceToolsActions } from "./workspace-tools";
import { ToggleRow, Input, Card } from "./ui";
import { C } from "./theme";

export function OwnedWorkspaceTools() {
  const state = useWorkspace(),
    utils = trpc.useUtils();
  const remote = trpc.workspace.load.useQuery(undefined, { retry: false });
  const removeStrategy =
    trpc.workspaceTools.deleteArchivedStrategy.useMutation();
  const removeSource = trpc.workspaceTools.deleteLibraryRecord.useMutation();
  const previewDigests = useRef(new Map<string, string>());
  const { update, saveCloud, loadCloud, clearLocal, exportSnapshot } = state;
  const deleteStrategy = removeStrategy.mutateAsync,
    deleteSource = removeSource.mutateAsync;
  const actions = useMemo<WorkspaceToolsActions>(() => {
    const snapshot = () => {
      const value = exportSnapshot();
      if (!value)
        throw new Error(
          "Verified owner snapshot unavailable. Nothing changed.",
        );
      return workspaceDigest(value);
    };
    const requireUnchanged = (key: string) => {
      if (previewDigests.current.get(key) !== snapshot())
        throw new Error(
          "Local data changed after the dependency preview. Save your changes and refresh the preview; nothing was deleted.",
        );
    };
    const prepare = async () => {
      if (!(await saveCloud()))
        throw new Error(
          "Save or resolve your local/cloud changes before preparing deletion. Nothing was deleted.",
        );
    };
    const finish = async () => {
      await utils.workspace.load.invalidate();
      if (!(await loadCloud({ replaceLocal: false })))
        throw new Error(
          "Deletion completed in cloud, but new local edits were preserved. Review the sync conflict before continuing; no local copy was discarded.",
        );
    };
    return {
      onArchiveStrategy: async (id) => {
        update((w) => archiveStrategyForCapacity(w, id));
        if (!(await saveCloud()))
          throw new Error("Archived locally; cloud save needs attention.");
        await utils.workspace.load.invalidate();
      },
      getStrategyRemovalPreview: async (id) => {
        await prepare();
        const result = await utils.workspaceTools.strategyRemovalPreview.fetch({
          strategyId: id,
        });
        previewDigests.current.set(`strategy:${id}`, snapshot());
        return result;
      },
      deleteArchivedStrategy: async (input) => {
        requireUnchanged(`strategy:${input.strategyId}`);
        const result = await deleteStrategy(input);
        await finish();
        return result;
      },
      getLibraryRemovalPreview: async (id) => {
        await prepare();
        const result = await utils.workspaceTools.libraryRemovalPreview.fetch({
          sourceId: id,
        });
        previewDigests.current.set(`source:${id}`, snapshot());
        return result;
      },
      deleteLibraryRecord: async (input) => {
        requireUnchanged(`source:${input.sourceId}`);
        const result = await deleteSource(input);
        await finish();
        return result;
      },
      onClearLocalData: async () => {
        if (!(await clearLocal({ confirmed: true })))
          throw new Error(
            "Local copy was not cleared; retained data is unchanged.",
          );
      },
      onApplyPortableImport: async (preview, confirmation) => {
        update((w) => applyPortableImport(w, preview, confirmation));
        if (!(await saveCloud()))
          throw new Error(
            "Imported draft preserved locally; resolve cloud sync before replacing any copy.",
          );
        await utils.workspace.load.invalidate();
      },
      onNativeShare: async (file) => {
        const sharing = await import("expo-sharing");
        if (!(await sharing.isAvailableAsync()))
          throw new Error("Private device export is unavailable.");
        await sharing.shareAsync(file.uri, {
          mimeType: file.mime,
          dialogTitle: "Export private Zax data",
        });
      },
    };
  }, [
    update,
    saveCloud,
    loadCloud,
    clearLocal,
    deleteStrategy,
    deleteSource,
    utils,
    exportSnapshot,
  ]);
  return (
    <View style={{ gap: 12 }}>
      <LocalLockControls service={deviceLocalLock} />
      <ToggleRow
        label="Hide private values in background"
        detail="Covers balances, P/L and original source content while inactive; not server authorization."
        value={state.workspace.settings.hideValuesOnBackground !== false}
        onChange={(value) =>
          update((w) => ({
            ...w,
            settings: { ...w.settings, hideValuesOnBackground: value },
          }))
        }
      />
      <ToggleRow
        label="Automatic cloud save"
        detail="Local changes debounce for 2 seconds; owner cloud sync preserves conflicts instead of overwriting them."
        value={state.workspace.settings.autoCloudSave !== false}
        onChange={state.setAutoCloudSave}
      />
      <Card>
        <Text style={{ color: C.text, fontWeight: "800" }}>
          Analysis limits per 10 minutes
        </Text>
        {(["coach", "source-analysis", "forecast"] as const).map((scope) => (
          <Input
            key={scope}
            label={scope}
            keyboardType="numeric"
            value={String(
              state.workspace.settings.aiRateLimits?.[scope] ??
                (scope === "coach" ? 30 : 20),
            )}
            onChangeText={(text) => {
              const n = Number(text);
              if (Number.isInteger(n) && n >= 1 && n <= 60)
                update((w) => ({
                  ...w,
                  settings: {
                    ...w.settings,
                    aiRateLimits: { ...w.settings.aiRateLimits, [scope]: n },
                  },
                }));
            }}
          />
        ))}
        <Text style={{ color: C.muted, fontSize: 11 }}>
          Range 1–60; counters persist in the database. Limits change after a
          successful owner cloud save.
        </Text>
      </Card>
      <Text
        style={{ color: C.muted, fontSize: 11 }}
        accessibilityLiveRegion="polite"
      >
        Local: {state.localState} · Cloud: {state.cloudState} · revision{" "}
        {state.revision}
        {state.lastSyncedAt
          ? ` · Last synced ${new Date(state.lastSyncedAt).toLocaleString()}`
          : ""}
      </Text>
      {state.localMessage || state.cloudMessage ? (
        <Text
          style={{ color: state.conflict ? C.amber : C.muted, fontSize: 11 }}
        >
          {state.localMessage || state.cloudMessage}
        </Text>
      ) : null}
      <WorkspaceTools
        workspace={state.workspace}
        savedWorkspace={remote.data?.workspace}
        revision={state.revision}
        savedRevision={remote.data?.revision}
        lastSyncedAt={state.lastSyncedAt}
        actions={actions}
      />
    </View>
  );
}
