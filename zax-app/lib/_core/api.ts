import { Platform } from "react-native";
import { getApiBaseUrl } from "@/constants/oauth";
import * as Auth from "./auth";

type ApiResponse<T> = {
  data?: T;
  error?: string;
};

type ApiUser = {
  id: number;
  openId: string;
  name: string | null;
  email: string | null;
  loginMethod: string | null;
  lastSignedIn: string;
};

export async function apiCall<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...((options.headers as Record<string, string>) || {}),
  };

  if (Platform.OS !== "web") {
    const sessionToken = await Auth.getSessionToken();
    if (sessionToken) headers.Authorization = `Bearer ${sessionToken}`;
  }

  const baseUrl = getApiBaseUrl();
  const cleanBaseUrl = baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
  const cleanEndpoint = endpoint.startsWith("/") ? endpoint : `/${endpoint}`;
  const url = baseUrl ? `${cleanBaseUrl}${cleanEndpoint}` : endpoint;

  const response = await fetch(url, {
    ...options,
    headers,
    credentials: "include",
  });

  if (!response.ok) {
    const errorText = await response.text();
    try {
      const errorJson = JSON.parse(errorText) as { error?: string; message?: string };
      throw new Error(errorJson.error || errorJson.message || `API call failed: ${response.statusText}`);
    } catch (error) {
      if (error instanceof Error && error.message !== errorText) throw error;
      throw new Error(errorText || `API call failed: ${response.statusText}`);
    }
  }

  const text = await response.text();
  return (text ? JSON.parse(text) : {}) as T;
}

/** Exchanges a native code/state pair only after the app's callback checks its SecureStore state. */
export async function exchangeOAuthCode(
  code: string,
  state: string,
): Promise<{ sessionToken: string; user: ApiUser }> {
  const result = await apiCall<{ app_session_id: string; user: ApiUser }>("/api/oauth/mobile", {
    method: "POST",
    body: JSON.stringify({ code, state }),
  });
  return { sessionToken: result.app_session_id, user: result.user };
}

/** Completes a web callback after the server verifies its HttpOnly transaction cookie. */
export async function completeWebOAuth(code: string, state: string): Promise<ApiUser> {
  const result = await apiCall<{ user: ApiUser }>("/api/oauth/callback", {
    method: "POST",
    body: JSON.stringify({ code, state }),
  });
  return result.user;
}

export async function logout(): Promise<void> {
  await apiCall<void>("/api/auth/logout", { method: "POST" });
}

export async function getMe(): Promise<ApiUser | null> {
  try {
    const result = await apiCall<{ user: ApiUser | null }>("/api/auth/me");
    return result.user || null;
  } catch {
    return null;
  }
}

// Retained for callers embedding Preview that already hold a validated Bearer token.
export async function establishSession(token: string): Promise<boolean> {
  try {
    await apiCall<{ success: boolean }>("/api/auth/session", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    return true;
  } catch {
    return false;
  }
}
