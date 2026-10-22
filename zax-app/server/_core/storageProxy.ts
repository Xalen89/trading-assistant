import type { Express } from "express";
import { ENV } from "./env";
import { sdk } from "./sdk";
import { mayUseApp } from "../trading/access";

export function registerStorageProxy(app: Express) {
  app.get("/manus-storage/*", async (req, res) => {
    res.set("Cache-Control", "private, no-store");
    let identity;
    try {
      identity = await sdk.authenticateRequest(req);
    } catch {
      res.status(401).send("Sign in to the private app.");
      return;
    }
    if (!mayUseApp(identity)) {
      res
        .status(403)
        .send("This private app is restricted to its approved owner.");
      return;
    }
    const key = (req.params as Record<string, string>)[0];
    if (!key) {
      res.status(400).send("Missing storage key");
      return;
    }

    if (!ENV.forgeApiUrl || !ENV.forgeApiKey) {
      res.status(500).send("Storage proxy not configured");
      return;
    }

    try {
      const forgeUrl = new URL(
        "v1/storage/presign/get",
        ENV.forgeApiUrl.replace(/\/+$/, "") + "/",
      );
      forgeUrl.searchParams.set("path", key);

      const forgeResp = await fetch(forgeUrl, {
        headers: { Authorization: `Bearer ${ENV.forgeApiKey}` },
      });

      if (!forgeResp.ok) {
        await forgeResp.body?.cancel().catch(() => undefined);
        console.error("[StorageProxy] forge request failed");
        res.status(502).send("Storage backend error");
        return;
      }

      const { url } = (await forgeResp.json()) as { url: string };
      if (!url) {
        res.status(502).send("Empty signed URL from backend");
        return;
      }

      res.set("Cache-Control", "private, no-store");
      res.redirect(307, url);
    } catch {
      console.error("[StorageProxy] failed");
      res.status(502).send("Storage proxy error");
    }
  });
}
