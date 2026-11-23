import { describe, expect, it } from "vitest";
import {
  AVATARS,
  DEFAULT_AVATAR_ID,
  resolveAvatar,
} from "../src/lib/avatars.js";

describe("AVATARS", () => {
  it("has six unique corgi ids with a coat each", () => {
    expect(AVATARS).toHaveLength(6);
    expect(new Set(AVATARS.map((a) => a.id)).size).toBe(6);
    for (const avatar of AVATARS) {
      expect(avatar.id).toMatch(/^corgi-[1-6]$/);
      expect(avatar.coat.main).toBeTruthy();
      expect(avatar.coat.legs).toBeTruthy();
    }
  });

  it("includes the default avatar", () => {
    expect(AVATARS.some((a) => a.id === DEFAULT_AVATAR_ID)).toBe(true);
  });
});

describe("resolveAvatar", () => {
  it("returns the matching avatar for a known id", () => {
    expect(resolveAvatar("corgi-4").label).toBe("Black & tan");
  });

  it.each([["corgi-9"], ["not-a-corgi"], [""], [undefined], [null]])(
    "falls back to the default avatar for %p",
    (id) => {
      expect(resolveAvatar(id).id).toBe(DEFAULT_AVATAR_ID);
    },
  );
});
