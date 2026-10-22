import { describe, expect, it } from "vitest";
import {
  DEFAULT_CLOCK_TIMEZONES,
  clockTimezonesOrDefault,
  fixedOffsetHours,
  fixedOffsetTimeZone,
  getTimeZoneClock,
  getTimeZoneClocks,
  isClockTimezoneConfiguration,
  isSupportedTimeZone,
} from "../../lib/trading/time-zone-clocks";

describe("time-zone clocks", () => {
  it("uses the three requested IANA defaults", () => {
    expect(DEFAULT_CLOCK_TIMEZONES).toEqual([
      "Europe/London",
      "America/New_York",
      "Asia/Tokyo",
    ]);
    expect(isClockTimezoneConfiguration(DEFAULT_CLOCK_TIMEZONES)).toBe(true);
  });

  it("renders actual DST abbreviations and UTC offsets at the supplied instant", () => {
    const winter = new Date(Date.UTC(2024, 0, 15, 12, 0, 0));
    const summer = new Date(Date.UTC(2024, 6, 15, 12, 0, 0));

    expect(getTimeZoneClock("Europe/London", winter)).toMatchObject({
      abbreviation: "GMT",
      utcOffset: "UTC+00:00",
    });
    expect(getTimeZoneClock("Europe/London", summer)).toMatchObject({
      abbreviation: "BST",
      utcOffset: "UTC+01:00",
    });
    expect(getTimeZoneClock("America/New_York", winter)).toMatchObject({
      abbreviation: "EST",
      utcOffset: "UTC−05:00",
    });
    expect(getTimeZoneClock("America/New_York", summer)).toMatchObject({
      abbreviation: "EDT",
      utcOffset: "UTC−04:00",
    });
    expect(getTimeZoneClock("Asia/Tokyo", summer)).toMatchObject({
      abbreviation: "JST",
      utcOffset: "UTC+09:00",
    });
  });

  it("uses only valid three-zone configuration for display and does not write a fallback", () => {
    expect(isSupportedTimeZone("America/New_York")).toBe(true);
    expect(isSupportedTimeZone("UTC")).toBe(true);
    expect(isSupportedTimeZone("Etc/GMT+5")).toBe(true);
    expect(isSupportedTimeZone("Not/A_Timezone")).toBe(false);
    expect(isClockTimezoneConfiguration(["Europe/London"])).toBe(false);
    expect(clockTimezonesOrDefault(["Not/A_Timezone", "UTC", "UTC"])).toEqual(
      DEFAULT_CLOCK_TIMEZONES,
    );
    expect(getTimeZoneClocks(["Europe/London"])).toHaveLength(3);
  });

  it("maps fixed strategy offsets through Intl's inverted Etc/GMT signs", () => {
    expect(fixedOffsetTimeZone(-12)).toBe("Etc/GMT+12");
    expect(fixedOffsetTimeZone(-5)).toBe("Etc/GMT+5");
    expect(fixedOffsetTimeZone(-4)).toBe("Etc/GMT+4");
    expect(fixedOffsetTimeZone(0)).toBe("UTC");
    expect(fixedOffsetTimeZone(14)).toBe("Etc/GMT-14");
    expect(fixedOffsetTimeZone(15)).toBeUndefined();
    expect(fixedOffsetHours("Etc/GMT+5")).toBe(-5);
    expect(fixedOffsetHours("Etc/GMT-14")).toBe(14);
    expect(fixedOffsetHours("America/New_York")).toBeUndefined();
  });
});
