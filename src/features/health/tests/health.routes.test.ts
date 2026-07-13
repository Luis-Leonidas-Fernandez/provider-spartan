import { describe, expect, it } from "vitest";
import { createTestApp } from "../../../test/helpers/create-test-app.js";

describe("health route", () => {
  it("returns ok", async () => {
    const app = await createTestApp();
    const response = await app.inject({ method: "GET", url: "/health" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ ok: true });
    await app.close();
  });
});
