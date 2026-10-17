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

export const thumbnailUrl = (id: string) =>
  `/api/photos/${encodeURIComponent(id)}/thumb`;
