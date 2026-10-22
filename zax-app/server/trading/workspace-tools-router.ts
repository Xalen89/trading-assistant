import { z } from "zod";
import { router } from "../_core/trpc";
import { ownerProcedure } from "./access";
import {
  deleteArchivedStrategy,
  deleteLibraryRecord,
  getArchivedStrategyRemovalPreview,
  getLibraryRemovalPreview,
  getWorkspaceToolsCapacity,
} from "./workspace-tools";

const identifier = z.string().trim().min(1).max(100);
const version = z.number().int().positive();
const confirmation = z.string().trim().min(1).max(240);
const versionedSource = z.object({ id: identifier, version }).strict();

/**
 * Parent integration: merge this as `workspaceTools` in appRouter. Every
 * procedure is owner-only; previews read no source bytes and mutations require
 * an optimistic workspace revision plus exact confirmation text.
 */
export const workspaceToolsRouter = router({
  capacity: ownerProcedure.query(({ ctx }) =>
    getWorkspaceToolsCapacity(ctx.user.id),
  ),
  strategyRemovalPreview: ownerProcedure
    .input(z.object({ strategyId: identifier }).strict())
    .query(({ ctx, input }) =>
      getArchivedStrategyRemovalPreview(ctx.user.id, input.strategyId),
    ),
  deleteArchivedStrategy: ownerProcedure
    .input(
      z
        .object({
          strategyId: identifier,
          expectedStrategyVersion: version,
          expectedWorkspaceRevision: z.number().int().nonnegative(),
          confirmation,
          dependentSourceVersions: z.array(versionedSource).max(500),
        })
        .strict(),
    )
    .mutation(({ ctx, input }) => deleteArchivedStrategy(ctx.user.id, input)),
  libraryRemovalPreview: ownerProcedure
    .input(z.object({ sourceId: identifier }).strict())
    .query(({ ctx, input }) =>
      getLibraryRemovalPreview(ctx.user.id, input.sourceId),
    ),
  deleteLibraryRecord: ownerProcedure
    .input(
      z
        .object({
          sourceId: identifier,
          expectedSourceVersion: version,
          expectedWorkspaceRevision: z.number().int().nonnegative(),
          confirmation,
        })
        .strict(),
    )
    .mutation(({ ctx, input }) => deleteLibraryRecord(ctx.user.id, input)),
});
