import { describe, expect, it, vi } from "vitest";
import { ENV } from "../../server/_core/env";
import {
  getScenarioProviderStatus,
  openScenarioKey,
  saveScenarioProviderKey,
  scenarioApiKeySchema,
  sealScenarioKey,
  disconnectScenarioProvider,
} from "../../server/trading/scenario-provider-vault";

const dbMock = vi.hoisted(() => ({
  rows: [] as { payload: unknown }[],
  inserted: undefined as unknown,
  removed: false,
}));
vi.mock("../../server/trading/repository", () => ({
  dbRequired: vi.fn(async () => ({
    select: () => ({
      from: () => ({ where: () => ({ limit: async () => dbMock.rows }) }),
    }),
    insert: () => ({
      values: (v: unknown) => {
        dbMock.inserted = v;
        return { onDuplicateKeyUpdate: async () => undefined };
      },
    }),
    delete: () => ({
      where: async () => {
        dbMock.removed = true;
      },
    }),
  })),
}));
const syntheticKey = "sk-" + "software-fixture-not-a-live-key".repeat(2);
const secret = "software-fixture-encryption-material-not-a-real-secret";
const app = "software-fixture-app";

describe("private owner-only scenario key vault", () => {
  it("rejects button labels, setting names, proxy placeholders and malformed keys", () => {
    for (const v of [
      "OpenAI API key",
      "ZAX_SCENARIO_OPENAI_API_KEY",
      "mtr_fake_fixture",
      "",
      "sk-short",
      "sk-" + "invalid key ".repeat(5),
    ])
      expect(scenarioApiKeySchema.safeParse(v).success).toBe(false);
    expect(scenarioApiKeySchema.parse("  " + syntheticKey + "  ")).toBe(
      syntheticKey,
    );
  });
  it("encrypts with unpredictable IVs and leaves no plaintext or raw private material in the envelope", () => {
    const first = sealScenarioKey(
      71,
      syntheticKey,
      ["gpt-5-mini", "gpt-5"],
      secret,
      app,
      100000,
    );
    const second = sealScenarioKey(
      71,
      syntheticKey,
      ["gpt-5-mini", "gpt-5"],
      secret,
      app,
      100000,
    );
    expect(first.iv).not.toBe(second.iv);
    expect(JSON.stringify(first)).not.toContain(syntheticKey);
    expect(JSON.stringify(first)).not.toContain(secret);
    expect(openScenarioKey(71, first, secret, app).apiKey).toBe(syntheticKey);
  });
  it("authenticates owner, app, signing foundation, ciphertext and public metadata", () => {
    const envelope = sealScenarioKey(
      71,
      syntheticKey,
      ["gpt-5-mini"],
      secret,
      app,
      100000,
    );
    const cases = [
      () => openScenarioKey(72, envelope, secret, app),
      () => openScenarioKey(71, envelope, secret, "another-app"),
      () => openScenarioKey(71, envelope, "different-secret", app),
      () => openScenarioKey(71, { ...envelope, savedAt: 100001 }, secret, app),
      () =>
        openScenarioKey(71, { ...envelope, models: ["gpt-5"] }, secret, app),
      () =>
        openScenarioKey(71, { ...envelope, ciphertext: "AAAA" }, secret, app),
      () => openScenarioKey(71, { ...envelope, version: 2 }, secret, app),
    ];
    for (const check of cases) {
      expect(check).toThrow("Saved OpenAI connection cannot be decrypted");
      try {
        check();
      } catch (e) {
        expect(String(e)).not.toContain(syntheticKey);
      }
    }
  });
  it("fails closed when encryption identity is absent, owner malformed or model labels unsupported", () => {
    expect(() =>
      sealScenarioKey(71, syntheticKey, ["gpt-5"], "", app),
    ).toThrow();
    expect(() =>
      sealScenarioKey(71, syntheticKey, ["gpt-5"], secret, ""),
    ).toThrow();
    expect(() =>
      sealScenarioKey(-1, syntheticKey, ["gpt-5"], secret, app),
    ).toThrow();
    expect(() =>
      sealScenarioKey(71, syntheticKey, ["unknown"], secret, app),
    ).toThrow();
    expect(() =>
      sealScenarioKey(71, syntheticKey, ["gpt-5", "gpt-5"], secret, app),
    ).toThrow();
  });
  it("stores only ciphertext and returns safe status, then removes only through scoped storage", async () => {
    const oldSecret = ENV.cookieSecret,
      oldApp = ENV.appId;
    ENV.cookieSecret = secret;
    ENV.appId = app;
    try {
      dbMock.rows = [];
      dbMock.removed = false;
      const absent = await getScenarioProviderStatus(71);
      expect(absent).toEqual({
        configured: false,
        vaultAvailable: true,
        models: [],
      });
      const saved = await saveScenarioProviderKey(71, syntheticKey, ["gpt-5"]);
      expect(saved).toMatchObject({ configured: true, models: ["gpt-5"] });
      expect(JSON.stringify(dbMock.inserted)).not.toContain(syntheticKey);
      const row = dbMock.inserted as { payload: unknown };
      dbMock.rows = [row];
      const status = await getScenarioProviderStatus(71);
      expect(Object.keys(status).sort()).toEqual([
        "configured",
        "models",
        "savedAt",
        "vaultAvailable",
      ]);
      expect(JSON.stringify(status)).not.toContain(syntheticKey);
      expect(await disconnectScenarioProvider(71)).toEqual({
        configured: false,
        vaultAvailable: true,
        models: [],
      });
      expect(dbMock.removed).toBe(true);
    } finally {
      ENV.cookieSecret = oldSecret;
      ENV.appId = oldApp;
      dbMock.rows = [];
    }
  });
});
