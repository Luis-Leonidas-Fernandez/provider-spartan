import { describe, expect, it } from "vitest";
import { ValidateAppClientKeyUseCase } from "../application/use-cases/validate-app-client-key.use-case.js";

describe("ValidateAppClientKeyUseCase", () => {
  it("blocks inactive app client", async () => {
    const useCase = new ValidateAppClientKeyUseCase(
      {
        async create() {},
        async findAll() { return []; },
        async findById() { return null; },
        async findByApiKeyPrefix() {
          return {
            id: "1",
            name: "police",
            description: null,
            apiKeyHash: "hash",
            apiKeyPrefix: "pgw_1234",
            apiKeyLastFour: "1234",
            isActive: false,
            lastUsedAt: null,
            createdAt: "now",
            updatedAt: "now",
          };
        },
        async update() {},
        async touchLastUsedAt() {},
        async delete() {},
      },
      { verify: () => true, generateApiKey: () => ({ apiKey: "", apiKeyHash: "", apiKeyPrefix: "", apiKeyLastFour: "" }) },
    );

    await expect(useCase.execute("pgw_123456")).rejects.toThrow("App client is inactive");
  });
});
