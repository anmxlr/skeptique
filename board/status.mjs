#!/usr/bin/env node
// Usage: node board/status.mjs [--json] [--check]
// Reads board/cards/*.md and board/done/<ID>.md receipts. No dependencies.
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const cardsDir = join(root, 'cards');
const doneDir = join(root, 'done');

const cards = new Map();
for (const f of readdirSync(cardsDir).filter((f) => f.endsWith('.md')).sort()) {
  const lane = f.replace(/^lane-/, '').replace(/\.md$/, '');
  let cur = null;
  for (const line of readFileSync(join(cardsDir, f), 'utf8').split(/\r?\n/)) {
    const h = line.match(/^## ([A-Z]+-\d+) · (.+)$/);
    if (h) {
      cur = { id: h[1], title: h[2], lane, deps: [], size: '?', who: 'agent', tracks: '' };
      cards.set(cur.id, cur);
      continue;
    }
    if (!cur) continue;
    const kv = line.match(/^- (deps|size|who|tracks): ?(.*)$/);
    if (!kv) continue;
    if (kv[1] === 'deps') cur.deps = kv[2].trim() === 'none' ? [] : kv[2].split(',').map((s) => s.trim()).filter(Boolean);
    else cur[kv[1]] = kv[2].trim();
  }
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
  console.log(`cards: ${rows.length} | done ${count('done')} | ready ${count('ready')} | blocked ${count('blocked')}\n`);
  const ready = rows.filter((r) => r.state === 'ready');
  console.log('READY (safe to run in parallel):');
  for (const r of ready) console.log(`  ${r.id.padEnd(5)} [${r.size}] ${r.who === 'human' ? 'HUMAN ' : ''}${r.title}  (lane ${r.lane}, wave ${r.wave})`);
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
