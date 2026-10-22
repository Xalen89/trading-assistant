import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "../../server/_core/context";
const mocks = vi.hoisted(() => ({
  models: vi.fn(),
  save: vi.fn(),
  status: vi.fn(),
  loadKey: vi.fn(),
  disconnect: vi.fn(),
  reserve: vi.fn(),
  release: vi.fn(),
  request: vi.fn(),
}));
vi.mock("../../server/trading/tradelocker", () => ({
  brokerOwner: (i: { openId?: string } | null) =>
    i?.openId === "software-fixture-owner",
}));
vi.mock("../../server/trading/scenario-provider-vault", async (original) => {
  const actual =
    await original<
      typeof import("../../server/trading/scenario-provider-vault")
    >();
  return {
    ...actual,
    scenarioVaultAvailable: () => true,
    getScenarioProviderStatus: mocks.status,
    saveScenarioProviderKey: mocks.save,
    loadScenarioProviderKey: mocks.loadKey,
    disconnectScenarioProvider: mocks.disconnect,
  };
});
vi.mock("../../server/trading/openai-scenario-client", async (original) => {
  const actual =
    await original<
      typeof import("../../server/trading/openai-scenario-client")
    >();
  return { ...actual, listDirectOpenAIModels: mocks.models };
});
vi.mock("../../server/trading/scenario-provider-security", () => ({
  assertScenarioCredentialRequest: mocks.request,
}));
vi.mock("../../server/trading/app-quota", async (original) => {
  const actual =
    await original<typeof import("../../server/trading/app-quota")>();
  return {
    ...actual,
    reserveAppQuota: mocks.reserve,
    releaseAppQuotaReservation: mocks.release,
  };
});
import { forecastRouter } from "../../server/trading/forecast-router";
import { DirectOpenAIError } from "../../server/trading/openai-scenario-client";
const syntheticKey = "sk-" + "not-live-software-fixture".repeat(3);
const safeStatus = {
  configured: true,
  vaultAvailable: true,
  models: ["gpt-5-mini", "gpt-5"],
  savedAt: 100000,
};
const reservation = {
  token: "synthetic-reservation",
  bucketId: "quota:71:forecast:1",
  userId: 71,
  scope: "forecast",
  cost: 1,
  reservedAt: 10000,
};
function context(
  openId: string | null = "software-fixture-owner",
): TrpcContext {
  return {
    req: {
      method: "POST",
      headers: { origin: "https://fixture-app.example" },
      hostname: "fixture-api.example",
      secure: true,
    },
    res: {},
    user: openId
      ? {
          id: 71,
          openId,
          name: "Software fixture",
          email: null,
          loginMethod: null,
          role: "user",
          createdAt: new Date(),
          updatedAt: new Date(),
          lastSignedIn: new Date(),
        }
      : null,
  } as unknown as TrpcContext;
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.request.mockResolvedValue(undefined);
  mocks.models.mockResolvedValue(["gpt-5-mini", "gpt-5", "irrelevant-model"]);
  mocks.save.mockResolvedValue(safeStatus);
  mocks.status.mockResolvedValue(safeStatus);
  mocks.disconnect.mockResolvedValue({
    configured: false,
    vaultAvailable: true,
    models: [],
  });
  mocks.reserve.mockResolvedValue({ reservation });
  mocks.release.mockResolvedValue(true);
});
describe("private in-app scenario provider endpoints", () => {
  it("checks the supplied credential before committing only verified safe model labels", async () => {
    const result = await forecastRouter
      .createCaller(context())
      .connectProvider({ apiKey: syntheticKey });
    expect(mocks.request).toHaveBeenCalled();
    expect(mocks.models).toHaveBeenCalledWith(syntheticKey, expect.any(Number));
    expect(mocks.save).toHaveBeenCalledWith(71, syntheticKey, [
      "gpt-5-mini",
      "gpt-5",
    ]);
    expect(mocks.models.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.save.mock.invocationCallOrder[0],
    );
    expect(result).toEqual(safeStatus);
    expect(JSON.stringify(result)).not.toContain(syntheticKey);
    expect(mocks.release).not.toHaveBeenCalled();
  });
  it("never changes the old stored connection when the proposed replacement is rejected or lacks a supported model", async () => {
    const caller = forecastRouter.createCaller(context());
    mocks.models.mockRejectedValue(
      new DirectOpenAIError("authentication", true),
    );
    await expect(
      caller.connectProvider({ apiKey: syntheticKey }),
    ).rejects.toThrow("OpenAI rejected this key");
    expect(mocks.save).not.toHaveBeenCalled();
    expect(mocks.release).toHaveBeenCalledWith(reservation);
    mocks.models.mockResolvedValue(["unsupported-only"]);
    await expect(
      caller.connectProvider({ apiKey: syntheticKey }),
    ).rejects.toThrow("No supported scenario model");
    expect(mocks.save).not.toHaveBeenCalled();
  });
  it("rejects raw labels and unauthorized/non-owner calls before provider, quota or persistence work", async () => {
    await expect(
      forecastRouter
        .createCaller(context())
        .connectProvider({ apiKey: "ZAX_SCENARIO_OPENAI_API_KEY" }),
    ).rejects.toThrow();
    await expect(
      forecastRouter
        .createCaller(context(null))
        .connectProvider({ apiKey: syntheticKey }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(
      forecastRouter
        .createCaller(context("different-owner"))
        .connectProvider({ apiKey: syntheticKey }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mocks.models).not.toHaveBeenCalled();
    expect(mocks.save).not.toHaveBeenCalled();
    expect(mocks.reserve).not.toHaveBeenCalled();
  });
  it("requires the credential mutation security guard and never leaks input in failure messages", async () => {
    mocks.request.mockRejectedValue(new Error("synthetic denied request"));
    await expect(
      forecastRouter
        .createCaller(context())
        .connectProvider({ apiKey: syntheticKey }),
    ).rejects.toThrow();
    expect(mocks.models).not.toHaveBeenCalled();
    expect(mocks.save).not.toHaveBeenCalled();
    mocks.request.mockResolvedValue(undefined);
    mocks.models.mockRejectedValue(new DirectOpenAIError("timeout", true));
    const error = await forecastRouter
      .createCaller(context())
      .connectProvider({ apiKey: syntheticKey })
      .catch((e) => e);
    expect(error.message).toBe("OpenAI check timed out. Key was not saved.");
    expect(String(error)).not.toContain(syntheticKey);
  });
  it("returns only safe status and limits disconnection to this authenticated owner", async () => {
    const caller = forecastRouter.createCaller(context());
    expect(await caller.providerStatus()).toEqual(safeStatus);
    expect(mocks.status).toHaveBeenCalledWith(71);
    expect(await caller.disconnectProvider()).toEqual({
      configured: false,
      vaultAvailable: true,
      models: [],
    });
    expect(mocks.disconnect).toHaveBeenCalledWith(71);
    expect(mocks.request).toHaveBeenCalled();
  });
});
