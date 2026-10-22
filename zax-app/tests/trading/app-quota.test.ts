import { describe, expect, it } from "vitest";
import {
  AppQuotaExceeded,
  nextQuota,
  quotaInfo,
} from "../../server/trading/app-quota";
// Unit fixtures only; no owner database or model requests.
describe("durable quota policy math", () => {
  it("counts cost atomically before admission and refuses overflow", () => {
    expect(nextQuota("coach", 28, 2, 650_000).remaining).toBe(0);
    expect(() => nextQuota("coach", 29, 2, 650_000)).toThrow(AppQuotaExceeded);
  });
  it("exposes a concrete reset deadline and countdown", () => {
    const info = quotaInfo("source-analysis", 20, 650_000);
    expect(info.resetAt).toBe(1_200_000);
    expect(info.retryAfterSeconds).toBe(550);
    expect(info.remaining).toBe(0);
  });
  it("rejects invalid costs rather than resetting usage", () => {
    for (const value of [-1, 0, 1.5, 50])
      expect(() => nextQuota("coach", 0, value, 1)).toThrow();
  });
});
