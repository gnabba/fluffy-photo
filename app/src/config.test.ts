import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { readConfig } from "#/config";

describe("readConfig", () => {
  it("defaults to the samples Library and a local llama.cpp server", () => {
    const config = readConfig({});

    expect(config.libraryDir).toBe(resolve(process.cwd(), "../samples"));
    expect(config.llmBaseUrl).toBe("http://localhost:8080/v1");
    expect(config.llmModel).toBe("unsloth/Qwen3.8-Flash-Next-GGUF:UD-Q4_K_XL");
    expect(config.llmApiKey).toBeUndefined();
  });

  it("lets env vars override every default", () => {
    const config = readConfig({
      LIBRARY_DIR: "/data/race-photos",
      LLM_BASE_URL: "http://gpu-box:9000/v1",
      LLM_MODEL: "qwen3-30b",
      LLM_API_KEY: "secret",
    });

    expect(config).toEqual({
      libraryDir: "/data/race-photos",
      llmBaseUrl: "http://gpu-box:9000/v1",
      llmModel: "qwen3-30b",
      llmApiKey: "secret",
    });
  });

  it("treats empty env vars as unset", () => {
    const config = readConfig({ LLM_MODEL: "", LLM_API_KEY: "" });

    expect(config.llmModel).toBe("unsloth/Qwen3.8-Flash-Next-GGUF:UD-Q4_K_XL");
    expect(config.llmApiKey).toBeUndefined();
  });
});
