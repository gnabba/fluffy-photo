import { readdir, readFile } from "node:fs/promises";
import { basename, extname, join } from "node:path";
import { z } from "zod";
import type { LibraryOverview } from "#/lib/library-overview";

const PHOTO_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp"]);

const sidecarSchema = z.looseObject({ file: z.string() });

export type Sidecar = z.infer<typeof sidecarSchema>;

export interface Photo {
  fileName: string;
  id: string;
  path: string;
  sidecar: Sidecar;
  sidecarText: string;
}

export interface Library {
  dir: string;
  name: string;
  overview: () => LibraryOverview;
  photos: Photo[];
  photosWithoutSidecar: string[];
}

async function readOptional(path: string): Promise<string | undefined> {
  try {
    return await readFile(path, "utf8");
  } catch {
    return undefined;
  }
}

function parseSidecar(json: string | undefined): Sidecar | undefined {
  if (json === undefined) {
    return undefined;
  }
  try {
    const result = sidecarSchema.safeParse(JSON.parse(json));
    return result.success ? result.data : undefined;
  } catch {
    return undefined;
  }
}

async function readPhoto(
  dir: string,
  fileName: string
): Promise<Photo | undefined> {
  const id = basename(fileName, extname(fileName));
  const sidecar = parseSidecar(await readOptional(join(dir, `${id}.json`)));
  // a.jpg and a.png share a.json; the Sidecar's `file` field says which Photo owns it.
  if (sidecar?.file !== fileName) {
    return undefined;
  }
  return {
    id,
    fileName,
    path: join(dir, fileName),
    sidecar,
    sidecarText: (await readOptional(join(dir, `${id}.txt`))) ?? "",
  };
}

/** Scans a flat Library folder and reads every Photo's Sidecar. */
export async function loadLibrary(dir: string): Promise<Library> {
  const entries = await readdir(dir, { withFileTypes: true });
  const fileNames = entries
    .filter(
      (entry) =>
        entry.isFile() &&
        PHOTO_EXTENSIONS.has(extname(entry.name).toLowerCase())
    )
    .map((entry) => entry.name)
    .sort();

  const readPhotos = await Promise.all(
    fileNames.map((fileName) => readPhoto(dir, fileName))
  );
  const photos = readPhotos.filter((photo) => photo !== undefined);
  const photosWithoutSidecar = fileNames.filter(
    (_, index) => readPhotos[index] === undefined
  );

  const name = basename(dir);
  return {
    dir,
    name,
    photos,
    photosWithoutSidecar,
    overview: () => ({
      name,
      photoCount: photos.length + photosWithoutSidecar.length,
      sidecarCount: photos.length,
    }),
  };
}
