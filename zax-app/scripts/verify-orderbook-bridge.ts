import { writeFile } from "node:fs/promises";
import { runPython } from "../server/trading/python";
import {
  orderBookInputSchema,
  orderBookReportSchema,
} from "../server/trading/orderbook-validation";
async function main() {
  const snapshots = Array.from({ length: 5000 }, (_, i) => {
    const center = 100 + 0.02 * Math.sin(i / 120) + 0.01 * Math.sin(i / 37);
    return {
      time: 1700000000 + i,
      bids: [0, 1, 2].map((n) => ({
        price: center - 0.01 - n * 0.01,
        quantity: 10 + n + (i % 3),
      })),
      asks: [0, 1, 2].map((n) => ({
        price: center + 0.01 + n * 0.01,
        quantity: 12 + n + (i % 5),
      })),
    };
  });
  const book = orderBookInputSchema.parse({
    instrument: "UNIT SYNTHETIC BOOK · NOT PERFORMANCE EVIDENCE",
    source: "Deterministic bridge fixture only · no repository/user book data",
    rightsConfirmed: true,
    snapshots,
    spec: {
      horizonSeconds: 600,
      trainingSeconds: 1800,
      testSeconds: 10,
      maxFolds: 1,
    },
  });
  const start = Date.now(),
    raw = await runPython<unknown>("orderbook_research", book, 45000),
    report = orderBookReportSchema.parse(raw);
  if (
    report.models.length !== 6 ||
    report.probability !== null ||
    !report.models.every(
      (m) =>
        m.configuration &&
        Object.keys(m.configuration).length > 0 &&
        m.folds.every((f) => f.metricScope && f.testWindowExclusiveEnd),
    )
  )
    throw new Error("Bridge report config/probability/disclosure mismatch");
  const output = {
    verified: true,
    fixture:
      "Explicitly synthetic unit-only book, not actual-market evidence, no production/account/session/trade writes.",
    elapsedMs: Date.now() - start,
    configurations: report.models.length,
    configurationParametersRetained: true,
    nestedFoldScopesRetained: true,
    features: report.features,
    hasPurgedFolds: report.models.some((m) =>
      m.folds.some((f) => f.purgedRows > 0),
    ),
    methodDisclosuresRetained: "sampling" in report && "evaluation" in report,
    probability: report.probability,
  };
  await writeFile(
    "artifacts/orderbook-bridge-verification.json",
    JSON.stringify(output, null, 2) + "\n",
  );
  console.log(JSON.stringify(output));
}
main().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
