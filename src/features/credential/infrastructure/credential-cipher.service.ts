import { CredentialCipher } from "../../../core/crypto.js";

export class CredentialCipherService extends CredentialCipher {
  constructor(options: {
    credentialEncryptionKey: string;
    allowInsecureCredentialStorage: boolean;
  }) {
    super(options.credentialEncryptionKey, options.allowInsecureCredentialStorage);
  }
}
