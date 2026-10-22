import { router } from "../_core/trpc";
import { ownerProcedure } from "./access";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { symbol, timeframe } from "./validation";
import { getCandles, retryCandles, retryQuote } from "./market";
import { loadWorkspace } from "./repository";
import { generateAIPriceForecast } from "./forecast-service";
import { releaseAppQuotaReservation, reserveAppQuota } from "./app-quota";
import { LLMServiceError } from "../_core/llm-errors";
import {
  disconnectScenarioProvider,
  getScenarioProviderStatus,
  loadScenarioProviderKey,
  saveScenarioProviderKey,
  scenarioApiKeySchema,
  scenarioVaultAvailable,
} from "./scenario-provider-vault";
import { assertScenarioCredentialRequest } from "./scenario-provider-security";
import {
  DirectOpenAIError,
  listDirectOpenAIModels,
} from "./openai-scenario-client";

const FORECAST_REQUEST_TIMEOUT_MS = 48_000;

async function withinForecastDeadline<T>(
  work: Promise<T>,
  deadline: number,
  phase: string,
): Promise<T> {
  const remaining = deadline - Date.now();
  if (remaining <= 0)
    throw new TRPCError({
      code: "TIMEOUT",
      message: `AI scenario request timed out before ${phase}. No path was fabricated.`,
    });
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      work,
      new Promise<T>((_, reject) => {
        timeout = setTimeout(
          () =>
            reject(
              new TRPCError({
                code: "TIMEOUT",
                message: `AI scenario request timed out during ${phase}. No path was fabricated.`,
              }),
            ),
          remaining,
        );
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

export const forecastRouter = router({
  providerStatus: ownerProcedure.query(async ({ ctx }) => {
    try {
      return await getScenarioProviderStatus(ctx.user.id);
    } catch {
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message:
          "OpenAI connection status unavailable. Reconnect in this private app.",
      });
    }
  }),
  connectProvider: ownerProcedure
    .input(z.object({ apiKey: scenarioApiKeySchema }).strict())
    .mutation(async ({ ctx, input }) => {
      await assertScenarioCredentialRequest(ctx.req, ctx.user.openId);
      if (!scenarioVaultAvailable())
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Private key storage is unavailable. Key was not saved.",
        });
      // Retain the same owner request-attempt throttle. Failure releases only this request's usable-output slot.
      const { reservation } = await reserveAppQuota(ctx.user.id, "forecast");
      const deadline = Date.now() + 20_000;
      try {
        const available = await listDirectOpenAIModels(input.apiKey, deadline);
        const models = ["gpt-5-mini", "gpt-5"].filter((id) =>
          available.includes(id),
        );
        if (!models.length)
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: "No supported scenario model is available for this key.",
          });
        if (Date.now() >= deadline - 1000)
          throw new DirectOpenAIError("timeout", true);
        // Await storage; never detach a save after a client-facing timeout or overwrite on failed validation.
        return await saveScenarioProviderKey(ctx.user.id, input.apiKey, models);
      } catch (error) {
        await releaseAppQuotaReservation(reservation).catch(() => undefined);
        if (error instanceof TRPCError) throw error;
        const message =
          error instanceof DirectOpenAIError
            ? error.kind === "authentication"
              ? "OpenAI rejected this key. Check key permissions and try again."
              : error.kind === "timeout"
                ? "OpenAI check timed out. Key was not saved."
                : error.kind === "rate-limit"
                  ? "OpenAI could not accept the key check right now. Key was not saved."
                  : "OpenAI connection check failed. Key was not saved."
            : "Unable to save the private OpenAI connection. Key was not saved.";
        throw new TRPCError({ code: "PRECONDITION_FAILED", message });
      }
    }),
  disconnectProvider: ownerProcedure.mutation(async ({ ctx }) => {
    await assertScenarioCredentialRequest(ctx.req, ctx.user.openId);
    try {
      return await disconnectScenarioProvider(ctx.user.id);
    } catch {
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message:
          "Unable to disconnect OpenAI. The saved connection was not confirmed removed.",
      });
    }
  }),
  generate: ownerProcedure
    .input(
      z.object({
        market: symbol,
        timeframe,
        contextMode: z
          .enum(["auto", "current", "last-available"])
          .default("auto"),
        aiQuality: z.enum(["efficient", "deep"]).optional(),
        strategyId: z.string().min(1).max(100).optional(),
        instructions: z.string().max(800).default(""),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const deadline = Date.now() + FORECAST_REQUEST_TIMEOUT_MS;
      const { reservation } = await withinForecastDeadline(
        reserveAppQuota(ctx.user.id, "forecast"),
        deadline,
        "quota check",
      );
      try {
        const sourceDeadline = Math.min(deadline, Date.now() + 12_000);
        const [feed, quote, stored, apiKey] = await withinForecastDeadline(
          Promise.all([
            input.contextMode !== "last-available"
              ? retryCandles(
                  input.market,
                  input.timeframe,
                  ctx.user,
                  sourceDeadline,
                )
              : getCandles(
                  input.market,
                  input.timeframe,
                  ctx.user,
                  sourceDeadline,
                ),
            input.contextMode !== "last-available"
              ? retryQuote(input.market, ctx.user, sourceDeadline).catch(
                  (error: unknown) => {
                    if (input.contextMode === "auto") return undefined;
                    throw error;
                  },
                )
              : Promise.resolve(undefined),
            loadWorkspace(ctx.user.id),
            // A corrupt/undecryptable saved direct key fails closed, never silently uses managed AI.
            loadScenarioProviderKey(ctx.user.id),
          ]),
          deadline,
          "market, workspace and private provider reads",
        );
        const strategy = input.strategyId
          ? stored.workspace?.strategies.find(
              (s) => s.id === input.strategyId && !s.archived,
            )
          : undefined;
        if (input.strategyId && !strategy)
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Selected strategy is not in your private workspace.",
          });
        return await generateAIPriceForecast({
          ...input,
          feed,
          aiQuality: input.aiQuality ?? stored.workspace?.settings.aiQuality,
          quote,
          strategy,
          deadline,
          ...(apiKey ? { directOpenAI: { apiKey } } : {}),
        });
      } catch (error) {
        if (
          (error instanceof LLMServiceError && error.terminal) ||
          (error instanceof DirectOpenAIError && error.terminal)
        )
          await releaseAppQuotaReservation(reservation).catch(() => undefined);
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "AI scenario unavailable. No path was fabricated.",
          ...(error instanceof LLMServiceError ||
          error instanceof DirectOpenAIError
            ? { cause: error }
            : {}),
        });
      }
    }),
});
