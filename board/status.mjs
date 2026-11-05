#!/usr/bin/env node
// Usage: node board/status.mjs [--json] [--check]
// Reads .scratch/skeptic-v1/issues/NN-<slug>.md tickets and board/done/NN.md receipts. No dependencies.
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const ticketsDir = join(root, '..', '.scratch', 'skeptic-v1', 'issues');
const doneDir = join(root, 'done');

const field = (text, name) => (text.match(new RegExp(`^\\*\\*${name}:\\*\\* ?(.*)$`, 'm')) || [])[1]?.trim() ?? '';

const cards = new Map();
for (const f of readdirSync(ticketsDir).filter((f) => /^\d{2}-.+\.md$/.test(f)).sort()) {
  const text = readFileSync(join(ticketsDir, f), 'utf8');
  const id = f.slice(0, 2);
  const title = (text.match(/^# \d+: (.+)$/m) || [])[1]?.trim() ?? f;
  // "none (can start immediately)" -> []; "06, 07" -> ['06','07']; parenthetical notes are ignored
  const blocked = field(text, 'Blocked by').replace(/\(.*\)/, '').trim();
  const deps = /^none\b/i.test(blocked) || !blocked ? [] : blocked.split(',').map((s) => s.trim()).filter(Boolean);
  const status = field(text, 'Status');
  cards.set(id, {
    id, title, deps,
    size: field(text, 'Size') || '?',
    who: status === 'needs-human' ? 'human' : 'agent',
    tracks: field(text, 'Tracks'),
  });
}

const isDone = (id) => existsSync(join(doneDir, `${id}.md`));
const problems = [];
for (const c of cards.values()) {
  for (const d of c.deps) if (!cards.has(d)) problems.push(`${c.id}: unknown dependency ${d}`);
  if (!['S', 'M'].includes(c.size)) problems.push(`${c.id}: size must be S or M (got "${c.size}")`);
}

// wave = longest dependency chain (also detects cycles)
const wave = new Map();
const visiting = new Set();
function waveOf(id) {
  if (wave.has(id)) return wave.get(id);
  if (visiting.has(id)) { problems.push(`cycle at ${id}`); return 0; }
  visiting.add(id);
  const c = cards.get(id);
  const w = c && c.deps.length ? 1 + Math.max(...c.deps.map((d) => (cards.has(d) ? waveOf(d) : 0))) : 0;
  visiting.delete(id);
  wave.set(id, w);
  return w;
}
for (const id of cards.keys()) waveOf(id);

const rows = [...cards.values()].map((c) => {
  const done = isDone(c.id);
  const ready = !done && c.deps.every(isDone);
  return { ...c, wave: wave.get(c.id), state: done ? 'done' : ready ? 'ready' : 'blocked' };
});

if (process.argv.includes('--json')) {
  console.log(JSON.stringify({ problems, cards: rows }, null, 2));
} else {
  const count = (s) => rows.filter((r) => r.state === s).length;
  console.log(`tickets: ${rows.length} | done ${count('done')} | ready ${count('ready')} | blocked ${count('blocked')}\n`);
  const ready = rows.filter((r) => r.state === 'ready');
  console.log('READY (safe to run in parallel):');
  for (const r of ready) console.log(`  ${r.id.padEnd(5)} [${r.size}] ${r.who === 'human' && !r.title.startsWith('HUMAN') ? 'HUMAN ' : ''}${r.title}  (tracks ${r.tracks || 'none'}, wave ${r.wave})`);
  if (!ready.length) console.log('  none');
  console.log('\nWAVES:');
  const maxW = Math.max(...rows.map((r) => r.wave));
  for (let w = 0; w <= maxW; w++) {
    const ids = rows.filter((r) => r.wave === w).map((r) => `${r.id}${r.state === 'done' ? '✓' : ''}`);
    console.log(`  wave ${w}: ${ids.join(' ')}`);
  }
}
if (problems.length) {
  console.error('\nPROBLEMS:\n  ' + problems.join('\n  '));
  if (process.argv.includes('--check')) process.exit(1);
}
