import { randomBytes, timingSafeEqual } from "node:crypto";
import { parse as parseCookieHeader } from "cookie";
import { ONE_YEAR_MS } from "../../shared/const.js";
import type { Express, Request, Response } from "express";
import { getUserByOpenId, upsertUser } from "../db";
import {
  authorizeLogoutRequest,
  type LogoutRequestAuthorization,
} from "./auth-security";
import { getSessionCookieName, getSessionCookieOptions } from "./cookies";
import { trustedExpoWebOrigins } from "./cors";
import { sdk } from "./sdk";

const OAUTH_TRANSACTION_TTL_MS = 10 * 60 * 1000;
const NATIVE_TRANSACTION_TTL_MS = 10 * 60 * 1000;
const consumedNativeTransactions = new Map<string, number>();

type WebOAuthTransaction = {
  nonce: string;
  redirectUri: string;
};

function getQueryParam(req: Request, key: string): string | undefined {
  const value = req.query[key];
  return typeof value === "string" ? value : undefined;
}

function getBodyParam(req: Request, key: string): string | undefined {
  const value = req.body?.[key];
  return typeof value === "string" ? value : undefined;
}

function configuredFrontendOrigins(): Set<string> {
  const origins = trustedExpoWebOrigins();
  for (const name of [
    "EXPO_WEB_PREVIEW_URL",
    "EXPO_PACKAGER_PROXY_URL",
  ] as const) {
    const value = process.env[name];
    if (!value) continue;
    try {
      const url = new URL(value);
      if (
        (url.protocol === "https:" || url.protocol === "http:") &&
        url.origin === value
      ) {
        origins.add(value);
      }
    } catch {
      // Invalid deployment configuration is not a client-controlled fallback.
    }
  }
  return origins;
}

function isAllowedFrontendOrigin(origin: string): boolean {
  return configuredFrontendOrigins().has(origin);
}

type VerifyNativeBearer = (
  token: string,
) => ReturnType<typeof sdk.verifySession>;

export function createLogoutHandler(
  verifyNativeBearer: VerifyNativeBearer = (token) => sdk.verifySession(token),
) {
  return async (req: Request, res: Response) => {
    const authorization: LogoutRequestAuthorization | null =
      authorizeLogoutRequest(req);
    if (!authorization) {
      res
        .status(403)
        .json({ error: "Logout origin or native bearer is required" });
      return;
    }

    if (authorization.kind === "native-bearer") {
      const session = await verifyNativeBearer(authorization.token);
      if (!session || session.openId.startsWith("cron_")) {
        res.status(401).json({ error: "Native bearer session is invalid" });
        return;
      }
    }

    res.clearCookie(getSessionCookieName(req), {
      ...getSessionCookieOptions(req),
      maxAge: -1,
    });
    res.json({ success: true });
  };
}

function isAllowedNativeRedirectUri(redirectUri: string): boolean {
  try {
    const url = new URL(redirectUri);
    return (
      url.protocol === "manus239962161970181:" &&
      url.hostname === "" &&
      url.pathname === "/oauth/callback" &&
      !url.search &&
      !url.hash
    );
  } catch {
    return false;
  }
}

function buildPortalLoginUrl(redirectUri: string, state: string): string {
  const portalUrl =
    process.env.MANUS_OAUTH_PORTAL_URL ?? process.env.VITE_OAUTH_PORTAL_URL;
  const appId = process.env.MANUS_PROJECT_ID ?? process.env.VITE_APP_ID;
  if (!portalUrl || !appId) {
    throw new Error("Manus OAuth is not configured");
  }

  const url = new URL("/app-auth", portalUrl);
  url.searchParams.set("appId", appId);
  url.searchParams.set("redirectUri", redirectUri);
  url.searchParams.set("state", state);
  url.searchParams.set("responseType", "code");
  return url.toString();
}

function getOAuthTransactionCookieName(req: Request): string {
  // __Host- prevents a sibling subdomain from setting a competing transaction cookie on Preview.
  return getSessionCookieName(req).startsWith("__Host-")
    ? "__Host-manus_oauth_transaction"
    : "manus_local_oauth_transaction";
}

