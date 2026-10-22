import type { AlertRule, Pattern, Strategy, Trade, Workspace } from "./model";

/** A source detached from a removed strategy remains private library metadata. */
export const DETACHED_STRATEGY_ID = "__stratdesk_detached_strategy__";

export type RemovalSource = Pick<
  Pattern,
  "id" | "name" | "strategyId" | "tradeReview" | "filename"
> & {
  /** Explicit optimistic-lock value rendered in the owner confirmation sheet. */
  sourceVersion: number;
  /** Present for screenshot evidence linked through canonical paper history. */
  linkedCanonicalTradeId?: string;
};

export type StrategyRemovalPreview = {
  strategy: Pick<Strategy, "id" | "name" | "version" | "archived">;
  confirmation: string;
  dependentAlerts: Pick<AlertRule, "id" | "name" | "strategyId" | "enabled">[];
  canonicalPaperRecords: Pick<
    Trade,
    "id" | "strategyId" | "strategyVersion" | "status" | "createdAt"
  >[];
  sourceScreenshots: RemovalSource[];
  sourceLibraryRecords: RemovalSource[];
  effects: string[];
};

export type LibraryRemovalPreview = {
  source: Pick<Pattern, "id" | "name" | "version" | "filename">;
  confirmation: string;
  matchingWorkspaceRecords: number;
  effects: string[];
};

export type VersionedSource = { id: string; version: number };

export function strategyDeleteConfirmation(strategyId: string) {
  return `DELETE ARCHIVED STRATEGY ${strategyId}`;
}

export function libraryDeleteConfirmation(sourceId: string) {
  return `DELETE LIBRARY RECORD ${sourceId}`;
}

export function tradeReferencesStrategy(
  trade: Pick<Trade, "strategyId" | "strategyIds">,
  strategyId: string,
) {
  return (
    trade.strategyId === strategyId ||
    (Array.isArray(trade.strategyIds) && trade.strategyIds.includes(strategyId))
  );
}

export function sourceReferencesStrategy(
  source: Pick<Pattern, "strategyId" | "tradeReview">,
  strategyId: string,
  dependentTradeIds: ReadonlySet<string> = new Set(),
) {
  return (
    source.strategyId === strategyId ||
    (source.tradeReview?.linkedTrade?.canonicalTradeId
      ? dependentTradeIds.has(source.tradeReview.linkedTrade.canonicalTradeId)
      : false)
  );
}

function isScreenshot(source: RemovalSource) {
  return (
    Boolean(source.tradeReview) || /^screenshot review\b/i.test(source.name)
  );
}

function sourceSummary(source: Pattern): RemovalSource {
  return {
    id: source.id,
    name: source.name,
    strategyId: source.strategyId,
    tradeReview: source.tradeReview,
    filename: source.filename,
    sourceVersion: source.version,
    linkedCanonicalTradeId:
      source.tradeReview?.linkedTrade?.canonicalTradeId ?? undefined,
  };
}

/**
 * Builds a reviewable deletion plan. Canonical paper records are supplied by
 * the server because local workspace history is not authoritative.
 */
export function previewArchivedStrategyRemoval(
  workspace: Workspace,
  strategyId: string,
  canonicalPaperRecords: readonly Trade[] = workspace.trades,
  sourceRecords: readonly Pattern[] = workspace.patterns,
): StrategyRemovalPreview {
  const strategy = workspace.strategies.find((item) => item.id === strategyId);
  if (!strategy) throw new Error("Strategy was not found in this workspace.");
  const trades = canonicalPaperRecords.filter((record) =>
    tradeReferencesStrategy(record, strategyId),
  );
  const dependentTradeIds = new Set(trades.map((trade) => trade.id));
  const sources = sourceRecords
    .filter((source) =>
      sourceReferencesStrategy(source, strategyId, dependentTradeIds),
    )
    .map(sourceSummary);

  return {
    strategy: {
      id: strategy.id,
      name: strategy.name,
      version: strategy.version,
      archived: strategy.archived,
    },
    confirmation: strategyDeleteConfirmation(strategy.id),
    dependentAlerts: workspace.alerts.filter(
      (alert) =>
        alert.strategyId === strategyId ||
        alert.combinedStrategyIds?.includes(strategyId),
    ),
    canonicalPaperRecords: trades.map((trade) => ({
      id: trade.id,
      strategyId: trade.strategyId,
      strategyVersion: trade.strategyVersion,
      status: trade.status,
      createdAt: trade.createdAt,
    })),
    sourceScreenshots: sources.filter(isScreenshot),
    sourceLibraryRecords: sources.filter((source) => !isScreenshot(source)),
    effects: [
      "Dependent alerts are removed because they cannot evaluate without this strategy.",
      "Canonical paper records remain unchanged; their entry strategy ID/version and snapshots are retained as historical facts.",
      `Dependent source metadata is relinked to ${DETACHED_STRATEGY_ID}; encrypted originals remain retained and are never rewritten or deleted by strategy removal.`,
    ],
  };
}

