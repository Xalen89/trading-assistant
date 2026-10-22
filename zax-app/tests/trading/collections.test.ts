import { describe, it, expect } from "vitest";
import { collectionPage } from "../../server/trading/collections";
import { appRouter } from "../../server/routers";
import { strategySchema } from "../../server/trading/validation";
import {
  collectionRulebook,
  collectionAlreadyImported,
  mergeCollectionReferences,
  type CollectionEntry,
} from "../../lib/trading/collection-model";
const entry = (
  id: string,
  identity: string,
  rules?: Record<string, unknown>,
): CollectionEntry => ({
  id,
  name: "Same display name",
  identity,
  collection: "quant-vault",
  url: "https://github.com/unit/document",
  aliases: [],
  category: "UNIT",
  ruleStatus: "unreviewed",
  licenseStatus: "UNIT",
  dataStatus: "UNIT",
  canonicalRules: rules,
});
describe("all-source research registry · not execution evidence", () => {
  it("has every discovered source record, including20distinct SGX methods", () => {
    const p = collectionPage({
      search: "",
      collection: "all",
      offset: 0,
      limit: 40,
    });
    expect(p.total).toBe(11374);
    expect(p.entries).toHaveLength(40);
    expect(p.semanticDeduplicationComplete).toBe(false);
    expect(
      collectionPage({
        search: "",
        collection: "paperswithbacktest",
        offset: 0,
        limit: 1,
      }).total,
    ).toBe(5546);
    expect(
      collectionPage({
        search: "",
        collection: "quant-vault",
        offset: 0,
        limit: 1,
      }).total,
    ).toBe(5808);
    const sgx = collectionPage({
      search: "",
      collection: "sgx-orderbook",
      offset: 0,
      limit: 40,
    });
    expect(sgx.total).toBe(20);
    expect(new Set(sgx.entries.map((e) => e.id)).size).toBe(20);
  });
  it("paginates without duplicate IDs and leaves titles searchable", () => {
    const p = collectionPage({
        search: "",
        collection: "all",
        offset: 0,
        limit: 40,
      }),
      n = collectionPage({
        search: "",
        collection: "all",
        offset: 40,
        limit: 40,
      });
    expect(new Set([...p.entries, ...n.entries].map((e) => e.id)).size).toBe(
      80,
    );
    expect(
      collectionPage({
        search: "RandomForest",
        collection: "sgx-orderbook",
        offset: 0,
        limit: 20,
      }).entries,
    ).toHaveLength(1);
  });
  it("does not merge by names or by a notebook containing different methods", () => {
    expect(
      mergeCollectionReferences([
        entry("a", "notebook#RF"),
        entry("b", "notebook#SVC"),
      ]),
    ).toHaveLength(2);
  });
  it("merges known identical parameters/rules across sources, but retains parameter variants", () => {
    const a = entry("a", "repo-one", { fast: 20, slow: 50, side: "cross" }),
      b = {
        ...entry("b", "repo-two", { slow: 50, side: "cross", fast: 20 }),
        collection: "paperswithbacktest" as const,
        url: "https://paperswithbacktest.com/strategies/unit",
      },
      c = entry("c", "repo-three", { fast: 10, slow: 50, side: "cross" });
    const result = mergeCollectionReferences([a, b, c]);
    expect(result).toHaveLength(2);
    expect(result[0].aliases).toContainEqual({
      collection: "paperswithbacktest",
      url: b.url,
    });
  });
  it("imports only an inactive unknown custom reference, never a live detector or fake training record", () => {
    const e = collectionPage({
        search: "",
        collection: "all",
        offset: 0,
        limit: 1,
      }).entries[0],
      s = collectionRulebook(e);
    expect(strategySchema.safeParse(s).success).toBe(true);
    expect(s.visible).toBe(false);
    expect(s.setupFamily).toBe("custom");
    expect(s.factors[0].weight).toBe(0);
    expect(collectionAlreadyImported(e, [{ ...s, archived: true }])).toBe(true);
  });
  it("does not expose the registry to an anonymous user", async () => {
    const caller = appRouter.createCaller({
      user: null,
      req: {} as any,
      res: {} as any,
    });
    await expect(
      caller.research.collections({
        search: "",
        collection: "all",
        offset: 0,
        limit: 20,
      }),
    ).rejects.toThrow();
  });
});
