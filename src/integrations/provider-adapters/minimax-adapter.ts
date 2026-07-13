import { OpenAICompatibleAdapter } from "./openai-compatible-adapter.js";

export class MiniMaxAdapter extends OpenAICompatibleAdapter {
  override readonly providerType = "minimax";
}
