import { parseProviderModel } from "../../domain/provider-model-parser.js";

export class ParseProviderModelUseCase {
  execute(model: string) {
    return parseProviderModel(model);
  }
}
