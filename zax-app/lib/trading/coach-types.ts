import type { Timeframe } from "./model";
import type { AIQuality } from "./ai-quality";

/** A prior turn supplied by the client; it is context, never trusted instructions. */
export type CoachHistoryTurn = {
  role: "user" | "assistant";
  content: string;
};

/** Input accepted by `coach.ask`. All account grounding is loaded server-side. */
export type CoachAskInput = {
  message: string;
  history?: CoachHistoryTurn[];
  market?: string;
  timeframe?: Timeframe;
  strategyId?: string;
  sourceId?: string;
  /** Optional per-request tier; absent requests use the persisted workspace preference. */
  aiQuality?: AIQuality;
};

/** A durable per-owner quota snapshot. It contains no identity or server storage details. */
export type CoachQuota = {
  limit: number;
  used: number;
  remaining: number;
  resetAt: number;
  retryAfterSeconds: number;
};

/** Metadata about an optional, bounded visual attachment sent with this one request. */
export type CoachVisualContext = {
  requested: boolean;
  attached: boolean;
  page?: number;
  width?: number;
  height?: number;
  reason?: string;
};

/** A server-verified item included in the coach's grounding packet. */
export type CoachSource = {
  id: string;
  label: string;
  kind: string;
  /** Provider/source timestamp in its native epoch units when supplied. */
  asOf?: number;
};

/** Stateless response from the private, paper-only AI coach. */
export type CoachReply = {
  answer: string;
  model: string;
  aiQuality?: AIQuality;
  createdAt: number;
  sources: CoachSource[];
  contextStatus: string[];
  capabilities: string[];
  /** Present on current server replies; optional for safe restoration of older local DTOs. */
  quota?: CoachQuota;
  visualContext?: CoachVisualContext;
};

/** Availability metadata returned by `coach.status`; this never fabricates a coach answer. */
export type CoachStatus = {
  available: boolean;
  model?: string;
  aiQuality?: AIQuality;
  contextStatus: string[];
  capabilities: string[];
  quota?: CoachQuota;
};
