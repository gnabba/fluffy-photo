import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { unzipSync } from "fflate";
import { beforeEach, describe, expect, it } from "vitest";
import { exportResponse } from "#/server/export";
import { loadLibrary } from "#/server/library";

let libraryDir: string;

const ORIGINALS: Record<string, string> = {
  "ferrari-lmcorsa.jpg": "ferrari bytes",
  "porsche.JPG": "porsche bytes",
  "audi.jpg": "audi bytes",
};

beforeEach(async () => {
  libraryDir = await mkdtemp(join(tmpdir(), "library-"));
  await Promise.all(
    Object.entries(ORIGINALS).flatMap(([fileName, bytes]) => [
      writeFile(join(libraryDir, fileName), bytes),
      writeFile(
        join(libraryDir, `${fileName.split(".")[0]}.json`),
        JSON.stringify({ file: fileName })
      ),
    ])
  );
  await writeFile(join(libraryDir, "secret.jpg"), "no sidecar");
});

const exportOf = async (ids: string[]) =>
  exportResponse(await loadLibrary(libraryDir), ids);

const entriesOf = async (response: Response) => {
  const files = unzipSync(new Uint8Array(await response.arrayBuffer()));
  return Object.fromEntries(
    Object.entries(files).map(([name, data]) => [
      name,
      new TextDecoder().decode(data),
    ])
  );
};

describe("exportResponse", () => {
  it("zips exactly the selected originals under their original file names", async () => {
    const response = await exportOf(["ferrari-lmcorsa", "porsche"]);

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("application/zip");
    expect(response.headers.get("Content-Disposition")).toContain("attachment");
    expect(await entriesOf(response)).toEqual({
      "ferrari-lmcorsa.jpg": "ferrari bytes",
      "porsche.JPG": "porsche bytes",
    });
  });

  it("puts a Photo selected twice in the zip once", async () => {
    const response = await exportOf(["audi", "audi"]);

    expect(await entriesOf(response)).toEqual({ "audi.jpg": "audi bytes" });
  });

  it("rejects an empty Selection", async () => {
    expect((await exportOf([])).status).toBe(400);
  });

  it("rejects the whole Export if any id is not a Photo of the Library", async () => {
    const bad = ["nope", "secret", "../audi", "audi.jpg", "/etc/passwd"];
    const statuses = await Promise.all(
      bad.map(async (id) => (await exportOf(["audi", id])).status)
    );

    expect(statuses).toEqual([400, 400, 400, 400, 400]);
  });
});
