import { TRPCError } from "@trpc/server";
import type { Request } from "express";
import { authorizeLogoutRequest } from "../_core/auth-security";
import { isLoopbackApiHost } from "../_core/cors";
import { sdk } from "../_core/sdk";

/** Secret submissions share the exact trusted web origin or verified native bearer boundary. */
export async function assertScenarioCredentialRequest(
  req: Request,
  ownerOpenId: string,
) {
  const deny = () =>
    new TRPCError({
      code: "FORBIDDEN",
      message: "OpenAI setup requires your authenticated secure app session.",
    });
  if (req.method !== "POST") throw deny();
  const authorization = authorizeLogoutRequest(req);
  if (!authorization) throw deny();
  if (authorization.kind === "allowed-web-origin") {
    const origin =
      typeof req.headers.origin === "string" ? req.headers.origin : "";
    let url: URL;
    try {
      url = new URL(origin);
    } catch {
      throw deny();
    }
    if (
      url.protocol !== "https:" &&
      !(
        url.protocol === "http:" &&
        isLoopbackApiHost(url.hostname) &&
        isLoopbackApiHost(req.hostname) &&
        isLoopbackApiHost(req.socket?.remoteAddress ?? "")
      )
    )
      throw deny();
    return;
  }
  const session = await sdk.verifySession(authorization.token);
  if (!session || session.openId !== ownerOpenId) throw deny();
  if (
    !req.secure &&
    !(
      isLoopbackApiHost(req.hostname) &&
      isLoopbackApiHost(req.socket?.remoteAddress ?? "")
    )
  )
    throw deny();
}
