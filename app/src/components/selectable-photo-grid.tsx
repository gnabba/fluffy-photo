import { DownloadIcon } from "lucide-react";
import { type ReactNode, useCallback } from "react";
import { PhotoCardView, PhotoGrid } from "#/components/photo-grid";
import { Button } from "#/components/ui/button";
import { Checkbox } from "#/components/ui/checkbox";
import type { PhotoCard } from "#/lib/photo-card";
import { exportUrl, type Selection, useSelection } from "#/lib/selection";

export interface SelectionCheckboxProps {
  className?: string;
  photo: PhotoCard;
  selection: Selection;
}

/** Ticks a Photo in or out of a Selection; reuse it anywhere the same Photo is shown (card, dialog). */
export function SelectionCheckbox({
  className,
  photo,
  selection,
}: SelectionCheckboxProps) {
  const { setSelected } = selection;
  const onCheckedChange = useCallback(
    (checked: boolean | "indeterminate") =>
      setSelected(photo.id, checked === true),
    [photo.id, setSelected]
  );
  return (
    <Checkbox
      aria-label={`Select ${photo.fileName}`}
      checked={selection.isSelected(photo.id)}
      className={className ?? "size-5 bg-background/80 shadow"}
      onCheckedChange={onCheckedChange}
    />
  );
}

/** "Select all / none" and "Download zip (n)" for one Selection. */
export function SelectionToolbar({ selection }: { selection: Selection }) {
  const count = selection.ids.length;
  const label = `Download zip (${count})`;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        onClick={selection.selectAll}
        size="sm"
        type="button"
        variant="outline"
      >
        Select all
      </Button>
      <Button
        onClick={selection.selectNone}
        size="sm"
        type="button"
        variant="outline"
      >
        Select none
      </Button>
      {count > 0 ? (
        <Button asChild size="sm">
          <a download href={exportUrl(selection.ids)}>
            <DownloadIcon />
            {label}
          </a>
        </Button>
      ) : (
        <Button disabled size="sm" type="button">
          <DownloadIcon />
          {label}
        </Button>
      )}
    </div>
  );
}

export interface SelectablePhotoGridProps {
  photos: PhotoCard[];
  /** Defaults to a PhotoCardView with the checkbox as its action; override to add reasons or a dialog. */
  renderCard?: (
    photo: PhotoCard,
    checkbox: ReactNode,
    selection: Selection
  ) => ReactNode;
}

/** A result grid with its own Selection and Export. */
export function SelectablePhotoGrid({
  photos,
  renderCard,
}: SelectablePhotoGridProps) {
  const selection = useSelection(photos);
  const renderSelectableCard = useCallback(
    (photo: PhotoCard) => {
      const checkbox = (
        <SelectionCheckbox photo={photo} selection={selection} />
      );
      return renderCard ? (
        renderCard(photo, checkbox, selection)
      ) : (
        <PhotoCardView action={checkbox} photo={photo} />
      );
    },
    [renderCard, selection]
  );
  return (
    <div className="space-y-2">
      <SelectionToolbar selection={selection} />
      <PhotoGrid photos={photos} renderCard={renderSelectableCard} />
    </div>
  );
}
