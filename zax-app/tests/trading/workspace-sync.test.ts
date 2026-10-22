import { describe, expect, it } from "vitest";
import { initialWorkspace } from "../../lib/trading/model";
import {
  acknowledgeCloudSave,
  cloudHasDiverged,
  createWorkspaceEnvelope,
  parseWorkspaceStorage,
  shouldAutoCloudSave,
  workspaceDigest,
} from "../../lib/trading/workspace-sync";

describe("owner workspace persistence envelope", () => {
  it("parses the owner envelope and still recognizes the old bare workspace", () => {
    const workspace = initialWorkspace();
    const envelope = createWorkspaceEnvelope(workspace, 3, false, "synced");
    expect(parseWorkspaceStorage(JSON.stringify(envelope))).toEqual({
      kind: "envelope",
      envelope,
    });
    expect(parseWorkspaceStorage(JSON.stringify(workspace))).toEqual({
      kind: "legacy",
      workspace,
    });
    expect(parseWorkspaceStorage("not json")).toEqual({ kind: "invalid" });
  });

  it("uses a stable workspace digest instead of object insertion order", () => {
    const first = initialWorkspace();
    const second = JSON.parse(JSON.stringify(first));
    second.settings = {
      adaptation: false,
      futureOverlay: false,
      sampleMode: false,
      weeklyBias: "Neutral",
      timezone: "America/New_York",
    };
    first.settings = {
      timezone: "America/New_York",
      weeklyBias: "Neutral",
      sampleMode: false,
      futureOverlay: false,
      adaptation: false,
    };
    expect(workspaceDigest(first)).toBe(workspaceDigest(second));
  });

  it("does not declare a later local update saved by an older cloud response", () => {
    const submitted = initialWorkspace();
    const later = {
      ...submitted,
      market: "ETH-USD",
    };
    const acknowledged = acknowledgeCloudSave(
      createWorkspaceEnvelope(later, 0, true, null),
      submitted,
      1,
    );
    expect(acknowledged).toMatchObject({
      workspace: later,
      revision: 1,
      dirty: true,
      lastSyncedDigest: workspaceDigest(submitted),
    });
  });

  it("permits auto cloud saves only after an explicit cloud initialization", () => {
    const workspace = initialWorkspace();
    const unsynced = createWorkspaceEnvelope(workspace, 0, true, null);
    expect(
      shouldAutoCloudSave(unsynced, {
        ownerAllowed: true,
        migratedLegacy: false,
        conflicted: false,
      }),
    ).toBe(false);
    expect(
      shouldAutoCloudSave({ ...unsynced, revision: 1 }, {
        ownerAllowed: true,
        migratedLegacy: false,
        conflicted: false,
      }),
    ).toBe(true);
    expect(
      shouldAutoCloudSave(
        {
          ...unsynced,
          revision: 1,
          workspace: {
            ...workspace,
            settings: { ...workspace.settings, autoCloudSave: false },
          },
        },
        { ownerAllowed: true, migratedLegacy: false, conflicted: false },
      ),
    ).toBe(false);
  });

  it("flags a remote snapshot that differs from the acknowledged baseline", () => {
    const workspace = initialWorkspace();
    const envelope = createWorkspaceEnvelope(
      workspace,
      2,
      true,
      workspaceDigest(workspace),
    );
    expect(cloudHasDiverged(envelope, workspace)).toBe(false);
    expect(
      cloudHasDiverged(envelope, { ...workspace, market: "ETH-USD" }),
    ).toBe(true);
  });
});
