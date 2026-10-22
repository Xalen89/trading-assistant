import express, { type Express } from "express";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

export interface WebRelease {
  app: "Zax";
  schemaVersion: 1;
  sourceFingerprint: string;
}

export function readWebRelease(directory: string): WebRelease {
  const value = JSON.parse(
    readFileSync(resolve(directory, "zax-release.json"), "utf8"),
  ) as Partial<WebRelease>;
  if (
    value.app !== "Zax" ||
    value.schemaVersion !== 1 ||
    !/^sha256:[a-f0-9]{64}$/.test(value.sourceFingerprint ?? "")
  ) {
    throw new Error("The web release manifest is invalid");
  }
  return value as WebRelease;
}

/** The public shell still requires the existing server-verified owner gate for data/actions. */
export function registerWebApp(
  app: Express,
  directory = resolve(process.cwd(), "web-dist"),
): void {
  if (!existsSync(resolve(directory, "index.html"))) {
    throw new Error("The production web app is missing");
  }
  const release = readWebRelease(directory);
  app.get("/api/release", (_req, res) => {
    res.setHeader("Cache-Control", "private, no-store");
    res.json(release);
  });
  // API errors are never replaced by a successful page response.
  app.use("/api", (_req, res) => {
    res.status(404).json({ error: "not_found" });
  });
  app.use(
    express.static(directory, {
      index: "index.html",
      extensions: ["html"],
      dotfiles: "deny",
      etag: false,
      cacheControl: false,
      setHeaders: (res) => res.setHeader("Cache-Control", "private, no-store"),
    }),
  );
  // Missing assets and routes remain honest errors rather than index.html with HTTP 200.
  app.use((_req, res) => {
    res.status(404).type("text/plain").send("Not found");
  });
}
