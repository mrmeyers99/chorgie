import { describe, expect, it } from "vitest";
import { biscuitsForChore } from "../src/lib/biscuits.js";

// Same cases as api/test/biscuits.test.ts, so the two copies stay in sync.
const DAY = 24 * 60 * 60 * 1000;
const availableAt = "2026-11-01T15:00:00.000Z";
const after = (ms) => new Date(new Date(availableAt).getTime() + ms);
const recurring = {
  recurrence_type: "recurring",
  next_available_at: availableAt,
};

describe("biscuitsForChore", () => {
  it.each([
    [0, 10],
    [DAY - 1, 10],
    [DAY, 5],
    [2 * DAY, 4],
    [3 * DAY, 3],
    [4 * DAY, 2],
    [5 * DAY, 1],
    [30 * DAY, 1],
  ])("recurring chore %i ms after it opened pays %i", (ms, expected) => {
    expect(biscuitsForChore(recurring, after(ms))).toBe(expected);
  });

  it("treats a recurring chore with no next_available_at as on time", () => {
    expect(
      biscuitsForChore({
        recurrence_type: "recurring",
        next_available_at: null,
      }),
    ).toBe(10);
  });

  it.each([["ad-hoc"], ["always-available"]])(
    "pays a flat 5 for %s",
    (type) => {
      expect(
        biscuitsForChore(
          { recurrence_type: type, next_available_at: availableAt },
          after(10 * DAY),
        ),
      ).toBe(5);
    },
  );
});
