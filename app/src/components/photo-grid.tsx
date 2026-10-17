import { CheckIcon, CopyIcon } from "lucide-react";
import { type ReactNode, useCallback, useState } from "react";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { type PhotoCard, thumbnailUrl } from "#/lib/photo-card";
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

/** One Photo of a result grid: thumbnail, race number badge, file name and copyable path. */
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
      src={thumbnailUrl(photo.id)}
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
  photos: PhotoCard[];
  /** Defaults to a plain PhotoCardView; override to add reasons, selection or a dialog. */
  renderCard?: (photo: PhotoCard) => ReactNode;
}

/** Responsive grid of Photos, keyed by Photo id. */
export function PhotoGrid({ className, photos, renderCard }: PhotoGridProps) {
  return (
    <div
      className={cn(
        "grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4",
        className
      )}
    >
      {photos.map((photo) => (
        <div key={photo.id}>
          {renderCard ? renderCard(photo) : <PhotoCardView photo={photo} />}
        </div>
      ))}
    </div>
  );
}
