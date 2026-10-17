import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  type Connection,
  connect,
  Index,
  rerankers,
  type Table,
} from "@lancedb/lancedb";
import type { Embedder } from "#/server/embedder";
import {
  type Library,
  type Photo,
  raceNumbersOf,
  toPhotoCard,
} from "#/server/library";
import {
  CANDIDATE_LIMIT,
  type Candidate,
  type FindCandidates,
  lexicalSearch,
} from "#/server/search";

export const INDEX_DIR = ".search-index";
const TABLE = "photos";
const FINGERPRINT_FILE = "fingerprint";
// A timestamp or focal length must never match a race number.
const EXIF_FIELDS = ["file", "captured_at", "camera", "gps"];

interface IndexRow {
  car_numbers: string;
  id: string;
  text: string;
  vector: number[];
}

/** The Sidecar text that goes into the index, without the EXIF lines. */
export function searchableText(sidecarText: string): string {
  return sidecarText
    .split("\n")
    .filter(
      (line) => !EXIF_FIELDS.some((field) => line.startsWith(`${field}:`))
    )
    .join("\n")
    .trim();
}

const fingerprintOf = (photos: readonly Photo[]) =>
  createHash("sha256")
    .update(
      JSON.stringify(photos.map((photo) => [photo.id, photo.sidecarText]))
    )
    .digest("hex");

async function buildTable(
  db: Connection,
  photos: readonly Photo[],
  embedder: Embedder
): Promise<Table> {
  const indexed = photos
    .map((photo) => ({ photo, text: searchableText(photo.sidecarText) }))
    .filter(({ text }) => text !== "");
  if (indexed.length === 0) {
    throw new Error("No Sidecar text to index");
  }
  const vectors = await embedder.embedDocuments(
    indexed.map(({ text }) => text)
  );
  const rows: IndexRow[] = indexed.map(({ photo, text }, index) => ({
    id: photo.id,
    text,
    car_numbers: raceNumbersOf(photo.sidecar).join(" "),
    vector: vectors[index] ?? [],
  }));
  const table = await db.createTable(
    TABLE,
    rows as unknown as Record<string, unknown>[],
    {
      mode: "overwrite",
    }
  );
  await table.createIndex("text", { config: Index.fts() });
  await table.createIndex("car_numbers", { config: Index.fts() });
  return table;
}

const readOptional = (path: string) =>
  readFile(path, "utf8").catch(() => undefined);

/** Opens the Library's index, rebuilding it when the Sidecars changed since it was built. */
async function openIndex(
  library: Library,
  embedder: Embedder,
  fingerprint: string
): Promise<Table> {
  const dir = join(library.dir, INDEX_DIR);
  const db = await connect(dir);
  const fingerprintPath = join(dir, FINGERPRINT_FILE);
  if (
    (await readOptional(fingerprintPath)) === fingerprint &&
    (await db.tableNames()).includes(TABLE)
  ) {
    return db.openTable(TABLE);
  }
  const table = await buildTable(db, library.photos, embedder);
  await writeFile(fingerprintPath, fingerprint);
  return table;
}

/**
 * Hybrid search over a LanceDB index kept in `<library>/.search-index/`: Photos with a race number
 * from the Search first, then BM25 + vector search fused with RRF. Falls back to the lexical search
 * when the index or the Embedder is not available.
 */
export function hybridSearch(
  embedder: Embedder,
  limit = CANDIDATE_LIMIT
): FindCandidates {
  const indexes = new Map<
    string,
    { fingerprint: string; table: Promise<Table> }
  >();

  const tableFor = (library: Library) => {
    const fingerprint = fingerprintOf(library.photos);
    const cached = indexes.get(library.dir);
    if (cached?.fingerprint === fingerprint) {
      return cached.table;
    }
    const table = openIndex(library, embedder, fingerprint);
    indexes.set(library.dir, { fingerprint, table });
    table.catch(() => indexes.delete(library.dir));
    return table;
  };

  const search = async (
    library: Library,
    request: string
  ): Promise<Candidate[]> => {
    const table = await tableFor(library);
    const [numberMatches, ranked] = await Promise.all([
      table
        .query()
        .fullTextSearch(request, { columns: "car_numbers" })
        .limit(limit)
        .toArray(),
      table
        .query()
        .fullTextSearch(request, { columns: "text" })
        .nearestTo(await embedder.embedQuery(request))
        .rerank(await rerankers.RRFReranker.create())
        .limit(limit)
        .toArray(),
    ]);
    const photos = new Map(library.photos.map((photo) => [photo.id, photo]));
    const ids = [
      ...new Set([...numberMatches, ...ranked].map((row) => String(row.id))),
    ].slice(0, limit);
    return ids.flatMap((id, rank) => {
      const photo = photos.get(id);
      return photo
        ? [
            {
              ...toPhotoCard(photo),
              score: ids.length - rank,
              sidecarText: photo.sidecarText,
            },
          ]
        : [];
    });
  };

  return async (library, request) => {
    try {
      return await search(library, request);
    } catch (error) {
      console.warn("Hybrid search failed, using lexical search:", error);
      return lexicalSearch(library, request);
    }
  };
}
