import type { AppClient } from "../../app-client/domain/app-client.types.js";
import type { Provider } from "../../provider/domain/provider.types.js";
import type { AppSubscription } from "../../subscription/domain/subscription.types.js";

export type GatewayChatCompletionRequest = {
  model: string;
  messages: Array<{
    role: "system" | "user" | "assistant" | "tool";
    content: string;
    name?: string | undefined;
  }>;
  temperature?: number | undefined;
  max_tokens?: number | undefined;
  stream?: boolean | undefined;
};

export type GatewayImageGenerationRequest = {
  model: string;
  prompt: string;
  n?: number | undefined;
  size?: string | undefined;
  quality?: string | undefined;
  response_format?: "url" | "b64_json" | undefined;
};

export type ParsedProviderModel = {
  providerPrefix?: string;
  modelName: string;
};

export type ResolvedGatewayContext = {
  requestId: string;
  appClient: AppClient;
  subscription: AppSubscription;
  provider: Provider;
  modelName: string;
};
