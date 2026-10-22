import { z } from "zod";
import { router } from "../_core/trpc";
import { ownerProcedure } from "./access";
import {
  sourcePreviewInfo,
  sourcePreviewPage,
  sourcePreviewText,
} from "./source-preview";

const sourceId = z.string().trim().min(1).max(100);
const evidence = z.string().trim().min(1).max(2_000).optional();
const page = z.number().int().min(1).max(2000).optional();

/**
 * Owner-scoped original-file review. Page pixels/text are bounded base64/RPC
 * payloads; this router never returns a storage URL, object key, token, or file
 * encryption material.
 */
export const sourcePreviewRouter = router({
  info: ownerProcedure
    .input(z.object({ sourceId, evidence }).strict())
    .query(({ ctx, input }) => sourcePreviewInfo(ctx.user.id, input)),
  page: ownerProcedure
    .input(
      z
        .object({
          sourceId,
          page,
          maxDimension: z.number().int().min(256).max(1_200).optional(),
        })
        .strict(),
    )
    .query(({ ctx, input }) => sourcePreviewPage(ctx.user.id, input)),
  text: ownerProcedure
    .input(z.object({ sourceId, page, evidence }).strict())
    .query(({ ctx, input }) => sourcePreviewText(ctx.user.id, input)),
});
