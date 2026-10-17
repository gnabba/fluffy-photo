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
| `LLM_MODEL`    | `unsloth/Qwen3.8-Flash-Next-GGUF:UD-Q4_K_XL` | Model id exposed by the server (`GET /v1/models`) |
| `LLM_API_KEY`  | unset                      | Optional bearer token                                     |

Example:

```sh
LIBRARY_DIR=/data/race-photos LLM_MODEL=my-model pnpm dev
```

Only JPEG and PNG files are Photos. Photos without a valid Sidecar (`<name>.json`), or whose name is not made of letters, digits, `_`, `.` and `-` (starting with a letter, digit or `_`), are counted separately and otherwise ignored.
Sidecars are re-read on every Search, so new ones are picked up without a restart.
Thumbnails are generated with `sharp` on first request and cached in `app/.cache/` (safe to delete).

## LLM server (llama.cpp)

Search relies on tool calling, so `llama-server` **must run with `--jinja`**. Without it the chat template does not handle tool calls. The default `LLM_MODEL` is the id llama.cpp exposes for a model pulled from Hugging Face:

```sh
llama-server -hf unsloth/Qwen3.8-Flash-Next-GGUF:UD-Q4_K_XL --jinja --port 8080
```

With a local file, either alias it to that id (`-m model.gguf -a unsloth/Qwen3.8-Flash-Next-GGUF:UD-Q4_K_XL`) or set `LLM_MODEL` to the id listed by `GET /v1/models`.

## Scripts

| Script           | What it does                         |
| ---------------- | ------------------------------------ |
| `pnpm dev`       | Dev server on port 3000              |
| `pnpm test`      | Vitest                               |
| `pnpm check`     | Biome via ultracite                  |
| `pnpm fix`       | Auto-fix lint and formatting         |
| `pnpm typecheck` | `tsc --noEmit`                       |
| `pnpm build`     | Production build                     |
