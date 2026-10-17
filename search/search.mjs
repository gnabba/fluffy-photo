#!/usr/bin/env node
import path from "node:path";
import { parseArgs } from "node:util";
import { findCandidates } from "./library-index.mjs";
import { nomicEmbedder } from "./nomic-embedder.mjs";

const USAGE = `Usage: node search.mjs <library> <search...> [options]

Prints the Candidates for a Search: the Photos whose Sidecars best match it, best first.

Options:
  --limit <n>    Maximum number of Candidates (default: 10)
  --host <url>   Ollama URL (default: http://localhost:11434)
  -h, --help     Show this help`;

const { values: opts, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    limit: { type: "string", default: "10" },
    host: { type: "string", default: "http://localhost:11434" },
    help: { type: "boolean", short: "h", default: false },
  },
});

const limit = Number(opts.limit);

if (opts.help || positionals.length < 2 || !Number.isInteger(limit) || limit < 1) {
  console.log(USAGE);
  process.exit(opts.help ? 0 : 1);
}

const [library, ...words] = positionals;

try {
  const candidates = await findCandidates(library, words.join(" "), nomicEmbedder(opts.host), limit);
  for (const photo of candidates) console.log(path.join(library, photo));
} catch (error) {
  console.error(`Search failed: ${error.message}`);
  process.exit(1);
}
