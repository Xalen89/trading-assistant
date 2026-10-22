import { afterEach, describe, expect, it, vi } from "vitest";
import type { Request, Response } from "express";
import { initialWorkspace } from "../lib/trading/model";
import {
  PORTABLE_IMPORT_CONFIRMATION,
  applyPortableImport,
  createPortableExport,
  createStoredZip,
  parseStoredZip,
  previewPortableImport,
} from "../lib/trading/workspace-portability";

vi.mock("../server/db", () => ({
  getUserByOpenId: vi.fn(),
  upsertUser: vi.fn(),
}));

vi.mock("../server/_core/sdk", () => ({
  sdk: { verifySession: vi.fn() },
}));

import { createLogoutHandler } from "../server/_core/oauth";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function workspaceWithArmedAutomaticPaper() {
  const workspace = initialWorkspace();
  const strategyId = workspace.strategies[0]!.id;
  return {
    ...workspace,
    alerts: [
      {
        id: "portable-alert",
        name: "Imported enabled alert",
        market: "BTC-USD",
        timeframe: "5m" as const,
        strategyId,
        kind: "above" as const,
        price: 100,
        enabled: true,
        cooldownMinutes: 5,
        createdAt: 1,
      },
    ],
    settings: {
      ...workspace.settings,
      orbAutoPaper: {
        version: 1 as const,
        enabled: true,
        strategyId,
        market: "NQ" as const,
        riskPct: 1 as const,
        maxTradesPerDay: 1 as const,
        armedAt: 1,
        expiresAt: 86_400_001,
      },
      sessionAutoPaper: {
        version: 1 as const,
        enabled: true,
        strategyId,
        market: "NQ",
        riskPct: 1 as const,
        maxTradesPerDay: 1 as const,
        runWhenClosed: true,
        armedAt: 1,
        expiresAt: 86_400_001,
      },
    },
  };
}

function archiveWithForgedAutomaticPaperSettings(
  workspace: ReturnType<typeof workspaceWithArmedAutomaticPaper>,
) {
  const exported = createPortableExport(workspace, Date.UTC(2026, 0, 2));
  const files = parseStoredZip(exported.bytes);
  const workspaceFile = JSON.parse(
    decoder.decode(files.get("workspace.json")!),
  ) as { workspace: { settings: unknown } };
  workspaceFile.workspace.settings = workspace.settings;

  return createStoredZip(
    [...files.entries()].map(([path, data]) => ({
      path,
      data:
        path === "workspace.json"
          ? encoder.encode(JSON.stringify(workspaceFile))
          : data,
    })),
  );
}

type MockResponse = {
  response: Response;
  status: ReturnType<typeof vi.fn>;
  json: ReturnType<typeof vi.fn>;
  clearCookie: ReturnType<typeof vi.fn>;
};

function mockResponse(): MockResponse {
  const status = vi.fn();
  const json = vi.fn();
  const clearCookie = vi.fn();
  const response = { status, json, clearCookie } as unknown as Response;
  status.mockReturnValue(response);
  return { response, status, json, clearCookie };
}

function mockRequest(headers: Record<string, string>): Request {
  return {
    headers,
    hostname: "3000-sandbox.example.test",
    protocol: "https",
  } as unknown as Request;
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("audit 09 portable automatic-paper boundary", () => {
  it("removes armed consent on export, preview, and final application while preserving alert default-off", () => {
    const workspace = workspaceWithArmedAutomaticPaper();
    const exported = createPortableExport(workspace, Date.UTC(2026, 0, 2));
    const exportedText = decoder.decode(exported.bytes);

    expect(exportedText).not.toContain('"orbAutoPaper"');
    expect(exportedText).not.toContain('"sessionAutoPaper"');
    expect(exportedText).not.toContain('"armedAt"');
    expect(exportedText).not.toContain('"expiresAt"');
    expect(exportedText).not.toContain('"runWhenClosed"');

    const preview = previewPortableImport(
      archiveWithForgedAutomaticPaperSettings(workspace),
    );
    expect(preview.settings).not.toHaveProperty("orbAutoPaper");
    expect(preview.settings).not.toHaveProperty("sessionAutoPaper");
    expect(preview.alerts).toEqual([
      expect.objectContaining({ id: "portable-alert", enabled: false }),
    ]);

    const applied = applyPortableImport(
      initialWorkspace(),
      preview,
      PORTABLE_IMPORT_CONFIRMATION,
    );
    expect(applied.settings).not.toHaveProperty("orbAutoPaper");
    expect(applied.settings).not.toHaveProperty("sessionAutoPaper");

    const forgedPreview = { ...preview, settings: workspace.settings };
    const appliedForgedPreview = applyPortableImport(
      initialWorkspace(),
      forgedPreview,
      PORTABLE_IMPORT_CONFIRMATION,
    );
    expect(appliedForgedPreview.settings).not.toHaveProperty("orbAutoPaper");
    expect(appliedForgedPreview.settings).not.toHaveProperty(
      "sessionAutoPaper",
    );
  });
});

describe("audit 09 cookie logout authorization", () => {
  it("rejects a cross-site form, accepts an allowlisted web origin, and accepts only a verified native bearer without Origin", async () => {
    vi.stubEnv("EXPO_WEB_PREVIEW_URL", "https://8328-sandbox.example.test");
    vi.stubEnv("EXPO_PACKAGER_PROXY_URL", "");

    const rejectedVerify = vi.fn(async () => ({
      openId: "never-used",
      appId: "app",
      name: "",
    }));
    const rejected = mockResponse();
    await createLogoutHandler(rejectedVerify)(
      mockRequest({
        origin: "https://attacker.example.test",
        cookie: "app_session=browser-cookie",
        "content-type": "application/x-www-form-urlencoded",
      }),
      rejected.response,
    );
    expect(rejected.status).toHaveBeenCalledWith(403);
    expect(rejected.clearCookie).not.toHaveBeenCalled();
    expect(rejectedVerify).not.toHaveBeenCalled();

    const webVerify = vi.fn();
    const web = mockResponse();
    await createLogoutHandler(webVerify)(
      mockRequest({ origin: "https://8328-sandbox.example.test" }),
      web.response,
    );
    expect(web.status).not.toHaveBeenCalled();
    expect(webVerify).not.toHaveBeenCalled();
    expect(web.clearCookie).toHaveBeenCalledWith(
      expect.stringMatching(/^__Host-manus_session_/),
      expect.objectContaining({
        httpOnly: true,
        maxAge: -1,
        sameSite: "none",
        secure: true,
      }),
    );
    expect(web.json).toHaveBeenCalledWith({ success: true });

    const nativeVerify = vi.fn(async (token: string) => ({
      openId: "native-owner",
      appId: "app",
      name: token,
    }));
    const native = mockResponse();
    await createLogoutHandler(nativeVerify)(
      mockRequest({ authorization: "Bearer native-session-token" }),
      native.response,
    );
    expect(nativeVerify).toHaveBeenCalledWith("native-session-token");
    expect(native.clearCookie).toHaveBeenCalledTimes(1);
    expect(native.json).toHaveBeenCalledWith({ success: true });

    const invalidNative = mockResponse();
    await createLogoutHandler(vi.fn(async () => null))(
      mockRequest({ authorization: "Bearer invalid-session" }),
      invalidNative.response,
    );
    expect(invalidNative.status).toHaveBeenCalledWith(401);
    expect(invalidNative.clearCookie).not.toHaveBeenCalled();
  });
});
