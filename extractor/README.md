# Race photo extractor

Extracts searchable metadata from race car photos with [Gemma 4 E4B](https://ollama.com/library/gemma4) running locally on Ollama. For each photo it writes, next to the image:

- `photo.txt`: a plain-text sidecar for full-text and vector search;
- `photo.json`: the same data as structured JSON (EXIF, cars, sponsors, scene).

Works on Linux, Windows and macOS. Background and design choices are in [`../docs/research/race-car-photo-metadata-extraction.md`](../docs/research/race-car-photo-metadata-extraction.md).

## Setup

1. Install [Ollama](https://ollama.com/download) and make sure it is running.
2. Pull the model (about 10 GB):

   ```sh
   ollama pull gemma4:e4b
   ```

3. Install the dependency (Node 20+):

   ```sh
   npm install
   ```

## Usage

```sh
node extract.mjs photos/                       # every .jpg/.jpeg/.png/.webp, recursively
node extract.mjs photos/a.jpg photos/b.jpg     # specific files
node extract.mjs photos/ --entries entries.txt # reject numbers not on the entry list
node extract.mjs photos/ --force               # re-process photos that already have a .txt
node extract.mjs photos/ --model gemma4:e2b    # smaller, faster, less accurate
```

`entries.txt` holds one race number per line.

## How numbers are checked

There is no separate OCR pass, so the script trusts a race number only when the model marks it as `clear` and, if `--entries` is given, the number is on the entry list. Rejected readings move to `car_number_candidates` with the reason (`legibility_partial`, `not_on_entry_list`).

## Customising

- `prompt.md`: instructions sent as the system prompt. The JSON schema is appended automatically.
- `schema.json`: the output structure, enforced by Ollama's `format` parameter.
