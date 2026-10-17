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

export interface SelectableCardSlots {
  /** The card's Selection checkbox, meant for PhotoCardView's `action`. */
  checkbox: ReactNode;
  /** Opens the photo dialog, meant for PhotoCardView's `onOpen`. */
  open: () => void;
}

export interface SelectablePhotoGridProps {
  photos: PhotoCard[];
  /** Defaults to a PhotoCardView with the checkbox and the dialog; override to add reasons. */
  renderCard?: (photo: PhotoCard, slots: SelectableCardSlots) => ReactNode;
}

/** A result grid with its own Selection and Export; the photo dialog shares the same Selection. */
export function SelectablePhotoGrid({
  photos,
  renderCard,
}: SelectablePhotoGridProps) {
  const selection = useSelection(photos);
  const renderSelectableCard = useCallback(
    (photo: PhotoCard, open: () => void) => {
      const checkbox = (
        <SelectionCheckbox photo={photo} selection={selection} />
      );
      return renderCard ? (
        renderCard(photo, { checkbox, open })
      ) : (
        <PhotoCardView action={checkbox} onOpen={open} photo={photo} />
      );
    },
    [renderCard, selection]
  );
  const dialogAction = useCallback(
    (photo: PhotoCard) => (
      <SelectionCheckbox
        className="size-5"
        photo={photo}
        selection={selection}
      />
    ),
    [selection]
  );
  return (
    <div className="space-y-2">
      <SelectionToolbar selection={selection} />
      <PhotoGrid
        dialogAction={dialogAction}
        photos={photos}
        renderCard={renderSelectableCard}
      />
    </div>
  );
}
