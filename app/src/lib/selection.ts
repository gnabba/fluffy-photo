import { useCallback, useMemo, useState } from "react";
import type { PhotoCard } from "#/lib/photo-card";

/** The URL of the Export (zip of the originals) of the given Photo ids. */
export const exportUrl = (ids: readonly string[]) =>
  `/api/export?${new URLSearchParams(ids.map((id) => ["id", id]))}`;

/** One result grid's Selection: the ticked Photo ids, in grid order. */
export interface Selection {
  ids: string[];
  isSelected: (id: string) => boolean;
  selectAll: () => void;
  selectNone: () => void;
  setSelected: (id: string, selected: boolean) => void;
}

/** Local Selection state for one grid; each grid calls it once, so Selections never leak across grids. */
export function useSelection(photos: readonly PhotoCard[]): Selection {
  const [selected, setSelectedIds] = useState<ReadonlySet<string>>(
    () => new Set()
  );

  const setSelected = useCallback((id: string, isTicked: boolean) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (isTicked) {
        next.add(id);
      } else {
        next.delete(id);
      }
      return next;
    });
  }, []);

  const selectAll = useCallback(
    () => setSelectedIds(new Set(photos.map((photo) => photo.id))),
    [photos]
  );
  const selectNone = useCallback(() => setSelectedIds(new Set()), []);
  const isSelected = useCallback((id: string) => selected.has(id), [selected]);

  const ids = useMemo(
    () => photos.map((photo) => photo.id).filter((id) => selected.has(id)),
    [photos, selected]
  );

  return { ids, isSelected, selectAll, selectNone, setSelected };
}
