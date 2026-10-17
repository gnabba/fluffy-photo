import { resolve } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { type Library, loadLibrary } from "#/server/library";
import { searchPhotos } from "#/server/search";

const samplesDir = resolve(import.meta.dirname, "../../../samples");

let library: Library;

beforeAll(async () => {
  library = await loadLibrary(samplesDir);
});

const fileNames = (request: string) =>
  searchPhotos(library.photos, request).map((candidate) => candidate.fileName);

describe("searchPhotos", () => {
  it("finds a race number", () => {
    expect(fileNames("car 98")).toEqual(["bmw-rowe.jpg"]);
    expect(fileNames("#98 on track")[0]).toBe("bmw-rowe.jpg");
  });

  it("finds a sponsor", () => {
    expect(fileNames("Photos with Pirelli branding")).toEqual(
      expect.arrayContaining(["bmw-rowe.jpg", "ferrari-lmcorsa.jpg"])
    );
    expect(fileNames("Petronas")).toEqual(["ferrari-lmcorsa.jpg"]);
  });

  it("finds a livery colour and ranks the best fit first", () => {
    const redFerrari = fileNames("Red Ferrari");
    expect(redFerrari[0]).toBe("ferrari-lmcorsa.jpg");
    expect(fileNames("red")).toContain("ferrari-lmcorsa.jpg");
  });

  it("returns no Candidates when nothing matches", () => {
    expect(fileNames("lamborghini huracan")).toEqual([]);
    expect(fileNames("car photos with the")).toEqual([]);
  });

  it("returns the Candidate's card data and Sidecar text", () => {
    const [candidate] = searchPhotos(library.photos, "car 98");

    expect(candidate).toMatchObject({
      id: "bmw-rowe",
      fileName: "bmw-rowe.jpg",
      path: resolve(samplesDir, "bmw-rowe.jpg"),
      raceNumbers: ["98"],
    });
    expect(candidate?.sidecarText).toContain("car_numbers: 98");
  });

  it("caps the Candidates at the limit, sorted by score", () => {
    const many = Array.from({ length: 30 }, (_, index) => ({
      ...(library.photos[0] as Library["photos"][number]),
      id: `photo-${index}`,
    }));

    expect(searchPhotos(many, "pirelli")).toHaveLength(20);
    expect(searchPhotos(library.photos, "pirelli", 1)).toHaveLength(1);
  });
});
