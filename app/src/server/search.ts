import type { PhotoCard } from "#/lib/photo-card";
import { type Library, type Photo, toPhotoCard } from "#/server/library";

export const CANDIDATE_LIMIT = 20;

export interface Candidate extends PhotoCard {
  score: number;
  sidecarText: string;
}

/** Finds the Candidates for a Search in a Library, best first. */
export type FindCandidates = (
  library: Library,
  request: string
) => Promise<Candidate[]>;

const FIELD_WEIGHTS: [path: string, weight: number][] = [
  ["cars.car_number", 10],
  ["cars.manufacturer_model", 3],
  ["cars.team_name", 3],
  ["cars.class_label", 3],
  ["cars.car_type", 3],
  ["cars.livery_colors", 3],
  ["cars.sponsors.name", 3],
  ["visible_text", 2],
  ["series_or_event", 1],
  ["cars.livery_description", 1],
  ["scene.setting", 1],
  ["scene.shot_type", 1],
  ["scene.weather_light", 1],
  ["description", 1],
];
const KEYWORD_WEIGHT = 1;

const STOPWORDS = new Set(
  (
    "a an and any all are as at by for from i in is it me my of on or show some the to with " +
    "car cars race photo photos picture pictures image images find search branding"
  ).split(" ")
);

const tokenize = (text: string): string[] =>
  text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];

function valuesAt(value: unknown, path: readonly string[]): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((item) => valuesAt(item, path));
  }
  const [key, ...rest] = path;
  if (key === undefined) {
    return typeof value === "string" || typeof value === "number"
      ? [String(value)]
      : [];
  }
  if (value === null || typeof value !== "object") {
    return [];
  }
  return valuesAt((value as Record<string, unknown>)[key], rest);
}

const KEYWORDS_LINE = /^keywords:(.*)$/m;

const keywordsOf = (sidecarText: string) =>
  sidecarText.match(KEYWORDS_LINE)?.[1] ?? "";

function tokenWeights(photo: Photo): Map<string, number> {
  const weights = new Map<string, number>();
  const add = (text: string, weight: number) => {
    for (const token of tokenize(text)) {
      weights.set(token, Math.max(weights.get(token) ?? 0, weight));
    }
  };
  for (const [path, weight] of FIELD_WEIGHTS) {
    for (const value of valuesAt(photo.sidecar, path.split("."))) {
      add(value, weight);
    }
  }
  add(keywordsOf(photo.sidecarText), KEYWORD_WEIGHT);
  return weights;
}

/** Broad lexical match of a Search over the Photos' Sidecars, best Candidates first. */
export function searchPhotos(
  photos: readonly Photo[],
  request: string,
  limit = CANDIDATE_LIMIT
): Candidate[] {
  const terms = [...new Set(tokenize(request))].filter(
    (term) => !STOPWORDS.has(term)
  );
  return photos
    .map((photo) => {
      const weights = tokenWeights(photo);
      const score = terms.reduce(
        (sum, term) => sum + (weights.get(term) ?? 0),
        0
      );
      return { photo, score };
    })
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score || a.photo.id.localeCompare(b.photo.id))
    .slice(0, limit)
    .map(({ photo, score }) => ({
      ...toPhotoCard(photo),
      score,
      sidecarText: photo.sidecarText,
    }));
}

export const lexicalSearch: FindCandidates = async (library, request) =>
  searchPhotos(library.photos, request);
