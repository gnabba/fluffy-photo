# Race car photo metadata extraction: research notes

Status: research, 2026-10-17. Scope: extracting searchable metadata from photos of race cars (car numbers, sponsor logos and text, livery, series, scene). The pipeline uses only open-source components and runs locally on Linux, Windows or macOS. It writes one `.txt` sidecar per photo, which is then indexed for hybrid keyword and vector search.

Every factual claim links to a primary source (official docs, repos, model cards, papers). The full list is in [Sources](#sources). Anything I could not confirm on a primary page is marked **unverified**. Statements marked *recommendation* or *inference* are my own engineering judgement, not claims from a source.

---

## TL;DR: recommended pipeline

The stack is deliberately minimal: **one vision model (Gemma 4 E4B), one runtime (Ollama), one database (LanceDB)**. Everything is open source (Apache-2.0 / MIT) and runs locally on Linux, Windows or macOS.

```
photo.jpg
  │
  ├─1─ exiftool -json -n          → camera, lens, DateTimeOriginal, ExposureTime, GPS
  ├─2─ Gemma 4 E4B via Ollama (gemma4:e4b, JSON schema in `format`, temperature 0)
  │        → car_number + legibility, team, sponsors + evidence, livery colours,
  │          series, visible_text, scene, description
  ├─3─ checks: keep car_number only if legibility is "clear" (and it is on the entry list, if you have one)
  ├─4─ write photo.txt sidecar
  └─5─ index in LanceDB: BM25 full-text on .txt + vector from nomic-embed-text (also via Ollama)
         → hybrid search with RRF
```

1. **EXIF read**: [ExifTool](https://exiftool.org/exiftool_pod.html) with `-json -n` (use `-stay_open` for batches). `DateTimeOriginal` and GPS place the photo in a session or circuit; `ExposureTime` hints at motion blur ([EXIF tag table](https://exiftool.org/TagNames/EXIF.html)).
2. **Gemma 4 E4B does all the visual work** in a single call: reading numbers and sponsor text, recognising logos, describing livery and scene.
   - Licence Apache-2.0; the card lists OCR, object detection and pointing among its capabilities ([card](https://huggingface.co/google/gemma-4-E4B-it), [Gemma vision docs](https://ai.google.dev/gemma/docs/capabilities/vision)).
   - Run it as `gemma4:e4b` on [Ollama](https://ollama.com/library/gemma4), with the [schema below](#example-json-schema-and-prompt-for-the-vlm-step) in `format` and `temperature: 0` ([Ollama structured outputs](https://docs.ollama.com/capabilities/structured-outputs)).
   - Gemma 4 has a selectable image token budget (70–1120). Use the high end, because race numbers and decals are small details ([Gemma vision docs](https://ai.google.dev/gemma/docs/capabilities/vision)). Whether and how Ollama exposes this setting: **unverified**.
3. **Checks** (*recommendation*): without a separate OCR engine there is no second opinion on numbers, so the schema's `car_number_legible` field and the event entry list are the only guards against invented numbers.
   - Keep `car_number` only when `car_number_legible` is `"clear"`. The prompt already tells the model to return `null` otherwise; enforce it in code as well.
   - If you have the entry list, drop any number that is not on it.
   - Keep sponsors with evidence `"uncertain"` out of the `sponsors` line (they can stay in `visible_text`).
4. **Sidecar**: write `photo.txt` (format below). This is the document you index.
5. **Index**:
   - **Database**: **LanceDB** in embedded mode, with native BM25 full-text search and hybrid search using an RRF reranker ([hybrid search](https://docs.lancedb.com/search/hybrid-search)).
   - **Text embedder**: `nomic-embed-text-v1.5` (Apache-2.0), which is also on Ollama, so there is a single runtime to install ([card](https://huggingface.co/nomic-ai/nomic-embed-text-v1.5)). It needs the `search_document:` / `search_query:` prefixes.
   - Exact race numbers go through BM25 or a `car_number` column filter, never vectors alone.

**When to add more** (*recommendation*): the rest of this document covers components that are *not* in the default stack. Add them only if a labelled test set of 50–100 photos shows a specific gap:

- numbers misread or invented → add an OCR cross-check with PaddleOCR or EasyOCR ([section 2](#2-ocr-for-race-numbers-and-sponsor-text));
- symbol-only sponsor logos missed → add crop + SigLIP 2 gallery matching ([section 4](#4-logo-detection-and-recognition));
- "photos that look like this" queries → add a SigLIP 2 image vector column ([section 5](#5-embeddings-and-search));
- keywords needed in Lightroom or other photo tools → also write `.xmp` sidecars ([section 6](#6-existing-exifiptcxmp-metadata-and-write-back)).

### Example `.txt` sidecar

This format is a *recommendation*. A `key: value` header keeps exact fields grep-able and BM25-friendly. The prose paragraph gives the text embedder natural language to work with.

```text
file: 2026-09-14_monza_R1_0421.jpg
captured_at: 2026-09-14T15:42:07+02:00
camera: Sony ILCE-1 | lens: FE 200-600mm F5.6-6.3 G OSS | focal_mm: 560 | shutter_s: 1/160 | iso: 400
gps: 45.6156, 9.2811
event: (from folder/entry list) Monza 2026 – Race 1
car_number: 44
car_number_check: legible=clear; on_entry_list=yes
team: Example Racing
series: GT World Challenge Europe
sponsors: Pirelli; Shell; Example Energy
sponsors_evidence: text_readable(Pirelli, Shell, Example Energy)
livery_colors: matte black; fluorescent yellow; white
car_type: GT3 coupe
visible_text: 44 | PIRELLI | Shell | EXAMPLE ENERGY | Example Racing
scene: on track; panning shot; motion-blurred background; car exiting a corner; daylight
keywords: car-44; gt3; pirelli; shell; black-yellow-livery; panning; monza

description: A matte black and fluorescent yellow GT3 coupe carrying race number 44
is photographed in a panning shot exiting a corner at Monza. Pirelli and Shell logos
are visible on the side; "Example Energy" appears on the rear wing endplate.
```

---

## 1. Context: why generic tools struggle with race numbers

- **Bib numbers (runners)** are the closest well-studied analog.
  - Ben-Ami, Basha and Avidan (BMVC 2012) built a pipeline that hypothesises the bib location from a face detector, then applies a stroke width transform, then OCR ([paper page](https://bmva-archive.org.uk/bmvc/2012/BMVC/paper019/index.html), [PDF](https://bmva-archive.org.uk/bmvc/2012/BMVC/paper019/paper019.pdf)).
  - They released the **RBNR** dataset: 217 images from 3 races, with ground truth. You are only asked to cite the paper ([dataset page](https://people.csail.mit.edu/talidekel/RBNR.html)).
- **Tesseract does very badly on bibs.** Castrillón-Santana et al. (ICPRAM 2024) measured bib-level F on RBNR ([PDF](https://www.scitepress.org/Papers/2024/125624/125624.pdf)):

  | Method | F on RBNR |
  |---|---|
  | Tesseract | 0.08 |
  | EasyOCR | 0.60 |
  | Bartz et al. 2018 | 0.77 |
  | YOLOv7 digit detector trained on street numbers | 0.91 |

  The in-the-wild dataset TGCRBNW, with 69% low-light images, remains hard. The authors note that occlusion means appearance cues are needed beyond the number itself.
- **Fine-tuned CNNs do much better.** Ivarsson and Mueller (AMCIS 2019) pretrained on SVHN plus 262k bib images and reached F=0.94 on RBNR ([AIS eLibrary](https://aisel.aisnet.org/amcis2019/data_science_analytics_for_decision_support/data_science_analytics_for_decision_support/20)).
- **Motorsport analog: "Beyond the Mud"** (Tyo et al., arXiv 2402.08025) ([abs](https://arxiv.org/abs/2402.08025), [HTML](https://arxiv.org/html/2402.08025v1)).
  - It introduces the **Racer Number Dataset (RnD)** and the **MUDD** re-identification dataset for off-road motorcycle racing, with more than 6,300 images in total. They feature mud, unusual poses and motion blur.
  - Off-the-shelf text spotters perform poorly (about 15% end-to-end F1). Fine-tuning helps (about 53%), but the authors say results are still insufficient.
  - The fine-tuned models are deployed for race-photo search at PerformancePhoto.co.
  - A `JacobTyo/MUDD` GitHub repo exists but declares no licence ([repo](https://github.com/JacobTyo/MUDD)). Dataset licence: **unverified**.
- **Motorsport (cars): RaceLens** (Boiarov et al., arXiv 2310.13515).
  - It detects race cars, recognises car numbers, detects car parts and classifies orientation. It is reported as used by NASCAR teams across four seasons ([abs](https://arxiv.org/abs/2310.13515)).
  - It is closed-source. The training-set size figures circulating for it are **unverified**.
- **Community data**: a Roboflow Universe "(WIP) Race Car Number Detection" dataset exists ([link](https://universe.roboflow.com/race-car-detection/-wip-race-car-number-detection)). Its contents and licence are **unverified**.
- **Commercial taggers** that match detected numbers against a start or entry list (for example RaceTagger, TagOMatic): **unverified**. I read no primary vendor page. The entry-list matching idea is still a sound mitigation (*recommendation*).

**Takeaway.** Race numbers are scene text with stylised, italic, outlined, curved and partially occluded fonts. General OCR gives you candidates. A VLM gives context, such as which number is the race number and which is a phone number on a sponsor decal. A closed vocabulary (the entry list) gives precision. If accuracy matters at scale, the literature points to fine-tuning a digit or number detector on your own labelled photos.

---

## 2. OCR for race numbers and sponsor text

### Comparison

| Tool | Latest (verified) | License | Offline | Apple Silicon | Output | Notes for race cars |
|---|---|---|---|---|---|---|
| **Apple Vision** `VNRecognizeTextRequest` | macOS 10.15+; Swift `RecognizeTextRequest` macOS 15+ | Apple OS framework (free with macOS) | Yes, "all of Vision's processing happens on the user's device" | Native; ANE usage not documented (**unverified**) | text, confidence, normalized box | `.accurate` level; `customWords` (sponsor lexicon) overrides the standard lexicon when language correction is on; `minimumTextHeight` defaults to 1/32 of image height, so lower it for small decals |
| `ocrmac` (Python bridge to Vision/LiveText) | GitHub main | MIT | Yes | Native | (text, confidence, bbox) | Exposes `recognition_level`, `language_preference`, `framework="livetext"` (Sonoma+, confidence always 1). README shows no `customWords` / `minimumTextHeight` options, so use PyObjC or a small Swift CLI for those (*inference*) |
| **PaddleOCR** (PP-OCRv6) | v3.7.0, 2026-06-11 | Apache-2.0 | Yes | Runs on macOS; MPS/Metal not mentioned, assume CPU (*inference*) | boxes + text + score | v6 has tiny, small and medium tiers (about 1.5M–34.5M params) and 50 languages in one model; docs report tiny is 6.1x faster than PP-OCRv5_server on an M4. 3.5+ supports switchable backends including Transformers |
| **PaddleOCR-VL** 1.6 | 2026-05-28 | Apache-2.0 | Yes | Official Apple Silicon tutorial via mlx-vlm server (tested on M4) | prompt-selected tasks (OCR, Spotting, Table…) | About 0.9B VLM aimed at documents; 1.5 added text spotting and irregular boxes. Quality on scene text **unverified** |
| **EasyOCR** | v1.7.2, 2024-09-24 (stale) | Apache-2.0 | Yes | `gpu=` is CUDA; MPS not documented, so CPU | (bbox, text, confidence) | `allowlist='0123456789'` for number passes; `rotation_info=[90,180,270]`; CRAFT detector. F=0.60 on RBNR (ICPRAM 2024) |
| **docTR** | v1.1.0 | Apache-2.0 | Yes | PyTorch-only since v1.0; MPS not mentioned | nested JSON with geometry + confidence | Document-first pipeline (`assume_straight_pages`, `export_as_straight_boxes`); includes scene-text-capable recognisers (PARSeq) |
| **Tesseract** | 5.5.3 | Apache-2.0 | Yes | CPU | text (+ boxes via TSV/hOCR) | Expects "a page of text", is "optimized to recognize sentences of words", wants ≥300 DPI and degrades when skewed. F=0.08 on RBNR. Do not use for scene text |
| **Florence-2** `<OCR>`, `<OCR_WITH_REGION>` | base 0.23B / large 0.77B | MIT | Yes | Runs under transformers/MLX (`florence2` in mlx-vlm); MPS not stated (**unverified**) | text; `<OCR_WITH_REGION>` returns quad boxes + labels | No per-token confidence in the output format (*inference*); also gives detection and grounding from the same model |

Sources for this table:
- Apple: [VNRecognizeTextRequest](https://developer.apple.com/documentation/vision/vnrecognizetextrequest), [Recognizing text in images](https://developer.apple.com/documentation/vision/recognizing-text-in-images), [customWords](https://developer.apple.com/documentation/vision/vnrecognizetextrequest/customwords), [minimumTextHeight](https://developer.apple.com/documentation/vision/vnrecognizetextrequest/minimumtextheight), [RecognizeTextRequest](https://developer.apple.com/documentation/vision/recognizetextrequest).
- PaddleOCR: [repo](https://github.com/PaddlePaddle/PaddleOCR), [docs](https://www.paddleocr.ai/latest/en/), [PP-OCRv6_medium_rec card](https://huggingface.co/PaddlePaddle/PP-OCRv6_medium_rec), [PaddleOCR-VL-1.6](https://huggingface.co/PaddlePaddle/PaddleOCR-VL-1.6), [PaddleOCR-VL on Apple Silicon](https://www.paddleocr.ai/latest/en/version3.x/pipeline_usage/PaddleOCR-VL-Apple-Silicon.html).
- EasyOCR: [repo](https://github.com/JaidedAI/EasyOCR), [releases](https://github.com/JaidedAI/EasyOCR/releases), [API docs](https://www.jaided.ai/easyocr/documentation/).
- docTR: [repo](https://github.com/mindee/doctr), [releases](https://github.com/mindee/doctr/releases).
- Tesseract: [repo](https://github.com/tesseract-ocr/tesseract), [releases](https://github.com/tesseract-ocr/tesseract/releases), [ImproveQuality](https://tesseract-ocr.github.io/tessdoc/ImproveQuality.html).
- Florence-2: [card](https://huggingface.co/microsoft/Florence-2-large), [transformers docs](https://huggingface.co/docs/transformers/model_doc/florence2).
- ocrmac: [repo](https://github.com/straussmaximilian/ocrmac).
- RBNR scores: [ICPRAM 2024](https://www.scitepress.org/Papers/2024/125624/125624.pdf).

The newer Swift `RecognizeDocumentsRequest` (macOS 26) targets documents such as receipts, forms and tables, so it is not useful here ([docs](https://developer.apple.com/documentation/vision/recognizedocumentsrequest)).

### OCR tactics (*recommendations*)

- Run OCR twice:
  - a **full-frame** pass;
  - a **crop pass** on regions where numbers appear: door, bonnet, roof, number panels. Get the crops from a detector (Florence-2 `<OD>`, OWLv2 "car door number"), or from the VLM if it gives boxes.
- Upscaling the crops 2–3x helps Vision's `minimumTextHeight` threshold and Tesseract-style engines alike (*inference* from the documented minimum-height and DPI behaviour).
- Do a digits-only pass for numbers: EasyOCR `allowlist`, or a regex filter like `^\d{1,3}$` on PaddleOCR tokens.
- Fuzzy-match OCR tokens against a known sponsor list after recognition, since the open-source engines have no equivalent of Vision's `customWords` lexicon (*inference*: no such option found in the PaddleOCR or EasyOCR docs above).

---

## 3. Small VLMs for structured captions (local)

All facts below were checked on the model cards or library pages on 2026-10-17. For the "newest" lines, small open models now include Qwen3.5 (Feb 2026), Gemma 4 (Mar 2026), MiniCPM-V 4.6 and 4.7 (May and Oct 2026), and Moondream 3.1 (Jun 2026).

### Comparison

| Model | Sizes (small) | License | OCR / grounding (per card) | Local runtimes | Fit for this task |
|---|---|---|---|---|---|
| **Qwen3-VL** | 2B, 4B, 8B (also 30B-A3B, 32B, 235B) | Apache-2.0 | OCR in 32 languages, "robust in low light, blur, and tilt"; 2D/3D grounding | Ollama `qwen3-vl:2b/4b/8b`; llama.cpp mtmd (`qwen3vl`); mlx-vlm; transformers ≥4.57 | **First choice.** 4B is about 3.3 GB on Ollama |
| **Qwen3.5** (native multimodal) | 0.8B, 2B, 4B, 9B | Apache-2.0 | 4B self-reports OCRBench 85.0 and RefCOCO avg 88.1 | Ollama `qwen3.5:0.8b…9b` (plus `-mlx` tags); mlx-vlm; llama.cpp vision support **unverified** | **Co-first choice**; newest Qwen with small sizes |
| Qwen2.5-VL | 3B, 7B, 72B | **3B: `qwen-research` (non-commercial); 7B: Apache-2.0** | Boxes and points with "stable JSON outputs for coordinates" | Ollama `qwen2.5vl`; llama.cpp; mlx-vlm | Superseded; watch the 3B licence |
| **Gemma 4** | E2B, E4B, 12B (also 26B-A4B, 31B) | **Apache-2.0** | OCR, object detection, "pointing"; selectable image token budget (70–1120) trades detail for speed | Ollama `gemma4:e2b/e4b/12b` (+ `-mlx`); llama.cpp; mlx-vlm | Strong alternative, permissive licence |
| Gemma 3 / 3n | 3: 4B, 12B, 27B; 3n: E2B, E4B | Gemma Terms (not OSI) | 896×896 input + pan-and-scan | Ollama `gemma3`, `gemma3n`; llama.cpp; mlx-vlm | Superseded by Gemma 4 |
| **MiniCPM-V 4.6 / 4.7** | 4.6: about 1B; 4.7: 1B and 35B-A3B | Apache-2.0 | 4.6 claims Qwen3.5-2B-level OCRBench | Ollama `minicpm-v4.6`; GGUF for llama.cpp; mlx-vlm (`minicpmv4_6`, `minicpmv4_7`); 4.7 Ollama location **unverified** | Good tiny option for batch throughput |
| Moondream 2 | 2B | Apache-2.0 | caption, query, detect, point, OCR-by-prompt | transformers (`trust_remote_code`); Ollama `moondream` (revision **unverified**) | Very small; good detector companion |
| Moondream 3 Preview / 3.1 | 9B MoE, about 2B active | 3 Preview: BSL 1.1; 3.1: Moondream Model License 1.0 (commercial use OK, hosted-service restriction) | query, detect, point, caption ("structured output"); OCR not mentioned for 3.1 | Photon runtime (Apple Silicon); llama.cpp / Ollama quants per card; mlx-vlm `moondream3` | Check the licence before use |
| SmolVLM2 | 256M, 500M, 2.2B | Apache-2.0 | 2.2B: OCRBench 72.9; no grounding claimed | llama.cpp; mlx-vlm; no official Ollama page | Weak on OCR; a budget fallback |
| **Florence-2** | 0.23B, 0.77B | MIT | Task tokens: `<OCR>`, `<OCR_WITH_REGION>`, `<OD>`, `<CAPTION_TO_PHRASE_GROUNDING>`, `<OPEN_VOCABULARY_DETECTION>`, `<MORE_DETAILED_CAPTION>` | transformers (native class or remote code); mlx-vlm | Not a JSON/chat model; use as a **detector / OCR helper** |
| PaliGemma 2 | 3B, 10B, 28B | Gemma Terms (gated) | Single-turn prefixes: `ocr`, `detect a ; b`, `caption en` | transformers; mlx-vlm | Not suited to free-form JSON |
| InternVL3.5 | 1B, 2B, 4B+ | Apache-2.0 | OCR / grounding benchmarks on card | transformers; llama.cpp (`internvl`); mlx-vlm; no official Ollama page | Viable alternative |
| LFM2-VL / LFM2.5-VL | 450M, 1.6B | LFM Open License v1.0 (revenue threshold ≥ US$10M) | 1.6B OCRBench 729 | transformers ≥4.57; mlx-vlm | Licence restriction |
| Granite Vision 4.1 | 4B | Apache-2.0 | Documents; card warns it "may not generalize well to open-ended" tasks | transformers; older version on Ollama | Poor fit |
| LLaVA-OneVision | 0.5B, 7B | Apache-2.0 | n/a | transformers | Outclassed (2024) |

Sources for this table:
- Qwen: [Qwen3-VL collection](https://huggingface.co/collections/Qwen/qwen3-vl), [Qwen3-VL-4B card](https://huggingface.co/Qwen/Qwen3-VL-4B-Instruct), [Ollama qwen3-vl](https://ollama.com/library/qwen3-vl), [Qwen3.5-4B card](https://huggingface.co/Qwen/Qwen3.5-4B), [Ollama qwen3.5](https://ollama.com/library/qwen3.5), [Qwen2.5-VL-3B card](https://huggingface.co/Qwen/Qwen2.5-VL-3B-Instruct), [Qwen2.5-VL-3B API (licence)](https://huggingface.co/api/models/Qwen/Qwen2.5-VL-3B-Instruct), [Ollama qwen2.5vl](https://ollama.com/library/qwen2.5vl).
- Gemma: [Gemma 4 E4B card](https://huggingface.co/google/gemma-4-E4B-it), [Gemma vision docs](https://ai.google.dev/gemma/docs/capabilities/vision), [Ollama gemma4](https://ollama.com/library/gemma4), [Gemma 3 4B card](https://huggingface.co/google/gemma-3-4b-it), [Gemma 3n card](https://huggingface.co/google/gemma-3n-E4B-it), [Ollama gemma3n](https://ollama.com/library/gemma3n), [PaliGemma 2 card](https://huggingface.co/google/paligemma2-3b-mix-448).
- MiniCPM-V: [repo](https://github.com/OpenBMB/MiniCPM-V), [4.7-1B card](https://huggingface.co/openbmb/MiniCPM-V-4.7-1B), [4.6 card](https://huggingface.co/openbmb/MiniCPM-V-4.6).
- Moondream: [Moondream 2](https://huggingface.co/vikhyatk/moondream2), [Moondream 3 Preview](https://huggingface.co/moondream/moondream3-preview), [Moondream 3.1](https://huggingface.co/moondream/moondream3.1-9B-A2B), [Moondream licence 1.0](https://moondream.ai/licenses/model/1.0).
- Other models: [SmolVLM2](https://huggingface.co/HuggingFaceTB/SmolVLM2-2.2B-Instruct), [Florence-2](https://huggingface.co/microsoft/Florence-2-large), [InternVL3.5-2B](https://huggingface.co/OpenGVLab/InternVL3_5-2B), [LFM2-VL-1.6B](https://huggingface.co/LiquidAI/LFM2-VL-1.6B), [LFM licence](https://huggingface.co/LiquidAI/LFM2-VL-1.6B/raw/main/LICENSE), [Granite Vision 4.1](https://huggingface.co/ibm-granite/granite-vision-4.1-4b), [LLaVA-OneVision](https://huggingface.co/llava-hf/llava-onevision-qwen2-7b-ov-hf).
- Runtimes: [llama.cpp multimodal](https://github.com/ggml-org/llama.cpp/blob/master/docs/multimodal.md), [llama.cpp mtmd models](https://github.com/ggml-org/llama.cpp/tree/master/tools/mtmd/models), [mlx-vlm models](https://github.com/Blaizzy/mlx-vlm/tree/main/mlx_vlm/models).

### Runtimes and constrained JSON output

- **Ollama** ([docs](https://docs.ollama.com/capabilities/structured-outputs)):
  - `format` accepts a full JSON Schema (for example from Pydantic `model_json_schema()`), and the docs show it with an `images` input.
  - The docs advise `temperature: 0` and also including the schema text in the prompt.
  - Structured outputs are not supported on Ollama cloud, which does not matter for local use.
- **llama.cpp** ([grammars README](https://github.com/ggml-org/llama.cpp/blob/master/grammars/README.md)):
  - It converts a JSON Schema subset to GBNF. `llama-server` accepts `response_format: {type: "json_schema", ...}`.
  - The schema is **not** injected into the prompt, so describe it yourself.
  - Limits: no nested `$ref`, `pattern` must be anchored, and `minimum`/`maximum` work on integers only.
  - Run vision through `llama-mtmd-cli` or `llama-server --mmproj` ([multimodal docs](https://github.com/ggml-org/llama.cpp/blob/master/docs/multimodal.md)).
- **mlx-vlm** (MIT, v0.7.8, 2026-10-13) ([repo](https://github.com/Blaizzy/mlx-vlm)):
  - `mlx_vlm.server` is OpenAI-compatible and "constrains generation to the supplied JSON schema".
  - Structured output cannot be combined with speculative decoding.

### Example JSON schema and prompt for the VLM step

The schema is a *recommendation*. It deliberately separates **observed** text from **inferred** facts and carries per-field evidence. That lets the reconcile step reject hallucinated numbers.

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": ["cars", "visible_text", "scene", "description"],
  "properties": {
    "cars": {
      "type": "array",
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": ["car_number", "car_number_legible", "livery_colors", "sponsors"],
        "properties": {
          "car_number":          { "type": ["string", "null"], "description": "Race number exactly as painted, digits only; null if not clearly readable" },
          "car_number_legible":  { "type": "string", "enum": ["clear", "partial", "not_visible"] },
          "car_number_location": { "type": "array", "items": { "type": "string", "enum": ["door", "bonnet", "roof", "windscreen", "rear", "nose", "side_panel", "other"] } },
          "team_name":           { "type": ["string", "null"], "description": "Only if the team name is written on the car" },
          "manufacturer_model":  { "type": ["string", "null"], "description": "Inferred, e.g. 'Porsche 911 GT3 R'" },
          "car_type":            { "type": ["string", "null"], "description": "e.g. GT3, prototype, single-seater, touring car, rally car, kart, stock car" },
          "livery_colors":       { "type": "array", "items": { "type": "string" }, "description": "Dominant colours, most prominent first" },
          "livery_description":  { "type": "string", "description": "Patterns, stripes, graphics, finish (matte/gloss/chrome)" },
          "sponsors": {
            "type": "array",
            "items": {
              "type": "object",
              "additionalProperties": false,
              "required": ["name", "evidence"],
              "properties": {
                "name":     { "type": "string" },
                "evidence": { "type": "string", "enum": ["text_readable", "logo_recognized", "uncertain"] },
                "location": { "type": "string" }
              }
            }
          }
        }
      }
    },
    "series_or_event": { "type": ["string", "null"], "description": "Only if indicated by visible text/branding (e.g. series logo on windscreen banner)" },
    "visible_text":    { "type": "array", "items": { "type": "string" }, "description": "Every legible text string, verbatim, including partial words" },
    "scene": {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "setting":       { "type": "string", "enum": ["on_track", "pit_lane", "garage", "paddock", "grid", "podium", "other"] },
        "shot_type":     { "type": "string", "description": "e.g. panning, head-on, close-up detail, wide" },
        "motion_blur":   { "type": "string", "enum": ["none", "background_only", "subject"] },
        "weather_light": { "type": "string" },
        "people":        { "type": "string", "description": "Drivers/crew/marshals present, no identification" }
      }
    },
    "description": { "type": "string", "description": "2-4 sentence factual caption for search" }
  }
}
```

Prompt (send with the image, the schema in `format`, `temperature: 0`):

```text
You are cataloguing motorsport photographs for a search index.
Describe ONLY what is visible. Do not guess.
Rules:
- car_number: copy the race number exactly as painted. If any digit is occluded, blurred,
  or ambiguous, set car_number to null and car_number_legible to "partial".
  Ignore numbers that are not the race number (phone numbers, URLs, model names, dates).
- sponsors: list a sponsor only if its name is readable (evidence "text_readable") or its
  logo is unmistakable (evidence "logo_recognized"); otherwise use "uncertain".
- visible_text: transcribe every legible string verbatim; do not correct spelling.
- series_or_event, team_name: fill only if written on the car or in the frame.
- If several cars are visible, add one entry per car, most prominent first.
Return JSON matching this schema:
<paste schema here>
```

Optional hint mode (*recommendation*): append "OCR detected these strings: [...]" to the prompt. It improves sponsor spelling, but it can **anchor** the model to OCR mistakes. Run a blind pass first, and use hints only for the `visible_text` and `sponsors` fields, so that `car_number` remains an independent second opinion.

---

## 4. Logo detection and recognition

### Detectors (to find candidate logo crops)

| Model | License | Mode | Notes |
|---|---|---|---|
| **OWLv2** (`google/owlv2-base-patch16-ensemble`) | Apache-2.0 (card says "research output") | text-query **and image-guided one-shot** (`image_guided_detection`, `query_images`) | Use a reference logo crop as the query to find it in a photo |
| **Grounding DINO** (T / B) | Apache-2.0 | text prompts | Repo documents CPU mode; MPS not mentioned. Grounding DINO 1.5 is accessed via a cloud API token |
| **YOLO-World** | Original repo GPL-3.0 (commercial licence on request); Ultralytics package AGPL-3.0 | text prompts (`set_classes`); original repo also supports image prompts | Fast. Watch the copyleft licences |
| **Florence-2** | MIT | `<OD>`, `<REGION_PROPOSAL>`, `<CAPTION_TO_PHRASE_GROUNDING>`, `<OPEN_VOCABULARY_DETECTION>` | One small model for OCR, detection and grounding |

Sources:
- OWLv2: [transformers docs](https://huggingface.co/docs/transformers/model_doc/owlv2), [model card](https://huggingface.co/google/owlv2-base-patch16-ensemble).
- Grounding DINO: [repo](https://github.com/IDEA-Research/GroundingDINO), [1.5 API](https://github.com/IDEA-Research/Grounding-DINO-1.5-API).
- YOLO-World: [repo](https://github.com/AILab-CVC/YOLO-World), [Ultralytics docs](https://docs.ultralytics.com/models/yolo-world/), [Ultralytics licence via GitHub](https://github.com/ultralytics/ultralytics).
- Florence-2: [card](https://huggingface.co/microsoft/Florence-2-large), [transformers docs](https://huggingface.co/docs/transformers/model_doc/florence2).

### Datasets

| Dataset | Size | Access / licence | Source |
|---|---|---|---|
| LogoDet-3K | 3,000 classes, 158,652 images, about 200k objects | arXiv 2008.05359 | https://arxiv.org/abs/2008.05359 |
| OpenLogo (QMUL) | 352 classes, 27,083 images | Academic research only | https://hangsu0730.github.io/qmul-openlogo/ |
| FlickrLogos-32/47 | 32 brands, 8,240 images | By email request; Flickr ToS | https://www.uni-augsburg.de/en/fakultaet/fai/informatik/prof/mmc/research/datensatze/flickrlogos/ |
| Open Brands | about 1.44M images, 559 brands | Download location not stated on arXiv | https://arxiv.org/abs/2012.07350 |

These datasets are useful for *evaluating* a matcher. You do not need them to build one, because you will curate your own sponsor gallery.

### Crop + embedding gallery matching

- **Prior art**:
  - "Open Set Logo Detection and Retrieval" (VISAPP 2018) uses a generic logo detector followed by embedding comparison against an exemplar ([arXiv 1710.10891](https://arxiv.org/abs/1710.10891)).
  - "Image-Text Pre-Training for Logo Recognition" (WACV 2023) shows that logo matching needs text sensitivity, and that image-text (CLIP-style) pre-training helps most on text-dominant logos ([arXiv 2309.10206](https://arxiv.org/abs/2309.10206)).
  - FashionLOGO uses an MLLM for logo embeddings ([arXiv 2308.09012](https://arxiv.org/abs/2308.09012)).
  - I found no paper doing exactly "zero-shot CLIP/SigLIP sponsor gallery matching on race cars". The recipe below is an engineering *inference* from these papers.
- **Recipe** (*recommendation*):
  1. Build `gallery/<sponsor>/*.png`, with 3–10 references per sponsor (official vector logo plus real crops from your photos).
  2. Embed each reference with SigLIP 2 (`get_image_features`) and L2-normalise. Store one vector per reference, or a per-sponsor mean.
  3. For each photo, get candidate crops from OWLv2 (text query "logo", "sponsor decal", or image-guided with each gallery logo), Florence-2 `<REGION_PROPOSAL>`, or OCR text boxes expanded by a margin.
  4. Embed the crops and take the top-1 cosine match. Accept if it is above a threshold tuned on about 50 labelled photos, and if the margin to the top-2 is large enough.
  5. Short-circuit: if OCR already reads a sponsor wordmark (fuzzy-matched against the sponsor list), accept it with evidence `ocr`. Logo matching then mainly adds symbol-only marks such as the Shell pecten or a manufacturer badge.

---

## 5. Embeddings and search

### Image vs. text embeddings

- **Text embeddings of the `.txt`** carry everything the pipeline verified: numbers, sponsor names, series, colours as words. Queries like "yellow Porsche with Pirelli" match well, and a small LLM can use them as RAG context. This is the **primary index** (*recommendation*).
- **Image embeddings** (SigLIP 2 / CLIP) support "find photos that look like this one", text-to-image queries for things the caption missed (for example "car on the kerb, sparks"), and near-duplicate detection in bursts. CLIP-style models are **not reliable at reading specific numbers**. Never use them alone for number search (*inference*; consistent with the text-sensitivity findings in [arXiv 2309.10206](https://arxiv.org/abs/2309.10206)).
- **Exact race numbers need keyword search.** A query for "44" should be an exact term or filter match (BM25, or a metadata `car_number = '44'` filter), not semantic similarity. Use **hybrid search**: BM25 plus vector, fused with Reciprocal Rank Fusion.

### Image embedding models

| Model | License | Size | Notes | Source |
|---|---|---|---|---|
| SigLIP 2 (B / L / So400m / g) | Apache-2.0 (checked: base-patch16-224) | 86M / 303M / 400M / 1B (vision tower) | Multilingual; better localisation and dense features; NaFlex variable-resolution variants | https://arxiv.org/abs/2502.14786, https://huggingface.co/google/siglip2-base-patch16-224 |
| OpenCLIP (incl. SigLIP/SigLIP2 weights) | Code MIT; weight licences vary per model | various | `open_clip.list_pretrained()` | https://github.com/mlfoundations/open_clip |
| Apple MobileCLIP2 | Code MIT; weights under Apple ML Research Model Terms; data CC-BY-NC-ND | S0: 11.4M image + 63.4M text params | Very fast on Apple devices | https://github.com/apple/ml-mobileclip |
| nomic-embed-vision-v1.5 | Apache-2.0 | 92.9M | Shares an embedding space with nomic-embed-text-v1.5 | https://huggingface.co/nomic-ai/nomic-embed-vision-v1.5 |

Qwen also publishes `Qwen3-VL-Embedding-2B/8B` (Jan 2026) for multimodal embeddings. I did not evaluate them beyond confirming they exist ([HF Qwen org](https://huggingface.co/Qwen)).

### Text embedding models

| Model | License | Size | Dims | Max tokens | Notes | Source |
|---|---|---|---|---|---|---|
| all-MiniLM-L6-v2 | Apache-2.0 | 22.7M | 384 | 256 word pieces | Baseline; truncates long sidecars | https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2 |
| bge-small-en-v1.5 | MIT | 33.4M | 384 | 512 | Good small default | https://huggingface.co/BAAI/bge-small-en-v1.5 |
| bge-m3 | MIT | (not on card) | 1024 | 8192 | Dense + sparse (lexical) + multi-vector in one model | https://huggingface.co/BAAI/bge-m3 |
| nomic-embed-text-v1.5 | Apache-2.0 | about 0.1B | 768 (Matryoshka down to 64) | 8192 | Requires `search_document:` / `search_query:` prefixes; on Ollama | https://huggingface.co/nomic-ai/nomic-embed-text-v1.5 |
| nomic-embed-text-v2-moe | Apache-2.0 | 475M total / 305M active | 768 | 512 | Multilingual | https://huggingface.co/nomic-ai/nomic-embed-text-v2-moe |
| EmbeddingGemma-300m | Gemma Terms (gated) | 0.3B | 768 (MRL 512/256/128) | 2048 | Task-prefixed prompts | https://huggingface.co/google/embeddinggemma-300m |
| Qwen3-Embedding-0.6B / 4B / 8B | Apache-2.0 | 0.6B / 4B / 8B | 1024 / 2560 / 4096 | 32K | Instruction-prefixed queries | https://huggingface.co/Qwen/Qwen3-Embedding-0.6B |

### Local vector databases

| DB | Hybrid / BM25 natively? | Local mode | Notes | Source |
|---|---|---|---|---|
| **LanceDB** | **Yes**: native BM25 FTS index plus `query_type="hybrid"`, default RRF reranker | Embedded (`lancedb.connect("path")`) | Recommended; multiple vector columns (text plus image) in one table | https://docs.lancedb.com/search/hybrid-search, https://docs.lancedb.com/search |
| Qdrant | Yes: prefetch dense + sparse, fused with RRF / DBSF; BM25 via sparse vectors with `modifier: idf` | Python client local mode (`path=...`) for dev/prototyping; hybrid in local mode **unverified** | Missing IDF modifier silently degrades ranking | https://qdrant.tech/documentation/concepts/hybrid-queries/, https://qdrant.tech/documentation/search/text-search/full-text-search/, https://github.com/qdrant/qdrant-client |
| Chroma | Hybrid (RRF Search API) documented as **Chroma Cloud only**; local has metadata filtering, keyword/regex filters, a BM25 embedding function | Yes | Fuse results yourself locally | https://docs.trychroma.com/docs/overview/introduction, https://docs.trychroma.com/cloud/search-api/hybrid-search, https://docs.trychroma.com/integrations/embedding-models/chroma-bm25 |
| sqlite-vec + FTS5 | No built-in fusion; FTS5 gives `bm25()` and sqlite-vec gives KNN, so you fuse with RRF in SQL or Python | Single file | Pre-v1 ("expect breaking changes"); simplest possible stack | https://github.com/asg017/sqlite-vec, https://www.sqlite.org/fts5.html |

**FTS footgun.** SQLite FTS5's trigram tokenizer does not match queries shorter than 3 characters, so it fails on "7" or "44". Use the default `unicode61` tokenizer, which treats digits as tokens ([FTS5 docs](https://www.sqlite.org/fts5.html)). Store `car_number` as its own filterable column regardless of the database (*recommendation*).

---

## 6. Existing EXIF/IPTC/XMP metadata and write-back

### Reading what is already there

Useful EXIF tags ([ExifTool EXIF tag table](https://exiftool.org/TagNames/EXIF.html)):

| Tag | ID | Why it matters |
|---|---|---|
| `Make`, `Model` | 0x010f, 0x0110 | Camera |
| `LensModel` | 0xa434 | Lens |
| `FocalLength` | 0x920a | Long lens implies distant car and small numbers (crop pass) |
| `ExposureTime` | 0x829a | Slow shutter implies a panning shot and blur (lower OCR confidence expectations) |
| `FNumber`, `ISO` | 0x829d, 0x8827 | Exposure settings |
| `DateTimeOriginal` + `OffsetTimeOriginal` + `SubSecTimeOriginal` | 0x9003 / 0x9011 / 0x9291 | Match the photo to a session; order bursts |
| `GPSInfo` | 0x8825 | Circuit or corner |
| `SerialNumber` | 0xa431 | Which body (multi-photographer events) |

Which tags a given camera actually writes varies. GPS is often missing on interchangeable-lens bodies that are not paired with a phone (**unverified** generalisation).

Tools:
- **ExifTool** ([docs](https://exiftool.org/exiftool_pod.html)):
  - `exiftool -json -n -struct` for machine-readable output.
  - `-stay_open True -@ -` to batch many files through one process.
- **Pillow 13**:
  - `Image.getexif()` returns an `Exif` object, and `ExifTags.TAGS` / `GPSTAGS` give readable names ([Image](https://pillow.readthedocs.io/en/stable/reference/Image.html), [ExifTags](https://pillow.readthedocs.io/en/stable/reference/ExifTags.html)).
  - `getxmp()` needs `defusedxml`.
- **piexif** is MIT, but its last release was 1.1.3 in 2019, so treat it as unmaintained ([PyPI](https://pypi.org/project/piexif/), [repo](https://github.com/hMatoba/Piexif)).
- **PyExifTool** (a Python wrapper over a persistent exiftool process) is at 0.5.6 on PyPI ([PyPI](https://pypi.org/project/PyExifTool/), [repo](https://github.com/sylikc/pyexiftool)).

### Writing extracted keywords back (in addition to `.txt`)

*Recommendation*: yes, but write to **XMP sidecars** (`photo.xmp`) rather than the originals. Lightroom, Capture One, Photo Mechanic and macOS tools can then search the same keywords, and the original files stay untouched.

Field mapping ([IPTC Photo Metadata 2025.1](https://www.iptc.org/std/photometadata/specification/IPTC-PhotoMetadata-2025.1.html), [ExifTool XMP tags](https://exiftool.org/TagNames/XMP.html), [ExifTool IPTC tags](https://exiftool.org/TagNames/IPTC.html)). The mapping is my *recommendation*, not IPTC guidance:

| Extracted field | XMP / IPTC field |
|---|---|
| keywords (`car-44`, sponsors, colours) | `XMP-dc:Subject` (list); legacy `IPTC:Keywords` (64 bytes per keyword) |
| description | `XMP-dc:Description` (lang-alt); legacy `IPTC:Caption-Abstract` (2000 bytes) |
| sponsors / team | `XMP-iptcExt:OrganisationInImageName` (list) |
| car make/model | `XMP-iptcExt:ProductInImage` (struct) |
| event | `XMP-iptcExt:Event` |
| number / logo boxes | `XMP-iptcExt:ImageRegion` |
| AI provenance | IPTC 2025.1 AI fields: `AISystemUsed`, `AISystemVersionUsed`, `AIPromptInformation` |
| hierarchical tags (`Sponsors\|Pirelli`) | `XMP-lr:HierarchicalSubject` |

ExifTool mechanics ([exiftool_pod](https://exiftool.org/exiftool_pod.html), [metafiles](https://exiftool.org/metafiles.html)):
- Add list items with `-XMP-dc:Subject+=car-44`.
- Deduplicate with `-sep '##' '-keywords<${keywords;NoDups}'`.
- ExifTool keeps `*_original` backups unless you pass `-overwrite_original`. `-P` preserves the file mtime.
- Create one sidecar per image with `exiftool -ext jpg -o %d%f.xmp -r DIR`.
- Writing new tags directly into an existing sidecar can be done with `-srcfile %d%f.xmp`. The exact combined command is extrapolated from documented patterns (**unverified**; test it on copies first).
- Legacy IPTC (IIM) defaults to Latin characters unless `CodedCharacterSet` is set (`-charset iptc`). Prefer XMP, which is UTF-8.

---

## Known pitfalls and mitigations

| Pitfall | Why | Mitigation |
|---|---|---|
| **VLM hallucinates or "completes" a race number** | VLMs produce plausible tokens even when digits are occluded (*inference*; same failure class as the generic OCR errors in the bib literature) | Schema allows `null` and `car_number_legible: "partial"`. Accept a number only when VLM == OCR, or when it is in the event entry list. Otherwise store it under `car_number_candidates` |
| **Other numbers in frame** (phone numbers, URLs, model names, pit boards, other cars) | Scene contains many digit strings | Prompt explicitly excludes them. OCR regex rules (1–3 digits, large box height relative to the car). Prefer numbers found at door/bonnet/roof positions |
| **Partial occlusion** (other cars, kerbs, drivers, crop) | Racing context | Numbers usually appear on 2–4 surfaces, so aggregate across surfaces and across burst frames (same timestamp ±2 s, from `SubSecTimeOriginal`) |
| **Italic, outlined, stylised or mirrored fonts; curved bodywork** | Scene text, not documents. Tesseract assumes pages and lines ([ImproveQuality](https://tesseract-ocr.github.io/tessdoc/ImproveQuality.html)) | Use scene-text-capable engines (Vision, PP-OCRv6). Try crop and upscale; optionally try a horizontally flipped crop for mirrored or reflected text (*recommendation*) |
| **Motion blur** (slow-shutter panning) | Read `ExposureTime` from EXIF | Expect lower OCR confidence on slow-shutter frames. Raise the agreement requirement instead of lowering thresholds. The Qwen3-VL card claims OCR robust to "blur and tilt", but verify on your own photos |
| **Small decals far away** | Long lens, wide framing | Run OCR on 2–3x upscaled crops of number and decal regions. For VLMs, use a higher image token budget (Gemma 4: up to 1120) or tile the crops |
| **Sponsor misspellings / near-miss logos** | OCR character errors; similar logos | Fuzzy-match OCR text against a sponsor list. Logo matching needs a similarity threshold plus a top-1/top-2 margin |
| **Multiple cars in one frame** | Battles, grid shots | Schema has `cars[]`. Index each car's number as a separate keyword |
| **Confidence semantics differ** | PaddleOCR and EasyOCR scores are not on the same scale; Florence-2 gives no per-token score | Use PaddleOCR or EasyOCR when you need scores. Calibrate thresholds per engine on about 50 labelled photos |
| **Licence traps** | Qwen2.5-VL-3B is research-only; Moondream 3 is BSL / custom; YOLO-World is GPL/AGPL; OpenLogo is academic-only; Gemma 3 / EmbeddingGemma use Gemma Terms | Prefer the Apache-2.0 / MIT set: Qwen3-VL, Qwen3.5, Gemma 4, MiniCPM-V 4.6/4.7, Florence-2, SigLIP 2, OWLv2, bge, nomic, Qwen3-Embedding |
| **Off-the-shelf accuracy ceiling** | "Beyond the Mud": 15% F1 off-the-shelf, 53% fine-tuned on muddy motorcycles; ICPRAM 2024: a fine-tuned digit detector beats general OCR | If you need high recall, label a few hundred of your own photos and fine-tune a number detector (for example YOLO trained on number regions, then OCR) |

---

## Open questions and unverified items

- Real-world accuracy of any listed VLM on race-car numbers: no benchmark exists. Build a 50–100 photo labelled evaluation set before choosing a model.
- llama.cpp support for Qwen3.5 vision. Whether the Ollama `moondream` tag matches the latest revision. Where MiniCPM-V 4.7 lives on Ollama.
- Apple Vision's use of the ANE.
- MPS acceleration for PaddleOCR classic, EasyOCR, docTR, Grounding DINO and Florence-2 (none is documented).
- Grounding coordinate format for Qwen3-VL / Qwen3.5 (not stated on the cards).
- Qdrant local mode with sparse/IDF hybrid.
- Licences of the RnD and MUDD datasets. Contents of the Roboflow race-car-number dataset. Claims of commercial taggers (RaceTagger, TagOMatic).

---

## Sources

**OCR**
- https://developer.apple.com/documentation/vision/vnrecognizetextrequest
- https://developer.apple.com/documentation/vision/recognizing-text-in-images
- https://developer.apple.com/documentation/vision/vnrecognizetextrequest/customwords
- https://developer.apple.com/documentation/vision/vnrecognizetextrequest/minimumtextheight
- https://developer.apple.com/documentation/vision/recognizetextrequest
- https://developer.apple.com/documentation/vision/recognizedocumentsrequest
- https://github.com/straussmaximilian/ocrmac
- https://github.com/PaddlePaddle/PaddleOCR
- https://www.paddleocr.ai/latest/en/
- https://huggingface.co/PaddlePaddle/PP-OCRv6_medium_rec
- https://huggingface.co/PaddlePaddle/PaddleOCR-VL
- https://huggingface.co/PaddlePaddle/PaddleOCR-VL-1.6
- https://www.paddleocr.ai/latest/en/version3.x/pipeline_usage/PaddleOCR-VL-Apple-Silicon.html
- https://github.com/JaidedAI/EasyOCR
- https://github.com/JaidedAI/EasyOCR/releases
- https://www.jaided.ai/easyocr/documentation/
- https://github.com/mindee/doctr
- https://github.com/mindee/doctr/releases
- https://github.com/tesseract-ocr/tesseract
- https://github.com/tesseract-ocr/tesseract/releases
- https://tesseract-ocr.github.io/tessdoc/ImproveQuality.html

**VLMs and runtimes**
- https://huggingface.co/collections/Qwen/qwen3-vl
- https://huggingface.co/Qwen/Qwen3-VL-4B-Instruct
- https://ollama.com/library/qwen3-vl
- https://huggingface.co/Qwen/Qwen3.5-4B
- https://ollama.com/library/qwen3.5
- https://huggingface.co/Qwen/Qwen2.5-VL-3B-Instruct
- https://huggingface.co/api/models/Qwen/Qwen2.5-VL-3B-Instruct
- https://ollama.com/library/qwen2.5vl
- https://huggingface.co/google/gemma-4-E4B-it
- https://ai.google.dev/gemma/docs/capabilities/vision
- https://ollama.com/library/gemma4
- https://huggingface.co/google/gemma-3-4b-it
- https://huggingface.co/google/gemma-3n-E4B-it
- https://ollama.com/library/gemma3n
- https://huggingface.co/google/paligemma2-3b-mix-448
- https://huggingface.co/vikhyatk/moondream2
- https://huggingface.co/moondream/moondream3-preview
- https://huggingface.co/moondream/moondream3.1-9B-A2B
- https://moondream.ai/licenses/model/1.0
- https://huggingface.co/HuggingFaceTB/SmolVLM2-2.2B-Instruct
- https://huggingface.co/microsoft/Florence-2-large
- https://huggingface.co/docs/transformers/model_doc/florence2
- https://huggingface.co/LiquidAI/LFM2-VL-1.6B
- https://huggingface.co/LiquidAI/LFM2-VL-1.6B/raw/main/LICENSE
- https://github.com/OpenBMB/MiniCPM-V
- https://huggingface.co/openbmb/MiniCPM-V-4.7-1B
- https://huggingface.co/openbmb/MiniCPM-V-4.6
- https://huggingface.co/OpenGVLab/InternVL3_5-2B
- https://huggingface.co/ibm-granite/granite-vision-4.1-4b
- https://huggingface.co/microsoft/Phi-4-multimodal-instruct
- https://huggingface.co/llava-hf/llava-onevision-qwen2-7b-ov-hf
- https://docs.ollama.com/capabilities/structured-outputs
- https://ollama.com/blog/structured-outputs
- https://github.com/ggml-org/llama.cpp/blob/master/grammars/README.md
- https://github.com/ggml-org/llama.cpp/blob/master/docs/multimodal.md
- https://github.com/ggml-org/llama.cpp/tree/master/tools/mtmd/models
- https://github.com/Blaizzy/mlx-vlm
- https://github.com/Blaizzy/mlx-vlm/tree/main/mlx_vlm/models

**Logo detection**
- https://huggingface.co/docs/transformers/model_doc/owlv2
- https://huggingface.co/google/owlv2-base-patch16-ensemble
- https://github.com/IDEA-Research/GroundingDINO
- https://github.com/IDEA-Research/Grounding-DINO-1.5-API
- https://github.com/AILab-CVC/YOLO-World
- https://docs.ultralytics.com/models/yolo-world/
- https://github.com/ultralytics/ultralytics
- https://arxiv.org/abs/2008.05359
- https://hangsu0730.github.io/qmul-openlogo/
- https://www.uni-augsburg.de/en/fakultaet/fai/informatik/prof/mmc/research/datensatze/flickrlogos/
- https://arxiv.org/abs/2012.07350
- https://arxiv.org/abs/1710.10891
- https://arxiv.org/abs/2309.10206
- https://arxiv.org/abs/2308.09012

**Embeddings and vector DBs**
- https://github.com/mlfoundations/open_clip
- https://github.com/mlfoundations/open_clip/blob/main/LICENSE
- https://arxiv.org/abs/2502.14786
- https://huggingface.co/google/siglip2-base-patch16-224
- https://github.com/apple/ml-mobileclip
- https://huggingface.co/nomic-ai/nomic-embed-vision-v1.5
- https://huggingface.co/Qwen
- https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2
- https://huggingface.co/BAAI/bge-small-en-v1.5
- https://huggingface.co/BAAI/bge-m3
- https://huggingface.co/nomic-ai/nomic-embed-text-v1.5
- https://huggingface.co/nomic-ai/nomic-embed-text-v2-moe
- https://huggingface.co/google/embeddinggemma-300m
- https://huggingface.co/Qwen/Qwen3-Embedding-0.6B
- https://docs.lancedb.com/search/hybrid-search
- https://docs.lancedb.com/search
- https://docs.lancedb.com/reranking/linear_combination
- https://qdrant.tech/documentation/concepts/hybrid-queries/
- https://qdrant.tech/documentation/search/text-search/full-text-search/
- https://qdrant.tech/documentation/search-tuning/before-tuning-a-qdrant-collection/
- https://github.com/qdrant/qdrant-client
- https://docs.trychroma.com/docs/overview/introduction
- https://docs.trychroma.com/cloud/search-api/hybrid-search
- https://docs.trychroma.com/integrations/embedding-models/chroma-bm25
- https://github.com/asg017/sqlite-vec
- https://www.sqlite.org/fts5.html

**EXIF / IPTC / XMP**
- https://exiftool.org/exiftool_pod.html
- https://exiftool.org/TagNames/EXIF.html
- https://exiftool.org/TagNames/XMP.html
- https://exiftool.org/TagNames/IPTC.html
- https://exiftool.org/metafiles.html
- https://www.iptc.org/std/photometadata/specification/IPTC-PhotoMetadata-2025.1.html
- https://pillow.readthedocs.io/en/stable/reference/Image.html
- https://pillow.readthedocs.io/en/stable/reference/ExifTags.html
- https://github.com/hMatoba/Piexif
- https://pypi.org/project/piexif/
- https://pypi.org/project/PyExifTool/
- https://github.com/sylikc/pyexiftool

**Race number / bib prior art**
- https://bmva-archive.org.uk/bmvc/2012/BMVC/paper019/index.html
- https://bmva-archive.org.uk/bmvc/2012/BMVC/paper019/paper019.pdf
- https://people.csail.mit.edu/talidekel/RBNR.html
- https://www.scitepress.org/Papers/2024/125624/125624.pdf
- https://aisel.aisnet.org/amcis2019/data_science_analytics_for_decision_support/data_science_analytics_for_decision_support/20
- https://ieeexplore.ieee.org/document/9412220/ (TGCRBNW; abstract page not fetched directly, so **unverified**)
- https://arxiv.org/abs/2402.08025
- https://arxiv.org/html/2402.08025v1
- https://github.com/JacobTyo/MUDD
- https://arxiv.org/abs/2310.13515
- https://constructor.tech/research/MI-based-application-for-racing
- https://universe.roboflow.com/race-car-detection/-wip-race-car-number-detection (**unverified** contents)
