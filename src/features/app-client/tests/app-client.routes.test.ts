import { describe, expect, it } from "vitest";
import { createTestApp } from "../../../test/helpers/create-test-app.js";

describe("app-client routes", () => {
  it("creates app client and returns api key only once", async () => {
    const app = await createTestApp();
    const response = await app.inject({
      method: "POST",
      url: "/app-clients",
      payload: { name: "police", description: "Police app" },
    });
    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(body.apiKey).toMatch(/^pgw_/);
    expect(body.appClient.apiKeyHash).toBeUndefined();
    await app.close();
  });

  it("rotates api key", async () => {
    const app = await createTestApp();
    const created = await app.inject({ method: "POST", url: "/app-clients", payload: { name: "police" } });
    const id = created.json().appClient.id;
    const rotated = await app.inject({ method: "POST", url: `/app-clients/${id}/rotate-key` });
    expect(rotated.statusCode).toBe(200);
    expect(rotated.json().apiKey).toMatch(/^pgw_/);
    await app.close();
  });
});
