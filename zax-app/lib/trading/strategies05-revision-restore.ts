import type { Strategy } from "./model";

type StrategyRevision = NonNullable<Strategy["history"]>[number];

function cloneOptional<T>(value: T | undefined): T | undefined {
  return value === undefined
    ? undefined
    : (JSON.parse(JSON.stringify(value)) as T);
}

/**
 * Applies a historical source snapshot as the contents of a new revision.
 * Version increment/history recording belongs to the caller so existing strategy
 * adoption authority remains unchanged.
 */
export function restoreStrategyRevision(
  current: Strategy,
  revision: StrategyRevision,
): Strategy {
  return {
    ...current,
    name: revision.name,
    description: revision.description,
    factors: revision.factors.map((factor) => ({ ...factor })),
    orbConfig: cloneOptional(revision.orbConfig),
    sessionConfig: cloneOptional(revision.sessionConfig),
    // Every rollback changes source rules/configuration and therefore requires a
    // fresh version-matched approval instead of displaying stale confluence.
    confluence: undefined,
  };
}
