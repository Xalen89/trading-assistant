import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { User } from "../drizzle/schema";
import { quantRequestSchema } from "../server/trading/quant-request";
import { runQuantResearch } from "../server/trading/quant-service";
import { closeVenueStreams } from "../server/trading/venue-depth";

/**
 * Temporary browser-fixture server only. It is intentionally separate from the
 * Expo/API listeners and must be started explicitly after script review.
 *
 * POST /fixture-api/quant/run:
 * - parses the same production quantRequestSchema;
 * - permits only public Coinbase BTC-USD / ETH-USD requests;
 * - rejects imports, broker symbols, keys, sessions and all writes;
 * - calls the same production runQuantResearch implementation.
 */
const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const projectDirectory = resolve(scriptDirectory, "..");
const fixtureHtml = resolve(
  projectDirectory,
  "artifacts/quant-workbench-fixture/quant-workbench.html",
);
const port = Number(process.env.QUANT_FIXTURE_PORT || 8767);
const allowedSymbols = new Set(["BTC-USD", "ETH-USD"]);
const MAX_BODY_BYTES = 32 * 1024;

// Type compatibility only. This has no session, account, token, database lookup,
// broker credentials, or owner authorization. The allowed symbols never invoke
// the broker branch of quantHistory.
const uiFixtureIdentity: User = {
  id: 99999,
  openId: "fixture-noowner",
  name: "UI fixture — not a real owner",
  email: null,
  loginMethod: null,
  role: "user",
  createdAt: new Date(0),
  updatedAt: new Date(0),
  lastSignedIn: new Date(0),
};

type JsonObject = Record<string, unknown>;

function json(response: ServerResponse, status: number, body: JsonObject) {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
  });
  response.end(JSON.stringify(body));
}

function text(response: ServerResponse, status: number, body: string) {
  response.writeHead(status, {
    "content-type": "text/html; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
  });
  response.end(body);
}

async function bodyJson(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let received = 0;
  for await (const chunk of request) {
    const value = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    received += value.length;
    if (received > MAX_BODY_BYTES) throw new Error("Fixture request body exceeds 32 KiB.");
    chunks.push(value);
  }
  if (!received) throw new Error("Fixture request body is required.");
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new Error("Fixture request must be valid JSON.");
  }
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Fixture service could not complete the read-only research request.";
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url || "/", "http://fixture.local");
  if (request.method === "GET" && url.pathname === "/healthz") {
    return json(response, 200, {
      ok: true,
      scope: "temporary quant browser fixture; no accounts, DB writes, imports, or broker access",
    });
  }

  if (request.method === "GET" && url.pathname === "/quant-workbench.html") {
    try {
      return text(response, 200, await readFile(fixtureHtml, "utf8"));
    } catch {
      return text(
        response,
        503,
        "<!doctype html><title>Fixture not built</title><p>Run <code>node scripts/check-quant-workbench-browser.mjs</code> from the project root before opening this fixture.</p>",
      );
    }
  }

  if (request.method === "POST" && url.pathname === "/fixture-api/quant/run") {
    try {
      const parsed = quantRequestSchema.parse(await bodyJson(request));
      if (parsed.imports?.length) {
        return json(response, 400, {
          error: "This browser fixture rejects imports. It can use only current public Coinbase data.",
        });
      }
      if (parsed.symbols.some((symbol) => !allowedSymbols.has(symbol))) {
        return json(response, 400, {
          error: "This browser fixture permits only BTC-USD and ETH-USD public Coinbase symbols.",
        });
      }
      // The production service fetches data and computes the actual result. The router
      // (and its persistence/owner scope) is intentionally not called by this fixture.
      const result = await runQuantResearch(parsed, uiFixtureIdentity);
      return json(response, 200, result);
    } catch (error) {
      return json(response, 400, { error: errorMessage(error) });
    }
  }

  return json(response, 404, { error: "Fixture route not found." });
});

server.listen(port, "0.0.0.0", () => {
  console.log(`Quant Workbench fixture server listening at http://0.0.0.0:${port}/quant-workbench.html`);
  console.log("Scope: schema-parsed production runQuantResearch; public Coinbase BTC-USD/ETH-USD only; no imports, broker keys, sessions, DB, or writes.");
});

function stop(signal: string) {
  console.log(`Received ${signal}; closing temporary Coinbase venue streams and fixture server.`);
  closeVenueStreams();
  server.close(() => process.exit(0));
}
process.once("SIGINT", () => stop("SIGINT"));
process.once("SIGTERM", () => stop("SIGTERM"));
