import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router } from "../_core/trpc";
import { ownerProcedure } from "./access";
import { timeframe } from "./validation";
import { quantHistory } from "./quant-data";
import {
  validateNoCodeQuantRule,
  evaluateNoCodeQuantRule,
  type NoCodeQuantRule,
} from "../../lib/trading/no-code-quant";

export const quantRulesRouter = router({
  evaluate: ownerProcedure
    .input(
      z.object({
        rule: z.custom<NoCodeQuantRule>(
          (v) => validateNoCodeQuantRule(v).valid,
          "Invalid bounded research rule",
        ),
        timeframe,
        bars: z.number().int().min(100).max(1800).default(900),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const validation = validateNoCodeQuantRule(input.rule);
      if (JSON.stringify(input.rule).length > 40000)
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Research rule is too large.",
        });
      const deadline = Date.now() + 45_000;
      const series = [];
      for (const symbol of validation.assetSymbols) {
        if (Date.now() > deadline - 2000)
          throw new TRPCError({
            code: "TIMEOUT",
            message:
              "Rule source fetch reached its deadline. The draft is retained; retry fewer assets.",
          });
        series.push(
          await quantHistory(
            symbol,
            input.timeframe,
            ctx.user,
            input.bars,
            deadline,
          ),
        );
      }
      return evaluateNoCodeQuantRule(input.rule, { series, now: Date.now() });
    }),
});
