import { describe, expect, it } from "vitest";
import { biscuitsForCompletion, daysLate } from "../src/biscuits.js";

const DAY = 24 * 60 * 60 * 1000;
const availableAt = new Date("2026-11-01T15:00:00.000Z");
const after = (ms: number) => new Date(availableAt.getTime() + ms);

describe("biscuitsForCompletion", () => {
  it.each([
    [0, 10],
    [DAY - 1, 10], // still inside the first 24h
    [DAY, 5],
    [2 * DAY, 4],
    [3 * DAY, 3],
    [4 * DAY, 2],
    [5 * DAY, 1],
    [30 * DAY, 1],
  ])("recurring chore done %i ms after it opened pays %i", (ms, expected) => {
    expect(biscuitsForCompletion("recurring", availableAt, after(ms))).toBe(
      expected,
    );
  });

  it("treats a recurring chore with no next_available_at as on time", () => {
    expect(biscuitsForCompletion("recurring", null, new Date())).toBe(10);
  });

  it("treats completing before next_available_at (override) as on time", () => {
    expect(biscuitsForCompletion("recurring", availableAt, after(-DAY))).toBe(
      10,
    );
  });

  it.each([["ad-hoc"], ["always-available"]])(
    "pays a flat 5 for %s chores regardless of timing",
    (type) => {
      expect(biscuitsForCompletion(type, availableAt, after(10 * DAY))).toBe(5);
    },
  );
});

describe("daysLate", () => {
  it("never goes negative", () => {
    expect(daysLate(availableAt, after(-3 * DAY))).toBe(0);
  });
});
