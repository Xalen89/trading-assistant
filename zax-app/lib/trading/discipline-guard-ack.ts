import type { Workspace } from "./model";
import type { DisciplineGuardSettings } from "./discipline-policy";

export type DisciplineGuardPersistenceChange = {
  setting: keyof DisciplineGuardSettings;
  enabled: boolean;
  reason?: string;
};

export type DisciplineGuardAcknowledgement =
  | { status: "acknowledged"; workspace: Workspace }
  | { status: "local-only"; workspace: Workspace };

/**
 * Applies one optional guard locally, then waits for the canonical workspace
 * save. Callers must treat `local-only` as advisory UI state, not enforcement.
 */
export async function persistDisciplineGuardWithAcknowledgement(input: {
  workspace: Workspace;
  change: DisciplineGuardPersistenceChange;
  update: (recipe: (current: Workspace) => Workspace) => void;
  saveCloud: (workspace?: Workspace) => Promise<boolean>;
}): Promise<DisciplineGuardAcknowledgement> {
  const reason = input.change.reason?.trim().slice(0, 1000);
  const nextWorkspace: Workspace = {
    ...input.workspace,
    settings: {
      ...input.workspace.settings,
      [input.change.setting]: input.change.enabled,
      ...(input.change.enabled
        ? {}
        : { guardChangeReason: reason || undefined }),
    },
  };

  input.update(() => nextWorkspace);
  const acknowledged = await input.saveCloud(nextWorkspace);
  return acknowledged
    ? { status: "acknowledged", workspace: nextWorkspace }
    : { status: "local-only", workspace: nextWorkspace };
}
