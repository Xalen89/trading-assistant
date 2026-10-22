import { writeFileSync, mkdirSync } from "node:fs";
import { getCandles, getQuote } from "../server/trading/market";
import { generateAIPriceForecast } from "../server/trading/forecast-service";
async function main() {
  const [feed, quote] = await Promise.all([
    getCandles("BTC-USD", "5m"),
    getQuote("BTC-USD"),
  ]);
  const scenario = await generateAIPriceForecast({
    market: "BTC-USD",
    timeframe: "5m",
    feed,
    quote,
    instructions:
      "Explain a conditional continuation versus reversal scenario using only these actual source bars.",
  });
  mkdirSync("artifacts", { recursive: true });
  writeFileSync(
    "artifacts/ai-forecast-live.json",
    JSON.stringify(
      {
        checkedAt: new Date().toISOString(),
        scenario,
        note: "Public Coinbase source + actual managed AI. Display-only hypothetical path. No owner workspace, private source, order or database write used.",
      },
      null,
      2,
    ),
  );
  console.log(
    JSON.stringify({
      model: scenario.model,
      kind: scenario.kind,
      direction: scenario.direction,
      bars: scenario.candles.length,
      source: scenario.source,
      probability: scenario.probability,
      sourceAsOf: scenario.sourceLastClosedAt,
    }),
  );
}
main().catch((e) => {
  console.error(e instanceof Error ? e.message : "Forecast smoke failed");
  process.exitCode = 1;
});
