import { CheckIcon, CopyIcon } from "lucide-react";
import { type ReactNode, useCallback, useState } from "react";
import { PhotoDialog } from "#/components/photo-dialog";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { type PhotoCard, photoUrl } from "#/lib/photo-card";
import { cn } from "#/lib/utils";

function CopyPathButton({ path }: { path: string }) {
  const [copied, setCopied] = useState(false);
  const copy = useCallback(async () => {
    await navigator.clipboard.writeText(path);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }, [path]);
  return (
    <Button
      aria-label="Copy path"
      className="size-6 shrink-0"
      onClick={copy}
      size="icon"
      title="Copy path"
      type="button"
      variant="ghost"
    >
      {copied ? (
        <CheckIcon className="size-3.5" />
      ) : (
        <CopyIcon className="size-3.5" />
      )}
    </Button>
  );
}

export interface PhotoCardViewProps {
  /** Slot over the thumbnail's top-left corner, e.g. a Selection checkbox. */
  action?: ReactNode;
  /** Extra content under the path, e.g. the Match reason. */
  children?: ReactNode;
  className?: string;
  onOpen?: () => void;
  photo: PhotoCard;
}

/** One Photo of a Match grid: thumbnail, race number badge, file name and copyable path. */
export function PhotoCardView({
  action,
  children,
  className,
  onOpen,
  photo,
}: PhotoCardViewProps) {
  const thumbnail = (
    <img
      alt={photo.fileName}
      className="aspect-[4/3] w-full bg-muted object-cover"
      height={300}
      loading="lazy"
      src={photoUrl(photo.id, "thumb")}
      width={400}
    />
  );
  return (
    <figure
      className={cn(
        "overflow-hidden rounded-lg border bg-card text-card-foreground",
        className
      )}
    >
      <div className="relative">
        {onOpen ? (
          <button className="block w-full" onClick={onOpen} type="button">
            {thumbnail}
          </button>
        ) : (
          thumbnail
        )}
        {action ? <div className="absolute top-2 left-2">{action}</div> : null}
        {photo.raceNumbers.length > 0 ? (
          <div className="absolute top-2 right-2 flex gap-1">
            {photo.raceNumbers.map((number) => (
              <Badge key={number}>#{number}</Badge>
            ))}
          </div>
        ) : null}
      </div>
      <figcaption className="space-y-1 p-2 text-xs">
        <p className="truncate font-medium text-sm" title={photo.fileName}>
          {photo.fileName}
        </p>
        <div className="flex items-center gap-1 text-muted-foreground">
          <code className="truncate" title={photo.path}>
            {photo.path}
          </code>
          <CopyPathButton path={photo.path} />
        </div>
        {children}
      </figcaption>
    </figure>
  );
}

export interface PhotoGridProps {
  className?: string;
  /** Extra content in the photo dialog's header, e.g. the Selection toggle. */
  dialogAction?: (photo: PhotoCard) => ReactNode;
  photos: PhotoCard[];
  /** Defaults to a plain PhotoCardView; pass `open` as the card's `onOpen` to keep the photo dialog. */
  renderCard?: (photo: PhotoCard, open: () => void) => ReactNode;
}

interface GridCellProps {
  onOpen: (id: string) => void;
  photo: PhotoCard;
  renderCard?: PhotoGridProps["renderCard"];
}

function GridCell({ onOpen, photo, renderCard }: GridCellProps) {
  const open = useCallback(() => onOpen(photo.id), [onOpen, photo.id]);
  return renderCard ? (
    renderCard(photo, open)
  ) : (
    <PhotoCardView onOpen={open} photo={photo} />
  );
}

/** Responsive grid of Photos, keyed by Photo id; clicking a card opens the photo dialog. */
export function PhotoGrid({
  className,
  dialogAction,
  photos,
  renderCard,
}: PhotoGridProps) {
  const [openId, setOpenId] = useState<string | null>(null);
  const openPhoto = photos.find((photo) => photo.id === openId);
  const onOpenChange = useCallback((open: boolean) => {
    if (!open) {
      setOpenId(null);
    }
  }, []);
  return (
    <div
      className={cn(
        "grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4",
        className
      )}
    >
      {photos.map((photo) => (
        <div key={photo.id}>
          <GridCell onOpen={setOpenId} photo={photo} renderCard={renderCard} />
        </div>
      ))}
      {openPhoto ? (
        <PhotoDialog
          action={dialogAction?.(openPhoto)}
          onOpenChange={onOpenChange}
          open
          photo={openPhoto}
        />
      ) : null}
    </div>
  );
}
