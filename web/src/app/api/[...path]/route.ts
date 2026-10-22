import { timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const allowed = new Set([
  "health", "strategies", "trades", "price-data", "analyze", "analyses", "backtest",
]);

function authorized(request: NextRequest) {
  const password = process.env.APP_PASSWORD;
  if (!password) return true;
  const header = request.headers.get("authorization");
  if (!header?.startsWith("Basic ")) return false;
  const credentials = Buffer.from(header.slice(6), "base64").toString();
  const separator = credentials.indexOf(":");
  if (separator < 0) return false;
  const supplied = Buffer.from(credentials.slice(separator + 1));
  const expected = Buffer.from(password);
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

async function proxy(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  if (!authorized(request)) {
    return new Response("Authentication required", {
      status: 401,
      headers: {
        "WWW-Authenticate": 'Basic realm="Trading Assistant", charset="UTF-8"',
        "Cache-Control": "no-store",
      },
    });
  }
  const { path } = await context.params;
  if (path.length !== 1 || !allowed.has(path[0])) {
    return Response.json({ error: "Unknown API endpoint" }, { status: 404 });
  }
  if (request.method === "POST") {
    const origin = request.headers.get("origin");
    if (origin && origin !== request.nextUrl.origin) {
      return Response.json({ error: "Cross-origin request rejected" }, { status: 403 });
    }
    if (!request.headers.get("content-type")?.startsWith("application/json")) {
      return Response.json({ error: "JSON request required" }, { status: 415 });
    }
  }
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (process.env.API_TOKEN) headers.Authorization = "Bearer " + process.env.API_TOKEN;
  try {
    let body: string | undefined;
    if (request.method === "POST") {
      const reader = request.body?.getReader();
      const chunks: Uint8Array[] = [];
      let size = 0;
      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          size += value.byteLength;
          if (size > 65_536) {
            await reader.cancel();
            return Response.json({ error: "Request too large" }, { status: 413 });
          }
          chunks.push(value);
        }
      }
      body = Buffer.concat(chunks).toString("utf8");
    }
    const base = process.env.API_URL || "http://127.0.0.1:4000";
    const url = new URL(`/api/${path[0]}`, base);
    url.search = request.nextUrl.search;
    const response = await fetch(url, {
      method: request.method,
      headers,
      body,
      cache: "no-store",
      signal: AbortSignal.timeout(120_000),
      redirect: "error",
    });
    return new Response(await response.text(), {
      status: response.status,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return Response.json({ error: "Trading API unavailable. Check the API server and configuration." }, { status: 502 });
  }
}

export { proxy as GET, proxy as POST };
