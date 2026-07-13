import { OpenAICompatibleAdapter } from "./openai-compatible-adapter.js";

export class KimiAdapter extends OpenAICompatibleAdapter {
  override readonly providerType = "kimi";
}
