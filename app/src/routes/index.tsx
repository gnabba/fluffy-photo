import { useChat } from "@ai-sdk/react";
import { createFileRoute } from "@tanstack/react-router";
import { DefaultChatTransport } from "ai";
import { useCallback } from "react";
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from "#/components/ai-elements/conversation";
import {
  PromptInput,
  PromptInputBody,
  PromptInputFooter,
  type PromptInputMessage,
  PromptInputSubmit,
  PromptInputTextarea,
} from "#/components/ai-elements/prompt-input";
import { Suggestion, Suggestions } from "#/components/ai-elements/suggestion";
import { AppToolbar, LOGO_SRC } from "#/components/app-toolbar";
import { ChatMessage } from "#/components/chat-message";
import { describeCounts } from "#/lib/library-overview";
import type { PhotoUIMessage } from "#/server/chat";
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

const transport = new DefaultChatTransport<PhotoUIMessage>({
  api: "/api/chat",
});

function Home() {
  const overview = Route.useLoaderData();
  const { error, messages, sendMessage, setMessages, status, stop } =
    useChat<PhotoUIMessage>({ transport });
  const busy = status === "submitted" || status === "streaming";

  const send = useCallback(
    (text: string) => {
      if (text.trim() && !busy) {
        sendMessage({ text });
      }
    },
    [busy, sendMessage]
  );

  const submit = useCallback(
    ({ text }: PromptInputMessage) => send(text),
    [send]
  );

  const newChat = useCallback(() => {
    stop();
    setMessages([]);
  }, [stop, setMessages]);

  return (
    <div className="flex h-dvh flex-col">
      <AppToolbar
        canStartNewChat={messages.length > 0}
        onNewChat={newChat}
        overview={overview}
      />
      <main className="mx-auto flex min-h-0 w-full max-w-5xl flex-1 flex-col gap-2 p-4">
        <Conversation className="flex-1">
          <ConversationContent className={messages.length ? "" : "h-full"}>
            {messages.length === 0 ? (
              <ConversationEmptyState>
                <img
                  alt=""
                  className="size-20 drop-shadow-[0_8px_24px_rgb(250_204_21/0.15)]"
                  height={80}
                  src={LOGO_SRC}
                  width={80}
                />
                <div className="space-y-1">
                  <h1 className="font-semibold text-2xl">{overview.name}</h1>
                  <p className="text-muted-foreground text-sm">
                    {describeCounts(overview)}
                  </p>
                </div>
                <Suggestions className="mx-auto mt-4">
                  {SUGGESTIONS.map((suggestion) => (
                    <Suggestion
                      key={suggestion}
                      onClick={send}
                      suggestion={suggestion}
                    />
                  ))}
                </Suggestions>
              </ConversationEmptyState>
            ) : (
              messages.map((message, index) => (
                <ChatMessage
                  isStreaming={
                    status === "streaming" && index === messages.length - 1
                  }
                  key={message.id}
                  message={message}
                />
              ))
            )}
            {error ? (
              <p className="text-destructive text-sm" role="alert">
                {error.message}
              </p>
            ) : null}
          </ConversationContent>
          <ConversationScrollButton />
        </Conversation>
        <PromptInput onSubmit={submit}>
          <PromptInputBody>
            <PromptInputTextarea placeholder="Describe the photos you are looking for…" />
          </PromptInputBody>
          <PromptInputFooter className="justify-end">
            <PromptInputSubmit onStop={stop} status={status} />
          </PromptInputFooter>
        </PromptInput>
      </main>
    </div>
  );
}
