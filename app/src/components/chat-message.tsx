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
import { SelectablePhotoGrid } from "#/components/selectable-photo-grid";
import type { PhotoUIMessage } from "#/server/chat";

type Part = PhotoUIMessage["parts"][number];

function SearchPhotosPart({
  part,
}: {
  part: Extract<Part, { type: "tool-searchPhotos" }>;
}) {
  switch (part.state) {
    case "output-available":
      return part.output.length > 0 ? (
        <SelectablePhotoGrid photos={part.output} />
      ) : null;
    case "output-error":
      return null;
    default:
      return <Shimmer>Searching the Library…</Shimmer>;
  }
}

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
                <MessageResponse key={key}>{part.text}</MessageResponse>
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
            default:
              return null;
          }
        })}
      </MessageContent>
    </Message>
  );
}
