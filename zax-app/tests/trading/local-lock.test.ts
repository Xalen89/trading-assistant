import { describe, expect, it } from "vitest";
import {
  LOCAL_LOCK_COOLDOWN_MS,
  LOCAL_LOCK_STORAGE_KEY,
  LocalLockCapabilityError,
  LocalLockService,
  type LocalLockCrypto,
  type LocalLockStorage,
} from "../../lib/trading/local-lock";

class MemoryStorage implements LocalLockStorage {
  readonly values = new Map<string, string>();

  async getItem(key: string): Promise<string | null> {
    return this.values.get(key) ?? null;
  }

  async setItem(key: string, value: string): Promise<void> {
    this.values.set(key, value);
  }

  async removeItem(key: string): Promise<void> {
    this.values.delete(key);
  }
}

// Deterministic test-only adapter: production uses WebCrypto PBKDF2 on web.
const mockCrypto: LocalLockCrypto = {
  randomBytes(length) {
    return Uint8Array.from({ length }, (_, index) => index + 1);
  },
  async derivePin(pin, salt, iterations) {
    let seed = iterations;
    for (const character of pin) seed = (seed * 31 + character.charCodeAt(0)) >>> 0;
    for (const byte of salt) seed = (seed * 17 + byte) >>> 0;
    const result = new Uint8Array(32);
    for (let index = 0; index < result.length; index += 1) {
      seed = (seed * 1_103_515_245 + 12_345) >>> 0;
      result[index] = seed & 0xff;
    }
    return result;
  },
};

describe("local app lock", () => {
  it("is opt-in by default and persists a salted verifier rather than a plaintext PIN", async () => {
    const storage = new MemoryStorage();
    const service = new LocalLockService({
      platform: "web",
      storage,
      crypto: mockCrypto,
    });

    expect((await service.getStatus()).enabled).toBe(false);
    await service.configurePin("123456");

    const persisted = storage.values.get(LOCAL_LOCK_STORAGE_KEY)!;
    expect(JSON.parse(persisted)).toMatchObject({ version: 1, failedAttempts: 0 });
    expect(JSON.parse(persisted)).not.toHaveProperty("pin");
    expect(persisted).not.toContain("123456");
    await expect(service.verifyPin("123456")).resolves.toEqual({ state: "unlocked" });
  });

  it("limits incorrect PIN attempts to five and exposes a persisted cooldown", async () => {
    let now = 10_000;
    const storage = new MemoryStorage();
    const service = new LocalLockService({
      platform: "web",
      storage,
      crypto: mockCrypto,
      now: () => now,
    });
    await service.configurePin("123456");

    for (let attempt = 0; attempt < 4; attempt += 1) {
      await expect(service.verifyPin("654321")).resolves.toEqual({
        state: "wrong-pin",
        attemptsRemaining: 4 - attempt,
      });
    }
    await expect(service.verifyPin("654321")).resolves.toEqual({
      state: "cooldown",
      retryAfterMs: LOCAL_LOCK_COOLDOWN_MS,
    });
    expect(await service.getCooldownUntil()).toBe(now + LOCAL_LOCK_COOLDOWN_MS);
    await expect(service.verifyPin("123456")).resolves.toEqual({
      state: "cooldown",
      retryAfterMs: LOCAL_LOCK_COOLDOWN_MS,
    });

    now += LOCAL_LOCK_COOLDOWN_MS;
    await expect(service.verifyPin("123456")).resolves.toEqual({ state: "unlocked" });
  });

  it("resets only the local PIN record after caller-confirmed re-authentication", async () => {
    const storage = new MemoryStorage();
    storage.values.set("workspace", "keep");
    storage.values.set("screenshot:one", "keep");
    const service = new LocalLockService({
      platform: "web",
      storage,
      crypto: mockCrypto,
    });
    await service.configurePin("123456");
    await service.resetAfterReauthentication();

    expect(storage.values.get(LOCAL_LOCK_STORAGE_KEY)).toBeUndefined();
    expect(storage.values.get("workspace")).toBe("keep");
    expect(storage.values.get("screenshot:one")).toBe("keep");
  });

  it("fails closed to opt-in off when native cryptography was not deliberately supplied", async () => {
    const storage = new MemoryStorage();
    const service = new LocalLockService({ platform: "native", storage, crypto: null });

    await expect(service.getStatus()).resolves.toMatchObject({
      isSupported: false,
      enabled: false,
      storageLabel: "SecureStore",
    });
    await expect(service.configurePin("123456")).rejects.toBeInstanceOf(
      LocalLockCapabilityError,
    );
    expect(storage.values.size).toBe(0);
  });
});
