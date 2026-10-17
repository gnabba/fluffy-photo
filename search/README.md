# Race photo search

Finds the Candidates for a Search in a Library: the Photos whose `.txt` Sidecars (written by the [extractor](../extractor/README.md)) best match a natural-language request in English. Everything runs locally: [LanceDB](https://lancedb.com) embedded in a folder, embeddings from `nomic-embed-text` on [Ollama](https://ollama.com/library/nomic-embed-text).

Works on Linux, Windows and macOS. Background and design choices are in [`../docs/research/race-car-photo-metadata-extraction.md`](../docs/research/race-car-photo-metadata-extraction.md#5-embeddings-and-search).

## Setup

1. Install [Ollama](https://ollama.com/download) and make sure it is running.
2. Pull the embedding model (about 270 MB):

   ```sh
   ollama pull nomic-embed-text
   ```

3. Install the dependency (Node 22+):

   ```sh
   npm install
   ```

## Usage

```sh
node build-index.mjs ../samples                           # index every Sidecar in the Library
node search.mjs ../samples yellow Porsche with Pirelli    # print up to 10 Candidates, best first
node search.mjs ../samples "#98" --limit 3                # at most 3 Candidates
node search.mjs ../samples car 98 --host http://gpu:11434 # Ollama on another machine
```

The index lives in `<library>/.search-index/`. `build-index.mjs` rebuilds it from scratch, so run it again after extracting new Photos or re-running the extractor with `--force`.

## How a Search is ranked

1. **Race numbers first.** Photos whose `car_numbers` line contains a number from the Search come first. Only whole numbers match: "9" does not match 98, and "GT3" is not read as number 3. Numbers left as `car_number_candidates` are not in this step.
2. **Then hybrid search** over the rest of the Sidecar: BM25 keyword search and `nomic-embed-text` vectors, fused with Reciprocal Rank Fusion.

The EXIF lines (`file`, `captured_at`, `camera`, `gps`) are left out of both, so a timestamp or a focal length never matches a race number.

## Limitations

- **Always returns Candidates.** Vector search ranks every Photo, so a Search that matches nothing still prints up to `--limit` Photos. Reviewing Candidates into Matches is not built yet.
- **English only**: `nomic-embed-text` is an English model, like the Sidecars.
- **Search quality is not measured yet.** It also cannot be better than the extraction: what the extractor missed cannot be found.
