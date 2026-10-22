import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveApiOrigin } from "../../lib/_core/api-origin";
import { trustedExpoWebOrigins } from "../../server/_core/cors";

afterEach(() => vi.unstubAllEnvs());
describe("private publication addressing", () => {
  const oldPreview = "https://3000-old-sandbox.manus.computer/";
  it("uses relative published web API paths rather than stale Preview config", () => {
    expect(
      resolveApiOrigin(
        "web",
        {
          protocol: "https:",
          hostname: "stratdesk.manus.space",
          origin: "https://stratdesk.manus.space",
        },
        oldPreview,
      ),
    ).toBe("");
  });
  it("preserves the native configured API URL", () => {
    expect(
      resolveApiOrigin("ios", undefined, "https://stratdesk.manus.space/"),
    ).toBe("https://stratdesk.manus.space");
  });
  it("maps both exact Cloud Mobile frontend hosts to their paired API", () => {
    expect(
      resolveApiOrigin(
        "web",
        {
          protocol: "https:",
          hostname: "8081-abcdef.us1.manus.computer",
          origin: "https://8081-abcdef.us1.manus.computer",
        },
        oldPreview,
      ),
    ).toBe("https://3000-abcdef.us1.manus.computer");
    expect(
      resolveApiOrigin(
        "web",
        {
          protocol: "https:",
          hostname: "8328-abcdef.us1.manus.computer",
          origin: "https://8328-abcdef.us1.manus.computer",
        },
        oldPreview,
      ),
    ).toBe("https://3000-abcdef.us1.manus.computer");
    expect(
      resolveApiOrigin(
        "web",
        {
          protocol: "https:",
          hostname: "8081-fake.example.com",
          origin: "https://8081-fake.example.com",
        },
        oldPreview,
      ),
    ).toBe("");
  });
  it("uses the screenshot's frontend host pattern without a stale configured API", () => {
    const hostname = "8328-current-session.us1.manus.computer";
    const api = resolveApiOrigin(
      "web",
      { protocol: "https:", hostname, origin: `https://${hostname}` },
      oldPreview,
    );
    const login = new URL("/api/oauth/start", api);
    login.searchParams.set("origin", `https://${hostname}`);
    expect(login.hostname).toBe("3000-current-session.us1.manus.computer");
    expect(login.searchParams.get("origin")).toBe(`https://${hostname}`);
  });
  it("does not rewrite lookalike domains or an arbitrary permanent app host", () => {
    for (const hostname of [
      "8328-fake.example.com",
      "8328-abc.us1.manus.computer.attacker.example",
      "private-app.manus.space",
    ]) {
      expect(
        resolveApiOrigin(
          "web",
          { protocol: "https:", hostname, origin: `https://${hostname}` },
          oldPreview,
        ),
      ).toBe("");
    }
  });
  it("accepts an exact configured HTTPS publication origin only", () => {
    vi.stubEnv("STRATDESK_APP_ORIGIN", "https://private-app.manus.space/");
    expect(trustedExpoWebOrigins().has("https://private-app.manus.space")).toBe(
      true,
    );
    expect(trustedExpoWebOrigins().has("https://attacker.example")).toBe(false);
    vi.stubEnv(
      "STRATDESK_APP_ORIGIN",
      "https://user:password@private-app.manus.space/",
    );
    expect(trustedExpoWebOrigins().has("https://private-app.manus.space")).toBe(
      false,
    );
  });
});
