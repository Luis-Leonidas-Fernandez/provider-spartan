import { describe, expect, it } from "vitest";
import { CredentialCipher } from "../../../core/crypto.js";

describe("CredentialCipher", () => {
  it("encrypts provider credential", () => {
    const cipher = new CredentialCipher("secret", false);
    const encrypted = cipher.encrypt("my-token");
    expect(encrypted.encryptedValue).not.toBe("my-token");
    expect(encrypted.maskedValue).toContain("***");
  });

  it("blocks insecure storage when key is missing", () => {
    const cipher = new CredentialCipher("", false);
    expect(() => cipher.encrypt("my-token")).toThrow("Credential encryption key is required");
  });
});
