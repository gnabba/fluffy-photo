export interface LibraryOverview {
  name: string;
  photoCount: number;
  sidecarCount: number;
}

export function describeCounts({
  photoCount,
  sidecarCount,
}: LibraryOverview): string {
  const photos = photoCount === 1 ? "photo" : "photos";
  return `${photoCount} ${photos}, ${sidecarCount} with Sidecar`;
}
