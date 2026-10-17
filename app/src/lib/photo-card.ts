/** What a Match grid needs to render one Photo. Client-safe. */
export interface PhotoCard {
  fileName: string;
  id: string;
  path: string;
  raceNumbers: string[];
}

/** A Candidate confirmed by the review, with the agent's reason. Client-safe. */
export interface Match extends PhotoCard {
  reason: string;
}

export type PhotoResource = "thumb" | "large" | "details";

/** The URL of one of a Photo's endpoints: its thumbnail, large image or Sidecar details. */
export const photoUrl = (id: string, resource: PhotoResource) =>
  `/api/photos/${encodeURIComponent(id)}/${resource}`;
