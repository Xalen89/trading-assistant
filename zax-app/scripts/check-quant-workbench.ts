import { mkdir, writeFile } from "node:fs/promises";
import { quantStarter } from "../lib/trading/quant-workbench-config";
import type { QuantFamily } from "../lib/trading/quant-lab-types";
import { quantRequestSchema } from "../server/trading/quant-request";
import { runQuantResearch } from "../server/trading/quant-service";
import { closeVenueStreams } from "../server/trading/venue-depth";
async function main() {
  const rows = [];
  try {
    for (const family of [
      "pairs",
      "momentum",
      "making",
      "macro",
      "ml",
    ] as QuantFamily[]) {
      const input = quantRequestSchema.parse({
        family,
        ...quantStarter(family),
      });
      console.log(`Checking production service starter: ${family}`);
      try {
        const response = await runQuantResearch(input, {} as never);
        rows.push({
          family,
          input,
          sources: response.series,
          book: response.book
            ? {
                source: response.book.source,
                status: response.book.status,
                receivedAt: response.book.receivedAt,
              }
            : undefined,
          status: response.result.status,
          summary: response.result.summary,
          metrics: response.result.metrics,
          signals: response.result.signals.length,
          validation: response.result.validation,
        });
        console.log(
          `${family}: ${response.result.status}; ${response.series.map((s) => `${s.symbol} ${s.barCount} bars`).join(", ")}; ${response.result.metrics.length} metrics`,
        );
      } catch (e) {
        rows.push({
          family,
          error: e instanceof Error ? e.message : "Service failure",
        });
        process.exitCode = 1;
        console.log(`${family}: source/service failure (see report)`);
      }
    }
  } finally {
    closeVenueStreams();
    await mkdir("artifacts", { recursive: true });
    await writeFile(
      "artifacts/quant-workbench-check.json",
      JSON.stringify(
        {
          at: new Date().toISOString(),
          scope:
            "Actual public Coinbase inputs through the same production service and parsed starter form. No owner session, DB writes, import or order. Not phone/edge proof.",
          rows,
        },
        null,
        2,
      ) + "\n",
    );
  }
}
void main();
