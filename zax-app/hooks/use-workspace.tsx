import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  AppState,
  type AppStateStatus,
} from "react-native";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ReactNode } from "react";
import { initialWorkspace, type Timeframe, type Workspace } from "@/lib/trading/model";
import {
  acknowledgeCloudSave,
  cloudHasDiverged,
  createWorkspaceEnvelope,
  envelopeForPersistence,
  LEGACY_WORKSPACE_STORAGE_KEY,
  OWNER_WORKSPACE_STORAGE_KEY,
  parseWorkspaceStorage,
  shouldAutoCloudSave,
  type PersistedWorkspaceEnvelope,
  workspaceDigest,
  workspaceForPersistence,
} from "@/lib/trading/workspace-sync";
import { trpc } from "@/lib/trpc";

type CloudState = "local" | "saving" | "saved" | "error";
type LocalState = "idle" | "saving" | "error";
type WorkspaceConflict = {
  kind: "legacy-cloud" | "cloud-changed" | "replace-local-confirmation" | "missing-cloud";
  message: string;
};
type LoadCloudOptions = {
  /** Required when replacing unsynced or legacy local state. */
  replaceLocal?: boolean;
};
type SaveMode = "manual" | "auto";

type WorkspaceContextValue = {
  workspace: Workspace;
  ready: boolean;
  revision: number;
  ownerAllowed: boolean;
  lastSyncedAt?: number;
  cloudState: CloudState;
  cloudMessage?: string;
  localState: LocalState;
  localMessage?: string;
  conflict?: WorkspaceConflict;
  update: (recipe: (workspace: Workspace) => Workspace) => void;
  setMarket: (market: string) => void;
  setTimeframe: (timeframe: Timeframe) => void;
  /** Saves the current latest local snapshot; an override is never allowed to replace a newer edit. */
  saveCloud: (override?: Workspace) => Promise<boolean>;
  /**
   * A clean device restores automatically. A destructive replacement requires
   * the caller to collect a fresh confirmation and pass replaceLocal: true.
   */
  loadCloud: (options?: LoadCloudOptions) => Promise<boolean>;
  setAutoCloudSave: (enabled: boolean) => void;
  /** Deletes only this device's owner envelope after an explicit confirmation. */
  clearLocal: (options: { confirmed?: boolean }) => Promise<boolean>;
  /** Returns an in-memory copy for the parent-owned portability flow; it performs no export/write. */
  exportSnapshot: () => Workspace | null;
};

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);
const api = trpc;
const LOCAL_SAVE_DEBOUNCE_MS = 2_000;

