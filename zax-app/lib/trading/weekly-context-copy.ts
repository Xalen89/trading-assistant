import type { HistoricalProfile } from "./setup-model";

const compact = (value: string | undefined): string | undefined => {
  const normalized = value?.replace(/\s+/g, " ").trim();
  return normalized ? normalized.slice(0, 1200) : undefined;
};

/**
 * Keeps a missing daily context explicit without assigning an unearned profile
 * bias. Source analysis remains the authority when it supplies an explanation.
 */
export function dailyContextUnavailableMessage(
  profile?: Pick<HistoricalProfile, "source" | "explanation">,
): string {
  const source = compact(profile?.source);
  const explanation = compact(profile?.explanation);
  if (source && explanation)
    return `Daily context unavailable. ${source} ${explanation}`;
  if (explanation) return `Daily context unavailable. ${explanation}`;
  if (source) return `Daily context unavailable. ${source}`;
  return "Daily provider context is unavailable. No eligible completed provider daily bar was supplied, so the profile, PDH, and PDL remain unknown.";
}
