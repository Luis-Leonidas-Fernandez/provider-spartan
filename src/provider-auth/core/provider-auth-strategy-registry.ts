import { ProviderAuthStrategyNotFoundError } from "./provider-auth.errors.js";
import type { ProviderAuthStrategy } from "./provider-auth.strategy.js";

export class ProviderAuthStrategyRegistry {
  private readonly strategies = new Map<string, ProviderAuthStrategy>();

  register(strategy: ProviderAuthStrategy) {
    this.strategies.set(strategy.provider, strategy);
  }

  get(provider: string) {
    const strategy = this.strategies.get(provider);
    if (!strategy) throw new ProviderAuthStrategyNotFoundError(provider);
    return strategy;
  }
}
