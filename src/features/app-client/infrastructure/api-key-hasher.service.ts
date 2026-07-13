import { ApiKeyHasher } from "../../../core/crypto.js";

export class ApiKeyHasherService extends ApiKeyHasher {
  constructor(appApiKeyPepper: string) {
    super(appApiKeyPepper);
  }
}
