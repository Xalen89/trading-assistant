import { describe, it, expect } from "vitest";
import { appRouter } from "../../server/routers";
import { encryptFile, decryptFile } from "../../server/trading/repository";
import { sdk } from "../../server/_core/sdk";
import { initialWorkspace } from "../../lib/trading/model";
const anonymous = appRouter.createCaller({
  req: { headers: {} } as any,
  res: {} as any,
  user: null,
});
describe("private trading APIs", () => {
  it("rejects unauthenticated workspace loading and saving", async () => {
    await expect(anonymous.workspace.load()).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
    await expect(
      anonymous.workspace.save({ workspace: initialWorkspace(), revision: 0 }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
  it("retires raw source reads and rejects unauthenticated scans", async () => {
    expect("source" in anonymous.learning).toBe(false);
    await expect(anonymous.notifications.scan()).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });
  it("rejects unauthenticated reference history and alert evidence reads", async () => {
    await expect(
      anonymous.learning.versions({ id: "test" }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(
      anonymous.notifications.event({ id: "test" }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
  it("round-trips encrypted sources without public plaintext bytes", () => {
    const plain = Buffer.from("Private trading rules");
    const sealed = encryptFile(plain);
    expect(sealed.includes(plain)).toBe(false);
    expect(decryptFile(sealed)).toEqual(plain);
  });
  it("rejects source tampering", () => {
    const sealed = encryptFile(Buffer.from("private"));
    sealed[sealed.length - 1] ^= 1;
    expect(() => decryptFile(sealed)).toThrow();
  });
  it("rejects a signed session for another application", async () => {
    const signed = await sdk.signSession({
      openId: "unit-test-only",
      name: "Unit fixture",
      appId: "different-project",
    });
    expect(await sdk.verifySession(signed)).toBeNull();
  });
  it("parses structured OAuth state and never interprets arbitrary state as a redirect", () => {
    const state = sdk.createOAuthState({
      redirectUri: "manus239962161970181:///oauth/callback",
      nonce: "12345678901234567890123456789012",
    });
    expect(sdk.parseOAuthState(state).nonce).toHaveLength(32);
    expect(() => sdk.parseOAuthState("malformed")).toThrow();
  });
});
