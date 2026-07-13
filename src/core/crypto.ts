import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { AppError, UnauthorizedError } from "./errors.js";

const IV_LENGTH = 12;

type CipherPayload = {
  encryptedValue: string;
  maskedValue: string;
};

export class ApiKeyHasher {
  constructor(private readonly pepper: string) {}

  generateApiKey() {
    const raw = randomBytes(24).toString("hex");
    const apiKey = `pgw_${raw}`;
    return {
      apiKey,
      apiKeyPrefix: apiKey.slice(0, 8),
      apiKeyLastFour: apiKey.slice(-4),
      apiKeyHash: this.hash(apiKey),
    };
  }

  hash(apiKey: string) {
    return createHash("sha256").update(`${this.pepper}:${apiKey}`).digest("hex");
  }

  verify(apiKey: string, hash: string) {
    const computed = this.hash(apiKey);
    return timingSafeEqual(Buffer.from(computed), Buffer.from(hash));
  }
}

export class CredentialCipher {
  private readonly key: Buffer | null;

  constructor(
    secret: string,
    private readonly allowInsecureStorage: boolean,
  ) {
    this.key = secret ? createHash("sha256").update(secret).digest() : null;
  }

  encrypt(value: string): CipherPayload {
    if (!this.key) {
      if (!this.allowInsecureStorage) {
        throw new AppError(
          "Credential encryption key is required to store provider secrets",
          400,
          "credential_encryption_required",
        );
      }
      return {
        encryptedValue: Buffer.from(value, "utf8").toString("base64"),
        maskedValue: maskSecret(value),
      };
    }

    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv("aes-256-gcm", this.key, iv);
    const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();

    return {
      encryptedValue: Buffer.concat([iv, tag, encrypted]).toString("base64"),
      maskedValue: maskSecret(value),
    };
  }

  decrypt(encryptedValue: string): string {
    if (!this.key) {
      if (!this.allowInsecureStorage) {
        throw new UnauthorizedError("Credential decryption is not available");
      }
      return Buffer.from(encryptedValue, "base64").toString("utf8");
    }

    const payload = Buffer.from(encryptedValue, "base64");
    const iv = payload.subarray(0, IV_LENGTH);
    const tag = payload.subarray(IV_LENGTH, IV_LENGTH + 16);
    const ciphertext = payload.subarray(IV_LENGTH + 16);
    const decipher = createDecipheriv("aes-256-gcm", this.key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
  }
}

export function maskSecret(value: string) {
  if (value.length <= 6) return "***";
  return `${value.slice(0, 3)}***${value.slice(-3)}`;
}