function assertArchivedStrategyVersion(
  workspace: Workspace,
  strategyId: string,
  expectedVersion: number,
  confirmation: string,
) {
  const strategy = workspace.strategies.find((item) => item.id === strategyId);
  if (!strategy) throw new Error("Strategy was not found in this workspace.");
  if (!strategy.archived)
    throw new Error("Only an archived strategy can be permanently removed.");
  if (strategy.version !== expectedVersion)
    throw new Error("Strategy changed elsewhere. Reopen the deletion preview.");
  if (confirmation !== strategyDeleteConfirmation(strategyId))
    throw new Error(
      "Deletion confirmation did not match the archived strategy.",
    );
  return strategy;
}

/**
 * Produces the next workspace only after version and explicit-text checks.
 * Paper trades deliberately retain their original strategy snapshots.
 */
export function prepareArchivedStrategyRemoval(
  workspace: Workspace,
  input: {
    strategyId: string;
    expectedStrategyVersion: number;
    confirmation: string;
  },
): Workspace {
  assertArchivedStrategyVersion(
    workspace,
    input.strategyId,
    input.expectedStrategyVersion,
    input.confirmation,
  );
  const nextActive = workspace.strategies.find(
    (strategy) => strategy.id !== input.strategyId && !strategy.archived,
  )?.id;
  const dependentTradeIds = new Set(
    workspace.trades
      .filter((trade) => tradeReferencesStrategy(trade, input.strategyId))
      .map((trade) => trade.id),
  );

  return {
    ...workspace,
    strategies: workspace.strategies.filter(
      (strategy) => strategy.id !== input.strategyId,
    ),
    alerts: workspace.alerts.filter(
      (alert) =>
        alert.strategyId !== input.strategyId &&
        !alert.combinedStrategyIds?.includes(input.strategyId),
    ),
    levels: workspace.levels.filter(
      (level) => level.strategyId !== input.strategyId,
    ),
    matches: workspace.matches.filter(
      (match) => match.strategyId !== input.strategyId,
    ),
    patterns: workspace.patterns.map((pattern) =>
      sourceReferencesStrategy(pattern, input.strategyId, dependentTradeIds)
        ? { ...pattern, strategyId: DETACHED_STRATEGY_ID }
        : pattern,
    ),
    activeStrategyId:
      workspace.activeStrategyId === input.strategyId
        ? (nextActive ?? DETACHED_STRATEGY_ID)
        : workspace.activeStrategyId,
    // Never edit workspace.trades: entry snapshots and actual history are immutable.
  };
}

export function previewLibraryRemoval(
  workspace: Workspace,
  sourceId: string,
): LibraryRemovalPreview {
  const source = workspace.patterns.find((pattern) => pattern.id === sourceId);
  if (!source)
    throw new Error("Library record was not found in this workspace.");
  return {
    source: {
      id: source.id,
      name: source.name,
      version: source.version,
      filename: source.filename,
    },
    confirmation: libraryDeleteConfirmation(source.id),
    matchingWorkspaceRecords: workspace.patterns.filter(
      (pattern) => pattern.id === source.id,
    ).length,
    effects: [
      "The library metadata record, version index, visual-search index, workspace reference, and derived matches are removed only after confirmation.",
      "The original encrypted object is deliberately retained. This action does not claim physical object-storage deletion.",
    ],
  };
}

export function prepareLibraryRemoval(
  workspace: Workspace,
  input: {
    sourceId: string;
    expectedSourceVersion: number;
    confirmation: string;
  },
): Workspace {
  const source = workspace.patterns.find(
    (pattern) => pattern.id === input.sourceId,
  );
  if (!source)
    throw new Error("Library record was not found in this workspace.");
  if (source.version !== input.expectedSourceVersion)
    throw new Error(
      "Library record changed elsewhere. Reopen the deletion preview.",
    );
  if (input.confirmation !== libraryDeleteConfirmation(input.sourceId))
    throw new Error("Deletion confirmation did not match the library record.");

  return {
    ...workspace,
    patterns: workspace.patterns.filter(
      (pattern) => pattern.id !== input.sourceId,
    ),
    matches: workspace.matches.filter(
      (match) => match.patternId !== input.sourceId,
    ),
  };
}
