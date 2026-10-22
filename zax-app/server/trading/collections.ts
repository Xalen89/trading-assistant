import { z } from "zod";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type {
  CollectionEntry,
  CollectionPage,
  CollectionSummary,
} from "../../lib/trading/collection-model";
type Registry = {
  entries: CollectionEntry[];
  summaries: CollectionSummary[];
  identityDuplicates: number;
};
const registry = JSON.parse(
  readFileSync(
    resolve("server/trading/data/strategy-collections.json"),
    "utf8",
  ),
) as Registry;
export const collectionQuerySchema = z.object({
  search: z.string().max(200).default(""),
  collection: z
    .enum(["all", "paperswithbacktest", "quant-vault", "sgx-orderbook"])
    .default("all"),
  offset: z.number().int().min(0).max(25000).default(0),
  limit: z.number().int().min(1).max(40).default(20),
});
export function collectionPage(
  input: z.infer<typeof collectionQuerySchema>,
): CollectionPage {
  const term = input.search.trim().normalize("NFKC").toLowerCase();
  const filtered = registry.entries.filter(
    (e) =>
      (input.collection === "all" || e.collection === input.collection) &&
      (!term ||
        `${e.name} ${e.category} ${e.collection}`
          .normalize("NFKC")
          .toLowerCase()
          .includes(term)),
  );
  return {
    entries: filtered.slice(input.offset, input.offset + input.limit),
    total: filtered.length,
    offset: input.offset,
    limit: input.limit,
    summaries: registry.summaries,
    identityDuplicates: registry.identityDuplicates,
    semanticDeduplicationComplete: false,
  };
}
