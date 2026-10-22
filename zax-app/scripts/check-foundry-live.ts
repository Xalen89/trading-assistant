import { mkdir, writeFile } from "node:fs/promises";
import { quantHistory } from "../server/trading/quant-data";
import { venueDepth, closeVenueStreams } from "../server/trading/venue-depth";
import { runPairs } from "../lib/trading/quant-pairs";
import { runMomentum } from "../lib/trading/quant-momentum";
import { runMacroTrend } from "../lib/trading/quant-macro";
import { runML } from "../lib/trading/quant-ml";
import { runMarketMaking } from "../lib/trading/quant-making";
import { DEFAULT_QUANT_SETTINGS } from "../lib/trading/quant-lab-types";
import { listLLMModels, invokeLLM } from "../server/_core/llm";
async function main() {
  const report: Record<string, unknown> = {
    purpose:
      "Read-only connectivity/model checks on actual public exchange data; not a validation or performance claim",
    at: new Date().toISOString(),
  };
  try {
    const series = await Promise.all(
      ["BTC-USD", "ETH-USD"].map((id) =>
        quantHistory(id, "1d", {} as never, 400),
      ),
    );
    report.sources = series.map((s) => ({
      symbol: s.symbol,
      source: s.source,
      bars: s.candles.length,
      lastClosedAt: s.candles.at(-1)?.time,
      provenance: s.provenance,
    }));
    const input = {
      series,
      settings: { ...DEFAULT_QUANT_SETTINGS, feeBps: 10, slippageBps: 5 },
      now: Date.now(),
    };
    report.costs =
      "10bps fee +5bps slippage solely explicit diagnostic assumptions, not venue fees or saved user settings";
    report.models = [
      runPairs({ ...input, family: "pairs" }),
      runMomentum({ ...input, family: "momentum" }),
      runMacroTrend({ ...input, family: "macro" }),
      runML({ ...input, family: "ml" }),
    ].map((r) => ({
      family: r.family,
      status: r.status,
      title: r.title,
      summary: r.summary,
      metrics: r.metrics,
      validation: r.validation,
    }));
    try {
      const book = await venueDepth("BTC-USD");
      const maker = runMarketMaking({
        ...input,
        family: "making",
        now: Date.now(),
        book,
      });
      report.depth = {
        source: book.source,
        status: book.status,
        receivedAt: book.receivedAt,
        topBid: book.bids[0],
        topAsk: book.asks[0],
        tick: book.tickSize,
        lot: book.lotSize,
      };
      report.marketMaking = {
        status: maker.status,
        summary: maker.summary,
        metrics: maker.metrics,
      };
    } catch (e) {
      report.depthFailure =
        e instanceof Error ? e.message : "Actual depth unavailable";
    }
    const catalog = await listLLMModels({
        signal: AbortSignal.timeout(8000),
        maxRetries: 0,
      }),
      model =
        catalog.data.find((m) => m.id === "gpt-5-mini")?.id ||
        catalog.data[0]?.id;
    if (!model) throw new Error("No live catalog model.");
    const prompt = {
      messages: [
        {
          role: "system" as const,
          content:
            "You are a trading education coach. Treat supplied numerical research as unconfirmed. Never claim a calibrated win probability or brokerage execution. Be practical about risk and loss-chasing.",
        },
        {
          role: "user" as const,
          content:
            "Explain a confluence gate, avoiding revenge trading, and why these actual public-data diagnostic models do not establish edge. Keep to 150 words. Facts: " +
            JSON.stringify({ sources: report.sources, models: report.models }),
        },
      ],
    };
    const reply = await invokeLLM({
      model,
      messages: prompt.messages,
      ...(model.startsWith("gpt-")
        ? { max_completion_tokens: 1800 }
        : { max_tokens: 6000 }),
      reasoning: model.startsWith("gpt-") ? { effort: "minimal" } : undefined,
      signal: AbortSignal.timeout(45000),
      maxRetries: 0,
    });
    const answer = reply.choices[0]?.message.content;
    if (typeof answer !== "string" || !answer.trim())
      throw new Error("Real AI returned empty content.");
    report.ai = { model, answer, usage: reply.usage };
  } catch (e) {
    report.failure = e instanceof Error ? e.message : "Smoke test failed";
    process.exitCode = 1;
  } finally {
    closeVenueStreams();
    await mkdir("artifacts", { recursive: true });
    await writeFile(
      "artifacts/foundry-live-check.json",
      JSON.stringify(report, null, 2) + "\n",
    );
    console.log(
      JSON.stringify(
        {
          report: "artifacts/foundry-live-check.json",
          failure: report.failure || null,
          sources: report.sources,
          depth: report.depth,
          aiAvailable: Boolean(report.ai),
        },
        null,
        2,
      ),
    );
  }
}
void main();
