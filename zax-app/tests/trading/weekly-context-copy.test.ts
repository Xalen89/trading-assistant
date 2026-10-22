import { describe, expect, it } from "vitest";
import { dailyContextUnavailableMessage } from "../../lib/trading/weekly-context-copy";

describe("weekly context unavailable copy", () => {
  it("shows the analysis source and reason without assigning a directional bias", () => {
    expect(
      dailyContextUnavailableMessage({
        source: "Daily profile not required by the selected source strategy",
        explanation:
          "Need a completed current-week provider daily observation; direction is not invented.",
      }),
    ).toContain("Daily profile not required by the selected source strategy");
  });

  it("uses a fixed clear unavailable state when no analysis reason exists", () => {
    expect(dailyContextUnavailableMessage()).toBe(
      "Daily provider context is unavailable. No eligible completed provider daily bar was supplied, so the profile, PDH, and PDL remain unknown.",
    );
  });
});
