import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { config } from "#/config";

const llamacpp = createOpenAICompatible({
  name: "llamacpp",
  baseURL: config.llmBaseUrl,
  apiKey: config.llmApiKey,
  includeUsage: true,
});

export const model = llamacpp(config.llmModel);
