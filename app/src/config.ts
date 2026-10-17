import { resolve } from "node:path";

export interface Config {
  libraryDir: string;
  llmApiKey: string | undefined;
  llmBaseUrl: string;
  llmModel: string;
}

type Env = Record<string, string | undefined>;

const nonEmpty = (value: string | undefined) => value || undefined;

/** Builds the app configuration from env vars, falling back to local-demo defaults. */
export function readConfig(env: Env): Config {
  return {
    libraryDir: resolve(nonEmpty(env.LIBRARY_DIR) ?? "../samples"),
    llmBaseUrl: nonEmpty(env.LLM_BASE_URL) ?? "http://localhost:8080/v1",
    llmModel: nonEmpty(env.LLM_MODEL) ?? "unsloth/Qwen3.8-Flash-Next-GGUF:UD-Q4_K_XL",
    llmApiKey: nonEmpty(env.LLM_API_KEY),
  };
}

export const config = readConfig(process.env);
