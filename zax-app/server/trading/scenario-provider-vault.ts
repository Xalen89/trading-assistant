import {
  createCipheriv,
  createDecipheriv,
  hkdfSync,
  randomBytes,
} from "node:crypto";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { ENV } from "../_core/env";
import { tradingRuntimeState } from "../../drizzle/schema";
import { dbRequired } from "./repository";

const KIND = "scenario-openai-vault";
const envelopeSchema = z
  .object({
    version: z.literal(1),
    ciphertext: z.string().min(1).max(4096),
    iv: z.string().length(16),
    tag: z.string().length(24),
    savedAt: z.number().int().positive(),
    models: z
      .array(z.enum(["gpt-5-mini", "gpt-5"]))
      .min(1)
      .max(2)
      .refine((models) => new Set(models).size === models.length),
  })
  .strict();
export type ScenarioKeyEnvelope = z.infer<typeof envelopeSchema>;
export type ScenarioProviderStatus = {
  configured: boolean;
  vaultAvailable: boolean;
  models: string[];
  savedAt?: number;
};
export const scenarioApiKeySchema = z
  .string()
  .trim()
  .min(32)
  .max(1024)
  .regex(
    /^sk-[A-Za-z0-9_-]+$/,
    "Enter an actual OpenAI API key, not a setting name.",
  );

function checkedOwner(userId: number) {
  if (!Number.isSafeInteger(userId) || userId <= 0)
    throw new Error("Verified owner required.");
  return userId;
}
function foundation(userId: number, secret: string, appId: string) {
  checkedOwner(userId);
  if (!secret || !appId)
    throw new Error("Private credential encryption is unavailable.");
  const aad = Buffer.from(`${appId}:${userId}:${KIND}:v1`);
  const key = Buffer.from(
    hkdfSync(
      "sha256",
      Buffer.from(secret),
      Buffer.from(appId),
      Buffer.from("zax-scenario-openai-key-v1"),
      32,
    ),
  );
  return { key, aad };
}
export function scenarioVaultAvailable() {
  return Boolean(ENV.cookieSecret && ENV.appId);
}

function authenticatedMetadata(aad: Buffer, savedAt: number, models: string[]) {
  return Buffer.concat([aad, Buffer.from(JSON.stringify({ savedAt, models }))]);
}

/** Separate cryptographic purpose and authenticated app/owner binding; never stored as plaintext. */
export function sealScenarioKey(
  userId: number,
  apiKey: string,
  models: string[],
  secret = ENV.cookieSecret,
  appId = ENV.appId,
  now = Date.now(),
): ScenarioKeyEnvelope {
  const clean = scenarioApiKeySchema.parse(apiKey);
  const { key, aad } = foundation(userId, secret, appId);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(authenticatedMetadata(aad, now, models));
  const ciphertext = Buffer.concat([
    cipher.update(clean, "utf8"),
    cipher.final(),
  ]);
  return envelopeSchema.parse({
    version: 1,
    ciphertext: ciphertext.toString("base64"),
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
    savedAt: now,
    models,
  });
}
export function openScenarioKey(
  userId: number,
  payload: unknown,
  secret = ENV.cookieSecret,
  appId = ENV.appId,
) {
  try {
    const envelope = envelopeSchema.parse(payload);
    const { key, aad } = foundation(userId, secret, appId);
    const iv = Buffer.from(envelope.iv, "base64"),
      tag = Buffer.from(envelope.tag, "base64");
    if (iv.length !== 12 || tag.length !== 16) throw new Error();
    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAAD(
      authenticatedMetadata(aad, envelope.savedAt, envelope.models),
    );
    decipher.setAuthTag(tag);
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(envelope.ciphertext, "base64")),
      decipher.final(),
    ]);
    try {
      return {
        apiKey: scenarioApiKeySchema.parse(plaintext.toString("utf8")),
        envelope,
      };
    } finally {
      plaintext.fill(0);
    }
  } catch {
    // Never propagate Crypto/Zod diagnostics or a payload to a client.
    throw new Error(
      "Saved OpenAI connection cannot be decrypted. Reconnect it in the private app.",
    );
  }
}
function rowId(userId: number) {
  return `${KIND}:${checkedOwner(userId)}`;
}
async function findEnvelope(userId: number): Promise<unknown | undefined> {
  const db = await dbRequired();
  const [row] = await db
    .select({ payload: tradingRuntimeState.payload })
    .from(tradingRuntimeState)
    .where(
      and(
        eq(tradingRuntimeState.id, rowId(userId)),
        eq(tradingRuntimeState.userId, userId),
        eq(tradingRuntimeState.kind, KIND),
      ),
    )
    .limit(1);
  return row?.payload;
}
export async function getScenarioProviderStatus(
  userId: number,
): Promise<ScenarioProviderStatus> {
  const payload = await findEnvelope(userId);
  if (!payload)
    return {
      configured: false,
      vaultAvailable: scenarioVaultAvailable(),
      models: [],
    };
  // Readiness must include authentic decryption, but no key or ciphertext escapes this function.
  const { envelope } = openScenarioKey(userId, payload);
  return {
    configured: true,
    vaultAvailable: true,
    models: [...envelope.models],
    savedAt: envelope.savedAt,
  };
}
export async function loadScenarioProviderKey(userId: number) {
  const payload = await findEnvelope(userId);
  return payload ? openScenarioKey(userId, payload).apiKey : undefined;
}
export async function saveScenarioProviderKey(
  userId: number,
  apiKey: string,
  models: string[],
): Promise<ScenarioProviderStatus> {
  // Only caller-verified models may reach this method. Router validates before any write.
  const payload = sealScenarioKey(userId, apiKey, models);
  const db = await dbRequired();
  await db
    .insert(tradingRuntimeState)
    .values({ id: rowId(userId), userId, kind: KIND, payload })
    .onDuplicateKeyUpdate({ set: { payload } });
  return {
    configured: true,
    vaultAvailable: true,
    models: [...payload.models],
    savedAt: payload.savedAt,
  };
}
export async function disconnectScenarioProvider(
  userId: number,
): Promise<ScenarioProviderStatus> {
  const db = await dbRequired();
  await db
    .delete(tradingRuntimeState)
    .where(
      and(
        eq(tradingRuntimeState.id, rowId(userId)),
        eq(tradingRuntimeState.userId, userId),
        eq(tradingRuntimeState.kind, KIND),
      ),
    );
  return {
    configured: false,
    vaultAvailable: scenarioVaultAvailable(),
    models: [],
  };
}
