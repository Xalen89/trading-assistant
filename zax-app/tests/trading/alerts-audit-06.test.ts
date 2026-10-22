import { describe, expect, it } from "vitest";
import type { Trade } from "../../lib/trading/model";
import {
  aggregateDelivery,
  conditionalPendingClaim,
  newDeliveryClaim,
  withReceiptResults,
} from "../../server/trading/alert-delivery-state";
import { ownerScheduleMapping } from "../../server/trading/notifications";
import { orbLateLedgerReason } from "../../server/trading/orb-auto-paper";
import { verifiedPaperProcessing } from "../../server/trading/paper-processing";

describe("06 alerts audit regressions (pure and mocked only)", () => {
  it("allows only the conditional pending-claim winner to invoke mocked transport", async () => {
    const row = { delivery: "pending" };
    let transportCalls = 0;
    const worker = async (token: string) => {
      await Promise.resolve(); // Both workers have already selected the same pending row.
      const next = conditionalPendingClaim(row.delivery, token);
      if (!next) return false;
      row.delivery = next;
      transportCalls += 1; // Mock transport: no provider request is made.
      return true;
    };

    const winners = await Promise.all([worker("worker_a"), worker("worker_b")]);
    expect(winners.filter(Boolean)).toHaveLength(1);
    expect(transportCalls).toBe(1);
    expect(row.delivery).toMatch(/^sending:worker_[ab]$/);
  });

  it("persists every synthetic device ticket and aggregates a late invalid-device receipt conservatively", () => {
    const claim = newDeliveryClaim({
      eventId: "alert_unit",
      claimToken: "claim_unit",
      attempts: 1,
      now: 1_800_000_000_000,
    });
    expect(claim).toBeDefined();
    const sent = {
      ...claim!,
      phase: "sent" as const,
      tickets: [
        {
          deviceKey: "device_a",
          ticketId: "ticket_a",
          ticketStatus: "accepted" as const,
          receiptStatus: "pending" as const,
          updatedAt: 1_800_000_000_001,
        },
        {
          deviceKey: "device_b",
          ticketId: "ticket_b",
          ticketStatus: "accepted" as const,
          receiptStatus: "pending" as const,
          updatedAt: 1_800_000_000_001,
        },
      ],
    };
    const result = withReceiptResults({
      record: sent,
      receipts: {
        ticket_a: { status: "ok" },
        ticket_b: {
          status: "error",
          details: { error: "DeviceNotRegistered" },
        },
      },
      now: 1_800_000_000_002,
    });

    expect(result).toMatchObject({
      delivery: "provider-partial",
      invalidDeviceKeys: ["device_b"],
    });
    expect(result?.record.tickets).toHaveLength(2);
    expect(
      result?.record.tickets.map((ticket) => ticket.receiptStatus),
    ).toEqual(["ok", "error"]);
    expect(aggregateDelivery(result!.record.tickets)).toBe("provider-partial");
  });

  it("fails closed when an owner has multiple schedule mappings instead of selecting one", () => {
    expect(
      ownerScheduleMapping([{ taskUid: "task_one" }, { taskUid: "task_two" }]),
    ).toEqual({ state: "ambiguous" });
    expect(ownerScheduleMapping([{ taskUid: "task_one" }])).toMatchObject({
      state: "one",
      row: { taskUid: "task_one" },
    });
  });

  it("blocks a durable ORB claim/order after a mocked manual entry interleaves during source work", async () => {
    const now = Date.UTC(2026, 9, 19, 14, 5, 0);
    const ledger: Trade[] = [];
    await Promise.resolve().then(() => {
      ledger.push({
        id: "manual-interleaved",
        market: "NQ",
        side: "long",
        entry: 20_100,
        stop: 20_000,
        target: 20_400,
        quantity: 1,
        pointValue: 1,
        createdAt: now,
        status: "open",
        journal: {},
        events: [],
      } as unknown as Trade);
    });
    const reason = orbLateLedgerReason({
      workspace: {
        paperStartingBalance: 100_000,
        settings: {
          dailyDrawdownLimitPct: 2,
          cooldownMinutes: 20,
          maxTradesPerDay: 6,
        },
      } as any,
      ledger,
      market: "NQ",
      side: "long",
      dailyCount: 0,
      maxTradesPerDay: 1,
      now,
    });
    let durableClaimOrOrder = false;
    if (!reason) durableClaimOrOrder = true;

    expect(reason).toContain("pending or open");
    expect(durableClaimOrOrder).toBe(false);
  });

  it("shows a scheduled no-change assessment as server checked without conflating it with a mutation", () => {
    const now = 1_800_000_000_000;
    const record = {
      origin: "scheduled" as const,
      lastCompletedAt: now - 1_000,
      updatedTradeIds: ["paper-mutated"],
      checkedTradeIds: ["paper-unchanged"],
    };
    expect(
      verifiedPaperProcessing(record, "paper-unchanged", now, true),
    ).toMatchObject({
      serverChecked: true,
      serverManaged: false,
    });
    expect(
      verifiedPaperProcessing(record, "paper-mutated", now, true),
    ).toMatchObject({
      serverChecked: false,
      serverManaged: true,
    });
    expect(
      verifiedPaperProcessing(
        { ...record, checkedTradeIds: [] },
        "paper-unchanged",
        now,
        true,
      ).serverChecked,
    ).toBe(false);
  });
});
