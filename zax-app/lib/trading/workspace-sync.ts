import type { Workspace } from "./model";

/** The pre-owner storage slot. It is never removed during migration. */
export const LEGACY_WORKSPACE_STORAGE_KEY = "stratdesk.guest.workspace.v1";
/** Owner-only local state is deliberately separate from the historical guest slot. */
export const OWNER_WORKSPACE_STORAGE_KEY = "stratdesk.owner.workspace.v1";

export type PersistedWorkspaceEnvelope = {
  workspace: Workspace;
  revision: number;
  dirty: boolean;
  /** Digest of the exact cloud snapshot acknowledged by the server, if any. */
  lastSyncedDigest: string | null;
};

export type ParsedWorkspaceStorage =
  | { kind: "empty" | "invalid" }
  | { kind: "envelope"; envelope: PersistedWorkspaceEnvelope }
  | { kind: "legacy"; workspace: Workspace };

function stableJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableJson(object[key])}`)
    .join(",")}}`;
}

/**
 * Sample Mode is a temporary view state. Keep a live session untouched, but
 * never retain or synchronize its enabled value.
 */
export function workspaceForPersistence(workspace: Workspace): Workspace {
  return {
    ...workspace,
    settings: { ...workspace.settings, sampleMode: false },
  };
}

export function envelopeForPersistence(
  envelope: PersistedWorkspaceEnvelope,
): PersistedWorkspaceEnvelope {
  return {
    ...envelope,
    workspace: workspaceForPersistence(envelope.workspace),
  };
}

/**
 * Small deterministic, non-cryptographic fingerprint used only to detect state
 * divergence. It is not a security primitive and never leaves the device by itself.
 */
export function workspaceDigest(workspace: Workspace): string {
  const json = stableJson(workspaceForPersistence(workspace));
  let hash = 0x811c9dc5;
  for (let index = 0; index < json.length; index += 1) {
    hash ^= json.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `fnv1a:${(hash >>> 0).toString(16).padStart(8, "0")}:${json.length}`;
}

export function createWorkspaceEnvelope(
  workspace: Workspace,
  revision = 0,
  dirty = false,
  lastSyncedDigest: string | null = null,
): PersistedWorkspaceEnvelope {
  return {
    workspace: workspaceForPersistence(workspace),
    revision,
    dirty,
    lastSyncedDigest,
  };
}

function isWorkspace(value: unknown): value is Workspace {
  return Boolean(
    value &&
      typeof value === "object" &&
      (value as { schemaVersion?: unknown }).schemaVersion === 1 &&
      Array.isArray((value as { strategies?: unknown }).strategies) &&
      Array.isArray((value as { trades?: unknown }).trades) &&
      typeof (value as { settings?: unknown }).settings === "object",
  );
}

function isEnvelope(value: unknown): value is PersistedWorkspaceEnvelope {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<PersistedWorkspaceEnvelope>;
  return (
    isWorkspace(candidate.workspace) &&
    typeof candidate.revision === "number" &&
    Number.isInteger(candidate.revision) &&
    candidate.revision >= 0 &&
    typeof candidate.dirty === "boolean" &&
    (typeof candidate.lastSyncedDigest === "string" ||
      candidate.lastSyncedDigest === null)
  );
}

/**
 * Read either the new owner envelope or the legacy bare workspace. The caller
 * decides whether it is authorized to read a storage slot; this helper never
 * accesses storage itself.
 */
export function parseWorkspaceStorage(
  raw: string | null | undefined,
): ParsedWorkspaceStorage {
  if (!raw) return { kind: "empty" };
  try {
    const value: unknown = JSON.parse(raw);
    if (isEnvelope(value))
      return { kind: "envelope", envelope: envelopeForPersistence(value) };
    if (isWorkspace(value))
      return { kind: "legacy", workspace: workspaceForPersistence(value) };
    return { kind: "invalid" };
  } catch {
    return { kind: "invalid" };
  }
}

/**
 * Preserve a later device update while adopting the revision returned for the
 * snapshot actually submitted. This is the critical acknowledgement rule for
 * a save that races with a newer local edit.
 */
export function acknowledgeCloudSave(
  current: PersistedWorkspaceEnvelope,
  submittedWorkspace: Workspace,
  acknowledgedRevision: number,
): PersistedWorkspaceEnvelope {
  const submittedDigest = workspaceDigest(submittedWorkspace);
  const currentDigest = workspaceDigest(current.workspace);
  return {
    ...current,
    revision: acknowledgedRevision,
    dirty: currentDigest !== submittedDigest,
    lastSyncedDigest: submittedDigest,
  };
}

/** True only when a known cloud baseline has changed somewhere else. */
export function cloudHasDiverged(
  envelope: PersistedWorkspaceEnvelope,
  cloudWorkspace: Workspace | null | undefined,
): boolean {
  if (!cloudWorkspace) return envelope.revision > 0;
  const cloudDigest = workspaceDigest(cloudWorkspace);
  return envelope.lastSyncedDigest
    ? envelope.lastSyncedDigest !== cloudDigest
    : envelope.dirty && cloudDigest !== workspaceDigest(envelope.workspace);
}

export function shouldAutoCloudSave(
  envelope: PersistedWorkspaceEnvelope,
  options: { ownerAllowed: boolean; migratedLegacy: boolean; conflicted: boolean },
): boolean {
  if (
    !options.ownerAllowed ||
    options.migratedLegacy ||
    options.conflicted ||
    !envelope.dirty ||
    envelope.workspace.settings.autoCloudSave === false
  )
    return false;
  // Cloud creation remains an explicit user action. Once initialized, the
  // requested default-on setting keeps later owner changes synchronized.
  return envelope.revision > 0 || envelope.lastSyncedDigest !== null;
}
