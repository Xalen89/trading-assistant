import { TRPCError } from "@trpc/server";
import { publicProcedure, protectedProcedure } from "../_core/trpc";
import { brokerOwner } from "./tradelocker";
// User-approved private app. Public release must be a deliberate source/config change.
export const OWNER_ONLY_APP = true;
export function mayUseApp(
  identity?: { openId?: string | null; email?: string | null } | null,
) {
  return !OWNER_ONLY_APP || brokerOwner(identity);
}
export const appProcedure = publicProcedure.use(({ ctx, next }) => {
  if (!mayUseApp(ctx.user))
    throw new TRPCError({
      code: ctx.user ? "FORBIDDEN" : "UNAUTHORIZED",
      message:
        "Zax is an owner-only private app. Sign in with the approved owner account.",
    });
  return next();
});
export const ownerProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (!mayUseApp(ctx.user))
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "This private app is restricted to its approved owner.",
    });
  return next({ ctx });
});
