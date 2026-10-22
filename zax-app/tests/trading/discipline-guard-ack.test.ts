import { describe, expect, it, vi } from "vitest";
import { initialWorkspace, type Workspace } from "../../lib/trading/model";
import { persistDisciplineGuardWithAcknowledgement } from "../../lib/trading/discipline-guard-ack";
import { hasEnforcedDisciplineBlock } from "../../lib/trading/discipline-policy";

const cooldownFlag = {
  id: "rapid-reentry-after-loss",
  severity: "warning" as const,
  title: "Synthetic canonical loss",
  evidence: ["Synthetic canonical paper record."],
  action: "Review the written rule.",
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

describe("discipline guard cloud acknowledgement", () => {
  it("does not present a newly enabled local guard as server enforcement during an immediate paper-order request", async () => {
    let local = initialWorkspace();
    let canonical = initialWorkspace();
    const gate = deferred<boolean>();
    const update = vi.fn((recipe: (current: Workspace) => Workspace) => {
      local = recipe(local);
    });
    const saveCloud = vi.fn(async (workspace?: Workspace) => {
      const acknowledged = await gate.promise;
      if (acknowledged && workspace) canonical = workspace;
      return acknowledged;
    });

    const saving = persistDisciplineGuardWithAcknowledgement({
      workspace: local,
      change: { setting: "enforceCooldown", enabled: true },
      update,
      saveCloud,
    });

    expect(local.settings.enforceCooldown).toBe(true);
    expect(saveCloud).toHaveBeenCalledOnce();
    // This models an immediate independent paper-order request: the canonical
    // server snapshot remains default-off until the save acknowledgement.
    expect(hasEnforcedDisciplineBlock(canonical.settings, [cooldownFlag])).toBe(
      false,
    );

    gate.resolve(true);
    await expect(saving).resolves.toMatchObject({ status: "acknowledged" });
    expect(hasEnforcedDisciplineBlock(canonical.settings, [cooldownFlag])).toBe(
      true,
    );
  });

  it("keeps a failed save local-only and leaves canonical enforcement default-off", async () => {
    let local = initialWorkspace();
    const canonical = initialWorkspace();
    const result = await persistDisciplineGuardWithAcknowledgement({
      workspace: local,
      change: { setting: "enforceCooldown", enabled: true },
      update: (recipe) => {
        local = recipe(local);
      },
      saveCloud: vi.fn().mockResolvedValue(false),
    });

    expect(result.status).toBe("local-only");
    expect(local.settings.enforceCooldown).toBe(true);
    expect(hasEnforcedDisciplineBlock(canonical.settings, [cooldownFlag])).toBe(
      false,
    );
  });
});
