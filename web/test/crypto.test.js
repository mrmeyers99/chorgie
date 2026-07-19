import { describe, expect, it } from "vitest";
import {
  deriveHouseholdKey,
  encryptField,
  decryptField,
  safeDecryptField,
} from "../src/lib/crypto.js";

describe("deriveHouseholdKey", () => {
  it("generates a fresh salt when none is given", async () => {
    const a = await deriveHouseholdKey("correct-horse-battery-staple");
    const b = await deriveHouseholdKey("correct-horse-battery-staple");
    expect(a.encSalt).not.toBe(b.encSalt);
  });

  it("re-derives the same key when given an existing salt", async () => {
    const { encSalt } = await deriveHouseholdKey("correct-horse-battery-staple");
    const { hek } = await deriveHouseholdKey(
      "correct-horse-battery-staple",
      encSalt,
    );

    const ciphertext = await encryptField(hek, "hello");
    const { hek: hek2 } = await deriveHouseholdKey(
      "correct-horse-battery-staple",
      encSalt,
    );
    expect(await decryptField(hek2, ciphertext)).toBe("hello");
  });
});

describe("encryptField / decryptField", () => {
  it("round-trips a plaintext string", async () => {
    const { hek } = await deriveHouseholdKey("password123");
    const ciphertext = await encryptField(hek, "Take out the trash");
    expect(ciphertext).not.toBe("Take out the trash");
    expect(await decryptField(hek, ciphertext)).toBe("Take out the trash");
  });

  it("uses a fresh IV each time, so the same plaintext encrypts differently", async () => {
    const { hek } = await deriveHouseholdKey("password123");
    const a = await encryptField(hek, "same input");
    const b = await encryptField(hek, "same input");
    expect(a).not.toBe(b);
  });

  it.each([null, undefined, ""])("passes %p through unchanged", async (value) => {
    const { hek } = await deriveHouseholdKey("password123");
    expect(await encryptField(hek, value)).toBe(value);
    expect(await decryptField(hek, value)).toBe(value);
  });

  it("throws when decrypting with the wrong key", async () => {
    const { hek } = await deriveHouseholdKey("password123");
    const { hek: wrongHek } = await deriveHouseholdKey("a-different-password");
    const ciphertext = await encryptField(hek, "secret");
    await expect(decryptField(wrongHek, ciphertext)).rejects.toThrow();
  });

  it("throws when decrypting a corrupted envelope", async () => {
    const { hek } = await deriveHouseholdKey("password123");
    const ciphertext = await encryptField(hek, "secret");
    const corrupted = ciphertext.slice(0, -4) + "abcd";
    await expect(decryptField(hek, corrupted)).rejects.toThrow();
  });
});

describe("safeDecryptField", () => {
  it("returns the decrypted value on success", async () => {
    const { hek } = await deriveHouseholdKey("password123");
    const ciphertext = await encryptField(hek, "secret");
    expect(await safeDecryptField(hek, ciphertext)).toBe("secret");
  });

  it("falls back instead of throwing on a wrong-key mismatch", async () => {
    const { hek } = await deriveHouseholdKey("password123");
    const { hek: wrongHek } = await deriveHouseholdKey("a-different-password");
    const ciphertext = await encryptField(hek, "secret");
    expect(await safeDecryptField(wrongHek, ciphertext)).toBe("🔒 unreadable");
  });

  it("supports a custom fallback value", async () => {
    const { hek } = await deriveHouseholdKey("password123");
    const { hek: wrongHek } = await deriveHouseholdKey("a-different-password");
    const ciphertext = await encryptField(hek, "secret");
    expect(await safeDecryptField(wrongHek, ciphertext, "???")).toBe("???");
  });

  it.each([null, undefined, ""])("passes %p through unchanged", async (value) => {
    const { hek } = await deriveHouseholdKey("password123");
    expect(await safeDecryptField(hek, value)).toBe(value);
  });
});
