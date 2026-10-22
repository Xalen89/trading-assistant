import { afterEach, describe, expect, it } from "vitest";
import express from "express";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer, type Server } from "node:http";
import { registerWebApp } from "../../server/_core/web-app";

const directories: string[] = [];
const servers: Server[] = [];
afterEach(async () => {
  for (const server of servers.splice(0)) {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});
function fixture() {
  const directory = mkdtempSync(join(tmpdir(), "zax-web-serving-"));
  directories.push(directory);
  writeFileSync(
    join(directory, "index.html"),
    "<!doctype html><html><body>Zax owner sign-in shell</body></html>",
  );
  writeFileSync(
    join(directory, "strategies.html"),
    "<!doctype html><html><body>Strategies</body></html>",
  );
  mkdirSync(join(directory, "assets"));
  writeFileSync(join(directory, "assets", "app.js"), "window.testApp=true;");
  writeFileSync(join(directory, ".env"), "TEST_PRIVATE_VALUE");
  const release = {
    app: "Zax",
    schemaVersion: 1,
    sourceFingerprint: "sha256:" + "a".repeat(64),
  };
  writeFileSync(join(directory, "zax-release.json"), JSON.stringify(release));
  return { directory, release };
}
async function serve(directory: string) {
  const app = express();
  app.get("/api/private", (_req, res) =>
    res.status(401).json({ error: "owner_required" }),
  );
  registerWebApp(app, directory);
  const server = createServer(app);
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("Missing local test listener");
  return `http://127.0.0.1:${address.port}`;
}
describe("shipped Expo web app", () => {
  it("serves the owner shell, exported route and matching public fingerprint", async () => {
    const f = fixture();
    const base = await serve(f.directory);
    const root = await fetch(base);
    expect(root.status).toBe(200);
    expect(root.headers.get("cache-control")).toBe("private, no-store");
    expect(await root.text()).toContain("Zax owner sign-in shell");
    expect((await fetch(base + "/strategies")).status).toBe(200);
    expect(await (await fetch(base + "/api/release")).json()).toEqual(
      f.release,
    );
    expect((await fetch(base + "/assets/app.js")).status).toBe(200);
  });
  it("does not turn missing API, assets, routes or dotfiles into successful pages", async () => {
    const base = await serve(fixture().directory);
    for (const path of [
      "/api/missing",
      "/assets/missing.js",
      "/missing",
      "/.env",
    ]) {
      const response = await fetch(base + path);
      expect(response.status).toBe(404);
      expect(await response.text()).not.toContain("TEST_PRIVATE_VALUE");
    }
    const denied = await fetch(base + "/api/private");
    expect(denied.status).toBe(401);
    expect(await denied.json()).toEqual({ error: "owner_required" });
  });
  it("fails startup rather than serving a healthy API-only release", () => {
    const f = fixture();
    rmSync(join(f.directory, "index.html"));
    expect(() => registerWebApp(express(), f.directory)).toThrow(
      "web app is missing",
    );
  });
  it("rejects a malformed release manifest", () => {
    const f = fixture();
    writeFileSync(
      join(f.directory, "zax-release.json"),
      JSON.stringify({ app: "Zax", sourceFingerprint: "wrong" }),
    );
    expect(() => registerWebApp(express(), f.directory)).toThrow(
      "manifest is invalid",
    );
  });
});
