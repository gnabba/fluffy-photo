const MODEL = "nomic-embed-text";

/** Turns Sidecar texts and Searches into vectors for the search index. */
export interface Embedder {
  embedDocuments: (texts: string[]) => Promise<number[][]>;
  embedQuery: (search: string) => Promise<number[]>;
}

/** Embeds with nomic-embed-text on Ollama, which expects a task prefix on every text. */
export function nomicEmbedder(host: string): Embedder {
  async function embed(texts: string[]): Promise<number[][]> {
    const response = await fetch(new URL("/api/embed", host), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: MODEL, input: texts }),
    });
    if (!response.ok) {
      throw new Error(
        `Ollama returned ${response.status}: ${await response.text()}`
      );
    }
    const { embeddings }: { embeddings: number[][] } = await response.json();
    return embeddings;
  }

  return {
    embedDocuments: (texts) =>
      embed(texts.map((text) => `search_document: ${text}`)),
    embedQuery: async (search) => {
      const [vector] = await embed([`search_query: ${search}`]);
      if (!vector) {
        throw new Error("Ollama returned no embedding");
      }
      return vector;
    },
  };
}
