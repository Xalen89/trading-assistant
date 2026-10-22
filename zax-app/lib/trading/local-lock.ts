type SecureStoreModule = {
  getItemAsync(key: string): Promise<string | null>;
  setItemAsync(key: string, value: string): Promise<void>;
  deleteItemAsync(key: string): Promise<void>;
};

/** The only persisted local-lock record. It never contains a plaintext PIN. */
export const LOCAL_LOCK_STORAGE_KEY = "stratdesk.local-app-lock.v1";
export const LOCAL_LOCK_PBKDF2_ITERATIONS = 310_000;
export const LOCAL_LOCK_MAX_ATTEMPTS = 5;
export const LOCAL_LOCK_COOLDOWN_MS = 30_000;

export type LocalLockPlatform = "web" | "native";

/** Injectable storage keeps tests local and avoids any workspace or server writes. */
export interface LocalLockStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

/**
 * A deliberately small cryptography adapter. The default adapter uses WebCrypto PBKDF2 on web.
 * Native callers may provide an Expo Crypto-backed adapter only when their parent elects to add it.
 */
export interface LocalLockCrypto {
  randomBytes(length: number): Uint8Array;
  derivePin(pin: string, salt: Uint8Array, iterations: number): Promise<Uint8Array>;
}

type StoredLockRecord = {
  version: 1;
  salt: string;
  verifier: string;
  iterations: number;
  failedAttempts: number;
  cooldownUntil: number | null;
};

export type LocalLockStatus = {
  platform: LocalLockPlatform;
  /** True only when hashing and the local storage surface are usable. */
  isSupported: boolean;
  /** A valid PIN verifier is configured. Defaults to false on first run. */
  enabled: boolean;
  storageLabel: "SecureStore" | "browser localStorage";
  message: string;
  privacyNotice: string;
};

export type LocalLockVerification =
  | { state: "unlocked" }
  | { state: "wrong-pin"; attemptsRemaining: number }
  | { state: "cooldown"; retryAfterMs: number }
  | { state: "invalid-pin"; message: string }
  | { state: "disabled" }
  | { state: "unavailable"; message: string };

export class LocalLockCapabilityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LocalLockCapabilityError";
  }
}

const webPrivacyNotice =
  "Web local app lock is a privacy convenience only: browsers do not strongly protect localStorage keys. It is not server security.";
const nativePrivacyNotice =
  "This local PIN is a device privacy layer only. It is not server authorization, broker authority, or a substitute for the Owner Gate.";

function detectedPlatform(): LocalLockPlatform {
  const runtime = globalThis as unknown as {
    navigator?: { product?: string };
    window?: unknown;
  };
  if (runtime.navigator?.product === "ReactNative") return "native";
  return runtime.window ? "web" : "native";
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function hexToBytes(value: string): Uint8Array | null {
  if (!/^(?:[0-9a-f]{2})+$/i.test(value)) return null;
  const bytes = new Uint8Array(value.length / 2);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(value.slice(index * 2, index * 2 + 2), 16);
  }
  return bytes;
}

function equalHex(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}

function parseRecord(value: string | null): StoredLockRecord | null {
  if (!value) return null;
  try {
    const candidate = JSON.parse(value) as Partial<StoredLockRecord>;
    const salt = typeof candidate.salt === "string" ? hexToBytes(candidate.salt) : null;
    const verifier =
      typeof candidate.verifier === "string" ? hexToBytes(candidate.verifier) : null;
    const failedAttempts =
      typeof candidate.failedAttempts === "number" ? candidate.failedAttempts : null;
    const cooldownUntil =
      typeof candidate.cooldownUntil === "number"
        ? candidate.cooldownUntil
        : candidate.cooldownUntil === null
          ? null
          : undefined;
    if (
      candidate.version !== 1 ||
      candidate.iterations !== LOCAL_LOCK_PBKDF2_ITERATIONS ||
      !salt ||
      salt.length < 16 ||
      !verifier ||
      verifier.length !== 32 ||
      typeof failedAttempts !== "number" ||
      !Number.isInteger(failedAttempts) ||
      failedAttempts < 0 ||
      failedAttempts > LOCAL_LOCK_MAX_ATTEMPTS ||
      (cooldownUntil === undefined ||
        (cooldownUntil !== null &&
        (!Number.isFinite(cooldownUntil) || cooldownUntil < 0))
      )
    ) {
      return null;
    }
    return {
      version: 1,
      salt: candidate.salt!,
      verifier: candidate.verifier!,
      iterations: LOCAL_LOCK_PBKDF2_ITERATIONS,
      failedAttempts,
      cooldownUntil,
    };
  } catch {
    return null;
  }
}

