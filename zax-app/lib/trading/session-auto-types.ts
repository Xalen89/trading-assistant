import { z } from "zod";
export const sessionAutoSettingsSchema = z.object({
  version: z.literal(1), enabled: z.boolean(), strategyId: z.string().min(1).max(160), market: z.string().min(1).max(120),
  riskPct: z.union([z.literal(1), z.literal(2)]), maxTradesPerDay: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  runWhenClosed: z.boolean(), armedAt: z.number().int().positive().optional(), expiresAt: z.number().int().positive().optional(),
}).strict();
export type SessionAutoSettings = z.infer<typeof sessionAutoSettingsSchema>;
export type SessionAutoOrigin = "foreground" | "scheduled";
export type SessionAutoResult = { state: "off" | "blocked" | "waiting" | "busy" | "duplicate" | "placed"; message: string; checkedAt: number; strategyId?: string; market?: string; tradeId?: string; signalId?: string };
export type SessionAutoStatus = SessionAutoResult & { settings?: SessionAutoSettings; strategyVersion?: number; gateConfigVersion?: number; backgroundReady?: boolean; lastScheduledAt?: number };
