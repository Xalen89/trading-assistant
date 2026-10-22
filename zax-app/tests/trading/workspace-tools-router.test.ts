import { describe, expect, it } from "vitest";
import { workspaceToolsRouter } from "../../server/trading/workspace-tools-router";

describe("workspace tools router", () => {
  it("rejects unauthenticated access before any capacity, preview, or delete service can run", async () => {
    const caller = workspaceToolsRouter.createCaller({
      user: null,
      req: { headers: {} },
      res: {},
    } as any);
    await expect(caller.capacity()).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
    await expect(
      caller.strategyRemovalPreview({ strategyId: "retired" }),
    ).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
    await expect(
      caller.deleteLibraryRecord({
        sourceId: "source",
        expectedSourceVersion: 1,
        expectedWorkspaceRevision: 0,
        confirmation: "DELETE LIBRARY RECORD source",
      }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
});
