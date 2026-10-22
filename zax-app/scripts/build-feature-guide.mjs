import { readFile, writeFile } from "node:fs/promises";

const guideDate = "18 October 2026";
const guideVersion = "2.0.0";
const groups = JSON.parse(
  await readFile("lib/trading/feature-purpose-data.json", "utf8"),
);
const glossarySource = await readFile("lib/trading/glossary.ts", "utf8");
const glossaryMatch = glossarySource.match(
  /export const GLOSSARY[^=]*=\s*(\[[\s\S]*?\])\s+as const;/,
);
if (!glossaryMatch) throw new Error("Could not read GLOSSARY from glossary.ts");
// glossary.ts deliberately remains TypeScript-friendly and uses trailing commas.
const glossary = JSON.parse(
  glossaryMatch[1]
    .replace(/([,{]\s*)([A-Za-z_$][\w$]*)\s*:/g, '$1"$2":')
    .replace(/,\s*([}\]])/g, "$1"),
);

const statusLabels = new Set([
  "Operational",
  "Data required",
  "Deployment required",
  "Qualification required",
  "Device test required",
]);
const featureCount = groups.reduce(
  (count, group) => count + group.features.length,
  0,
);
if (!groups.length || !featureCount)
  throw new Error("Guide data has no groups or features");
if (groups.some((group) => !group.id || !group.name || !group.guide_note))
  throw new Error("Every guide group needs an id, name, and guide_note");
if (
  groups.some((group) =>
    group.features.some(
      (feature) =>
        ![
          "name",
          "purpose",
          "location",
          "how_to_use",
          "output",
          "next_action",
          "status",
          "limits",
        ].every((field) => String(feature[field] ?? "").trim()) ||
        !statusLabels.has(feature.status),
    ),
  )
)
  throw new Error(
    "Every guide feature needs complete fields and a recognized status",
  );

const safe = (value) =>
  String(value)
    .replace(/\|/g, "\\|")
    .replace(/\n/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
const pad = (value) => String(value).padStart(2, "0");
const anchor = (id) => `<a id="${id}"></a>`;

const canonicalize = (value) =>
  value
    .replaceAll("Quant model studio", "Quant Lab")
    .replaceAll("quantitative workbench", "Quant Lab")
    .replaceAll("AI conditional forecast scenario", "AI scenario")
    .replaceAll("Paper ticket", "Paper lifecycle");

const usedGlossaryIds = new Set();
const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const linkFirstGlossaryUse = (value) => {
  let result = canonicalize(value);
  for (const entry of [...glossary].sort(
    (a, b) => b.term.length - a.term.length,
  )) {
    if (usedGlossaryIds.has(entry.id)) continue;
    const expression = new RegExp(`\\b(${escapeRegExp(entry.term)})\\b`, "i");
    if (!expression.test(result)) continue;
    result = result.replace(
      expression,
      `[${entry.term}](#glossary-${entry.id})`,
    );
    usedGlossaryIds.add(entry.id);
  }
  return result;
};
const tagsFor = (group, feature) => {
  const tags = [];
  if (["paper", "journal"].includes(group.id)) tags.push("[P]");
  if (group.id === "forecast") tags.push("[S]");
  if (feature.status === "Data required") tags.push("[D]");
  if (feature.status === "Qualification required") tags.push("[Q]");
  return tags.join(" ");
};
const sourceState = (feature) =>
  feature.name === "Macro release/vintage and rate-differential model"
    ? "Not exposed"
    : "Documented in source";

let doc = `# Zax feature guide

> **Version:** ${guideVersion}
>
> **Reviewed:** ${guideDate}
>
> **Supersedes:** the undated StratDesk / Foundry feature-purpose guide
> **Generated from:** \`lib/trading/feature-purpose-data.json\` by \`scripts/build-feature-guide.mjs\`

Zax is an **owner-only learning, analysis and paper-practice workspace**. Its useful sequence is: **observe a sourced market, select rules, check confluence, act on paper, review your process**. Nothing here places brokerage orders. [Manus](#glossary-manus) is the workspace host and sign-in service used by the app; it is not a broker.

## How to use this guide

1. Start with a module in the generated index, then open its numbered feature entry.
2. Read **Where / how**, **You get**, and **Next action** in that order.
3. Keep the stated source, timestamp, source version, and current status together when comparing results.
4. Use the glossary for the compact terms that appear in chart, research, and paper-practice language.

The guide describes the current capability. A documented source control, a data response, a deployed delivery path, statistical qualification, and a physical-device check are different kinds of evidence.

## Status legend — ${guideDate}

| Status | Current meaning |
|---|---|
| **Operational** | A documented current service check exists for this specific capability. It is not a device or statistical-validation claim. |
| **Data required** | The capability needs current source, entitlement, owner record, or input data; absent data is shown as a boundary, not a result. |
| **Deployment required** | The documented delivery path needs deployed native/server configuration or a physical delivery check. |
| **Qualification required** | A research or decision output exists, but its edge, calibration, or predictive usefulness has not been qualified. |
| **Device test required** | The documented source path has no physical-device verification recorded in this guide. |

**Guide tags.** **[P]** Paper scope: records and simulations do not submit brokerage orders. **[Q]** Qualification: a calculated result is not a validated edge or predictive probability. **[S]** Scenario: a conditional scenario is not a forecast. **[D]** Data state: insufficient or unavailable input is not a hidden signal.

## Module index

| No. | Module | Features |
|---:|---|---:|
${groups
  .map(
    (group, index) =>
      `| ${pad(index + 1)} | [${safe(canonicalize(group.name))}](#module-${group.id}) | ${group.features.length} |`,
  )
  .join("\n")}

