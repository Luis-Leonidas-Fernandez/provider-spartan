import { describe, expect, it } from "vitest";
import { createAppClient } from "../domain/app-client.entity.js";

describe("createAppClient", () => {
  it("creates active app client", () => {
    const entity = createAppClient({
      name: "police",
      description: "desc",
      apiKeyHash: "hash",
      apiKeyPrefix: "pgw_abcd",
      apiKeyLastFour: "1234",
    });

    expect(entity.name).toBe("police");
    expect(entity.isActive).toBe(true);
  });
});
