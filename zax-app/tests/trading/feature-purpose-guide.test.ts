import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import groups from "../../lib/trading/feature-purpose-data.json";
import { GLOSSARY } from "../../lib/trading/glossary";

const guide = readFileSync("FEATURE_PURPOSE_GUIDE.md", "utf8");
const allowedStatuses = new Set([
  "Operational",
  "Data required",
  "Deployment required",
  "Qualification required",
  "Device test required",
]);

describe("Feature guide — current-state documentation, not trading evidence", () => {
  it("covers every app area and all five quant families", () => {
    for (const id of [
      "chart",
      "markets",
      "strategies",
      "library",
      "screenshots",
      "historical",
      "forecast",
      "coach",
      "paper",
      "journal",
      "discipline",
      "alerts",
      "pairs",
      "momentum",
      "making",
      "macro",
      "ml",
      "private-workspace-tools",
    ])
      expect(groups.some((g) => g.id === id && g.features.length > 0)).toBe(
        true,
      );
    expect(groups).toHaveLength(18);
    expect(groups.flatMap((group) => group.features)).toHaveLength(156);
    for (const name of [
      "London Breakout AI-assisted source",
      "Initial Balance AI-assisted source",
      "Red-to-Green / Green-to-Red AI-assisted source",
      "Optional automatic session paper entries",
      "Published session monitoring and setup alerts",
    ])
      expect(
        groups
          .flatMap((group) => group.features)
          .some((feature) => feature.name === name),
      ).toBe(true);
    expect(
      groups
        .find((group) => group.id === "strategies")
        ?.features.some(
          (feature) => feature.name === "ORB Strategy from uploaded video",
        ),
    ).toBe(true);
    expect(
      groups
        .find((group) => group.id === "paper")
        ?.features.some(
          (feature) =>
            feature.name === "Optional automatic ORB paper entries" &&
            feature.status === "Data required",
        ),
    ).toBe(true);
  });

  it("gives every retained control complete detail, a module instruction, and one recognized status", () => {
    for (const group of groups) {
      expect(group.guide_note.trim().length, group.id).toBeGreaterThan(20);
      expect(new Set(group.features.map((feature) => feature.name)).size).toBe(
        group.features.length,
      );
      for (const feature of group.features) {
        for (const key of [
          "name",
          "purpose",
          "location",
          "how_to_use",
          "output",
          "next_action",
          "status",
          "limits",
        ] as const)
          expect(
            feature[key].trim().length,
            `${group.id}:${feature.name}:${key}`,
          ).toBeGreaterThan(key === "location" ? 0 : 5);
        expect(allowedStatuses.has(feature.status), feature.name).toBe(true);
      }
    }
  });

  it("keeps the unavailable macro-vintage capability unavailable rather than rebranding price trend", () => {
    const macro = groups
      .find((group) => group.id === "macro")!
      .features.find(
        (feature) =>
          feature.name === "Macro release/vintage and rate-differential model",
      )!;
    expect(macro.status).toBe("Data required");
    expect(`${macro.how_to_use} ${macro.output}`).toMatch(
      /no .*model|no .*result/i,
    );
  });

  it("keeps venue quote targets separate from queue fills or orders", () => {
    const text = groups
      .find((group) => group.id === "making")!
      .features.map((feature) => `${feature.limits} ${feature.next_action}`)
      .join(" ");
    expect(text).toMatch(/queue/);
    expect(text).toMatch(/no.*order|not.*order/i);
  });

  it("provides a reusable, group-mapped glossary without duplicating terms", () => {
    expect(GLOSSARY.length).toBeGreaterThanOrEqual(25);
    expect(new Set(GLOSSARY.map((entry) => entry.id)).size).toBe(
      GLOSSARY.length,
    );
    for (const entry of GLOSSARY) {
      expect(entry.definition.length).toBeGreaterThan(20);
      expect(entry.groupIds.length).toBeGreaterThan(0);
      for (const groupId of entry.groupIds)
        expect(groups.some((group) => group.id === groupId)).toBe(true);
    }
  });

  it("generates the dated, numbered guide with stable module anchors and retained boundaries", () => {
    expect(guide).toContain("# Zax feature guide");
    expect(guide).toContain("## Status legend — 18 October 2026");
    expect(guide).toContain("Recent analogue scenario");
    expect(guide).toContain("active local Coach conversation");
    expect(guide).toContain("owner-only learning, analysis and paper-practice");
    expect(guide).toMatch(/source version/i);
    expect(guide).toMatch(/100-record|100 cases/i);
    expect(guide.match(/^### \d{2}\.\d{2}\. /gm)).toHaveLength(156);
    for (const group of groups)
      expect(guide).toContain(`<a id="module-${group.id}"></a>`);
    for (const status of allowedStatuses)
      expect(guide).toContain(`**${status}**`);
  });

  it("keeps every generated Markdown table rectangular", () => {
    const lines = guide.split("\n");
    const cellCount = (line: string) => line.split("|").length - 2;
    for (let index = 0; index < lines.length - 1; index += 1) {
      if (
        !lines[index].startsWith("|") ||
        !/^\|[-:|]+\|$/.test(lines[index + 1])
      )
        continue;
      const expected = cellCount(lines[index]);
      index += 2;
      while (lines[index]?.startsWith("|")) {
        expect(cellCount(lines[index]), lines[index]).toBe(expected);
        index += 1;
      }
    }
  });
});
