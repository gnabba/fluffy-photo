# Race car photo metadata

Goal: extract searchable metadata from race car photos (race numbers, sponsors, livery, class, scene) into one `.txt` file per photo, so the photos can later be searched with a small LLM or a vector database.

Status: **working prototype**. Extraction works end to end on a handful of test photos; search returns Candidates from a local LanceDB index, but its quality is not measured yet.

## Decisions so far

1. **Open source only, cross-platform.** The stack must run on Linux and Windows as well as macOS, so macOS-only tools (Apple Vision OCR, MLX) were dropped.
2. **One model does all the visual work: Gemma 4 E4B** (Apache-2.0), run locally with [Ollama](https://ollama.com/library/gemma4) as `gemma4:e4b`. There is no separate OCR or logo detector for now.
3. **Node.js** for the tooling.
4. **Search stack**: LanceDB with hybrid search (BM25 on the `.txt` + vectors from `nomic-embed-text` on Ollama), with exact race number matches ranked first. Searches are in English.

The research behind these choices, with sources, is in [`docs/research/race-car-photo-metadata-extraction.md`](docs/research/race-car-photo-metadata-extraction.md).

## Repository layout

| Path | What it is |
|---|---|
| `docs/research/race-car-photo-metadata-extraction.md` | Research notes: OCR, small vision models, logo detection, embeddings, vector DBs, EXIF/XMP, pitfalls |
| `extractor/` | The extraction script ([usage](extractor/README.md)) |
| `extractor/extract.mjs` | Reads EXIF, asks Gemma for structured JSON, checks race numbers, writes `.txt` + `.json` sidecars |
| `extractor/prompt.md` | System prompt sent to the model |
| `extractor/schema.json` | JSON schema enforced through Ollama's `format` parameter |
| `search/` | Indexing and search over the `.txt` sidecars ([usage](search/README.md)) |
| `samples/` | Test photos from Wikimedia Commons and the sidecars generated for them |

## How extraction works

For each photo the script:

1. reads EXIF (camera, lens, focal length, shutter speed, ISO, date, GPS) with `exifr`;
2. sends the image to `gemma4:e4b` with `prompt.md` + `schema.json`, `temperature: 0` and thinking disabled;
3. replaces placeholder strings such as `"null"` or `"n/a"` with real nulls;
4. keeps a race number only if the model marks it `clear` and, when `--entries` is given, it is on the entry list; otherwise it is kept as a candidate with the reason;
5. writes `photo.json` (all data) and `photo.txt` (key/value header + description, ready for full-text and vector search).

Quick start:

```sh
ollama pull gemma4:e4b
cd extractor && npm install
node extract.mjs ../samples --force
```

## Test results

Five photos from Wikimedia Commons, run on an Apple M4 Pro (24 GB) with `gemma4:e4b`, about 7–10 s per photo after the model is loaded.

| Photo | Race number | Notes on the rest |
|---|---|---|
| `bmw-rowe.jpg` (BMW M4 GT3, Spa 2023) | 98 ✅ | Sponsors mostly correct; "M Motorsport" listed as a sponsor |
| `bmw-wrt.jpg` (Team WRT BMW M4 GT3, Spa 2024) | 31 ✅ | Class "LM GT3" correct; team given as "M Motorsport" instead of WRT |
| `ferrari-lmcorsa.jpg` (Ferrari 296 GT3, show display) | 60 ✅ | Class "PRO-AM" and setting "display" correct; "TAICHI" misread as "TAGHI" |
| `nascar-menard.jpg` (Paul Menard NASCAR Cup car) | 27 ✅ | Many sponsors read; team given as "MENARD" |
| `porsche-pfaff.jpg` (Pfaff Motorsports Porsche 911 GT3 R) | 9 ✅ | Class "GTD" correct; team given as "HAGERTY" (a sponsor); "IMSA" listed as a sponsor |

The race numbers match the Commons file titles; the WRT and Ferrari photos were also checked by eye. Five photos are far too few to measure accuracy: they only show that the pipeline works.

### Prompt changes made while testing

- Added `class_label` per car and a `display` value for `scene.setting`, because class markings were being listed as sponsors and a show car was tagged as on track.
- Added rules separating team, sponsor, manufacturer brand and series.
- Removed named examples (such as "IMSA") from the series rule, because the model copied them into photos where they did not appear.

## Known limitations

- **Team names are unreliable**: the model often picks a manufacturer brand or a sponsor.
- **Series and class markings still leak into sponsors** at times.
- **No second opinion on race numbers**: without OCR, the only guards against invented numbers are the `clear` legibility flag and the optional entry list.
- **Small text**: Gemma 4 supports up to 1120 visual tokens per image, but Ollama's API documents no option to choose the budget, so fine details may be lost on wide shots.
- **Only JPEG, PNG and WebP**: RAW and HEIC files must be converted first.

## Next steps (not started)

1. Label 50–100 real photos by hand and measure accuracy per field.
2. Write 10–20 test Searches with the Photos each should return, and measure how many land in the top Candidates.
3. Only if the measurements show a gap: add an OCR cross-check for numbers (PaddleOCR/EasyOCR) or logo matching (SigLIP 2), as described in the research notes.

## Sample photo credits

All from Wikimedia Commons, resized to 1920 px wide where larger:

- `bmw-rowe.jpg`: [98BMWROWE24HSPA2023.jpg](https://commons.wikimedia.org/wiki/File:98BMWROWE24HSPA2023.jpg), CC BY-SA 4.0
- `bmw-wrt.jpg`: [2024 6 Hours of Spa-Francorchamps Team WRT BMW M4 GT3 No.31 (DSC02566).jpg](https://commons.wikimedia.org/wiki/File:2024_6_Hours_of_Spa-Francorchamps_Team_WRT_BMW_M4_GT3_No.31_(DSC02566).jpg), CC BY-SA 4.0
- `ferrari-lmcorsa.jpg`: [Ferrari 296 GT3 of LM Corsa.jpg](https://commons.wikimedia.org/wiki/File:Ferrari_296_GT3_of_LM_Corsa.jpg), CC0
- `nascar-menard.jpg`: [Paul Menard NASCAR Cup car shown at Road America 2012.jpg](https://commons.wikimedia.org/wiki/File:Paul_Menard_NASCAR_Cup_car_shown_at_Road_America_2012.jpg), CC BY-SA 3.0
- `porsche-pfaff.jpg`: [Pfaff Motorsports's Porsche 911 GT3 R ar Road america.jpg](https://commons.wikimedia.org/wiki/File:Pfaff_Motorsports%27s_Porsche_911_GT3_R_ar_Road_america.jpg), CC BY 2.0

See each file page for the author and full licence terms.