function browserStorage(): Storage {
  const storage = (globalThis as unknown as { localStorage?: Storage }).localStorage;
  if (!storage) throw new Error("browser localStorage is unavailable");
  return storage;
}

export function createBrowserLocalLockStorage(): LocalLockStorage {
  return {
    async getItem(key) {
      return browserStorage().getItem(key);
    },
    async setItem(key, value) {
      browserStorage().setItem(key, value);
    },
    async removeItem(key) {
      browserStorage().removeItem(key);
    },
  };
}

function nativeSecureStore(): SecureStoreModule {
  // Kept behind the native path so injected mock storage never evaluates native bindings in tests.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require("expo-secure-store") as SecureStoreModule;
}

export function createNativeLocalLockStorage(): LocalLockStorage {
  return {
    getItem: (key) => nativeSecureStore().getItemAsync(key),
    setItem: (key, value) => nativeSecureStore().setItemAsync(key, value),
    removeItem: (key) => nativeSecureStore().deleteItemAsync(key),
  };
}

type RuntimeSubtleCrypto = {
  importKey(
    format: string,
    keyData: Uint8Array,
    algorithm: { name: string },
    extractable: boolean,
    usages: string[],
  ): Promise<unknown>;
  deriveBits(
    algorithm: {
      name: string;
      salt: Uint8Array;
      iterations: number;
      hash: string;
    },
    baseKey: unknown,
    length: number,
  ): Promise<ArrayBuffer>;
};

type RuntimeCrypto = {
  getRandomValues<T extends ArrayBufferView | null>(array: T): T;
  subtle: RuntimeSubtleCrypto;
};

/** Returns null rather than falling back to a weak custom hash. */
export function createWebCryptoLocalLockCrypto(): LocalLockCrypto | null {
  const runtime = (globalThis as unknown as { crypto?: RuntimeCrypto }).crypto;
  if (!runtime?.subtle || typeof runtime.getRandomValues !== "function") return null;
  return {
    randomBytes(length) {
      const bytes = new Uint8Array(length);
      runtime.getRandomValues(bytes);
      return bytes;
    },
    async derivePin(pin, salt, iterations) {
      const key = await runtime.subtle.importKey(
        "raw",
        new TextEncoder().encode(pin),
        { name: "PBKDF2" },
        false,
        ["deriveBits"],
      );
      const bits = await runtime.subtle.deriveBits(
        {
          name: "PBKDF2",
          salt,
          iterations,
          hash: "SHA-256",
        },
        key,
        256,
      );
      return new Uint8Array(bits);
    },
  };
}

export function validateLocalPin(pin: string): string | null {
  if (!/^\d{6,12}$/.test(pin)) {
    return "Use a 6–12 digit PIN.";
  }
  return null;
}

export type LocalLockServiceOptions = {
  platform?: LocalLockPlatform;
  storage?: LocalLockStorage;
  crypto?: LocalLockCrypto | null;
  now?: () => number;
  maxAttempts?: number;
  cooldownMs?: number;
};

/**
 * Local-only PIN verifier service. It has no network imports or broker/action authority.
 * On native, no custom cryptography is assumed: the feature stays opt-in/off until a parent
 * deliberately supplies a vetted adapter (for example, after adding Expo Crypto).
 */
export class LocalLockService {
  private readonly platform: LocalLockPlatform;
  private readonly storage: LocalLockStorage;
  private readonly crypto: LocalLockCrypto | null;
  private readonly now: () => number;
  private readonly maxAttempts: number;
  private readonly cooldownMs: number;
  private readonly listeners = new Set<() => void>();

  constructor(options: LocalLockServiceOptions = {}) {
    this.platform = options.platform ?? detectedPlatform();
    this.storage =
      options.storage ??
      (this.platform === "web"
        ? createBrowserLocalLockStorage()
        : createNativeLocalLockStorage());
    this.crypto =
      options.crypto ??
      (this.platform === "web" ? createWebCryptoLocalLockCrypto() : null);
    this.now = options.now ?? Date.now;
    this.maxAttempts = Math.max(1, Math.floor(options.maxAttempts ?? LOCAL_LOCK_MAX_ATTEMPTS));
    this.cooldownMs = Math.max(1_000, Math.floor(options.cooldownMs ?? LOCAL_LOCK_COOLDOWN_MS));
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    this.listeners.forEach((listener) => listener());
  }

  private unavailable(message: string): LocalLockStatus {
    return {
      platform: this.platform,
      isSupported: false,
      enabled: false,
      storageLabel: this.platform === "web" ? "browser localStorage" : "SecureStore",
      message,
      privacyNotice: this.platform === "web" ? webPrivacyNotice : nativePrivacyNotice,
    };
  }

