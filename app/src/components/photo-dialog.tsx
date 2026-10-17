import { type ReactNode, useEffect, useState } from "react";
import { Badge } from "#/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "#/components/ui/dialog";
import type { PhotoCard } from "#/lib/photo-card";
import {
  type CarDetails,
  largeImageUrl,
  type PhotoDetails,
  photoDetailsUrl,
} from "#/lib/photo-details";

type DetailsState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; details: PhotoDetails };

function usePhotoDetails(id: string, enabled: boolean): DetailsState {
  const [state, setState] = useState<DetailsState>({ status: "loading" });
  useEffect(() => {
    if (!enabled) {
      return;
    }
    const controller = new AbortController();
    setState({ status: "loading" });
    fetch(photoDetailsUrl(id), { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(response.statusText);
        }
        const details: PhotoDetails = await response.json();
        setState({ status: "ready", details });
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setState({ status: "error" });
        }
      });
    return () => controller.abort();
  }, [id, enabled]);
  return state;
}

const carLabel = (car: CarDetails) =>
  [car.raceNumber ? `#${car.raceNumber}` : null, car.model, car.type, car.team]
    .filter(Boolean)
    .join(" · ");

function Field({ label, values }: { label: string; values: string[] }) {
  if (values.length === 0) {
    return null;
  }
  return (
    <div className="space-y-1">
      <dt className="text-muted-foreground text-xs uppercase tracking-wide">
        {label}
      </dt>
      <dd className="flex flex-wrap gap-1">
        {values.map((value) => (
          <Badge key={value} variant="secondary">
            {value}
          </Badge>
        ))}
      </dd>
    </div>
  );
}

function Metadata({ state }: { state: DetailsState }) {
  if (state.status === "loading") {
    return <p className="text-muted-foreground text-sm">Loading metadata…</p>;
  }
  if (state.status === "error") {
    return (
      <p className="text-muted-foreground text-sm">
        Could not load this Photo's metadata.
      </p>
    );
  }
  const { details } = state;
  return (
    <dl className="space-y-3">
      <Field
        label="Race numbers"
        values={details.raceNumbers.map((number) => `#${number}`)}
      />
      <Field label="Cars" values={details.cars.map(carLabel).filter(Boolean)} />
      <Field label="Sponsors" values={details.sponsors} />
      <Field label="Livery colours" values={details.liveryColours} />
      <Field label="Scene" values={details.scene} />
      {details.description ? (
        <div className="space-y-1">
          <dt className="text-muted-foreground text-xs uppercase tracking-wide">
            Description
          </dt>
          <dd className="text-sm">{details.description}</dd>
        </div>
      ) : null}
    </dl>
  );
}

export interface PhotoDialogProps {
  /** Slot in the dialog header, e.g. the Selection toggle. */
  action?: ReactNode;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  photo: PhotoCard;
}

/** A Photo shown large next to its Sidecar metadata; closes on Esc or outside click. */
export function PhotoDialog({
  action,
  onOpenChange,
  open,
  photo,
}: PhotoDialogProps) {
  const state = usePhotoDetails(photo.id, open);
  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-5xl">
        <DialogHeader className="pr-8">
          <div className="flex items-center gap-2">
            {action}
            <DialogTitle className="truncate">{photo.fileName}</DialogTitle>
          </div>
          <DialogDescription className="truncate font-mono text-xs">
            {photo.path}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 md:grid-cols-[2fr_1fr]">
          <img
            alt={photo.fileName}
            className="h-auto max-h-[70vh] w-full rounded-md bg-muted object-contain"
            height={1067}
            src={largeImageUrl(photo.id)}
            width={1600}
          />
          <Metadata state={state} />
        </div>
      </DialogContent>
    </Dialog>
  );
}
