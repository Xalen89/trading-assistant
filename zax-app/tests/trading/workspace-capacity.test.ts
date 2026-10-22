import { describe, expect, it } from "vitest";
import { initialWorkspace, type Workspace } from "../../lib/trading/model";
import {
  WORKSPACE_CAPACITY_LIMITS,
  WorkspaceCapacityError,
  archiveStrategyForCapacity,
  assertCapacityAvailable,
  restoreStrategyForCapacity,
  workspaceCapacity,
} from "../../lib/trading/workspace-capacity";

function strategy(id: string, archived = false) {
  const base = initialWorkspace().strategies[0];
  return { ...base, id, name: `Strategy ${id}`, archived };
}

describe("workspace capacity", () => {
  it("moves archived strategies into a separate 500-record allowance so active capacity is freed", () => {
    let workspace: Workspace = {
      ...initialWorkspace(),
      strategies: Array.from({ length: 100 }, (_, index) =>
        strategy(`active-${index}`),
      ),
    };
    for (const item of [...workspace.strategies])
      workspace = archiveStrategyForCapacity(workspace, item.id);

    const afterArchive = workspaceCapacity(workspace);
    expect(afterArchive.activeStrategies).toMatchObject({
      used: 0,
      limit: 100,
    });
    expect(afterArchive.archivedStrategies).toMatchObject({
      used: 100,
      limit: 500,
    });

    workspace = {
      ...workspace,
      strategies: [
        ...workspace.strategies,
        ...Array.from({ length: 100 }, (_, index) => strategy(`new-${index}`)),
      ],
    };
    expect(workspaceCapacity(workspace).activeStrategies).toMatchObject({
      used: 100,
      remaining: 0,
    });
    expect(workspaceCapacity(workspace).archivedStrategies).toMatchObject({
      used: 100,
      remaining: 400,
    });
  });

  it("enforces the archive allowance separately and protects restores when active is full", () => {
    const fullArchive = {
      ...initialWorkspace(),
      strategies: [
        strategy("working"),
        ...Array.from({ length: 500 }, (_, index) =>
          strategy(`retired-${index}`, true),
        ),
      ],
    };
    expect(() => archiveStrategyForCapacity(fullArchive, "working")).toThrow(
      WorkspaceCapacityError,
    );

    const fullActive = {
      ...initialWorkspace(),
      strategies: [
        ...Array.from({ length: 100 }, (_, index) =>
          strategy(`active-${index}`),
        ),
        strategy("retired", true),
      ],
    };
    expect(() => restoreStrategyForCapacity(fullActive, "retired")).toThrow(
      WorkspaceCapacityError,
    );
  });

  it("keeps the 500-record source library independent of strategy capacity", () => {
    const workspace = {
      ...initialWorkspace(),
      strategies: [strategy("active")],
      patterns: Array.from({ length: 500 }, (_, index) => ({
        id: `source-${index}`,
        name: `Source ${index}`,
        tags: [],
        kind: "pattern" as const,
        strategyId: "active",
        market: "BTC-USD",
        timeframe: "5m" as const,
        notes: "",
        status: "ready" as const,
        createdAt: index,
        version: 1,
        feedback: [],
      })),
    };
    const capacity = workspaceCapacity(workspace);
    expect(capacity.sourceLibrary).toMatchObject({
      used: WORKSPACE_CAPACITY_LIMITS.sourceLibrary,
      remaining: 0,
    });
    expect(capacity.activeStrategies).toMatchObject({ used: 1, remaining: 99 });
    expect(() => assertCapacityAvailable(workspace, "sourceLibrary")).toThrow(
      WorkspaceCapacityError,
    );
    expect(() =>
      assertCapacityAvailable(workspace, "activeStrategies"),
    ).not.toThrow();
  });
});
