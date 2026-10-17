import { mkdtemp, writeFile } from "node:fs/promises";
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

    expect(thumb?.fromCache).toBe(false);
    const meta = await sharp(thumb?.data).metadata();
    expect(meta.format).toBe("webp");
    expect(meta.width).toBe(400);
  });

  it("serves the thumbnail from the disk cache afterwards", async () => {
    const first = await render("car");
    const second = await render("car");

    expect(second?.fromCache).toBe(true);
    expect(second?.data.equals(first?.data ?? Buffer.alloc(0))).toBe(true);
  });

  it("refuses unknown ids, Photos without a Sidecar and paths outside the Library", async () => {
    expect(await render("nope")).toBeUndefined();
    expect(await render("secret")).toBeUndefined();
    expect(await render("../car")).toBeUndefined();
    expect(await render("car.jpg")).toBeUndefined();
    expect(await render("/etc/passwd")).toBeUndefined();
  });
});