function clearOAuthTransaction(req: Request, res: Response) {
  res.clearCookie(getOAuthTransactionCookieName(req), {
    ...getSessionCookieOptions(req),
    maxAge: -1,
  });
}

function readWebTransaction(req: Request): WebOAuthTransaction | null {
  const cookieValue = req.headers.cookie
    ? parseCookieHeader(req.headers.cookie)[getOAuthTransactionCookieName(req)]
    : undefined;
  if (!cookieValue) return null;

  try {
    const parsed = JSON.parse(cookieValue) as Record<string, unknown>;
    if (
      typeof parsed.nonce !== "string" ||
      typeof parsed.redirectUri !== "string"
    )
      return null;
    return { nonce: parsed.nonce, redirectUri: parsed.redirectUri };
  } catch {
    return null;
  }
}

function secretsMatch(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return (
    leftBuffer.length === rightBuffer.length &&
    timingSafeEqual(leftBuffer, rightBuffer)
  );
}

function consumeWebTransaction(
  req: Request,
  res: Response,
  state: string,
): boolean {
  const transaction = readWebTransaction(req);
  let parsedState: ReturnType<typeof sdk.parseOAuthState>;
  try {
    parsedState = sdk.parseOAuthState(state);
  } catch {
    clearOAuthTransaction(req, res);
    return false;
  }

  const valid =
    !!transaction &&
    !parsedState.transaction &&
    secretsMatch(transaction.nonce, parsedState.nonce) &&
    transaction.redirectUri === parsedState.redirectUri &&
    isAllowedFrontendOrigin(new URL(parsedState.redirectUri).origin);

  // Clear before exchange so a valid state cannot be replayed, including on exchange failure.
  clearOAuthTransaction(req, res);
  return valid;
}

function pruneConsumedNativeTransactions() {
  const now = Date.now();
  for (const [transactionId, expiresAt] of consumedNativeTransactions) {
    if (expiresAt <= now) consumedNativeTransactions.delete(transactionId);
  }
}

async function syncUser(userInfo: {
  openId?: string | null;
  name?: string | null;
  email?: string | null;
  loginMethod?: string | null;
  platform?: string | null;
}) {
  if (!userInfo.openId) throw new Error("openId missing from user info");

  const lastSignedIn = new Date();
  await upsertUser({
    openId: userInfo.openId,
    name: userInfo.name || null,
    email: userInfo.email ?? null,
    loginMethod: userInfo.loginMethod ?? userInfo.platform ?? null,
    lastSignedIn,
  });
  const saved = await getUserByOpenId(userInfo.openId);
  return (
    saved ?? {
      openId: userInfo.openId,
      name: userInfo.name,
      email: userInfo.email,
      loginMethod: userInfo.loginMethod ?? null,
      lastSignedIn,
    }
  );
}

function buildUserResponse(
  user:
    | Awaited<ReturnType<typeof getUserByOpenId>>
    | {
        openId: string;
        name?: string | null;
        email?: string | null;
        loginMethod?: string | null;
        lastSignedIn?: Date | null;
      },
) {
  return {
    id: (user as any)?.id ?? null,
    openId: user?.openId ?? null,
    name: user?.name ?? null,
    email: user?.email ?? null,
    loginMethod: user?.loginMethod ?? null,
    lastSignedIn: (user?.lastSignedIn ?? new Date()).toISOString(),
  };
}

async function issueSession(
  req: Request,
  res: Response,
  code: string,
  state: string,
) {
  const tokenResponse = await sdk.exchangeCodeForToken(code, state);
  const userInfo = await sdk.getUserInfo(tokenResponse.accessToken);
  const user = await syncUser(userInfo);
  const sessionToken = await sdk.createSessionToken(userInfo.openId!, {
    name: userInfo.name || "",
    expiresInMs: ONE_YEAR_MS,
  });

  res.cookie(getSessionCookieName(req), sessionToken, {
    ...getSessionCookieOptions(req),
    maxAge: ONE_YEAR_MS,
  });

  return { sessionToken, user: buildUserResponse(user) };
}

