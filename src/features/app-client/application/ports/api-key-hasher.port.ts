export interface ApiKeyHasherPort {
  generateApiKey(): {
    apiKey: string;
    apiKeyHash: string;
    apiKeyPrefix: string;
    apiKeyLastFour: string;
  };
  verify(apiKey: string, hash: string): boolean;
}
