import { Readable } from "node:stream";
import { ZipArchive } from "archiver";
import { resolvePhoto } from "#/server/images";
import type { Library, Photo } from "#/server/library";

/** Streams an Export: a zip of the original files of the given Photo ids, or 400 if any id is not served. */
export function exportResponse(
  library: Library,
  ids: readonly string[]
): Response {
  const photos: Photo[] = [];
  for (const id of new Set(ids)) {
    const photo = resolvePhoto(library, id);
    if (!photo) {
      return new Response("Unknown Photo id", { status: 400 });
    }
    photos.push(photo);
  }
  if (photos.length === 0) {
    return new Response("Empty Selection", { status: 400 });
  }

  // JPEG/PNG are already compressed, so storing is as small and much faster.
  const zip = new ZipArchive({ store: true });
  for (const photo of photos) {
    zip.file(photo.path, { name: photo.fileName });
  }
  zip.finalize();

  return new Response(Readable.toWeb(zip) as ReadableStream, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": 'attachment; filename="export.zip"',
    },
  });
}
