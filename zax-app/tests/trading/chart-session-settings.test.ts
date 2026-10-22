import { describe, expect, it } from "vitest";
import { initialWorkspace } from "../../lib/trading/model";
import { workspaceSchema } from "../../server/trading/validation";

describe("optional session presentation settings", () => {
  it("preserves existing workspaces without requiring a new preference", () => {
    const original = initialWorkspace();
    expect(
      workspaceSchema.parse(original).settings.chartSessions,
    ).toBeUndefined();
  });
  it("retains disabled state and individually selected regional sessions", () => {
    const workspace = initialWorkspace();
    workspace.settings.chartSessions = {
      enabled: false,
      sessions: ["asia", "new-york", "sydney"],
    };
    const parsed = workspaceSchema.parse(JSON.parse(JSON.stringify(workspace)));
    expect(parsed.settings.chartSessions).toEqual(
      workspace.settings.chartSessions,
    );
    expect(parsed.settings.timezone).toBe(workspace.settings.timezone);
  });
  it("rejects unknown or duplicate session IDs and accepts an empty selection", () => {
    const workspace = initialWorkspace();
    expect(
      workspaceSchema.safeParse({
        ...workspace,
        settings: {
          ...workspace.settings,
          chartSessions: { enabled: true, sessions: ["asia", "asia"] },
        },
      }).success,
    ).toBe(false);
    expect(
      workspaceSchema.safeParse({
        ...workspace,
        settings: {
          ...workspace.settings,
          chartSessions: { enabled: true, sessions: ["invented"] },
        },
      }).success,
    ).toBe(false);
    expect(
      workspaceSchema.safeParse({
        ...workspace,
        settings: {
          ...workspace.settings,
          chartSessions: { enabled: false, sessions: [] },
        },
      }).success,
    ).toBe(true);
  });
});
