import { retryCandles, retryQuote } from "../server/trading/market";
import { generateAIPriceForecast } from "../server/trading/forecast-service";

// One explicit development check only. Public read-only data + Efficient AI; no DB/quota/layer/order writes.
async function main() {
  const deadline = Date.now() + 48_000;
  const sourceDeadline = Math.min(deadline, Date.now() + 12_000);
  console.log(
    "Reading public BTC-USD 5m candles and quote; no owner records are used.",
  );
  const [feed, quote] = await Promise.all([
    retryCandles("BTC-USD", "5m", undefined, sourceDeadline),
    retryQuote("BTC-USD", undefined, sourceDeadline),
  ]);
  console.log(
    "Checking one Efficient managed-model scenario; no output is saved to the app.",
  );
  const forecast = await generateAIPriceForecast({
    market: "BTC-USD",
    timeframe: "5m",
    feed,
    quote,
    contextMode: "auto",
    aiQuality: "efficient",
    deadline,
    instructions:
      "State an educational conditional hypothesis using only the supplied observations and disclose uncertainty.",
  });
  console.log(
    JSON.stringify(
      {
        checkedAt: new Date().toISOString(),
        model: forecast.model,
        aiQuality: forecast.aiQuality,
        source: forecast.source,
        contextMode: forecast.contextMode,
        sourceFreshness: forecast.sourceFreshness,
        count: forecast.candles.length,
        direction: forecast.direction,
        validOHLC: forecast.candles.every(
          (c) =>
            c.low > 0 &&
            c.low <= Math.min(c.open, c.close) &&
            c.high >= Math.max(c.open, c.close),
        ),
        probability: forecast.probability,
        generationNotice: forecast.generationNotice ?? null,
        containsInternalSteps: "steps" in forecast,
        writes: "none; not saved to app workspace, library or paper ledger",
        scope:
          "Managed transport and display-shape integration only; not forecast accuracy, iPhone or Deep-tier inference proof",
      },
      null,
      2,
    ),
  );
}
main().catch((error: unknown) => {
  console.error(
    error instanceof Error ? error.message : "Read-only scenario check failed.",
  );
  process.exitCode = 1;
});
