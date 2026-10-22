import { z } from "zod";
export const orbAutoPaperSettingsSchema = z
  .object({
    version: z.literal(1),
    enabled: z.boolean(),
    strategyId: z.string().min(1).max(100),
    market: z.union([z.enum(["NQ", "ES"]), z.string().regex(/^TL:\d{1,18}$/)]),
    riskPct: z.union([z.literal(1), z.literal(2)]),
    maxTradesPerDay: z.union([z.literal(1), z.literal(2), z.literal(3)]),
    armedAt: z.number().int().nonnegative().optional(),
    expiresAt: z.number().int().nonnegative().optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (
      value.enabled &&
      (!value.armedAt ||
        !value.expiresAt ||
        value.expiresAt <= value.armedAt ||
        value.expiresAt - value.armedAt > 86_400_000)
    )
      ctx.addIssue({
        code: "custom",
        message:
          "Automatic paper consent needs a positive expiry within24hours of arming.",
      });
  });
export type OrbAutoPaperSettings = z.infer<typeof orbAutoPaperSettingsSchema>;
export type OrbAutoPaperResult = {
  state: "off" | "blocked" | "waiting" | "busy" | "duplicate" | "placed";
  message: string;
  checkedAt: number;
  tradeId?: string;
  signalKey?: string;
};
