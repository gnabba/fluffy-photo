# Fluffy Photo app

Chat-driven Search over the race car Photos of one Library. The app reads the Sidecars that `../extractor` produced beforehand. It never generates them.

## Setup

Requires Node 22+ and pnpm 11.

```sh
cd app
pnpm install
pnpm dev          # http://localhost:3000
```

With no env vars the app uses `../samples` as the Library.

## Configuration

Every value has a default in `src/config.ts`. Each one can be overridden with an env var:

| Env var        | Default                    | Meaning                                                   |
| -------------- | -------------------------- | --------------------------------------------------------- |
| `LIBRARY_DIR`  | `../samples`               | Flat folder of Photos and their Sidecars. Relative paths resolve from `app/`. |
| `LLM_BASE_URL` | `http://localhost:8080/v1` | OpenAI-compatible endpoint (local llama.cpp by default)   |
| `LLM_MODEL`    | `qwen3`                    | Model id exposed by the server (`GET /v1/models`)         |
| `LLM_API_KEY`  | unset                      | Optional bearer token                                     |

Example:

```sh
LIBRARY_DIR=/data/race-photos LLM_MODEL=qwen3 pnpm dev
```

Photos without a valid Sidecar (`<name>.json`) are counted separately and otherwise ignored.

## LLM server (llama.cpp)

Search relies on tool calling, so `llama-server` **must run with `--jinja`**. Without it the chat template does not handle tool calls. Use `-a` to give the model the id that `LLM_MODEL` expects:

```sh
llama-server -m qwen3.gguf --jinja -a qwen3 --port 8080
```

## Scripts

| Script           | What it does                         |
| ---------------- | ------------------------------------ |
| `pnpm dev`       | Dev server on port 3000              |
| `pnpm test`      | Vitest                               |
| `pnpm check`     | Biome via ultracite                  |
| `pnpm fix`       | Auto-fix lint and formatting         |
| `pnpm typecheck` | `tsc --noEmit`                       |
| `pnpm build`     | Production build                     |
