import { describe, expect, it } from "vitest";
import { initialWorkspace } from "../../lib/trading/model";
import { resolveAIQuality } from "../../lib/trading/ai-quality";
import {
  createWorkspaceEnvelope,
  envelopeForPersistence,
  parseWorkspaceStorage,
} from "../../lib/trading/workspace-sync";
import { workspaceSchema } from "../../server/trading/validation";
import { forecastRouter } from "../../server/trading/forecast-router";

describe("owner AI quality preference", () => {
  it("defaults old workspaces to Efficient without migrating them into Deep", () => {
    const workspace = workspaceSchema.parse(initialWorkspace());
    expect(workspace.settings.aiQuality).toBeUndefined();
    expect(resolveAIQuality(workspace.settings.aiQuality)).toBe("efficient");
  });
  it("preserves a deliberate Deep choice through server and local owner-envelope serialization", () => {
    const original = initialWorkspace();
    original.settings.aiQuality = "deep";
    const validated = workspaceSchema.parse(original);
    const persisted = envelopeForPersistence(
      createWorkspaceEnvelope(validated),
    );
    const restored = parseWorkspaceStorage(JSON.stringify(persisted));
    expect(restored.kind).toBe("envelope");
    if (restored.kind === "envelope")
      expect(restored.envelope.workspace.settings.aiQuality).toBe("deep");
    expect(original.settings.aiQuality).toBe("deep");
  });
  it("rejects raw model IDs in the server workspace quality field", () => {
    const original = initialWorkspace();
    expect(
      workspaceSchema.safeParse({
        ...original,
        settings: { ...original.settings, aiQuality: "gpt-5.5" },
      }).success,
    ).toBe(false);
  });
  it("does not let a guest request either premium or efficient forecast generation", async () => {
    const guest = forecastRouter.createCaller({
      user: null,
      req: { headers: {} },
      res: {},
    } as any);
    await expect(
      guest.generate({
        market: "BTC-USD",
        timeframe: "5m",
        aiQuality: "deep",
        contextMode: "auto",
        instructions: "",
      }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
});
