import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import { GET, POST } from "../web/src/app/api/[...path]/route";

const originalFetch = globalThis.fetch;
const originalEnv = { ...process.env };

beforeEach(() => {
  delete process.env.APP_PASSWORD;
  delete process.env.API_TOKEN;
  delete process.env.API_URL;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  for (const key of ["APP_PASSWORD", "API_TOKEN", "API_URL"]) {
    if (originalEnv[key] === undefined) delete process.env[key];
    else process.env[key] = originalEnv[key];
  }
});

function request(path: string, init?: RequestInit) {
  const req = new Request(`http://localhost:3000/api/${path}`, init);
  return Object.assign(req, { nextUrl: new URL(req.url) }) as Parameters<typeof GET>[0];
}

const context = (path: string) => ({ params: Promise.resolve({ path: path.split("/") }) });

test("proxy only exposes explicitly allowed endpoints", async () => {
  globalThis.fetch = () => { throw new Error("Must not forward"); };
  assert.equal((await GET(request("private"), context("private"))).status, 404);
  assert.equal((await GET(request("trades/private"), context("trades/private"))).status, 404);
});

test("proxy rejects cross-origin and non-JSON mutations", async () => {
  globalThis.fetch = () => { throw new Error("Must not forward"); };
  assert.equal((await POST(request("analyze", {
    method: "POST", headers: { origin: "https://other.example", "content-type": "application/json" },
    body: "{}",
  }), context("analyze"))).status, 403);
  assert.equal((await POST(request("analyze", { method: "POST", body: "{}" }), context("analyze"))).status, 415);
});

test("proxy enforces configured password", async () => {
  process.env.APP_PASSWORD = "test-only-password";
  assert.equal((await GET(request("trades"), context("trades"))).status, 401);
  const malformed = "Basic " + Buffer.from("test-only-password").toString("base64");
  assert.equal((await GET(request("trades", { headers: { authorization: malformed } }), context("trades"))).status, 401);
  globalThis.fetch = async () => Response.json({ trades: [] });
  const authorization = "Basic " + Buffer.from("user:test-only-password").toString("base64");
  assert.equal((await GET(request("trades", { headers: { authorization } }), context("trades"))).status, 200);
});

test("proxy forwards credentials server-side without forwarding browser credentials", async () => {
  process.env.API_TOKEN = "test-only-token";
  globalThis.fetch = async (input, init) => {
    assert.equal(String(input), "http://127.0.0.1:4000/api/trades?instrument=NAS100");
    assert.equal(new Headers(init?.headers).get("authorization"), "Bearer " + process.env.API_TOKEN);
    assert.equal(init?.redirect, "error");
    return Response.json({ trades: [] });
  };
  const response = await GET(request("trades?instrument=NAS100"), context("trades"));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.deepEqual(await response.json(), { trades: [] });
});

test("proxy bounds mutation body size", async () => {
  globalThis.fetch = () => { throw new Error("Must not forward"); };
  const response = await POST(request("trades", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ notes: "x".repeat(65_536) }),
  }), context("trades"));
  assert.equal(response.status, 413);
});

test("proxy returns a sanitized unavailable error", async () => {
  globalThis.fetch = () => { throw new Error("sensitive upstream error"); };
  const response = await GET(request("health"), context("health"));
  assert.equal(response.status, 502);
  assert.doesNotMatch(await response.text(), /sensitive/);
});
