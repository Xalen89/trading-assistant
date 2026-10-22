import { and, desc, eq } from "drizzle-orm";
import { createHash } from "node:crypto";
import {
  tradingAlertEvents,
  tradingScenarioDirections,
} from "../../drizzle/schema";
import type {
  AlertEvent,
  AlertRule,
  Quote,
  Strategy,
} from "../../lib/trading/model";
import type { SetupAnalysis } from "../../lib/trading/setup-model";
import {
  observeScenarioDirection,
  scenarioDirectionContext,
  type DirectionBaseline,
} from "../../lib/trading/scenario-direction";
import { dbRequired } from "./repository";

export function directionBaselineId(userId: number, ruleId: string): string {
  return `direction_${createHash("sha256")
    .update(JSON.stringify([userId, ruleId]))
    .digest("hex")
    .slice(0, 48)}`;
}

/** Only server scans update this row; browsing the chart cannot consume a direction change. */
export async function persistDirectionObservation(
  userId: number,
  rule: AlertRule,
  analysis: SetupAnalysis,
  strategies: Strategy[],
  quote: Quote,
  deadline?: number,
): Promise<AlertEvent | undefined> {
  const ensureBudget = () => {
    if (deadline && Date.now() >= deadline)
      throw new Error(
        "Direction observation exceeded the scan deadline; no event committed.",
      );
  };
  ensureBudget();
  const db = await dbRequired();
  const id = directionBaselineId(userId, rule.id);
  return db.transaction(async (tx) => {
    ensureBudget();
    // Upsert obtains a row lock even when two runtime instances first observe a rule together.
    await tx
      .insert(tradingScenarioDirections)
      .values({
        id,
        userId,
        ruleId: rule.id,
        payload: {
          context: "unobserved",
          lastAsOf: 0,
          sequence: 0,
        } satisfies DirectionBaseline,
      })
      .onDuplicateKeyUpdate({ set: { id } });
    const rows = await tx
      .select()
      .from(tradingScenarioDirections)
      .where(
        and(
          eq(tradingScenarioDirections.id, id),
          eq(tradingScenarioDirections.userId, userId),
        ),
      )
      .for("update");
    ensureBudget();
    const prior = rows[0]?.payload as DirectionBaseline | undefined;
    const observed = observeScenarioDirection(prior, {
      context: scenarioDirectionContext(analysis, strategies),
      asOf: analysis.asOf,
      scenario: analysis.scenario,
    });
    const now = Date.now();
    if (observed.change) {
      const latest = await tx
        .select()
        .from(tradingAlertEvents)
        .where(
          and(
            eq(tradingAlertEvents.userId, userId),
            eq(tradingAlertEvents.ruleId, rule.id),
          ),
        )
        .orderBy(desc(tradingAlertEvents.createdAt))
        .limit(1);
      ensureBudget();
      if (
        latest[0] &&
        now - latest[0].createdAt.getTime() < rule.cooldownMinutes * 60000
      ) {
        // Keep the previous direction. After cooldown, a still-reversed path can notify;
        // reversals that returned to the original direction are intentionally coalesced.
        return undefined;
      }
    }
    let event: AlertEvent | undefined;
    if (observed.change && analysis.scenario) {
      const change = observed.change,
        scenario = analysis.scenario;
      const strategy = strategies.find((s) => s.id === rule.strategyId);
      event = {
        id: `direction-alert_${createHash("sha256")
          .update(
            JSON.stringify([
              userId,
              rule.id,
              change.context,
              change.sequence,
              change.asOf,
            ]),
          )
          .digest("hex")
          .slice(0, 48)}`,
        ruleId: rule.id,
        market: rule.market,
        timeframe: rule.timeframe,
        strategyId: rule.strategyId,
        strategyVersion: strategy?.version,
        price: quote.price,
        source: analysis.source,
        providerTimestamp:
          quote.timestampKind === "received" ? undefined : quote.timestamp,
        createdAt: now,
        read: false,
        delivery: "pending",
        title: `${rule.name} · ${change.previous.toUpperCase()} → ${change.current.toUpperCase()}`,
        body: `${rule.market} ${rule.timeframe}: historical-source scenario direction changed. Tap for the captured line/ghost source. Scenario replay, not a price prediction or trade order.`,
        evidence: [
          `Direction ${change.previous} → ${change.current}: final drawn close versus anchor ${scenario.anchorPrice}; 1bp flat deadband. Setup long/short labels are not used.`,
          `Replay basis: ${scenario.basis || "legacy strategy-matched"}; ${scenario.source}.`,
          `Historical source ${new Date(scenario.sourceAt * 1000).toISOString()} → ${scenario.sourceEndAt ? new Date(scenario.sourceEndAt * 1000).toISOString() : "last actual returned source bar"}; ${scenario.candles.length} bars.`,
          `Current anchor ${new Date(scenario.anchorAt * 1000).toISOString()}; selected versions ${scenario.strategyIds.map((s, i) => `${s} v${scenario.strategyVersions[i]}`).join(", ")}.`,
          "First observation is a baseline. Cooldown coalesces reversals; flat/unavailable data do not fabricate a flip. Native delivery requires deployed scans and registered device credentials.",
        ],
        setup: { ...analysis, candles: analysis.candles.slice(-80) },
      };
      ensureBudget();
      await tx
        .insert(tradingAlertEvents)
        .values({ id: event.id, userId, ruleId: rule.id, payload: event });
    }
    ensureBudget();
    await tx
      .update(tradingScenarioDirections)
      .set({ payload: observed.state })
      .where(
        and(
          eq(tradingScenarioDirections.id, id),
          eq(tradingScenarioDirections.userId, userId),
        ),
      );
    ensureBudget();
    return event;
  });
}