  private async readRecord(): Promise<StoredLockRecord | null> {
    return parseRecord(await this.storage.getItem(LOCAL_LOCK_STORAGE_KEY));
  }

  private async writeRecord(record: StoredLockRecord): Promise<void> {
    await this.storage.setItem(LOCAL_LOCK_STORAGE_KEY, JSON.stringify(record));
  }

  async getStatus(): Promise<LocalLockStatus> {
    if (!this.crypto) {
      return this.unavailable(
        this.platform === "native"
          ? "Custom PIN cryptography is not included in this native build, so local app lock stays off."
          : "WebCrypto is unavailable in this browser, so local app lock stays off.",
      );
    }
    try {
      const record = await this.readRecord();
      return {
        platform: this.platform,
        isSupported: true,
        enabled: Boolean(record),
        storageLabel: this.platform === "web" ? "browser localStorage" : "SecureStore",
        message: record
          ? "Local PIN protection is on."
          : "Local PIN protection is off until you explicitly enable and confirm a PIN.",
        privacyNotice: this.platform === "web" ? webPrivacyNotice : nativePrivacyNotice,
      };
    } catch {
      return this.unavailable(
        "Private device storage is unavailable, so local app lock stays off.",
      );
    }
  }

  private async requireSupported(): Promise<void> {
    const status = await this.getStatus();
    if (!status.isSupported) throw new LocalLockCapabilityError(status.message);
  }

  async configurePin(pin: string): Promise<void> {
    const validation = validateLocalPin(pin);
    if (validation) throw new Error(validation);
    await this.requireSupported();
    const crypto = this.crypto!;
    const salt = crypto.randomBytes(16);
    const verifier = await crypto.derivePin(pin, salt, LOCAL_LOCK_PBKDF2_ITERATIONS);
    await this.writeRecord({
      version: 1,
      salt: bytesToHex(salt),
      verifier: bytesToHex(verifier),
      iterations: LOCAL_LOCK_PBKDF2_ITERATIONS,
      failedAttempts: 0,
      cooldownUntil: null,
    });
    this.notify();
  }

  async verifyPin(pin: string): Promise<LocalLockVerification> {
    const validation = validateLocalPin(pin);
    if (validation) return { state: "invalid-pin", message: validation };
    const status = await this.getStatus();
    if (!status.isSupported) return { state: "unavailable", message: status.message };
    const record = await this.readRecord();
    if (!record) return { state: "disabled" };

    const now = this.now();
    if (record.cooldownUntil && record.cooldownUntil > now) {
      return { state: "cooldown", retryAfterMs: record.cooldownUntil - now };
    }

    const salt = hexToBytes(record.salt);
    if (!salt) return { state: "disabled" };
    const candidate = bytesToHex(
      await this.crypto!.derivePin(pin, salt, record.iterations),
    );
    if (equalHex(candidate, record.verifier)) {
      if (record.failedAttempts || record.cooldownUntil) {
        await this.writeRecord({ ...record, failedAttempts: 0, cooldownUntil: null });
      }
      return { state: "unlocked" };
    }

    const failedAttempts = record.failedAttempts + 1;
    if (failedAttempts >= this.maxAttempts) {
      const cooldownUntil = now + this.cooldownMs;
      await this.writeRecord({
        ...record,
        failedAttempts: this.maxAttempts,
        cooldownUntil,
      });
      return { state: "cooldown", retryAfterMs: this.cooldownMs };
    }
    await this.writeRecord({ ...record, failedAttempts, cooldownUntil: null });
    return { state: "wrong-pin", attemptsRemaining: this.maxAttempts - failedAttempts };
  }

  async getCooldownUntil(): Promise<number | null> {
    const status = await this.getStatus();
    if (!status.isSupported) return null;
    const record = await this.readRecord();
    const cooldownUntil = record?.cooldownUntil ?? null;
    return cooldownUntil && cooldownUntil > this.now() ? cooldownUntil : null;
  }

  /** Removes only the PIN verifier after caller-confirmed sign-out/re-authentication. */
  async resetAfterReauthentication(): Promise<void> {
    await this.storage.removeItem(LOCAL_LOCK_STORAGE_KEY);
    this.notify();
  }

  /** Turns the optional local lock off. It never touches workspace, screenshots, or server data. */
  async disable(): Promise<void> {
    await this.resetAfterReauthentication();
  }
}

/** Shared default for parent components that do not inject a service. */
export const localLock = new LocalLockService();
