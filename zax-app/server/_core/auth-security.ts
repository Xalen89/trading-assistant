import type { IncomingHttpHeaders } from "node:http";
import { isAllowedCorsOrigin } from "./cors";

export type LogoutRequestAuthorization =
  | { kind: "allowed-web-origin" }
  | { kind: "native-bearer"; token: string };

type LogoutRequestHeaders = Pick<
  IncomingHttpHeaders,
  "authorization" | "origin"
>;

export type LogoutAuthorizationRequest = {
  headers: LogoutRequestHeaders;
  hostname: string;
};

function singleHeader(
  value: string | string[] | undefined,
): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function bearerToken(headers: LogoutRequestHeaders): string | undefined {
  const authorization = singleHeader(headers.authorization);
  const match = authorization?.match(/^Bearer ([^\s]+)$/);
  return match?.[1];
}

/**
 * Browser cookie logout requires the exact credentialed-CORS origin. Requests
 * without Origin are reserved for native clients and must present a bearer token
 * that the route verifies with the SDK before clearing any cookie.
 */
export function authorizeLogoutRequest(
  request: LogoutAuthorizationRequest,
): LogoutRequestAuthorization | null {
  const origin = singleHeader(request.headers.origin);
  if (origin)
    return isAllowedCorsOrigin(origin, request.hostname)
      ? { kind: "allowed-web-origin" }
      : null;

  const token = bearerToken(request.headers);
  return token ? { kind: "native-bearer", token } : null;
}
