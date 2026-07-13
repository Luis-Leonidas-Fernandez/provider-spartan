export interface CredentialCipherPort {
  encrypt(value: string): { encryptedValue: string; maskedValue: string };
  decrypt(encryptedValue: string): string;
}
