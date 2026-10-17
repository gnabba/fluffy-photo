import { createFileRoute } from "@tanstack/react-router";
import { ImagesIcon } from "lucide-react";
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
} from "#/components/ai-elements/conversation";
import { Suggestion, Suggestions } from "#/components/ai-elements/suggestion";
import { describeCounts } from "#/lib/library-overview";
import { getLibraryOverview } from "#/server/functions";

const SUGGESTIONS = [
  "Car #98 on track",
  "Red Ferrari",
  "Photos with Pirelli branding",
];

export const Route = createFileRoute("/")({
  loader: () => getLibraryOverview(),
  component: Home,
});

function Home() {
  const overview = Route.useLoaderData();

  return (
    <main className="mx-auto flex h-dvh max-w-4xl flex-col p-4">
      <Conversation className="flex-1">
        <ConversationContent className="h-full">
          <ConversationEmptyState>
            <ImagesIcon className="size-10 text-muted-foreground" />
            <div className="space-y-1">
              <h1 className="font-semibold text-2xl">{overview.name}</h1>
              <p className="text-muted-foreground text-sm">
                {describeCounts(overview)}
              </p>
            </div>
            <Suggestions className="mx-auto mt-4">
              {SUGGESTIONS.map((suggestion) => (
                <Suggestion key={suggestion} suggestion={suggestion} />
              ))}
            </Suggestions>
          </ConversationEmptyState>
        </ConversationContent>
      </Conversation>
    </main>
  );
}
