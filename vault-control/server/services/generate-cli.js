#!/usr/bin/env node
/**
 * generate-cli.js — headless bridge so the Python orchestrator can call the
 * Node unified post generator (research + one core narrative, adapted per platform).
 *
 * Usage:
 *   node generate-cli.js --topic "AI agents" --platforms linkedin,facebook
 *   node generate-cli.js --content-file /path/to/trigger.md --platforms linkedin
 *
 * Prints a single JSON object to stdout. All diagnostic logging goes to stderr,
 * so stdout is always clean, parseable JSON for the caller.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load environment (API keys) from the repo-root .env. callAI() reads
// process.env, and nothing loads dotenv when invoked standalone. Repo root is
// four levels up: services -> server -> vault-control -> repo-root.
const repoRoot = path.resolve(__dirname, '../../..');
try {
  const { config } = await import('dotenv');
  config({ path: path.join(repoRoot, '.env') });
} catch (e) {
  console.error('[generate-cli] dotenv unavailable, relying on ambient env:', e.message);
}

// Route console.log (used liberally inside postGenerator) to stderr so stdout
// stays pure JSON.
console.log = (...args) => console.error(...args);

function parseArgs(argv) {
  const out = {};
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const val = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : 'true';
      out[key] = val;
    }
  }
  return out;
}

/**
 * Best-effort topic extraction from a raw trigger file, mirroring the loose
 * heuristic the Python side used (first "topic:"/"about" line, else first
 * meaningful line). Kept intentionally forgiving.
 */
function extractTopic(content) {
  const lines = content.split('\n');
  for (const line of lines) {
    const low = line.toLowerCase();
    if (low.includes('topic') || low.includes('about')) {
      if (line.includes(':')) return line.split(':').slice(1).join(':').trim();
      return line.trim();
    }
  }
  for (const line of lines) {
    const t = line.trim();
    if (t.length > 10 && !t.startsWith('---') && !t.startsWith('#')) return t.slice(0, 120);
  }
  return 'AI and SaaS Development Update';
}

async function main() {
  const args = parseArgs(process.argv);

  let topic = args.topic;
  if (!topic && args['content-file']) {
    try {
      const raw = fs.readFileSync(args['content-file'], 'utf-8');
      topic = extractTopic(raw);
    } catch (e) {
      console.error('[generate-cli] could not read content-file:', e.message);
    }
  }

  const platforms = (args.platforms || 'linkedin')
    .split(',').map(s => s.trim().toLowerCase()).filter(Boolean);

  const mentions = args.mentions
    ? args.mentions.split(',').map(s => s.trim()).filter(Boolean)
    : undefined;

  const { generateUnifiedPosts } = await import('./postGenerator.js');
  const result = await generateUnifiedPosts(topic, platforms, mentions ? { mentions } : {});

  process.stdout.write(JSON.stringify(result));
}

main().catch(err => {
  // Emit a structured error on stdout so the caller can distinguish failure
  // from an empty result, and still fall back gracefully.
  process.stdout.write(JSON.stringify({ error: String(err && err.message || err) }));
  console.error('[generate-cli] fatal:', err);
  process.exit(1);
});
