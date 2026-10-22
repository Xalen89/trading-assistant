type BrowserLocation = { protocol: string; hostname: string; origin: string };

/** Web publication shares its origin with the routed API. Native builds use their configured URL. */
export function resolveApiOrigin(
  platform: string,
  location: BrowserLocation | undefined,
  configured: string,
): string {
  if (platform !== "web" || !location) return configured.replace(/\/$/, "");
  // Mobile Preview 8081/8328 both serve Expo pages, not the Express API routes.
  // Pair only exact Cloud frontend hosts with the fixed, declared 3000 API.
  if (
    /^(?:8081|8328)-[a-z0-9-]+(?:\.[a-z0-9-]+)+\.manus\.computer$/.test(
      location.hostname,
    )
  ) {
    return `${location.protocol}//${location.hostname.replace(/^(?:8081|8328)-/, "3000-")}`;
  }
  if (location.hostname === "localhost" || location.hostname === "127.0.0.1") {
    return configured.replace(/\/$/, "");
  }
  // Never send a production browser to the old EXPO_PUBLIC_API_BASE_URL from Preview.
  return "";
}
