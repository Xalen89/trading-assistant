import { scenarioRouter } from "./trading/scenario-router";
import { quantRulesRouter } from "./trading/quant-rules-router";
import { sourcePreviewRouter } from "./trading/source-preview-router";
import { sourceAnalysisRouter } from "./trading/source-analysis-router";
import { workspaceToolsRouter } from "./trading/workspace-tools-router";
import { biasRouter } from "./trading/bias-router";
import { tradeScreenshotRouter } from "./trading/trade-screenshot-router";
import { forecastRouter } from "./trading/forecast-router";
import { setupRouter, paperRouter } from "./trading/setup-router";
import { coachRouter } from "./trading/coach-router";
import { quantRouter } from "./trading/quant-router";
import { OWNER_ONLY_APP, mayUseApp } from "./trading/access";
import { getSessionCookieName, getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
import {
  marketRouter,
  workspaceRouter,
  learningRouter,
  notificationsRouter,
  researchRouter,
} from "./trading/router";

export const appRouter = router({
  // if you need to use socket.io, read and register route in server/_core/index.ts, all api should start with '/api/' so that the gateway can route correctly
  system: systemRouter,
  market: marketRouter,
  workspace: workspaceRouter,
  learning: learningRouter,
  notifications: notificationsRouter,
  research: researchRouter,
  setup: setupRouter,
  paper: paperRouter,
  bias: biasRouter,
  tradeScreenshot: tradeScreenshotRouter,
  forecast: forecastRouter,
  scenarios: scenarioRouter,
  coach: coachRouter,
  quant: quantRouter,
  quantRules: quantRulesRouter,
  sourcePreview: sourcePreviewRouter,
  sourceAnalysis: sourceAnalysisRouter,
  workspaceTools: workspaceToolsRouter,
  auth: router({
    access: publicProcedure.query(({ ctx }) => ({
      ownerOnly: OWNER_ONLY_APP,
      allowed: mayUseApp(ctx.user),
      signedIn: Boolean(ctx.user),
    })),
    me: publicProcedure.query((opts) => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(getSessionCookieName(ctx.req), {
        ...cookieOptions,
        maxAge: -1,
      });
      return {
        success: true,
      } as const;
    }),
  }),

  // TODO: add feature routers here, e.g.
  // todo: router({
  //   list: protectedProcedure.query(({ ctx }) =>
  //     db.getUserTodos(ctx.user.id)
  //   ),
  // }),
});

export type AppRouter = typeof appRouter;
