import * as Localization from "expo-localization";

import { deviceTimeZone, localToday } from "@/lib/today";

describe("localToday", () => {
  it("is the calendar day in the device's time zone", () => {
    // jest-expo's expo-localization reports America/New_York.
    expect(localToday(new Date("2026-11-19T03:00:00.000Z"))).toBe("2026-11-18");
  });
});

describe("deviceTimeZone", () => {
  it("falls back to UTC when iOS reports no time zone", () => {
    const [calendar] = Localization.getCalendars();
    jest.spyOn(Localization, "getCalendars").mockReturnValue([{ ...calendar, timeZone: null }]);

    expect(deviceTimeZone()).toBe("UTC");
  });
});