## Reviewed source references

| ID | Full name | Current guide surfaces |
|---|---|---|
| order-block-retest | Order Block Retest | Strategies source-reference catalog; chart setup analysis and overlays; applicable paper/alert context |
| stdv-vwap-reentry | STDV · VWAP Re-entry | Strategies source-reference catalog; chart layers; Quant Lab terminology |
| core-sequence | Core Sequence | Strategies source-reference catalog; closed-bar setup analysis; chart context |
| sma-crossover | SMA Crossover | Strategies source-reference catalog; chart indicators |
| macd-momentum | MACD Momentum | Strategies source-reference catalog; chart indicators |
| trend-following | Trend Following | Strategies source-reference catalog; chart indicators; Quant Lab context |
| breakout-momentum | Breakout Momentum | Strategies source-reference catalog; chart indicators |
| mean-reversion | Mean Reversion | Strategies source-reference catalog; chart indicators |
| orb-strategy | ORB Strategy | Uploaded-video source card; exact opening-range chart levels; owner-approved confluence; optional foreground automatic paper |
| london-breakout-reference | London Breakout | Exact Asian-range source;15m primary; source paper and setup alerts |
| initial-balance-reference | Initial Balance | Exact09:30–10:30source;15m/real derived30m; known venue-volume confirmation |
| pdc-continuation-reference | Red-to-Green / Green-to-Red | Explicit PDC/tick/target; observed-quote cross;1m/5m venue-volume evidence |

## Glossary

${glossary
  .map(
    (entry) =>
      `${anchor(`glossary-${entry.id}`)}\n**${entry.term}.** ${entry.definition}`,
  )
  .join("\n\n")}

## Feature inventory

`;

for (const [groupIndex, group] of groups.entries()) {
  const groupNumber = pad(groupIndex + 1);
  doc += `${anchor(`module-${group.id}`)}\n## ${groupNumber}. ${safe(canonicalize(group.name))}\n\n**Use this module:** ${safe(canonicalize(group.guide_note))}\n\n| No. | Feature | Purpose |\n|---:|---|---|\n${group.features
    .map(
      (feature, featureIndex) =>
        `| ${groupNumber}.${pad(featureIndex + 1)} | ${safe(canonicalize(feature.name))} | ${safe(linkFirstGlossaryUse(feature.purpose))} |`,
    )
    .join("\n")}\n\n`;
  for (const [featureIndex, feature] of group.features.entries()) {
    const number = `${groupNumber}.${pad(featureIndex + 1)}`;
    const tags = tagsFor(group, feature);
    doc += `### ${number}. ${safe(canonicalize(feature.name))}\n\n**Where / how:** ${safe(linkFirstGlossaryUse(feature.location))}. ${safe(linkFirstGlossaryUse(feature.how_to_use))}\n\n**You get:** ${safe(linkFirstGlossaryUse(feature.output))}\n\n**Next action:** ${safe(linkFirstGlossaryUse(feature.next_action))}\n\n**Limits / prerequisites:** ${safe(linkFirstGlossaryUse(feature.limits))}${tags ? ` ${tags}` : ""}\n\n`;
  }
}

doc += `## Evidence-status index

This is the single evidence-status table for the inventory. “Documented in source” identifies the audited source description only; it does not assert a passing test, live entitlement, deployment, or device result.

| Feature | Current status | Implemented in source | Unit fixture | Device-verified | Date |
|---|---|---|---|---|---|
${groups
  .flatMap((group, groupIndex) =>
    group.features.map(
      (feature, featureIndex) =>
        `| ${pad(groupIndex + 1)}.${pad(featureIndex + 1)} ${safe(canonicalize(feature.name))} | ${feature.status} | ${sourceState(feature)} | Not asserted per feature | Not recorded | ${guideDate} |`,
    ),
  )
  .join("\n")}

## Changelog

- **${guideVersion} — ${guideDate}:** renamed the visible guide for Zax; generated the module index from all ${groups.length} groups; added stable module anchors, numbered headings, glossary, source-reference index, current-state status legend, and the consolidated evidence-status index.
- **Current wording:** uses **Recent analogue scenario** for the documented 3,000-bar window and describes the active local Coach conversation without claiming a separate prompt-history library.

This guide is source-generated documentation for an owner-only paper-practice workspace. It does not modify retained raw research or user files.
`;

await writeFile("FEATURE_PURPOSE_GUIDE.md", doc);
console.log(
  `Wrote FEATURE_PURPOSE_GUIDE.md: ${groups.length} groups, ${featureCount} features, ${doc.length} characters.`,
);