export function registerOAuthRoutes(app: Express) {
  // Browser login begins on the API so the HttpOnly transaction cookie is bound to this browser.
  app.get("/api/oauth/start", (req: Request, res: Response) => {
    const origin = getQueryParam(req, "origin");
    if (!origin || !isAllowedFrontendOrigin(origin)) {
      res.status(403).json({ error: "OAuth origin is not allowed" });
      return;
    }

    const redirectUri = new URL("/oauth/callback", origin).toString();
    const nonce = randomBytes(32).toString("base64url");
    const state = sdk.createOAuthState({ redirectUri, nonce });

    try {
      const loginUrl = buildPortalLoginUrl(redirectUri, state);
      res.cookie(
        getOAuthTransactionCookieName(req),
        JSON.stringify({ nonce, redirectUri }),
        {
          ...getSessionCookieOptions(req),
          maxAge: OAUTH_TRANSACTION_TTL_MS,
        },
      );
      res.redirect(302, loginUrl);
    } catch {
      res.status(500).json({ error: "OAuth is unavailable" });
    }
  });

  // The portal sends users to the real frontend callback. That callback exchanges code/state here.
  app.post("/api/oauth/callback", async (req: Request, res: Response) => {
    const code = getBodyParam(req, "code");
    const state = getBodyParam(req, "state");
    if (!code || !state) {
      res.status(400).json({ error: "code and state are required" });
      return;
    }

    if (!consumeWebTransaction(req, res, state)) {
      res
        .status(401)
        .json({ error: "OAuth transaction is invalid or expired" });
      return;
    }

    try {
      const { user } = await issueSession(req, res, code, state);
      res.json({ user });
    } catch {
      res.status(500).json({ error: "OAuth callback failed" });
    }
  });

  // Native clients receive a signed, expiring transaction and retain the exact state in SecureStore.
  app.post("/api/oauth/native-start", async (req: Request, res: Response) => {
    const redirectUri = getBodyParam(req, "redirectUri");
    if (!redirectUri || !isAllowedNativeRedirectUri(redirectUri)) {
      res.status(400).json({ error: "Invalid native callback URI" });
      return;
    }

    try {
      const { state } = await sdk.createNativeOAuthState(redirectUri);
      res.json({ state, loginUrl: buildPortalLoginUrl(redirectUri, state) });
    } catch {
      res.status(500).json({ error: "OAuth is unavailable" });
    }
  });

  app.post("/api/oauth/mobile", async (req: Request, res: Response) => {
    const code = getBodyParam(req, "code");
    const state = getBodyParam(req, "state");
    if (!code || !state) {
      res.status(400).json({ error: "code and state are required" });
      return;
    }

    try {
      const transaction = await sdk.verifyNativeOAuthState(state);
      pruneConsumedNativeTransactions();
      if (consumedNativeTransactions.has(transaction.transactionId)) {
        res.status(401).json({ error: "OAuth transaction is already used" });
        return;
      }
      consumedNativeTransactions.set(
        transaction.transactionId,
        Date.now() + NATIVE_TRANSACTION_TTL_MS,
      );

      const { sessionToken, user } = await issueSession(req, res, code, state);
      res.json({ app_session_id: sessionToken, user });
    } catch {
      res.status(401).json({ error: "OAuth mobile exchange failed" });
    }
  });

  app.post("/api/auth/logout", createLogoutHandler());

  app.get("/api/auth/me", async (req: Request, res: Response) => {
    try {
      const user = await sdk.authenticateRequest(req);
      res.json({ user: buildUserResponse(user) });
    } catch {
      res.status(401).json({ error: "Not authenticated", user: null });
    }
  });

  app.post("/api/auth/session", async (req: Request, res: Response) => {
    try {
      const user = await sdk.authenticateRequest(req);
      const authHeader = req.headers.authorization || req.headers.Authorization;
      if (typeof authHeader !== "string" || !authHeader.startsWith("Bearer ")) {
        res.status(400).json({ error: "Bearer token required" });
        return;
      }
      const token = authHeader.slice("Bearer ".length).trim();
      res.cookie(getSessionCookieName(req), token, {
        ...getSessionCookieOptions(req),
        maxAge: ONE_YEAR_MS,
      });
      res.json({ success: true, user: buildUserResponse(user) });
    } catch {
      res.status(401).json({ error: "Invalid token" });
    }
  });
}
