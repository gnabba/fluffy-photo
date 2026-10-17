/** One car read off a Photo's Sidecar. Client-safe. */
export interface CarDetails {
  model: string | null;
  raceNumber: string | null;
  team: string | null;
  type: string | null;
}

/** The Sidecar metadata shown in the photo dialog. Client-safe. */
export interface PhotoDetails {
  cars: CarDetails[];
  description: string | null;
  fileName: string;
  id: string;
  liveryColours: string[];
  path: string;
  raceNumbers: string[];
  scene: string[];
  sponsors: string[];
}
