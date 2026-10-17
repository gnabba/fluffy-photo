import { SquarePenIcon } from "lucide-react";
import { Button } from "#/components/ui/button";
import { Separator } from "#/components/ui/separator";
import { describeCounts, type LibraryOverview } from "#/lib/library-overview";

export const APP_NAME = "Fluffy Photo";
export const LOGO_SRC = "/logo.webp";

export interface AppToolbarProps {
  canStartNewChat: boolean;
  onNewChat: () => void;
  overview: LibraryOverview;
}

/** Sticky top bar with the app brand, the Library summary and the New chat action. */
export function AppToolbar({
  canStartNewChat,
  onNewChat,
  overview,
}: AppToolbarProps) {
  return (
    <header className="sticky top-0 z-20 border-border/60 border-b bg-background/80 backdrop-blur-md supports-[backdrop-filter]:bg-background/60">
      <div className="mx-auto flex h-14 max-w-5xl items-center gap-3 px-4">
        <div className="flex shrink-0 items-center gap-2.5">
          <img
            alt=""
            className="size-8"
            height={32}
            src={LOGO_SRC}
            width={32}
          />
          <span className="font-semibold text-sm tracking-tight">
            {APP_NAME}
          </span>
        </div>
        <Separator className="h-5! max-sm:hidden" orientation="vertical" />
        <div className="flex min-w-0 items-baseline gap-2 text-sm max-sm:hidden">
          <span className="truncate text-foreground/90">{overview.name}</span>
          <span className="shrink-0 text-muted-foreground text-xs tabular-nums">
            {describeCounts(overview)}
          </span>
        </div>
        <Button
          className="ml-auto"
          disabled={!canStartNewChat}
          onClick={onNewChat}
          size="sm"
          variant="outline"
        >
          <SquarePenIcon />
          New chat
        </Button>
      </div>
    </header>
  );
}
