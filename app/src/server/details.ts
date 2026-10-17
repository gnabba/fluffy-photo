import { z } from "zod";
import type { PhotoDetails } from "#/lib/photo-details";
import { resolvePhoto } from "#/server/images";
import { type Library, toPhotoCard } from "#/server/library";

const nullableStringSchema = z.string().nullable().catch(null);
const stringListSchema = z.array(z.string()).catch([]);

const detailsSchema = z.looseObject({
  cars: z
    .array(
      z.looseObject({
        car_number: nullableStringSchema,
        manufacturer_model: nullableStringSchema,
        team_name: nullableStringSchema,
        car_type: nullableStringSchema,
        livery_colors: stringListSchema,
        sponsors: z.array(z.looseObject({ name: z.string() })).catch([]),
      })
    )
    .catch([]),
  scene: z
    .looseObject({
      setting: nullableStringSchema,
      shot_type: nullableStringSchema,
      weather_light: nullableStringSchema,
    })
    .nullable()
    .catch(null),
  description: nullableStringSchema
    .optional()
    .transform((value) => value ?? null),
});

const unique = (values: string[]) => [...new Set(values)];

const sceneLabel = (value: string) => value.replaceAll("_", " ");

/** The Sidecar metadata of a served Photo; undefined if the id is not served. */
export function photoDetails(
  library: Library,
  id: string
): PhotoDetails | undefined {
  const photo = resolvePhoto(library, id);
  if (!photo) {
    return undefined;
  }
  const { cars, scene, description } = detailsSchema.parse(photo.sidecar);
  return {
    ...toPhotoCard(photo),
    cars: cars.map((car) => ({
      raceNumber: car.car_number,
      model: car.manufacturer_model,
      team: car.team_name,
      type: car.car_type,
    })),
    sponsors: unique(
      cars.flatMap((car) => car.sponsors.map((sponsor) => sponsor.name))
    ),
    liveryColours: unique(cars.flatMap((car) => car.livery_colors)),
    scene: [scene?.setting, scene?.shot_type, scene?.weather_light]
      .filter((value): value is string => Boolean(value))
      .map(sceneLabel),
    description,
  };
}
