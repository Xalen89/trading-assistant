import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import {
  mergeCollectionReferences,
  type CollectionEntry,
  type CollectionKey,
  type CollectionSummary,
} from "../lib/trading/collection-model";
const collections: CollectionKey[] = [
  "paperswithbacktest",
  "quant-vault",
  "sgx-orderbook",
];
const summary: CollectionSummary[] = [];
const all: CollectionEntry[] = [];
for (const collection of collections) {
  const inventory = JSON.parse(
    readFileSync(`research/strategy-inventory/${collection}.json`, "utf8"),
  );
  const entries = inventory.entries as any[];
  summary.push({
    collection,
    label:
      collection === "paperswithbacktest"
        ? "PapersWithBacktest"
        : collection === "quant-vault"
          ? "The Quant Trading Vault"
          : "SGX order-book methods",
    entries: entries.length,
    coverage:
      collection === "paperswithbacktest"
        ? `${inventory.coverage.public_detail_pages_retrieved}/${inventory.coverage.individual_strategy_or_paper_detail_urls} sitemap detail pages retrieved`
        : collection === "quant-vault"
          ? `${inventory.coverage.local_strategy_document_count} unique local document blobs +${inventory.coverage.index_only_context_reference_count} index-only records; complete recursive tree`
          : "Complete tree;20unique methods/references,5classifier families; zero deployable strategies",
    limitations:
      collection === "paperswithbacktest"
        ? "Complete code/pseudocode gated. Public backtest sections are third-party claims, not StratDesk tests."
        : "Source license not established. Metadata is not proof of complete rules, authorized copying or runnable strategy.",
  });
  for (const entry of entries) {
    const url = entry.url;
    if (typeof url !== "string" || !url.startsWith("https://"))
      throw new Error("Invalid source URL");
    const identity =
      collection === "sgx-orderbook"
        ? `${url}#method=${entry.id}`
        : entry.external_detail_url ||
          (entry.git_blob_sha && `git-blob:${entry.git_blob_sha}`) ||
          url;
    const id = createHash("sha256").update(identity).digest("hex").slice(0, 32);
    all.push({
      id,
      name: entry.name,
      collection,
      category:
        collection === "paperswithbacktest"
          ? entry.public_metadata?.markets || "Paper / strategy reference"
          : entry.category || "Research reference",
      url,
      aliases: entry.external_detail_url
        ? [{ collection, url: entry.external_detail_url }]
        : [],
      identity,
      ruleStatus:
        collection === "paperswithbacktest"
          ? "gated"
          : collection === "quant-vault"
            ? "unreviewed"
            : "offline-method",
      dataStatus:
        collection === "paperswithbacktest"
          ? `Named data requirement metadata: ${(entry.public_metadata?.public_dataset_labels || []).join("; ").slice(0, 350) || "not established"}. No data downloaded.`
          : collection === "quant-vault"
            ? "Data requirements not individually verified. View source and review before adapting."
            : "Requires authorized event/top3 book snapshots, not OHLC/ticker polling. No trained model/live execution.",
      licenseStatus:
        collection === "paperswithbacktest"
          ? "Full code/data access/license not established."
          : "No retrieved license grant; no upstream source code/data imported.",
    });
  }
}
const merged = mergeCollectionReferences(all).sort((a, b) =>
  a.name.localeCompare(b.name),
);
const result = {
  schemaVersion: 1,
  sourceRecords: all.length,
  entries: merged,
  summaries: summary,
  identityDuplicates: all.length - merged.length,
  semanticDeduplicationComplete: false,
};
mkdirSync("server/trading/data", { recursive: true });
writeFileSync(
  "server/trading/data/strategy-collections.json",
  JSON.stringify(result) + "\n",
);
writeFileSync(
  "research/strategy-inventory/coverage-manifest.json",
  JSON.stringify(
    {
      schemaVersion: 1,
      sourceRecords: all.length,
      catalogRecords: merged.length,
      identityDuplicates: result.identityDuplicates,
      semanticDeduplicationComplete: false,
      summaries: summary,
    },
    null,
    2,
  ) + "\n",
);
console.log(
  JSON.stringify({
    sourceRecords: all.length,
    catalogRecords: merged.length,
    identityDuplicates: result.identityDuplicates,
    bytes: Buffer.byteLength(JSON.stringify(result)),
  }),
);