function newLocalEnvelope(): PersistedWorkspaceEnvelope {
  return createWorkspaceEnvelope(initialWorkspace());
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function isConflictError(error: unknown) {
  const candidate = error as { data?: { code?: unknown }; message?: unknown };
  return (
    candidate?.data?.code === "CONFLICT" ||
    (typeof candidate?.message === "string" &&
      candidate.message.toLowerCase().includes("cloud workspace"))
  );
}

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [workspace, setWorkspace] = useState<Workspace>(() => initialWorkspace());
  const [ready, setReady] = useState(false);
  const [revision, setRevision] = useState(0);
  const [lastSyncedAt, setLastSyncedAt] = useState<number>();
  const [cloudState, setCloudState] = useState<CloudState>("local");
  const [cloudMessage, setCloudMessage] = useState<string>();
  const [localState, setLocalState] = useState<LocalState>("idle");
  const [localMessage, setLocalMessage] = useState<string>();
  const [conflict, setConflict] = useState<WorkspaceConflict>();
  const access = api.auth.access.useQuery(undefined, {
    retry: false,
    staleTime: 0,
    refetchInterval: 15_000,
  });
  const cloudLoad = api.workspace.load.useQuery(undefined, { enabled: false, retry: false });
  const cloudSave = api.workspace.save.useMutation();
  const saveMutation = cloudSave.mutateAsync;
  const loadRefetch = cloudLoad.refetch;
  const ownerAllowed = access.data?.allowed === true;

  const latestRef = useRef<PersistedWorkspaceEnvelope>(newLocalEnvelope());
  const ownerAllowedRef = useRef(false);
  const hydratedOwnerRef = useRef(false);
  const legacyMigrationRef = useRef(false);
  const conflictRef = useRef<WorkspaceConflict | undefined>(undefined);
  const generationRef = useRef(0);
  const localStorageEpochRef = useRef(0);
  const localWriteTailRef = useRef<Promise<boolean>>(Promise.resolve(true));
  const cloudSaveTailRef = useRef<Promise<boolean>>(Promise.resolve(true));
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const schedulePersistenceRef = useRef<() => void>(() => undefined);

  // Make authorization changes visible to queued work before effects run.
  ownerAllowedRef.current = ownerAllowed;

  const applyEnvelope = useCallback((envelope: PersistedWorkspaceEnvelope) => {
    latestRef.current = envelope;
    setWorkspace(envelope.workspace);
    setRevision(envelope.revision);
  }, []);

  /** Serializes writes and samples latestRef only when the write actually runs. */
  const flushLocal = useCallback(async (): Promise<boolean> => {
    if (!ownerAllowedRef.current || !hydratedOwnerRef.current) return false;
    const generation = generationRef.current;
    const storageEpoch = localStorageEpochRef.current;
    setLocalState("saving");
    const write = async () => {
      if (
        !ownerAllowedRef.current ||
        !hydratedOwnerRef.current ||
        generation !== generationRef.current ||
        storageEpoch !== localStorageEpochRef.current
      )
        return false;
      try {
        // Do not capture a stale envelope before a prior storage write finishes.
        await AsyncStorage.setItem(
          OWNER_WORKSPACE_STORAGE_KEY,
          JSON.stringify(envelopeForPersistence(latestRef.current)),
        );
        if (
          generation === generationRef.current &&
          storageEpoch === localStorageEpochRef.current
        ) {
          setLocalState("idle");
          setLocalMessage(undefined);
        }
        return true;
      } catch (error) {
        if (
          generation === generationRef.current &&
          storageEpoch === localStorageEpochRef.current
        ) {
          setLocalState("error");
          setLocalMessage(
            errorMessage(
              error,
              "Local storage could not be updated. Changes remain in memory.",
            ),
          );
        }
        return false;
      }
    };
    const queued = localWriteTailRef.current.then(write, write);
    localWriteTailRef.current = queued;
    return queued;
  }, []);

  const setConflictState = useCallback((next?: WorkspaceConflict) => {
    conflictRef.current = next;
    setConflict(next);
  }, []);

  const canAutoSave = useCallback(() =>
    shouldAutoCloudSave(latestRef.current, {
      ownerAllowed: ownerAllowedRef.current && hydratedOwnerRef.current,
      migratedLegacy: legacyMigrationRef.current,
      conflicted: Boolean(conflictRef.current),
    }), []);

  const performCloudSave = useCallback(
    async (mode: SaveMode, override?: Workspace): Promise<boolean> => {
      if (!ownerAllowedRef.current || !hydratedOwnerRef.current) {
        if (mode === "manual") {
          setCloudState("error");
          setCloudMessage("Cloud save is available only to the verified owner.");
        }
        return false;
      }
      if (mode === "auto" && !canAutoSave()) return false;
      if (conflictRef.current) {
        if (mode === "manual") {
          setCloudState("error");
          setCloudMessage(conflictRef.current.message);
        }
        return false;
      }

      const latestBeforeSave = latestRef.current;
      if (
        override &&
        workspaceDigest(override) !== workspaceDigest(latestBeforeSave.workspace)
      ) {
        setCloudMessage(
          "A newer local snapshot was kept; cloud save uses the current workspace.",
        );
      }

      // Local durability is attempted first. A local failure remains visible but
      // does not falsely report that memory was persisted.
      await flushLocal();
      const submitted: PersistedWorkspaceEnvelope = {
        ...latestRef.current,
        workspace: workspaceForPersistence(latestRef.current.workspace),
      };
      if (mode === "auto" && !canAutoSave()) return false;

      setCloudState("saving");
      setCloudMessage(undefined);
      try {
        const result = await saveMutation({
          workspace: submitted.workspace,
          revision: submitted.revision,
        });
        if (!ownerAllowedRef.current || !hydratedOwnerRef.current) return false;

        const acknowledged = acknowledgeCloudSave(
          latestRef.current,
          submitted.workspace,
          result.revision,
        );
        applyEnvelope(acknowledged);
        setLastSyncedAt(Date.now());
        legacyMigrationRef.current = false;
        await flushLocal();

        if (acknowledged.dirty) {
          setCloudState("local");
          setCloudMessage(
            "Cloud saved an earlier snapshot. A newer local change remains pending.",
          );
          // The serialized tail will use the revision just acknowledged.
          schedulePersistenceRef.current();
        } else {
          setCloudState("saved");
          setCloudMessage(
            result.historyArchived === false
              ? "Workspace saved; some manual paper history revisions could not be archived."
              : "Workspace saved to the owner cloud copy.",
          );
        }
        return true;
      } catch (error) {
        const message = errorMessage(
          error,
          "Cloud save failed; the local workspace is unchanged.",
        );
        if (isConflictError(error)) {
          const next: WorkspaceConflict = {
            kind: "cloud-changed",
            message:
              "Cloud workspace changed elsewhere. Export local changes, then explicitly load the current cloud copy; neither version was overwritten.",
          };
          setConflictState(next);
          setCloudMessage(next.message);
        } else {
          setCloudMessage(message);
        }
        setCloudState("error");
        return false;
      }
    },
    [applyEnvelope, canAutoSave, saveMutation, flushLocal, setConflictState],
  );

  /** One cloud flight at a time; each queued flight re-reads the latest snapshot and revision. */
  const enqueueCloudSave = useCallback(
    (mode: SaveMode, override?: Workspace) => {
      const queued = cloudSaveTailRef.current.then(
        () => performCloudSave(mode, override),
        () => performCloudSave(mode, override),
      );
      cloudSaveTailRef.current = queued;
      return queued;
    },
    [performCloudSave],
  );

  const schedulePersistence = useCallback(() => {
    if (!ownerAllowedRef.current || !hydratedOwnerRef.current) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    setLocalState("saving");
    saveTimerRef.current = setTimeout(() => {
      saveTimerRef.current = undefined;
      void flushLocal().then(() => {
        if (canAutoSave()) void enqueueCloudSave("auto");
      });
    }, LOCAL_SAVE_DEBOUNCE_MS);
  }, [canAutoSave, enqueueCloudSave, flushLocal]);
  schedulePersistenceRef.current = schedulePersistence;

  const restoreAfterHydration = useCallback(
    async (
      hydrated: PersistedWorkspaceEnvelope,
      migratedLegacy: boolean,
      generation: number,
    ) => {
      setCloudState("saving");
      try {
        const result = await loadRefetch();
        if (result.error) throw result.error;
        if (
          generation !== generationRef.current ||
          !ownerAllowedRef.current ||
          !hydratedOwnerRef.current
        )
          return;
        const remote = result.data;
        if (!remote?.workspace) {
          if (latestRef.current.revision > 0) {
            const next: WorkspaceConflict = {
              kind: "missing-cloud",
              message:
                "The expected cloud workspace is unavailable. Local data was retained; do not overwrite it until the cloud copy is reviewed.",
            };
            setConflictState(next);
            setCloudState("error");
            setCloudMessage(next.message);
          } else {
            setCloudState("local");
            setCloudMessage(
              migratedLegacy
                ? "Legacy local workspace migrated privately. No cloud copy was created; Save to cloud remains explicit."
                : "No cloud workspace exists yet. Local practice remains available.",
            );
          }
          return;
        }

        // A legacy key is intentionally never allowed to overwrite an existing
        // owner cloud copy without the owner choosing the destructive action.
        if (migratedLegacy) {
          const next: WorkspaceConflict = {
            kind: "legacy-cloud",
            message:
              "A legacy local workspace and a cloud workspace both exist. Neither was overwritten; export local data or explicitly load the current cloud copy.",
          };
          setConflictState(next);
          setCloudState("error");
          setCloudMessage(next.message);
          return;
        }

        const current = latestRef.current;
        if (current.dirty) {
          if (cloudHasDiverged(current, remote.workspace)) {
            const next: WorkspaceConflict = {
              kind: "cloud-changed",
              message:
                "Cloud and unsynced local changes differ. Neither was overwritten; export local data or explicitly load the current cloud copy.",
            };
            setConflictState(next);
            setCloudState("error");
            setCloudMessage(next.message);
          } else {
            setCloudState("local");
            setCloudMessage("Unsynced local changes were retained.");
            schedulePersistenceRef.current();
          }
          return;
        }

        // Clean local state is the only state that restores automatically.
        const restored = createWorkspaceEnvelope(
          remote.workspace,
          remote.revision,
          false,
          workspaceDigest(remote.workspace),
        );
        applyEnvelope(restored);
        setLastSyncedAt(Date.now());
        legacyMigrationRef.current = false;
        await flushLocal();
        setConflictState(undefined);
        setCloudState("saved");
        setCloudMessage("Restored the current owner cloud workspace.");
      } catch (error) {
        if (generation !== generationRef.current) return;
        setCloudState("error");
        setCloudMessage(
          errorMessage(
            error,
            "Cloud workspace could not be checked; local data was retained.",
          ),
        );
      }
    },
    [applyEnvelope, loadRefetch, flushLocal, setConflictState],
  );

  // Read either storage slot only after the same owner authorization used by OwnerGate succeeds.
  useEffect(() => {
    generationRef.current += 1;
    const generation = generationRef.current;
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = undefined;
    }

    if (!ownerAllowed) {
      // Clear private visible data synchronously before any future authorized load.
      hydratedOwnerRef.current = false;
      legacyMigrationRef.current = false;
      setConflictState(undefined);
      applyEnvelope(newLocalEnvelope());
      setReady(false);
      setCloudState("local");
      setCloudMessage(undefined);
      setLocalState("idle");
      setLocalMessage(undefined);
      return;
    }

    let cancelled = false;
    const hydrate = async () => {
      setReady(false);
      setCloudMessage(undefined);
      setLocalMessage(undefined);
      try {
        const ownerStored = parseWorkspaceStorage(
          await AsyncStorage.getItem(OWNER_WORKSPACE_STORAGE_KEY),
        );
        if (cancelled || generation !== generationRef.current || !ownerAllowedRef.current)
          return;

        let envelope: PersistedWorkspaceEnvelope;
        let migratedLegacy = false;
        if (ownerStored.kind === "envelope") {
          envelope = ownerStored.envelope;
        } else {
          const legacyStored = parseWorkspaceStorage(
            await AsyncStorage.getItem(LEGACY_WORKSPACE_STORAGE_KEY),
          );
          if (cancelled || generation !== generationRef.current || !ownerAllowedRef.current)
            return;
          if (legacyStored.kind === "legacy") {
            envelope = createWorkspaceEnvelope(legacyStored.workspace, 0, true, null);
            migratedLegacy = true;
          } else {
            envelope = newLocalEnvelope();
          }
        }

        hydratedOwnerRef.current = true;
        legacyMigrationRef.current = migratedLegacy;
        applyEnvelope(envelope);
        setReady(true);
        if (migratedLegacy) {
          // Copy, do not remove or mutate the legacy key.
          await flushLocal();
        }
        void restoreAfterHydration(envelope, migratedLegacy, generation);
      } catch (error) {
        if (cancelled || generation !== generationRef.current) return;
        // Keep a fresh in-memory workspace available to the verified owner even
        // when device storage itself is unavailable.
        hydratedOwnerRef.current = true;
        legacyMigrationRef.current = false;
        applyEnvelope(newLocalEnvelope());
        setReady(true);
        setLocalState("error");
        setLocalMessage(
          errorMessage(
            error,
            "Local storage could not be read. Changes remain in memory.",
          ),
        );
      }
    };
    void hydrate();
    return () => {
      cancelled = true;
    };
  }, [applyEnvelope, flushLocal, ownerAllowed, restoreAfterHydration, setConflictState]);

  const update = useCallback(
    (recipe: (current: Workspace) => Workspace) => {
      if (!ownerAllowedRef.current || !hydratedOwnerRef.current) return;
      const previous = latestRef.current;
      const nextWorkspace = recipe(previous.workspace);
      const changedPersistedState =
        workspaceDigest(nextWorkspace) !== workspaceDigest(previous.workspace);
      const changed: PersistedWorkspaceEnvelope = {
        ...previous,
        workspace: nextWorkspace,
        dirty: previous.dirty || changedPersistedState,
      };
      applyEnvelope(changed);
      // Sample Mode is intentionally live-only. It may update the current view
      // without becoming a local/cloud change or resetting a saved indicator.
      if (!changedPersistedState) return;
      setCloudState("local");
      setCloudMessage(undefined);
      schedulePersistence();
    },
    [applyEnvelope, schedulePersistence, setConflictState],
  );

  const setMarket = useCallback(
    (market: string) => update((current) => ({ ...current, market })),
    [update],
  );
  const setTimeframe = useCallback(
    (timeframe: Timeframe) => update((current) => ({ ...current, timeframe })),
    [update],
  );

  const clearLocal = useCallback(
    async (options: { confirmed?: boolean }): Promise<boolean> => {
      if (!options.confirmed) {
        setLocalState("error");
        setLocalMessage("Confirm local removal before clearing this device copy.");
        return false;
      }
      if (!ownerAllowedRef.current || !hydratedOwnerRef.current) {
        setLocalState("error");
        setLocalMessage("Only the verified owner can clear this device copy.");
        return false;
      }
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = undefined;
      }

      // Block queued writes before removal so an old timer cannot recreate this
      // owner envelope. No cloud request, source file, or canonical paper trade
      // is deleted by this operation.
      hydratedOwnerRef.current = false;
      localStorageEpochRef.current += 1;
      await localWriteTailRef.current.catch(() => false);
      try {
        await AsyncStorage.removeItem(OWNER_WORKSPACE_STORAGE_KEY);
        if (!ownerAllowedRef.current) return false;
        legacyMigrationRef.current = false;
        setConflictState(undefined);
        applyEnvelope(newLocalEnvelope());
        hydratedOwnerRef.current = true;
        setReady(true);
        setCloudState("local");
        setCloudMessage("This device's owner workspace copy was cleared. Cloud and canonical records were not changed.");
        setLocalState("idle");
        setLocalMessage(undefined);
        return true;
      } catch (error) {
        if (ownerAllowedRef.current) {
          hydratedOwnerRef.current = true;
          setLocalState("error");
          setLocalMessage(
            errorMessage(
              error,
              "This device copy could not be cleared. Existing data remains in memory.",
            ),
          );
        }
        return false;
      }
    },
    [applyEnvelope, setConflictState],
  );

  const saveCloud = useCallback(
    (override?: Workspace) => enqueueCloudSave("manual", override),
    [enqueueCloudSave],
  );

  const loadCloud = useCallback(
    async (options?: LoadCloudOptions): Promise<boolean> => {
      if (!ownerAllowedRef.current || !hydratedOwnerRef.current) {
        setCloudState("error");
        setCloudMessage("Cloud load is available only to the verified owner.");
        return false;
      }
      // A requested load waits for an in-flight save acknowledgement so it reads
      // against the revision that will be used next.
      await cloudSaveTailRef.current.catch(() => false);
      const generation = generationRef.current;
      const before = latestRef.current;
      const beforeDigest = workspaceDigest(before.workspace);
      setCloudState("saving");
      setCloudMessage(undefined);
      try {
        const result = await loadRefetch();
        if (result.error) throw result.error;
        if (
          generation !== generationRef.current ||
          !ownerAllowedRef.current ||
          !hydratedOwnerRef.current
        )
          return false;
        const remote = result.data;
        if (!remote?.workspace) {
          if (before.revision > 0) {
            const next: WorkspaceConflict = {
              kind: "missing-cloud",
              message:
                "The expected cloud workspace is unavailable. Local data was not replaced.",
            };
            setConflictState(next);
            setCloudState("error");
            setCloudMessage(next.message);
            return false;
          }
          setCloudState("local");
          setCloudMessage("No cloud workspace exists yet. Local data was not replaced.");
          return true;
        }

        const latest = latestRef.current;
        const changedWhileLoading = workspaceDigest(latest.workspace) !== beforeDigest;
        const needsExplicitReplacement =
          legacyMigrationRef.current || latest.dirty || changedWhileLoading;
        if (needsExplicitReplacement && !options?.replaceLocal) {
          const next: WorkspaceConflict = {
            kind: "replace-local-confirmation",
            message:
              "Loading cloud data would replace local changes. Export local data, then confirm Load current cloud to continue.",
          };
          setConflictState(next);
          setCloudState("local");
          setCloudMessage(next.message);
          return false;
        }
        // A confirmation made before another edit is not consent to discard that edit.
        if (changedWhileLoading) {
          const next: WorkspaceConflict = {
            kind: "replace-local-confirmation",
            message:
              "Local data changed while cloud was loading. Nothing was replaced; confirm again against the current local copy.",
          };
          setConflictState(next);
          setCloudState("local");
          setCloudMessage(next.message);
          return false;
        }

        const replacement = createWorkspaceEnvelope(
          remote.workspace,
          remote.revision,
          false,
          workspaceDigest(remote.workspace),
        );
        applyEnvelope(replacement);
        setLastSyncedAt(Date.now());
        legacyMigrationRef.current = false;
        setConflictState(undefined);
        await flushLocal();
        setCloudState("saved");
        setCloudMessage("Loaded the current owner cloud workspace.");
        return true;
      } catch (error) {
        setCloudState("error");
        setCloudMessage(
          errorMessage(
            error,
            "Cloud load failed; local workspace is unchanged.",
          ),
        );
        return false;
      }
    },
    [applyEnvelope, loadRefetch, flushLocal, setConflictState],
  );

  const setAutoCloudSave = useCallback(
    (enabled: boolean) => {
      update((current) => ({
        ...current,
        settings: { ...current.settings, autoCloudSave: enabled },
      }));
    },
    [update],
  );

  const exportSnapshot = useCallback(() => {
    if (!ownerAllowedRef.current || !hydratedOwnerRef.current) return null;
    // Clone so a parent-owned export/Share flow cannot mutate live state.
    return JSON.parse(
      JSON.stringify(workspaceForPersistence(latestRef.current.workspace)),
    ) as Workspace;
  }, []);

  useEffect(() => {
    let appState: AppStateStatus = AppState.currentState;
    const subscription = AppState.addEventListener("change", (nextState) => {
      const leavingForeground =
        appState === "active" && (nextState === "inactive" || nextState === "background");
      appState = nextState;
      if (!leavingForeground || !ownerAllowedRef.current || !hydratedOwnerRef.current)
        return;
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = undefined;
      }
      // Device durability is immediate; server synchronization is deliberately
      // best effort because a backgrounded app may lose network execution.
      void flushLocal();
      if (canAutoSave()) void enqueueCloudSave("auto");
    });
    return () => subscription.remove();
  }, [canAutoSave, enqueueCloudSave, flushLocal]);

  useEffect(
    () => () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    },
    [],
  );

  const value = useMemo(
    () => ({
      workspace,
      ready,
      revision,
      ownerAllowed,
      lastSyncedAt,
      cloudState,
      cloudMessage,
      localState,
      localMessage,
      conflict,
      update,
      setMarket,
      setTimeframe,
      saveCloud,
      loadCloud,
      setAutoCloudSave,
      clearLocal,
      exportSnapshot,
    }),
    [
      workspace,
      ready,
      revision,
      ownerAllowed,
      lastSyncedAt,
      cloudState,
      cloudMessage,
      localState,
      localMessage,
      conflict,
      update,
      setMarket,
      setTimeframe,
      saveCloud,
      loadCloud,
      setAutoCloudSave,
      clearLocal,
      exportSnapshot,
    ],
  );
  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace() {
  const context = useContext(WorkspaceContext);
  if (!context) throw new Error("useWorkspace must be used under WorkspaceProvider");
  return context;
}
