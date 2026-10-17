import { useCallback, useMemo } from "react";
import {
  Message,
  MessageContent,
  MessageResponse,
} from "#/components/ai-elements/message";
import {
  Reasoning,
  ReasoningContent,
  ReasoningTrigger,
} from "#/components/ai-elements/reasoning";
import { Shimmer } from "#/components/ai-elements/shimmer";
import { PhotoCardView } from "#/components/photo-grid";
import {
  type SelectableCardSlots,
  SelectablePhotoGrid,
} from "#/components/selectable-photo-grid";
import type { Match, PhotoCard } from "#/lib/photo-card";
import type { PhotoUIMessage } from "#/server/chat";

type Part = PhotoUIMessage["parts"][number];

function SearchPhotosPart({
  part,
}: {
  part: Extract<Part, { type: "tool-searchPhotos" }>;
}) {
  return part.state === "input-streaming" ||
    part.state === "input-available" ? (
    <Shimmer>Searching the Library…</Shimmer>
  ) : null;
}

function MatchGrid({ matches }: { matches: Match[] }) {
  const reasons = useMemo(
    () => new Map(matches.map((match) => [match.id, match.reason])),
    [matches]
  );
  const renderMatch = useCallback(
    (photo: PhotoCard, { checkbox, open }: SelectableCardSlots) => {
      const reason = reasons.get(photo.id);
      return (
        <PhotoCardView action={checkbox} onOpen={open} photo={photo}>
          <p className="line-clamp-3 text-foreground" title={reason}>
            {reason}
          </p>
        </PhotoCardView>
      );
    },
    [reasons]
  );
  return <SelectablePhotoGrid photos={matches} renderCard={renderMatch} />;
}

function ShowPhotosPart({
  part,
}: {
  part: Extract<Part, { type: "tool-showPhotos" }>;
}) {
  switch (part.state) {
    case "output-available":
      return part.output.length > 0 ? (
        <MatchGrid matches={part.output} />
      ) : null;
    case "output-error":
      return null;
    default:
      return <Shimmer>Reviewing the Candidates…</Shimmer>;
  }
}

// Photos come only from validated showPhotos results, so the model's text is minimal markdown:
// no images, links, code, math, diagrams or raw HTML that could point at paths or rich content.
const TEXT_ALLOWED_ELEMENTS = ["p", "br", "strong", "em", "ul", "ol", "li"];
const NO_PLUGINS = {};

export interface ChatMessageProps {
  isStreaming: boolean;
  message: PhotoUIMessage;
}

/** One chat message: text, collapsed reasoning and inline result grids. */
export function ChatMessage({ isStreaming, message }: ChatMessageProps) {
  return (
    <Message from={message.role}>
      <MessageContent className="w-full max-w-full">
        {message.parts.map((part, index) => {
          const key = `${message.id}-${index}`;
          switch (part.type) {
            case "text":
              return message.role === "user" ? (
                <p key={key}>{part.text}</p>
              ) : (
                <MessageResponse
                  allowedElements={TEXT_ALLOWED_ELEMENTS}
                  key={key}
                  plugins={NO_PLUGINS}
                  skipHtml
                  unwrapDisallowed
                >
                  {part.text}
                </MessageResponse>
              );
            case "reasoning":
              return (
                <Reasoning
                  defaultOpen={false}
                  isStreaming={isStreaming && part.state === "streaming"}
                  key={key}
                >
                  <ReasoningTrigger />
                  <ReasoningContent>{part.text}</ReasoningContent>
                </Reasoning>
              );
            case "tool-searchPhotos":
              return <SearchPhotosPart key={part.toolCallId} part={part} />;
            case "tool-showPhotos":
              return <ShowPhotosPart key={part.toolCallId} part={part} />;
            default:
              return null;
          }
        })}
      </MessageContent>
    </Message>
  );
}
