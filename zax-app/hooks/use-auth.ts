import * as Api from "@/lib/_core/api";
import * as Auth from "@/lib/_core/auth";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Platform } from "react-native";

type UseAuthOptions = {
  autoFetch?: boolean;
};

function toAuthUser(user: NonNullable<Awaited<ReturnType<typeof Api.getMe>>>): Auth.User {
  return {
    id: user.id,
    openId: user.openId,
    name: user.name,
    email: user.email,
    loginMethod: user.loginMethod,
    lastSignedIn: new Date(user.lastSignedIn),
  };
}

export function useAuth(options?: UseAuthOptions) {
  const { autoFetch = true } = options ?? {};
  const [user, setUser] = useState<Auth.User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchUser = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      if (Platform.OS !== "web") {
        const sessionToken = await Auth.getSessionToken();
        if (!sessionToken) {
          setUser(null);
          await Auth.clearUserInfo();
          return;
        }
      }

      // The API validates the browser cookie or native Bearer token; cached identity is display-only.
      const apiUser = await Api.getMe();
      if (!apiUser) {
        if (Platform.OS !== "web") await Auth.removeSessionToken();
        await Auth.clearUserInfo();
        setUser(null);
        return;
      }

      const verifiedUser = toAuthUser(apiUser);
      setUser(verifiedUser);
      await Auth.setUserInfo(verifiedUser);
    } catch (err) {
      const authError = err instanceof Error ? err : new Error("Failed to fetch user");
      setError(authError);
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      await Api.logout();
    } finally {
      await Auth.removeSessionToken();
      await Auth.clearUserInfo();
      setUser(null);
      setError(null);
    }
  }, []);

  const isAuthenticated = useMemo(() => Boolean(user), [user]);

  useEffect(() => {
    if (autoFetch) {
      void fetchUser();
    } else {
      setLoading(false);
    }
  }, [autoFetch, fetchUser]);

  return {
    user,
    loading,
    error,
    isAuthenticated,
    refresh: fetchUser,
    logout,
  };
}
