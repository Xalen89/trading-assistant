import "dotenv/config";
import express from "express";
import { createServer } from "http";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { registerStorageProxy } from "./storageProxy";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { createCorsMiddleware } from "./cors";
import { registerTradingScheduler } from "../trading/notifications";
import { registerWebApp } from "./web-app";

async function startServer() {
  const app = express();
  const server = createServer(app);

  // Only a loopback reverse proxy may supply forwarded protocol/host metadata.
  // Non-loopback native credential setup requires a real secure request and fails closed.
  app.set("trust proxy", "loopback");
  app.use(createCorsMiddleware());

  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));

  app.use("/api", (_req, res, next) => {
    res.setHeader("Cache-Control", "private, no-store");
    next();
  });
  registerStorageProxy(app);
  registerOAuthRoutes(app);
  registerTradingScheduler(app);

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, timestamp: Date.now() });
  });

  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    }),
  );

  if (process.env.NODE_ENV === "production") {
    registerWebApp(app);
  }

  const port = parseInt(process.env.PORT || "3000");
  server.listen(port, () => {
    console.log("[api] server listening");
  });
}

startServer().catch(() => {
  console.error("[api] server failed to start");
});
