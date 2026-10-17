import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import sharp from "sharp";
import { type Library, PHOTO_ID, type Photo } from "#/server/library";

const SIZES = {
  thumb: { pixels: 400, quality: 75 },
  large: { pixels: 1600, quality: 82 },
} as const;

export type PhotoSize = keyof typeof SIZES;

/** Looks a Photo up by id, only among the Library's Photos and only inside its folder. */
export function resolvePhoto(library: Library, id: string): Photo | undefined {
  if (!PHOTO_ID.test(id)) {
    return undefined;
  }
  const photo = library.photos.find((candidate) => candidate.id === id);
  if (!photo) {
    return undefined;
  }
  const root = resolve(library.dir) + sep;
  return resolve(photo.path).startsWith(root) ? photo : undefined;
}

async function readCached(path: string): Promise<Buffer | undefined> {
  try {
    return await readFile(path);
  } catch {
    return undefined;
  }
}

/** A resized webp of a Photo, cached on disk per size and Photo version; undefined if the id is not served. */
export async function renderPhoto(
  library: Library,
  id: string,
  size: PhotoSize,
  cacheDir: string
): Promise<Buffer | undefined> {
  const photo = resolvePhoto(library, id);
  if (!photo) {
    return undefined;
  }
  const { mtimeMs } = await stat(photo.path);
  const sizeDir = join(cacheDir, size);
  const cachePath = join(sizeDir, `${photo.id}-${Math.round(mtimeMs)}.webp`);

  const cached = await readCached(cachePath);
  if (cached) {
    return cached;
  }

  const { pixels, quality } = SIZES[size];
  const data = await sharp(photo.path)
    .rotate()
    .resize({
      width: pixels,
      height: pixels,
      fit: "inside",
      withoutEnlargement: true,
    })
    .webp({ quality })
    .toBuffer();

  await mkdir(sizeDir, { recursive: true });
  // Write then rename so a concurrent request never reads a half-written file.
  const tempPath = `${cachePath}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(tempPath, data);
  await rename(tempPath, cachePath);
  return data;
}
