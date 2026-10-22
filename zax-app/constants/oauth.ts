import Constants from "expo-constants";
import * as Linking from "expo-linking";
import * as SecureStore from "expo-secure-store";
import * as ReactNative from "react-native";
import { launchWebLogin } from "@/lib/_core/web-login";
import { resolveApiOrigin } from "@/lib/_core/api-origin";

// Preserve the generated Manus deep-link scheme derived from this app's immutable bundle ID.
const bundleId = "space.manus.stratdesk.t239962161970181";
const timestamp = bundleId.split(".").pop()?.replace(/^t/, "") ?? "";
const schemeFromBundleId = `manus${timestamp}`;

const extra = (Constants.expoConfig?.extra ?? {}) as Record<
  string,
  string | undefined
>;

const env = {
  portal:
    extra.oauthPortalUrl ?? process.env.EXPO_PUBLIC_OAUTH_PORTAL_URL ?? "",
  server:
    extra.oauthServerUrl ?? process.env.EXPO_PUBLIC_OAUTH_SERVER_URL ?? "",
  appId: extra.appId ?? process.env.EXPO_PUBLIC_APP_ID ?? "",
  ownerId: process.env.EXPO_PUBLIC_OWNER_OPEN_ID ?? "",
  ownerName: process.env.EXPO_PUBLIC_OWNER_NAME ?? "",
  apiBaseUrl: extra.apiBaseUrl ?? process.env.EXPO_PUBLIC_API_BASE_URL ?? "",
  deepLinkScheme: schemeFromBundleId,
};

export const OAUTH_PORTAL_URL = env.portal;
export const OAUTH_SERVER_URL = env.server;
export const APP_ID = env.appId;
export const OWNER_OPEN_ID = env.ownerId;
export const OWNER_NAME = env.ownerName;
export const API_BASE_URL = env.apiBaseUrl;

export function getApiBaseUrl(): string {
  return resolveApiOrigin(
    ReactNative.Platform.OS,
    typeof window === "undefined" ? undefined : window.location,
    API_BASE_URL,
  );
}

export const SESSION_TOKEN_KEY = "app_session_token";
export const USER_INFO_KEY = "manus-runtime-user-info";
const NATIVE_OAUTH_STATE_KEY = "manus-native-oauth-state";

function apiUrl(path: string): string {
  const baseUrl = getApiBaseUrl();
  return baseUrl ? `${baseUrl.replace(/\/$/, "")}${path}` : path;
}

export const getRedirectUri = () =>
  ReactNative.Platform.OS === "web"
    ? typeof window === "undefined"
      ? ""
      : new URL("/oauth/callback", window.location.origin).toString()
    : `${env.deepLinkScheme}:///oauth/callback`;

export async function getExpectedNativeOAuthState(): Promise<string | null> {
  if (ReactNative.Platform.OS === "web") return null;
  return SecureStore.getItemAsync(NATIVE_OAUTH_STATE_KEY);
}

export async function clearExpectedNativeOAuthState(): Promise<void> {
  if (ReactNative.Platform.OS !== "web") {
    await SecureStore.deleteItemAsync(NATIVE_OAUTH_STATE_KEY);
  }
}

async function startNativeOAuthLogin(): Promise<void> {
  const redirectUri = getRedirectUri();
  const response = await fetch(apiUrl("/api/oauth/native-start"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ redirectUri }),
  });

  if (!response.ok) throw new Error("Unable to start secure sign-in");
  const result = (await response.json()) as {
    state?: unknown;
    loginUrl?: unknown;
  };
  if (typeof result.state !== "string" || typeof result.loginUrl !== "string") {
    throw new Error("Invalid sign-in response");
  }

  await SecureStore.setItemAsync(NATIVE_OAUTH_STATE_KEY, result.state);
  const supported = await Linking.canOpenURL(result.loginUrl);
  if (!supported) throw new Error("This device cannot open the sign-in page");
  await Linking.openURL(result.loginUrl);
}

/**
 * Starts a genuine Manus OAuth transaction. Browser state is bound by an HttpOnly API cookie;
 * native state is server-signed and stored verbatim in SecureStore until the deep-link returns.
 */
export async function startOAuthLogin(): Promise<string | null> {
  if (ReactNative.Platform.OS === "web") {
    if (typeof window === "undefined")
      throw new Error("Sign-in is only available in a browser");

    const url = new URL(apiUrl("/api/oauth/start"), window.location.origin);
    url.searchParams.set("origin", window.location.origin);
    return launchWebLogin(window, url.toString()) === "standalone"
      ? "standalone"
      : null;
  }

  await startNativeOAuthLogin();
  return null;
}
