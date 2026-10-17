import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { photoDetails } from "#/server/details";
import { loadLibrary } from "#/server/library";

const samplesDir = resolve(import.meta.dirname, "../../../samples");

describe("photoDetails", () => {
  it("summarises a Photo's Sidecar for the photo dialog", async () => {
    const library = await loadLibrary(samplesDir);

    expect(photoDetails(library, "bmw-rowe")).toEqual({
      id: "bmw-rowe",
      fileName: "bmw-rowe.jpg",
      path: join(samplesDir, "bmw-rowe.jpg"),
      raceNumbers: ["98"],
      cars: [{ raceNumber: "98", model: "BMW M4", team: null, type: "GT3" }],
      sponsors: [
        "ROWE MOTOR OIL",
        "aws",
        "PIRELLI",
        "M Motorsport",
        "Akrapovic",
      ],
      liveryColours: ["white", "yellow", "black", "grey"],
      scene: ["on track", "side", "daylight"],
      description:
        "A white, yellow, and grey race car, number 98, is speeding on a track. The car features prominent 'ROWE MOTOR OIL' and 'aws' branding. The background shows blurred green grass and a white barrier.",
    });
  });

  it("refuses ids that are not a Photo of the Library", async () => {
    const library = await loadLibrary(samplesDir);

    expect(photoDetails(library, "nope")).toBeUndefined();
    expect(photoDetails(library, "../samples/bmw-rowe")).toBeUndefined();
    expect(photoDetails(library, "bmw-rowe.jpg")).toBeUndefined();
  });

  it("leaves out Sidecar fields that are missing or malformed", async () => {
    const dir = await mkdtemp(join(tmpdir(), "library-"));
    await writeFile(join(dir, "car.jpg"), "jpeg");
    await writeFile(
      join(dir, "car.json"),
      JSON.stringify({
        file: "car.jpg",
        cars: [{ car_number: 7, sponsors: "Shell", livery_colors: ["red"] }],
        scene: "pit lane",
      })
    );

    expect(photoDetails(await loadLibrary(dir), "car")).toMatchObject({
      raceNumbers: [],
      cars: [{ raceNumber: null, model: null, team: null, type: null }],
      sponsors: [],
      liveryColours: ["red"],
      scene: [],
      description: null,
    });
  });
});
