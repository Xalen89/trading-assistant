import { describe, expect, it } from "vitest";
import { initialWorkspace } from "../../lib/trading/model";
import {
  PORTABLE_IMPORT_CONFIRMATION,
  applyPortableImport,
  createPortableExport,
  parseStoredZip,
  previewPortableImport,
} from "../../lib/trading/workspace-portability";

function workspaceWithHistory() {
  const base = initialWorkspace();
  return {
    ...base,
    patterns: [
      {
        id: "private-source",
        name: "Private source",
        tags: [],
        kind: "pattern" as const,
        strategyId: base.strategies[0].id,
        market: "BTC-USD",
        timeframe: "5m" as const,
        notes: "metadata only",
        filename: "source.png",
        mime: "image/png",
        fileKey: "private-sources/owner/source.enc",
        imageUri: "internal://private-preview",
        status: "ready" as const,
        createdAt: 1,
        version: 1,
        feedback: [],
      },
    ],
    trades: [
      {
        id: "closed-trade",
        market: "BTC-USD",
        side: "long" as const,
        status: "closed" as const,
        entry: 100,
        stop: 90,
        target: 120,
        quantity: 1,
        pointValue: 1,
        strategyId: base.strategies[0].id,
        strategyName: base.strategies[0].name,
        strategyVersion: base.strategies[0].version,
        factors: [],
        journal: { review: "closed" },
        createdAt: 1,
        closedAt: 2,
      },
      {
        id: "pending-trade",
        market: "BTC-USD",
        side: "long" as const,
        status: "pending" as const,
        entry: 100,
        stop: 90,
        target: 120,
        quantity: 1,
        pointValue: 1,
        strategyId: base.strategies[0].id,
        strategyName: base.strategies[0].name,
        strategyVersion: base.strategies[0].version,
        factors: [],
        journal: { review: "must not import as order" },
        createdAt: 3,
      },
    ],
  };
}

describe("workspace portability", () => {
  it("creates a real readable ZIP with CSV/JSON and removes private storage paths", () => {
    const artifact = createPortableExport(
      workspaceWithHistory(),
      Date.UTC(2026, 0, 2),
    );
    expect(artifact.filename).toBe("stratdesk-export-2026-01-02.zip");
    expect(Array.from(artifact.bytes.slice(0, 4))).toEqual([80, 75, 3, 4]);
    const files = parseStoredZip(artifact.bytes);
    expect([...files.keys()]).toEqual(
      expect.arrayContaining([
        "trades.csv",
        "events.csv",
        "strategies.json",
        "rules.json",
        "journal.json",
        "workspace.json",
        "library-metadata.json",
      ]),
    );
    const allText = new TextDecoder().decode(artifact.bytes);
    expect(allText).not.toContain("private-sources/owner/source.enc");
    expect(allText).not.toContain("internal://private-preview");
    expect(new TextDecoder().decode(files.get("trades.csv")!)).toContain(
      "closed-trade",
    );
  });

  it("stages only closed trade history, disables imported alerts, and requires import confirmation", () => {
    const artifact = createPortableExport(workspaceWithHistory());
    const preview = previewPortableImport(artifact.bytes);
    expect(preview.closedTrades.map((trade) => trade.id)).toEqual([
      "closed-trade",
    ]);
    expect(preview.skippedOpenOrPendingTrades).toBe(1);
    expect(preview.alerts.every((alert) => !alert.enabled)).toBe(true);
    const original = initialWorkspace();
    expect(() => applyPortableImport(original, preview, "import now")).toThrow(
      "confirmation",
    );
    const merged = applyPortableImport(
      original,
      preview,
      PORTABLE_IMPORT_CONFIRMATION,
    );
    expect(merged.trades.map((trade) => trade.id)).toEqual(["closed-trade"]);
    expect(merged.trades.some((trade) => trade.status !== "closed")).toBe(
      false,
    );
  });

  it("rejects compressed ZIP entries rather than inflating arbitrary input", () => {
    const artifact = createPortableExport(workspaceWithHistory());
    const malformed = artifact.bytes.slice();
    for (let offset = 0; offset < malformed.length - 4; offset += 1) {
      if (
        malformed[offset] === 80 &&
        malformed[offset + 1] === 75 &&
        malformed[offset + 2] === 1 &&
        malformed[offset + 3] === 2
      ) {
        malformed[offset + 10] = 8;
        break;
      }
    }
    expect(() => parseStoredZip(malformed)).toThrow("uncompressed");
  });
});
