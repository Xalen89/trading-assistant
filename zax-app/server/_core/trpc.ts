import { NOT_ADMIN_ERR_MSG, UNAUTHED_ERR_MSG } from "../../shared/const.js";
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { TrpcContext } from "./context";
import { AppQuotaExceeded } from "../trading/app-quota";
import { safeLLMFailureKind } from "./llm-errors";
import { DirectOpenAIError } from "../trading/openai-scenario-client";

const directFailureKinds = [
  "authentication",
  "rate-limit",
  "timeout",
  "unavailable",
  "invalid-output",
] as const;

const t = initTRPC.context<TrpcContext>().create({
  transformer: superjson,
  errorFormatter({ shape, error }) {
    return {
      ...shape,
      data: {
        ...shape.data,
        appRateLimit:
          error.cause instanceof AppQuotaExceeded
            ? error.cause.quota
            : undefined,
        aiFailureKind: safeLLMFailureKind(error.cause),
        directOpenAIKind:
          error.cause instanceof DirectOpenAIError &&
          directFailureKinds.includes(error.cause.kind)
            ? error.cause.kind
            : undefined,
      },
    };
  },
});

export const router = t.router;
export const publicProcedure = t.procedure;

const requireUser = t.middleware(async (opts) => {
  const { ctx, next } = opts;

  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  }

  return next({
    ctx: {
      ...ctx,
      user: ctx.user,
    },
  });
});

export const protectedProcedure = t.procedure.use(requireUser);

export const adminProcedure = t.procedure.use(
  t.middleware(async (opts) => {
    const { ctx, next } = opts;

    if (!ctx.user || ctx.user.role !== "admin") {
      throw new TRPCError({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
    }

    return next({
      ctx: {
        ...ctx,
        user: ctx.user,
      },
    });
  }),
);
