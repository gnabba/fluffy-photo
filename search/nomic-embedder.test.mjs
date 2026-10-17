import { test } from "node:test";
import assert from "node:assert/strict";
import { nomicEmbedder } from "./nomic-embedder.mjs";

function fakeOllama(t) {
  const requests = [];
  t.mock.method(globalThis, "fetch", async (url, init) => {
    const body = JSON.parse(init.body);
    requests.push({ url: String(url), body });
    return Response.json({ embeddings: body.input.map((_, i) => [i, 0.5]) });
  });
  return requests;
}

test("embeds Sidecars on Ollama as nomic search documents", async (t) => {
  const requests = fakeOllama(t);

  const vectors = await nomicEmbedder("http://ollama:11434").embedDocuments(["car_numbers: 9", "car_numbers: 98"]);

  assert.deepEqual(vectors, [
    [0, 0.5],
    [1, 0.5],
  ]);
  assert.deepEqual(requests, [
    {
      url: "http://ollama:11434/api/embed",
      body: {
        model: "nomic-embed-text",
        input: ["search_document: car_numbers: 9", "search_document: car_numbers: 98"],
      },
    },
  ]);
});

test("embeds a Search on Ollama as a nomic search query", async (t) => {
  const requests = fakeOllama(t);

  const vector = await nomicEmbedder("http://ollama:11434").embedQuery("yellow Porsche");

  assert.deepEqual(vector, [0, 0.5]);
  assert.deepEqual(requests[0].body.input, ["search_query: yellow Porsche"]);
});

test("reports the error returned by Ollama", async (t) => {
  t.mock.method(globalThis, "fetch", async () => new Response('model "nomic-embed-text" not found', { status: 404 }));

  await assert.rejects(
    nomicEmbedder("http://ollama:11434").embedQuery("yellow Porsche"),
    /Ollama returned 404: model "nomic-embed-text" not found/,
  );
});
