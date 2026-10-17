#!/usr/bin/env node
import { readFile, readdir, stat, writeFile, access } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import exifr from "exifr";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp"]);

const USAGE = `Usage: node extract.mjs <image-or-folder>... [options]

Writes <photo>.txt (for search) and <photo>.json (structured data) next to each photo.

Options:
  --model <name>     Ollama model (default: gemma4:e4b)
  --host <url>       Ollama URL (default: http://localhost:11434)
  --entries <file>   Entry list, one race number per line; numbers not on it are rejected
  --force            Re-process photos that already have a .txt
  -h, --help         Show this help`;

const { values: opts, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    model: { type: "string", default: "gemma4:e4b" },
    host: { type: "string", default: "http://localhost:11434" },
    entries: { type: "string" },
    force: { type: "boolean", default: false },
    help: { type: "boolean", short: "h", default: false },
  },
});

if (opts.help || positionals.length === 0) {
  console.log(USAGE);
  process.exit(opts.help ? 0 : 1);
}

const schema = JSON.parse(await readFile(path.join(HERE, "schema.json"), "utf8"));
const systemPrompt = `${await readFile(path.join(HERE, "prompt.md"), "utf8")}\n${JSON.stringify(schema)}`;
const entryList = opts.entries ? await loadEntryList(opts.entries) : null;

const photos = await collectPhotos(positionals);
let failures = 0;

for (const [index, photo] of photos.entries()) {
  const label = `[${index + 1}/${photos.length}] ${path.relative(process.cwd(), photo)}`;
  const base = photo.slice(0, -path.extname(photo).length);

  if (!opts.force && (await exists(`${base}.txt`))) {
    console.log(`${label} skipped (already has .txt)`);
    continue;
  }

  try {
    const started = Date.now();
    const exif = await readExif(photo);
    const vision = await describePhoto(photo);
    const cars = vision.cars.map((car) => checkCar(car, entryList));
    const record = { file: path.basename(photo), model: opts.model, exif, ...vision, cars };

    await writeFile(`${base}.json`, `${JSON.stringify(record, null, 2)}\n`);
    await writeFile(`${base}.txt`, toSidecarText(record));

    const numbers = cars.map((car) => car.car_number ?? "?").join(", ") || "no cars";
    console.log(`${label} → ${numbers} (${((Date.now() - started) / 1000).toFixed(1)}s)`);
  } catch (error) {
    failures++;
    console.error(`${label} failed: ${error.message}`);
  }
}

process.exit(failures > 0 ? 1 : 0);

async function collectPhotos(inputs) {
  const found = [];
  for (const input of inputs) {
    const resolved = path.resolve(input);
    if ((await stat(resolved)).isDirectory()) {
      const names = await readdir(resolved, { recursive: true });
      found.push(...names.map((name) => path.join(resolved, name)).filter(isImage));
    } else if (isImage(resolved)) {
      found.push(resolved);
    } else {
      console.error(`Ignoring ${input}: supported formats are ${[...IMAGE_EXTENSIONS].join(", ")}`);
    }
  }
  return found.sort();
}

function isImage(file) {
  return IMAGE_EXTENSIONS.has(path.extname(file).toLowerCase());
}

async function exists(file) {
  return access(file).then(
    () => true,
    () => false,
  );
}

async function loadEntryList(file) {
  const lines = (await readFile(file, "utf8")).split(/\r?\n/);
  return new Set(lines.map((line) => line.trim()).filter(Boolean));
}

async function readExif(photo) {
  const tags = (await exifr.parse(photo).catch(() => null)) ?? {};
  return {
    captured_at: tags.DateTimeOriginal?.toISOString() ?? null,
    camera: cameraName(tags.Make, tags.Model),
    lens: tags.LensModel ?? null,
    focal_mm: tags.FocalLength ?? null,
    shutter_s: tags.ExposureTime ?? null,
    aperture: tags.FNumber ?? null,
    iso: tags.ISO ?? null,
    gps: tags.latitude != null ? { lat: tags.latitude, lon: tags.longitude } : null,
  };
}

function cameraName(make, model) {
  if (!model) return make ?? null;
  return make && !model.toLowerCase().startsWith(make.toLowerCase()) ? `${make} ${model}` : model;
}

async function describePhoto(photo) {
  const image = (await readFile(photo)).toString("base64");
  const response = await fetch(new URL("/api/chat", opts.host), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: opts.model,
      stream: false,
      think: false,
      format: schema,
      options: { temperature: 0 },
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: "Catalogue this photo.", images: [image] },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(`Ollama returned ${response.status}: ${await response.text()}`);
  }
  const { message } = await response.json();
  return normalizeEmpty(JSON.parse(message.content));
}

