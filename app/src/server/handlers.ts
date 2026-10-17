import { resolve } from "node:path";
import { createUIMessageStreamResponse } from "ai";
import { config } from "#/config";
import { type PhotoUIMessage, streamChat } from "#/server/chat";
import { photoDetails } from "#/server/details";
import { exportResponse } from "#/server/export";
import { type PhotoSize, renderPhoto } from "#/server/images";
import { loadLibrary } from "#/server/library";
import { model } from "#/server/model";

const CACHE_DIR = resolve(".cache");

const readLibrary = () => loadLibrary(config.libraryDir);

export async function handleChat(request: Request): Promise<Response> {
  const { messages }: { messages: PhotoUIMessage[] } = await request.json();
  return createUIMessageStreamResponse({
    stream: await streamChat({ model, messages, readLibrary }),
  });
}

export async function handlePhotoImage(
  id: string,
  size: PhotoSize
): Promise<Response> {
  const rendered = await renderPhoto(await readLibrary(), id, size, CACHE_DIR);
  if (!rendered) {
    return new Response("Photo not found", { status: 404 });
  }
  return new Response(new Uint8Array(rendered.data), {
    headers: {
      "Content-Type": "image/webp",
      "Cache-Control": "public, max-age=3600",
    },
  });
}

export async function handleExport(request: Request): Promise<Response> {
  const ids = new URL(request.url).searchParams.getAll("id");
  return exportResponse(await readLibrary(), ids);
}

export async function handlePhotoDetails(id: string): Promise<Response> {
  const details = photoDetails(await readLibrary(), id);
  if (!details) {
    return new Response("Photo not found", { status: 404 });
  }
  return Response.json(details);
}
