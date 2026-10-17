import { mkdtemp, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { beforeEach, describe, expect, it } from "vitest";
import { renderPhoto } from "#/server/images";
import { loadLibrary } from "#/server/library";

let libraryDir: string;
let cacheDir: string;

beforeEach(async () => {
  libraryDir = await mkdtemp(join(tmpdir(), "library-"));
  cacheDir = await mkdtemp(join(tmpdir(), "cache-"));
  const jpeg = await sharp({
    create: { width: 1200, height: 800, channels: 3, background: "red" },
  })
    .jpeg()
    .toBuffer();
  await writeFile(join(libraryDir, "car.jpg"), jpeg);
  await writeFile(
    join(libraryDir, "car.json"),
    JSON.stringify({ file: "car.jpg" })
  );
  await writeFile(join(libraryDir, "secret.jpg"), jpeg);
});

const render = async (id: string) =>
  renderPhoto(await loadLibrary(libraryDir), id, "thumb", cacheDir);

describe("renderPhoto", () => {
  it("makes a webp thumbnail of about 400 px", async () => {
    const thumb = await render("car");

    const meta = await sharp(thumb).metadata();
    expect(meta.format).toBe("webp");
    expect(meta.width).toBe(400);
  });

  it("serves the thumbnail from the disk cache afterwards", async () => {
    await render("car");
    const [cached] = await readdir(join(cacheDir, "thumb"));
    if (!cached) {
      throw new Error("thumbnail not cached");
    }
    await writeFile(join(cacheDir, "thumb", cached), "cached bytes");

    expect((await render("car"))?.toString()).toBe("cached bytes");
  });

  it("makes a large webp of at most 1600 px, cached apart from the thumbnail", async () => {
    const big = await sharp({
      create: { width: 4000, height: 2000, channels: 3, background: "blue" },
    })
      .jpeg()
      .toBuffer();
    await writeFile(join(libraryDir, "car.jpg"), big);
    const library = await loadLibrary(libraryDir);

    await renderPhoto(library, "car", "thumb", cacheDir);
    const large = await renderPhoto(library, "car", "large", cacheDir);

    const meta = await sharp(large).metadata();
    expect(meta.format).toBe("webp");
    expect(meta.width).toBe(1600);
    expect(meta.height).toBe(800);
  });

  it("refuses unknown ids, Photos without a Sidecar and paths outside the Library", async () => {
    expect(await render("nope")).toBeUndefined();
    expect(await render("secret")).toBeUndefined();
    expect(await render("../car")).toBeUndefined();
    expect(await render("car.jpg")).toBeUndefined();
    expect(await render("/etc/passwd")).toBeUndefined();
  });
});
