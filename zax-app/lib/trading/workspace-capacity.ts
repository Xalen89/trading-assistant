import type { Pattern, Strategy, Workspace } from "./model";

/**
 * Capacity is deliberately split by lifecycle. Retired strategies must not
 * consume the working-strategy budget, and source-library records are a
 * separate pool from both.
 */
export const WORKSPACE_CAPACITY_LIMITS = {
  activeStrategies: 100,
  archivedStrategies: 500,
  sourceLibrary: 500,
  alertRules: 100,
} as const;

export type CapacityPool = keyof typeof WORKSPACE_CAPACITY_LIMITS;

export type CapacityMeter = {
  key: CapacityPool;
  label: string;
  used: number;
  limit: number;
  remaining: number;
  percent: number;
  detail: string;
};

export type WorkspaceCapacity = {
  activeStrategies: CapacityMeter;
  archivedStrategies: CapacityMeter;
  sourceLibrary: CapacityMeter;
  alertRules: CapacityMeter;
  totalStrategies: number;
  sourceScreenshots: number;
};

export class WorkspaceCapacityError extends Error {
  readonly pool: CapacityPool;

  constructor(pool: CapacityPool, message?: string) {
    super(
      message ??
        `${pool} has reached its capacity of ${WORKSPACE_CAPACITY_LIMITS[pool]}.`,
    );
    this.name = "WorkspaceCapacityError";
    this.pool = pool;
  }
}

function meter(
  key: CapacityPool,
  label: string,
  used: number,
  detail: string,
): CapacityMeter {
  const limit = WORKSPACE_CAPACITY_LIMITS[key];
  const safeUsed = Math.max(0, Math.floor(used));
  return {
    key,
    label,
    used: safeUsed,
    limit,
    remaining: Math.max(0, limit - safeUsed),
    percent: Math.min(100, Math.round((safeUsed / limit) * 100)),
    detail,
  };
}

export function isArchivedStrategy(strategy: Pick<Strategy, "archived">) {
  return strategy.archived === true;
}

export function isSourceScreenshot(
  pattern: Pick<Pattern, "name" | "tradeReview">,
) {
  return (
    Boolean(pattern.tradeReview) || /^screenshot review\b/i.test(pattern.name)
  );
}

/** Returns local/saved counts without inferring that screenshots have a second quota. */
export function workspaceCapacity(
  workspace: Pick<Workspace, "strategies" | "patterns" | "alerts">,
): WorkspaceCapacity {
  const activeStrategies = workspace.strategies.filter(
    (strategy) => !isArchivedStrategy(strategy),
  ).length;
  const archivedStrategies = workspace.strategies.length - activeStrategies;
  const sourceScreenshots =
    workspace.patterns.filter(isSourceScreenshot).length;

  return {
    activeStrategies: meter(
      "activeStrategies",
      "Active strategies",
      activeStrategies,
      "Working strategies. Archiving frees this pool immediately.",
    ),
    archivedStrategies: meter(
      "archivedStrategies",
      "Archived strategies",
      archivedStrategies,
      "Retired strategies have their own allowance and can be explicitly hard-deleted.",
    ),
    sourceLibrary: meter(
      "sourceLibrary",
      "Source library",
      workspace.patterns.length,
      `${sourceScreenshots} screenshot${sourceScreenshots === 1 ? "" : "s"} share this 500-record library pool.`,
    ),
    alertRules: meter(
      "alertRules",
      "Alert rules",
      workspace.alerts.length,
      "Rules are separate from strategy and library capacity.",
    ),
    totalStrategies: workspace.strategies.length,
    sourceScreenshots,
  };
}

export function assertCapacityAvailable(
  workspace: Pick<Workspace, "strategies" | "patterns" | "alerts">,
  pool: CapacityPool,
) {
  const capacity = workspaceCapacity(workspace)[pool];
  if (capacity.used >= capacity.limit) {
    throw new WorkspaceCapacityError(
      pool,
      `${capacity.label} is full (${capacity.used} / ${capacity.limit}).`,
    );
  }
}

/** Call before adding a strategy. Archived candidates use only the archive pool. */
export function assertStrategyCapacity(
  workspace: Pick<Workspace, "strategies" | "patterns" | "alerts">,
  strategy: Pick<Strategy, "archived">,
) {
  assertCapacityAvailable(
    workspace,
    isArchivedStrategy(strategy) ? "archivedStrategies" : "activeStrategies",
  );
}

/**
 * Archive is a capacity transition, not a deletion. It leaves strategy history
 * and all external records intact and makes room in the active 100-record pool.
 */
export function archiveStrategyForCapacity(
  workspace: Workspace,
  strategyId: string,
): Workspace {
  const strategy = workspace.strategies.find((item) => item.id === strategyId);
  if (!strategy) throw new Error("Strategy was not found in this workspace.");
  if (strategy.archived) return workspace;
  assertCapacityAvailable(workspace, "archivedStrategies");
  return {
    ...workspace,
    strategies: workspace.strategies.map((item) =>
      item.id === strategyId ? { ...item, archived: true } : item,
    ),
  };
}

/** Restoring an archive is allowed only when the active pool has room. */
export function restoreStrategyForCapacity(
  workspace: Workspace,
  strategyId: string,
): Workspace {
  const strategy = workspace.strategies.find((item) => item.id === strategyId);
  if (!strategy) throw new Error("Strategy was not found in this workspace.");
  if (!strategy.archived) return workspace;
  assertCapacityAvailable(workspace, "activeStrategies");
  return {
    ...workspace,
    strategies: workspace.strategies.map((item) =>
      item.id === strategyId ? { ...item, archived: false } : item,
    ),
  };
}
