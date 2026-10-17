import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import * as lancedb from "@lancedb/lancedb";

const INDEX_DIR = ".search-index";
const TABLE = "photos";
const EXIF_FIELDS = ["file", "captured_at", "camera", "gps"];

export async function buildIndex(library, embedder) {
  const sidecars = await readSidecars(library);
  if (sidecars.length === 0) {
    throw new Error(`No Sidecars found in ${library}: run the extractor first`);
  }

  const vectors = await embedder.embedDocuments(sidecars.map((sidecar) => sidecar.text));
  const rows = sidecars.map((sidecar, i) => ({ ...sidecar, vector: vectors[i] }));
  const db = await lancedb.connect(path.join(library, INDEX_DIR));
  const table = await db.createTable(TABLE, rows, { mode: "overwrite" });
  await table.createIndex("text", { config: lancedb.Index.fts() });
  await table.createIndex("car_numbers", { config: lancedb.Index.fts() });
  return rows.length;
}

export async function findCandidates(library, search, embedder, limit) {
  const db = await lancedb.connect(path.join(library, INDEX_DIR));
  if (!(await db.tableNames()).includes(TABLE)) {
    throw new Error(`No search index in ${library}: run build-index.mjs first`);
  }

  const table = await db.openTable(TABLE);
  const numberMatches = await table.query().fullTextSearch(search, { columns: "car_numbers" }).limit(limit).toArray();
  const ranked = await table
    .query()
    .fullTextSearch(search, { columns: "text" })
    .nearestTo(await embedder.embedQuery(search))
    .rerank(await lancedb.rerankers.RRFReranker.create())
    .limit(limit)
    .toArray();
  return [...new Set([...numberMatches, ...ranked].map((row) => row.photo))].slice(0, limit);
}

export function searchableText(sidecar) {
  return sidecar
    .split("\n")
    .filter((line) => !EXIF_FIELDS.some((field) => line.startsWith(`${field}:`)))
    .join("\n")
    .trim();
}

async function readSidecars(library) {
  const names = (await readdir(library)).filter((name) => name.endsWith(".txt")).sort();
  const sidecars = [];
  for (const name of names) {
    const content = await readFile(path.join(library, name), "utf8");
    const photo = readField(content, "file");
    if (photo) {
      sidecars.push({ photo, text: searchableText(content), car_numbers: readField(content, "car_numbers") ?? "" });
    }
  }
  return sidecars;
}

function readField(sidecar, name) {
  return sidecar.match(new RegExp(`^${name}: (.+)$`, "m"))?.[1];
}
