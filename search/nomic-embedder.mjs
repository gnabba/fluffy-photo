const MODEL = "nomic-embed-text";

export function nomicEmbedder(host) {
  async function embed(texts) {
    const response = await fetch(new URL("/api/embed", host), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: MODEL, input: texts }),
    });

    if (!response.ok) {
      throw new Error(`Ollama returned ${response.status}: ${await response.text()}`);
    }
    return (await response.json()).embeddings;
  }

  return {
    embedDocuments: (texts) => embed(texts.map((text) => `search_document: ${text}`)),
    embedQuery: async (search) => (await embed([`search_query: ${search}`]))[0],
  };
}
