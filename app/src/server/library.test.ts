import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { loadLibrary } from "#/server/library";

const samplesDir = resolve(import.meta.dirname, "../../../samples");

describe("loadLibrary", () => {
  it("summarises the samples Library", async () => {
    const library = await loadLibrary(samplesDir);

    expect(library.overview()).toEqual({
      name: "samples",
      photoCount: library.photos.length,
      sidecarCount: library.photos.length,
    });
    expect(library.photos.length).toBeGreaterThan(0);
    expect(library.photosWithoutSidecar).toEqual([]);
  });

  it("counts Photos without a Sidecar separately and leaves them out", async () => {
    const dir = await mkdtemp(join(tmpdir(), "library-"));
    await writeFile(join(dir, "bmw-rowe.jpg"), "jpeg");
    await writeFile(
      join(dir, "bmw-rowe.json"),
      JSON.stringify({ file: "bmw-rowe.jpg", description: "BMW #98" })
    );
    await writeFile(join(dir, "bmw-rowe.txt"), "car_numbers: 98");
    await writeFile(join(dir, "orphan.png"), "png");
    await writeFile(join(dir, "broken.jpg"), "jpeg");
    await writeFile(join(dir, "broken.json"), "{ not json");
    await writeFile(join(dir, "notes.md"), "not a photo");

    const library = await loadLibrary(dir);

    expect(library.overview()).toEqual({
      name: basename(dir),
      photoCount: 3,
      sidecarCount: 1,
    });
    expect(library.photos.map((photo) => photo.id)).toEqual(["bmw-rowe"]);
    expect(library.photos[0]?.sidecarText).toBe("car_numbers: 98");
    expect(library.photosWithoutSidecar).toEqual(["broken.jpg", "orphan.png"]);
  });

  it("gives a shared Sidecar only to the Photo it names", async () => {
    const dir = await mkdtemp(join(tmpdir(), "library-"));
    await writeFile(join(dir, "car.jpg"), "jpeg");
    await writeFile(join(dir, "car.png"), "png");
    await writeFile(join(dir, "car.json"), JSON.stringify({ file: "car.png" }));

    const library = await loadLibrary(dir);

    expect(library.photos.map((photo) => photo.fileName)).toEqual(["car.png"]);
    expect(library.photosWithoutSidecar).toEqual(["car.jpg"]);
  });

  it("takes only JPEG and PNG files as Photos", async () => {
    const dir = await mkdtemp(join(tmpdir(), "library-"));
    await Promise.all(
      ["a.jpg", "b.JPEG", "c.png", "d.webp", "e.gif"].flatMap((fileName) => {
        const [id] = fileName.split(".");
        return [
          writeFile(join(dir, fileName), "image"),
          writeFile(
            join(dir, `${id}.json`),
            JSON.stringify({ file: fileName })
          ),
        ];
      })
    );

    const library = await loadLibrary(dir);

    expect(library.photos.map((photo) => photo.fileName)).toEqual([
      "a.jpg",
      "b.JPEG",
      "c.png",
    ]);
    expect(library.photosWithoutSidecar).toEqual([]);
  });
});
