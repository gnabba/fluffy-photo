#!/usr/bin/env node
import { parseArgs } from "node:util";
import { buildIndex } from "./library-index.mjs";
import { nomicEmbedder } from "./nomic-embedder.mjs";

const USAGE = `Usage: node build-index.mjs <library> [options]

Indexes the .txt Sidecars in <library> for search, rebuilding the index from scratch.

Options:
  --host <url>   Ollama URL (default: http://localhost:11434)
  -h, --help     Show this help`;

const { values: opts, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    host: { type: "string", default: "http://localhost:11434" },
    help: { type: "boolean", short: "h", default: false },
  },
});

if (opts.help || positionals.length !== 1) {
  console.log(USAGE);
  process.exit(opts.help ? 0 : 1);
}

const [library] = positionals;

try {
  const count = await buildIndex(library, nomicEmbedder(opts.host));
  console.log(`Indexed ${count} Sidecars in ${library}`);
} catch (error) {
  console.error(`Indexing failed: ${error.message}`);
  process.exit(1);
}
