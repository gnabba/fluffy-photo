import { copyFile, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { readUIMessageStream } from "ai";
import { MockLanguageModelV4, simulateReadableStream } from "ai/test";
import { describe, expect, it } from "vitest";
import { type PhotoUIMessage, streamChat } from "#/server/chat";
import { loadLibrary } from "#/server/library";

const samplesDir = resolve(import.meta.dirname, "../../../samples");

const usage = {
  inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 1, text: 1, reasoning: 0 },
};
const finish = (unified: "stop" | "tool-calls") =>
  ({
    type: "finish",
    finishReason: { unified, raw: undefined },
    usage,
  }) as const;

function searchingModel(query: string) {
  return new MockLanguageModelV4({
    doStream: [
      {
        stream: simulateReadableStream({
          chunks: [
            { type: "reasoning-start", id: "r" },
            { type: "reasoning-delta", id: "r", delta: "Look for #98" },
            { type: "reasoning-end", id: "r" },
            {
              type: "tool-call",
              toolCallId: "call-1",
              toolName: "searchPhotos",
              input: JSON.stringify({ query }),
            },
            finish("tool-calls"),
          ],
        }),
      },
      {
        stream: simulateReadableStream({
          chunks: [
            { type: "text-start", id: "t" },
            { type: "text-delta", id: "t", delta: "Here they are." },
            { type: "text-end", id: "t" },
            finish("stop"),
          ],
        }),
      },
    ],
  });
}

const userMessage = (text: string): PhotoUIMessage => ({
  id: "u1",
  role: "user",
  parts: [{ type: "text", text }],
});

async function lastMessage(
  pending: ReturnType<typeof streamChat>
): Promise<PhotoUIMessage> {
  const stream = await pending;
  let last: PhotoUIMessage | undefined;
  for await (const message of readUIMessageStream<PhotoUIMessage>({
    stream,
  })) {
    last = message;
  }
  if (!last) {
    throw new Error("no message streamed");
  }
  return last;
}

function searchPart(message: PhotoUIMessage) {
  const part = message.parts.find((p) => p.type === "tool-searchPhotos");
  if (part?.state !== "output-available") {
    throw new Error(`searchPhotos not completed: ${JSON.stringify(part)}`);
  }
  return part;
}

describe("streamChat", () => {
  it("streams reasoning, the Candidates of a Search and the reply", async () => {
    const model = searchingModel("car 98");

    const message = await lastMessage(
      streamChat({
        model,
        messages: [userMessage("car 98")],
        readLibrary: () => loadLibrary(samplesDir),
      })
    );

    expect(message.parts.map((p) => p.type)).toEqual([
      "step-start",
      "reasoning",
      "tool-searchPhotos",
      "step-start",
      "text",
    ]);
    expect(searchPart(message).output.map((c) => c.fileName)).toEqual([
      "bmw-rowe.jpg",
    ]);
    expect(searchPart(message).output[0]).toMatchObject({
      id: "bmw-rowe",
      path: resolve(samplesDir, "bmw-rowe.jpg"),
      raceNumbers: ["98"],
    });
  });

  it("gives the model each Candidate's Sidecar as delimited untrusted data", async () => {
    const model = searchingModel("car 98");

    await lastMessage(
      streamChat({
        model,
        messages: [userMessage("car 98")],
        readLibrary: () => loadLibrary(samplesDir),
      })
    );

    const secondStep = JSON.stringify(model.doStreamCalls[1]?.prompt);
    expect(secondStep).toContain(
      '<sidecar id=\\"bmw-rowe\\" untrusted=\\"true\\">'
    );
    expect(secondStep).toContain("car_numbers: 98");
    const instructions = JSON.stringify(model.doStreamCalls[0]?.prompt[0]);
    expect(instructions).toContain("system");
    expect(instructions).not.toContain("car_numbers");
  });

  it("re-reads the Library on every Search", async () => {
    const dir = await mkdtemp(join(tmpdir(), "library-"));
    const chat = (query: string) =>
      lastMessage(
        streamChat({
          model: searchingModel(query),
          messages: [userMessage(query)],
          readLibrary: () => loadLibrary(dir),
        })
      );

    expect(searchPart(await chat("petronas")).output).toEqual([]);

    await copyFile(
      join(samplesDir, "ferrari-lmcorsa.jpg"),
      join(dir, "ferrari-lmcorsa.jpg")
    );
    await copyFile(
      join(samplesDir, "ferrari-lmcorsa.json"),
      join(dir, "ferrari-lmcorsa.json")
    );
    await writeFile(join(dir, "ferrari-lmcorsa.txt"), "keywords: petronas");

    expect(searchPart(await chat("petronas")).output.map((c) => c.id)).toEqual([
      "ferrari-lmcorsa",
    ]);
  });
});
