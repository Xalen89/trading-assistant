import { z } from "zod";
import type {
  OrderBookInput,
  OrderBookReport,
} from "../../lib/trading/orderbook-model";
const level = z
  .object({
    price: z.number().positive().finite(),
    quantity: z.number().nonnegative().finite(),
  })
  .strict();
export const orderBookInputSchema: z.ZodType<OrderBookInput> = z
  .object({
    instrument: z.string().min(1).max(100),
    source: z.string().min(1).max(250),
    rightsConfirmed: z.literal(true),
    snapshots: z
      .array(
        z
          .object({
            time: z.number().positive().finite(),
            bids: z.array(level).length(3),
            asks: z.array(level).length(3),
          })
          .strict(),
      )
      .min(500)
      .max(12000),
    spec: z
      .object({
        horizonSeconds: z.union([z.literal(600), z.literal(900)]),
        trainingSeconds: z.literal(1800),
        testSeconds: z.literal(10),
        maxFolds: z.number().int().min(1).max(3),
      })
      .strict(),
  })
  .strict()
  .superRefine((data, ctx) => {
    if (Buffer.byteLength(JSON.stringify(data), "utf8") > 8 * 1024 * 1024)
      ctx.addIssue({ code: "custom", message: "Book input exceeds8MB." });
    for (let i = 0; i < data.snapshots.length; i++) {
      const p = data.snapshots[i];
      if (
        p.time > Date.now() / 1000 ||
        (i && p.time <= data.snapshots[i - 1].time)
      ) {
        ctx.addIssue({
          code: "custom",
          message:
            "Book timestamps must be strictly increasing real historical Unixseconds; no sorting/future repair.",
        });
        break;
      }
      if (
        p.bids[0].price >= p.asks[0].price ||
        p.bids.some((b, j) => j > 0 && b.price >= p.bids[j - 1].price) ||
        p.asks.some((a, j) => j > 0 && a.price <= p.asks[j - 1].price) ||
        p.bids.reduce((s, b) => s + b.quantity, 0) <= 0 ||
        p.asks.reduce((s, a) => s + a.quantity, 0) <= 0
      ) {
        ctx.addIssue({
          code: "custom",
          message:
            "Require uncrossed top3 book, descending bids/ascending asks and positive depth; OHLC is not orderbook.",
        });
        break;
      }
    }
  });
const metric = z.number().finite().min(0).max(1).nullable();
const confusion = z.tuple([
  z.tuple([z.number().int().nonnegative(), z.number().int().nonnegative()]),
  z.tuple([z.number().int().nonnegative(), z.number().int().nonnegative()]),
]);
export const orderBookReportSchema: z.ZodType<OrderBookReport> = z
  .object({
    kind: z.literal("orderbook-ml"),
    engine: z.string(),
    instrument: z.string(),
    source: z.string(),
    generatedAt: z.number().finite(),
    snapshots: z.number().int().nonnegative(),
    featureRows: z.number().int().nonnegative(),
    features: z.number().int().positive(),
    horizonSeconds: z.number().int().positive(),
    models: z
      .array(
        z.object({
          name: z.string(),
          status: z.enum(["complete", "skipped"]),
          reason: z.string().optional(),
          configuration: z.record(
            z.string().max(100),
            z.union([
              z.string().max(100),
              z.number().finite(),
              z.boolean(),
              z.null(),
            ]),
          ),
          metricScope: z.string().max(500).optional(),
          folds: z
            .array(
              z.object({
                trainStart: z.number().finite(),
                trainEnd: z.number().finite(),
                testStart: z.number().finite(),
                testEnd: z.number().finite(),
                trainRows: z.number().int().nonnegative(),
                testRows: z.number().int().nonnegative(),
                purgedRows: z.number().int().nonnegative(),
                accuracy: metric,
                balancedAccuracy: metric,
                precision: metric,
                recall: metric,
                baselineAccuracy: metric,
                confusion,
                testWindowExclusiveEnd: z.number().finite().optional(),
                metricScope: z.string().max(500).optional(),
                reason: z.string().max(500).optional(),
              }),
            )
            .max(3),
        }),
      )
      .max(6),
    limitations: z.array(z.string()).max(50),
    probability: z.null(),
  })
  .passthrough();
