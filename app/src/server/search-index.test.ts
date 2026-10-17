import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it, vi } from "vitest";
import type { Embedder } from "#/server/embedder";
import { loadLibrary } from "#/server/library";
import { hybridSearch, searchableText } from "#/server/search-index";

const libraries: string[] = [];

afterAll(() =>
  Promise.all(libraries.map((dir) => rm(dir, { recursive: true, force: true })))
);

interface TestPhoto {
  description: string;
  numbers: string[];
}

async function writePhoto(dir: string, id: string, photo: TestPhoto) {
  const fileName = `${id}.jpg`;
  await writeFile(join(dir, fileName), "");
  await writeFile(
    join(dir, `${id}.json`),
    JSON.stringify({
      file: fileName,
      cars: photo.numbers.map((car_number) => ({ car_number })),
    })
  );
  await writeFile(
    join(dir, `${id}.txt`),
    [
      `file: ${fileName}`,
      "captured_at: 2026-09-14T15:42:07.000Z",
      `car_numbers: ${photo.numbers.join(", ")}`,
      `description: ${photo.description}`,
    ].join("\n")
  );
}

async function libraryWith(photos: Record<string, TestPhoto>) {
  const dir = await mkdtemp(join(tmpdir(), "library-"));
  libraries.push(dir);
  await Promise.all(
    Object.entries(photos).map(([id, photo]) => writePhoto(dir, id, photo))
  );
  return dir;
}

const colourEmbedder = (): Embedder => {
  const vectorOf = (text: string) => {
    if (text.includes("yellow")) {
      return [1, 0];
    }
    return text.includes("red") ? [0.8, 0.6] : [0, 1];
  };
  return {
    embedDocuments: vi.fn(async (texts: string[]) => texts.map(vectorOf)),
    embedQuery: async (search) => vectorOf(search),
  };
};

const ids = async (
  search: ReturnType<typeof hybridSearch>,
  dir: string,
  request: string
) =>
  (await search(await loadLibrary(dir), request)).map(
    (candidate) => candidate.id
  );

describe("searchableText", () => {
  it("drops the EXIF fields and keeps the rest of the Sidecar", () => {
    const sidecar = [
      "file: a.jpg",
      "captured_at: 2026-09-14T15:42:07.000Z",
      "camera: Sony ILCE-1 | lens: FE 200-600mm | focal_mm: 560",
      "gps: 45.61560, 9.28110",
      "car_numbers: 44",
      "",
      "description: A black GT3 car on track.",
    ].join("\n");

    expect(searchableText(sidecar)).toBe(
      "car_numbers: 44\n\ndescription: A black GT3 car on track."
    );
  });
});

describe("hybridSearch", () => {
  it("ranks the Photo with exactly the race number of the Search first", async () => {
    const dir = await libraryWith({
      a: { numbers: ["98"], description: "A white car." },
      b: { numbers: ["9"], description: "A white car." },
    });

    expect((await ids(hybridSearch(colourEmbedder()), dir, "#9"))[0]).toBe("b");
  });

  it("puts race number matches before Photos closer in meaning", async () => {
    const dir = await libraryWith({
      a: { numbers: ["98"], description: "A white car." },
      b: { numbers: ["31"], description: "A yellow car." },
      c: { numbers: ["7"], description: "A red car." },
    });

    const found = await ids(hybridSearch(colourEmbedder()), dir, "yellow 7");

    expect(found.slice(0, 2)).toEqual(["c", "b"]);
  });

  it("returns the Candidate's card data and Sidecar text", async () => {
    const dir = await libraryWith({
      a: { numbers: ["98"], description: "A white car." },
    });

    const [candidate] = await hybridSearch(colourEmbedder())(
      await loadLibrary(dir),
      "98"
    );

    expect(candidate).toMatchObject({ id: "a", raceNumbers: ["98"] });
    expect(candidate?.sidecarText).toContain("description: A white car.");
  });

  it("reuses the index until a Sidecar changes", async () => {
    const dir = await libraryWith({
      a: { numbers: ["98"], description: "A white car." },
    });
    const embedder = colourEmbedder();
    const search = hybridSearch(embedder);

    await ids(search, dir, "white");
    await ids(search, dir, "white");
    expect(embedder.embedDocuments).toHaveBeenCalledTimes(1);

    await writePhoto(dir, "b", {
      numbers: ["31"],
      description: "A yellow car.",
    });
    expect(await ids(search, dir, "31")).toContain("b");
    expect(embedder.embedDocuments).toHaveBeenCalledTimes(2);
  });

  it("keeps the index across restarts", async () => {
    const dir = await libraryWith({
      a: { numbers: ["98"], description: "A white car." },
    });
    await ids(hybridSearch(colourEmbedder()), dir, "white");
    const embedder = colourEmbedder();

    expect(await ids(hybridSearch(embedder), dir, "98")).toEqual(["a"]);
    expect(embedder.embedDocuments).not.toHaveBeenCalled();
  });

  it("falls back to the lexical search when the Embedder fails", async () => {
    const dir = await libraryWith({
      a: { numbers: ["98"], description: "A white car." },
    });
    const failing: Embedder = {
      embedDocuments: () => Promise.reject(new Error("Ollama is down")),
      embedQuery: () => Promise.reject(new Error("Ollama is down")),
    };
    vi.spyOn(console, "warn").mockImplementation(() => undefined);

    expect(await ids(hybridSearch(failing), dir, "car 98")).toEqual(["a"]);
  });
});
