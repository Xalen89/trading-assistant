import { describe, expect, it, vi } from "vitest";
import type { Request } from "express";
import { assertScenarioCredentialRequest } from "../../server/trading/scenario-provider-security";
const mocks = vi.hoisted(() => ({ verify: vi.fn() }));
vi.mock("../../server/_core/sdk", () => ({
  sdk: { verifySession: mocks.verify },
}));
vi.mock("../../server/_core/cors", () => ({
  isAllowedCorsOrigin: (origin: string) =>
    [
      "https://private-fixture.example",
      "http://localhost:8081",
      "http://insecure-fixture.example",
    ].includes(origin),
  isLoopbackApiHost: (h: string) =>
    ["localhost", "127.0.0.1", "::1"].includes(h),
}));
function request(
  headers: Record<string, string>,
  hostname = "private-api.example",
  method = "POST",
  secure = false,
) {
  return {
    headers,
    hostname,
    method,
    secure,
    socket: {
      remoteAddress: hostname === "localhost" ? "127.0.0.1" : "203.0.113.17",
    },
  } as unknown as Request;
}
describe("credential submission boundary", () => {
  it("allows the exact secure authenticated app origin", async () => {
    await expect(
      assertScenarioCredentialRequest(
        request({ origin: "https://private-fixture.example" }),
        "fixture-owner",
      ),
    ).resolves.toBeUndefined();
  });
  it("rejects foreign/missing origins, insecure remote origins and non-POST mutations", async () => {
    for (const req of [
      request({ origin: "https://attacker.example" }),
      request({}),
      request({ origin: "http://insecure-fixture.example" }),
      request(
        { origin: "https://private-fixture.example" },
        "private-api.example",
        "GET",
      ),
    ])
      await expect(
        assertScenarioCredentialRequest(req, "fixture-owner"),
      ).rejects.toThrow("authenticated secure app session");
  });
  it("allows local HTTP only when both ends are local", async () => {
    await expect(
      assertScenarioCredentialRequest(
        request({ origin: "http://localhost:8081" }, "localhost"),
        "fixture-owner",
      ),
    ).resolves.toBeUndefined();
    await expect(
      assertScenarioCredentialRequest(
        request({ origin: "http://localhost:8081" }),
        "fixture-owner",
      ),
    ).rejects.toThrow();
  });
  it("verifies native bearer ownership and secure transport rather than trusting a cookie alone", async () => {
    mocks.verify.mockResolvedValue({
      openId: "fixture-owner",
      appId: "fixture-app",
    });
    await expect(
      assertScenarioCredentialRequest(
        request(
          {
            authorization: "Bearer synthetic-session",
            "x-forwarded-proto": "https",
          },
          "private-api.example",
          "POST",
          true,
        ),
        "fixture-owner",
      ),
    ).resolves.toBeUndefined();
    await expect(
      assertScenarioCredentialRequest(
        request({ authorization: "Bearer synthetic-session" }),
        "fixture-owner",
      ),
    ).rejects.toThrow();
    mocks.verify.mockResolvedValue({
      openId: "different-owner",
      appId: "fixture-app",
    });
    await expect(
      assertScenarioCredentialRequest(
        request({
          authorization: "Bearer synthetic-session",
          "x-forwarded-proto": "https",
        }),
        "fixture-owner",
      ),
    ).rejects.toThrow();
    mocks.verify.mockResolvedValue(null);
    await expect(
      assertScenarioCredentialRequest(
        request({
          authorization: "Bearer synthetic-session",
          "x-forwarded-proto": "https",
        }),
        "fixture-owner",
      ),
    ).rejects.toThrow();
    mocks.verify.mockResolvedValue({
      openId: "fixture-owner",
      appId: "fixture-app",
    });
    await expect(
      assertScenarioCredentialRequest(
        request({
          authorization: "Bearer synthetic-session",
          "x-forwarded-proto": "https",
        }),
        "fixture-owner",
      ),
    ).rejects.toThrow();
    expect(mocks.verify).toHaveBeenCalledWith("synthetic-session");
  });
});
