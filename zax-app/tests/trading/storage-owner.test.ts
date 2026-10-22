import { beforeEach, describe, expect, it, vi } from "vitest";
const auth = vi.hoisted(() => ({ authenticateRequest: vi.fn() }));
vi.mock("../../server/_core/sdk", () => ({ sdk: auth }));
vi.mock("../../server/_core/env", () => ({
  ENV: {
    forgeApiUrl: "https://storage.example/",
    forgeApiKey: "unit-only-key",
  },
}));
vi.mock("../../server/trading/access", () => ({
  mayUseApp: (identity: { openId?: string }) =>
    identity?.openId === "unit_owner",
}));
import { registerStorageProxy } from "../../server/_core/storageProxy";

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", vi.fn());
});
function handlerAndResponse() {
  let handler: (req: any, res: any) => Promise<void>;
  registerStorageProxy({
    get: (_path: string, route: any) => {
      handler = route;
    },
  } as any);
  const res: any = {
    set: vi.fn(),
    status: vi.fn(),
    send: vi.fn(),
    redirect: vi.fn(),
  };
  res.status.mockReturnValue(res);
  return {
    handler: handler!,
    res,
    req: { params: { 0: "private-sources/fixture.enc" } },
  };
}
describe("private storage redirect", () => {
  it("rejects guests before any storage credential is used", async () => {
    auth.authenticateRequest.mockRejectedValueOnce(
      new Error("unauthenticated"),
    );
    const { handler, req, res } = handlerAndResponse();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(fetch).not.toHaveBeenCalled();
    expect(res.redirect).not.toHaveBeenCalled();
  });
  it("rejects another signed identity before presigning", async () => {
    auth.authenticateRequest.mockResolvedValueOnce({ openId: "unit_other" });
    const { handler, req, res } = handlerAndResponse();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(fetch).not.toHaveBeenCalled();
  });
  it("allows only the verified owner and disables response caching", async () => {
    auth.authenticateRequest.mockResolvedValueOnce({ openId: "unit_owner" });
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ url: "https://assets.example/unit-signed" }),
    } as Response);
    const { handler, req, res } = handlerAndResponse();
    await handler(req, res);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(res.set).toHaveBeenCalledWith("Cache-Control", "private, no-store");
    expect(res.redirect).toHaveBeenCalledWith(
      307,
      "https://assets.example/unit-signed",
    );
  });
});