// Small models often write placeholder strings like "null" or "n/a" instead of a JSON null.
// "none" is deliberately kept: it is a valid value of scene.motion_blur.
function normalizeEmpty(value) {
  if (Array.isArray(value)) return value.map(normalizeEmpty).filter((item) => item !== null);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, normalizeEmpty(item)]));
  }
  if (typeof value === "string" && /^(null|n\/?a|unknown|-)?$/i.test(value.trim())) return null;
  return value;
}

// The model has no OCR cross-check, so a number is trusted only when it was read cleanly
// and, if an entry list is available, belongs to a car that is actually entered.
function checkCar(car, entries) {
  const reasons = [];
  if (car.car_number == null) {
    reasons.push("not_read");
  } else {
    if (car.car_number_legible !== "clear") reasons.push(`legibility_${car.car_number_legible}`);
    if (entries && !entries.has(car.car_number)) reasons.push("not_on_entry_list");
  }

  const accepted = reasons.length === 0;
  return {
    ...car,
    car_number: accepted ? car.car_number : null,
    car_number_candidate: accepted ? null : car.car_number,
    car_number_check: accepted ? (entries ? "clear+entry_list" : "clear") : reasons.join("+"),
  };
}

function toSidecarText(record) {
  const { exif, cars, scene } = record;
  const confirmedSponsors = cars.flatMap((car) =>
    car.sponsors.filter((sponsor) => sponsor.evidence !== "uncertain").map((sponsor) => sponsor.name),
  );
  const numbers = cars.map((car) => car.car_number).filter(Boolean);
  const carTypes = cars.map((car) => car.car_type).filter(Boolean);
  const colors = cars.flatMap((car) => car.livery_colors);

  const keywords = [
    ...numbers.map((number) => `car-${number}`),
    ...carTypes,
    ...cars.map((car) => car.class_label),
    ...cars.map((car) => car.team_name),
    ...confirmedSponsors,
    ...colors,
    scene.setting,
    record.series_or_event,
  ]
    .filter(Boolean)
    .map((keyword) => keyword.toLowerCase().replace(/\s+/g, "-"));

  const lines = [
    `file: ${record.file}`,
    field("captured_at", exif.captured_at),
    field(
      "camera",
      [
        exif.camera,
        exif.lens && `lens: ${exif.lens}`,
        exif.focal_mm && `focal_mm: ${exif.focal_mm}`,
        exif.shutter_s && `shutter_s: ${formatShutter(exif.shutter_s)}`,
        exif.iso && `iso: ${exif.iso}`,
      ]
        .filter(Boolean)
        .join(" | "),
    ),
    field("gps", exif.gps && `${exif.gps.lat.toFixed(5)}, ${exif.gps.lon.toFixed(5)}`),
    field("car_numbers", numbers.join("; ")),
    field(
      "car_number_candidates",
      cars
        .filter((car) => car.car_number_candidate)
        .map((car) => `${car.car_number_candidate} (${car.car_number_check})`)
        .join("; "),
    ),
    field("teams", unique(cars.map((car) => car.team_name)).join("; ")),
    field("classes", unique(cars.map((car) => car.class_label)).join("; ")),
    field("cars", unique(cars.map((car) => car.manufacturer_model)).join("; ")),
    field("car_types", unique(carTypes).join("; ")),
    field("series", record.series_or_event),
    field("sponsors", unique(confirmedSponsors).join("; ")),
    field("livery_colors", unique(colors).join("; ")),
    field("visible_text", record.visible_text.join(" | ")),
    field(
      "scene",
      [scene.setting, scene.shot_type, `motion_blur: ${scene.motion_blur}`, scene.weather_light, scene.people]
        .filter(Boolean)
        .join("; "),
    ),
    field("keywords", unique(keywords).join("; ")),
    "",
    field("description", record.description),
    "",
    ...cars.map((car, i) => `car_${i + 1}: ${describeCar(car)}`),
  ];

  return `${lines.filter((line) => line !== null).join("\n")}\n`;
}

function describeCar(car) {
  const sponsors = unique(
    car.sponsors.map((sponsor) => (sponsor.evidence === "uncertain" ? `${sponsor.name}?` : sponsor.name)),
  );
  return [
    `#${car.car_number ?? car.car_number_candidate ?? "?"} (${car.car_number_check})`,
    car.manufacturer_model,
    car.team_name && `team ${car.team_name}`,
    car.class_label && `class ${car.class_label}`,
    car.livery_colors.join(", "),
    car.livery_description,
    sponsors.length > 0 && `sponsors: ${sponsors.join(", ")}`,
    car.car_number_location.length > 0 && `number on: ${car.car_number_location.join(", ")}`,
  ]
    .filter(Boolean)
    .join(" | ");
}

function field(name, value) {
  return value ? `${name}: ${value}` : null;
}

function unique(items) {
  return [...new Set(items.filter(Boolean))];
}

function formatShutter(seconds) {
  return seconds >= 1 ? `${seconds}` : `1/${Math.round(1 / seconds)}`;
}
