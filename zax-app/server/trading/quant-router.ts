import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router } from "../_core/trpc";
import { ownerProcedure } from "./access";
import { symbol } from "./validation";
import { venueDepth } from "./venue-depth";
import { rememberQuantResearch } from "./quant-state";
import { runQuantResearch } from "./quant-service";
import { quantRequestSchema } from "./quant-request";
export { quantRequestSchema } from "./quant-request";
const usage = new Map<number, { at: number; count: number }>();
function limit(userId: number) {
  const now = Date.now(),
    old = usage.get(userId),
    bucket = old && now - old.at < 600000 ? old : { at: now, count: 0 };
  if (bucket.count >= 30)
    throw new TRPCError({
      code: "TOO_MANY_REQUESTS",
      message:
        "Research request limit reached; pause before running more parameter trials.",
    });
  bucket.count++;
  usage.set(userId, bucket);
}
export const quantRouter = router({
  book: ownerProcedure
    .input(z.object({ symbol }))
    .query(({ input }) => venueDepth(input.symbol)),
  run: ownerProcedure
    .input(quantRequestSchema)
    .mutation(async ({ ctx, input }) => {
      limit(ctx.user.id);
      const response = await runQuantResearch(input, ctx.user);
      rememberQuantResearch(ctx.user.id, {
        family: input.family,
        generatedAt: Date.now(),
        sources: response.series,
        result: response.result,
      });
      return response;
    }),
});
