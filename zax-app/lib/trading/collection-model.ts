import type { Strategy } from "./model";
export type CollectionKey =
  | "paperswithbacktest"
  | "quant-vault"
  | "sgx-orderbook";
export type CollectionEntry = {
  id: string;
  name: string;
  collection: CollectionKey;
  category: string;
  url: string;
  aliases: { collection: CollectionKey; url: string }[];
  identity: string;
  ruleStatus: "gated" | "unreviewed" | "offline-method";
  dataStatus: string;
  licenseStatus: string;
  canonicalRules?: Record<string, unknown>;
};
export type CollectionSummary = {
  collection: CollectionKey;
  label: string;
  entries: number;
  coverage: string;
  limitations: string;
};
export type CollectionPage = {
  entries: CollectionEntry[];
  total: number;
  offset: number;
  limit: number;
  summaries: CollectionSummary[];
  identityDuplicates: number;
  semanticDeduplicationComplete: false;
};
const canonical = (v: unknown): string =>
  Array.isArray(v)
    ? JSON.stringify(v.map(canonical))
    : v !== null && typeof v === "object"
      ? JSON.stringify(
          Object.entries(v)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([k, value]) => [k, canonical(value)]),
        )
      : JSON.stringify(v);
/** Merge only actual known canonical parameter/rule representations or exact cited-source identity. Names/families are never evidence of equivalence. */
export function mergeCollectionReferences(
  entries: CollectionEntry[],
): CollectionEntry[] {
  const out: CollectionEntry[] = [],
    seen = new Map<string, CollectionEntry>();
  for (const entry of entries) {
    const key = entry.canonicalRules
      ? `rules:${canonical(entry.canonicalRules)}`
      : `reference:${entry.identity}`;
    const prior = seen.get(key);
    if (prior) {
      for (const alias of [
        ...entry.aliases,
        { collection: entry.collection, url: entry.url },
      ])
        if (
          !prior.aliases.some(
            (a) => a.collection === alias.collection && a.url === alias.url,
          )
        )
          prior.aliases.push(alias);
    } else {
      const next = { ...entry, aliases: entry.aliases.map((a) => ({ ...a })) };
      seen.set(key, next);
      out.push(next);
    }
  }
  return out;
}
export const collectionAlreadyImported = (
  entry: CollectionEntry,
  strategies: Strategy[],
) =>
  strategies.some(
    (s) =>
      s.id === `ref-${entry.id}` ||
      s.description.includes(`[collection:${entry.id}]`),
  );
export function collectionRulebook(entry: CollectionEntry): Strategy {
  return {
    id: `ref-${entry.id}`,
    name: entry.name.slice(0, 150),
    kind: "reference",
    visible: false,
    version: 1,
    color: "#94A3B8",
    setupFamily: "custom",
    source: [entry.url, ...entry.aliases.map((a) => a.url)]
      .join("\n")
      .slice(0, 10000),
    description: `[collection:${entry.id}] ${entry.name}\n${entry.category}\nReference-only: ${entry.ruleStatus}. Full rule semantics/execution and semantic duplicates are not verified. ${entry.dataStatus} ${entry.licenseStatus} This is not a trained pattern, runnable code or a supported live strategy.`,
    factors: [
      {
        id: "source-review",
        name: "Complete rules / parameters / source review required",
        description: `Reference ${entry.id}. Exact entry, stop, exit, sizing, costs and data prerequisites must be supplied/reviewed before this profile becomes a real strategy. No title-derived trigger is invented.`,
        group: "Source prerequisites",
        enabled: true,
        weight: 0,
      },
    ],
  };
}
