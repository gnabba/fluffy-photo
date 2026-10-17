import { after, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { buildIndex, findCandidates, searchableText } from "./library-index.mjs";

const libraries = [];
after(() => Promise.all(libraries.map((library) => rm(library, { recursive: true, force: true }))));

const flatEmbedder = {
  embedDocuments: async (texts) => texts.map(() => [1, 0]),
  embedQuery: async () => [1, 0],
};

async function libraryWith(files) {
  const library = await mkdtemp(path.join(tmpdir(), "library-"));
  libraries.push(library);
  for (const [name, content] of Object.entries(files)) {
    await writeFile(path.join(library, name), content);
  }
  return library;
}

test("searchableText drops the EXIF fields and keeps the rest of the Sidecar", () => {
  const sidecar = [
    "file: a.jpg",
    "captured_at: 2026-09-14T15:42:07.000Z",
    "camera: Sony ILCE-1 | lens: FE 200-600mm | focal_mm: 560",
    "gps: 45.61560, 9.28110",
    "car_numbers: 44",
    "",
    "description: A black GT3 car on track.",
    "",
  ].join("\n");

  assert.equal(searchableText(sidecar), "car_numbers: 44\n\ndescription: A black GT3 car on track.");
});

test("a race number in the Search ranks the Photo with exactly that number first", async () => {
  const library = await libraryWith({
    "a.txt": "file: a.jpg\ncar_numbers: 98\n",
    "b.txt": "file: b.jpg\ncar_numbers: 9\n",
  });
  await buildIndex(library, flatEmbedder);

  const candidates = await findCandidates(library, "#9", flatEmbedder, 10);

  assert.equal(candidates[0], "b.jpg");
});

test("Photos with a race number from the Search come before Photos that are only closer in meaning", async () => {
  const library = await libraryWith({
    "a.txt": "file: a.jpg\ncar_numbers: 98\ndescription: A white car.\n",
    "b.txt": "file: b.jpg\ncar_numbers: 31\ndescription: A yellow car.\n",
    "c.txt": "file: c.jpg\ncar_numbers: 7\ndescription: A red car.\n",
  });
  const yellowEmbedder = {
    embedDocuments: async (texts) =>
      texts.map((text) => (text.includes("yellow") ? [1, 0] : text.includes("red") ? [0.8, 0.6] : [0, 1])),
    embedQuery: async () => [1, 0],
  };
  await buildIndex(library, yellowEmbedder);

  const candidates = await findCandidates(library, "yellow 98", yellowEmbedder, 10);

  assert.deepEqual(candidates, ["a.jpg", "b.jpg", "c.jpg"]);
});

test("a Search with no words in common with the Sidecars still ranks Photos by meaning", async () => {
  const library = await libraryWith({
    "a.txt": "file: a.jpg\ndescription: A GT3 car in the pit lane.\n",
    "b.txt": "file: b.jpg\ndescription: A stock car on an oval.\n",
  });
  const stockCarEmbedder = {
    embedDocuments: async (texts) => texts.map((text) => (text.includes("stock car") ? [1, 0] : [0, 1])),
    embedQuery: async () => [1, 0],
  };
  await buildIndex(library, stockCarEmbedder);

  const candidates = await findCandidates(library, "NASCAR racer", stockCarEmbedder, 10);

  assert.equal(candidates[0], "b.jpg");
});

test("returns at most `limit` Candidates", async () => {
  const library = await libraryWith({
    "a.txt": "file: a.jpg\ncar_numbers: 1\n",
    "b.txt": "file: b.jpg\ncar_numbers: 2\n",
    "c.txt": "file: c.jpg\ncar_numbers: 3\n",
  });
  await buildIndex(library, flatEmbedder);

  assert.equal((await findCandidates(library, "car", flatEmbedder, 2)).length, 2);
});

test("ignores .txt files in the Library that are not Sidecars", async () => {
  const library = await libraryWith({
    "a.txt": "file: a.jpg\ncar_numbers: 9\n",
    "entries.txt": "9\n98\n",
  });
  await buildIndex(library, flatEmbedder);

  assert.deepEqual(await findCandidates(library, "9", flatEmbedder, 10), ["a.jpg"]);
});

test("rebuilding the index replaces the previous one", async () => {
  const library = await libraryWith({ "a.txt": "file: a.jpg\ncar_numbers: 9\n" });
  await buildIndex(library, flatEmbedder);
  await writeFile(path.join(library, "b.txt"), "file: b.jpg\ncar_numbers: 98\n");

  await buildIndex(library, flatEmbedder);

  assert.deepEqual((await findCandidates(library, "98", flatEmbedder, 10)).sort(), ["a.jpg", "b.jpg"]);
});

test("refuses to build an index for a Library without Sidecars", async () => {
  await assert.rejects(buildIndex(await libraryWith({}), flatEmbedder), /No Sidecars found/);
});

test("asks to build the index when searching a Library that has none", async () => {
  await assert.rejects(findCandidates(await libraryWith({}), "9", flatEmbedder, 10), /run build-index\.mjs first/);
});
