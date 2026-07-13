import { describe, expect, it } from "vitest";
import { ProviderAdapterRegistry } from "../infrastructure/provider-adapter-registry.js";
import { MiniMaxAdapter } from "../../../integrations/provider-adapters/minimax-adapter.js";

describe("ProviderAdapterRegistry", () => {
  it("selects the correct adapter", () => {
    const registry = new ProviderAdapterRegistry([new MiniMaxAdapter()]);
    expect(registry.getAdapter("minimax").providerType).toBe("minimax");
  });
});
