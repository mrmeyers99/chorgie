import { describe, expect, it } from "vitest";
import { getTimeOfDayGreeting } from "../src/lib/greeting.js";

const at = (hour, minute = 0) => new Date(2026, 0, 1, hour, minute);

describe("getTimeOfDayGreeting", () => {
  it.each([
    [0, "Good evening"],
    [4, "Good evening"],
    [5, "Good morning"],
    [11, "Good morning"],
    [12, "Good afternoon"],
    [16, "Good afternoon"],
    [17, "Good evening"],
    [23, "Good evening"],
  ])("hour %i -> %s", (hour, expected) => {
    expect(getTimeOfDayGreeting(at(hour))).toBe(expected);
  });

  it("treats the last minute before a boundary as the earlier period", () => {
    expect(getTimeOfDayGreeting(at(11, 59))).toBe("Good morning");
    expect(getTimeOfDayGreeting(at(16, 59))).toBe("Good afternoon");
  });
});
