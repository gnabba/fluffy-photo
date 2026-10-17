/** What a result grid needs to render one Photo. Client-safe. */
export interface PhotoCard {
  fileName: string;
  id: string;
  path: string;
  raceNumbers: string[];
}

export const thumbnailUrl = (id: string) =>
  `/api/photos/${encodeURIComponent(id)}/thumb`;
