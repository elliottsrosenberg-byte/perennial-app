#!/usr/bin/env node
// Design-system guardrail: flags hardcoded color literals that should be
// design tokens. Run on a single file path (the Claude Code post-edit hook
// passes the edited file). Prints violations to stderr and exits 2 so the
// finding is surfaced back to the agent; exits 0 when clean.
//
//   node scripts/check-design-tokens.mjs <file.tsx>
//
// The rule: color VALUES come from app/globals.css tokens
// (var(--color-*), rgba(var(--color-*-rgb), α)) — never a raw hex/rgba.
// See docs/architecture/design-system.md and .design-sync/.

import { readFileSync } from 'node:fs';

const file = process.argv[2];
if (!file) process.exit(0);

// Only police app source .tsx. Everything else is out of scope.
if (!/\.(tsx|jsx)$/.test(file)) process.exit(0);
if (!/(^|\/)(app|components)\//.test(file)) process.exit(0);

// Documented exceptions — intentionally not tokenized (see .design-sync/NOTES.md):
//  - tour/ animations, the /design showcase (displays literal values),
//  - the public booking page's distinct warm sub-palette.
const EXEMPT_PATH = /components\/tour\/|app\/design\/page\.tsx|components\/scheduling\//;
if (EXEMPT_PATH.test(file)) process.exit(0);

let src;
try { src = readFileSync(file, 'utf8'); } catch { process.exit(0); }

const lines = src.split('\n');
const hits = [];

for (let i = 0; i < lines.length; i++) {
  const raw = lines[i];
  // Skip comment lines (// … or a line that's clearly inside a block comment / JSDoc *).
  const trimmed = raw.trim();
  if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) continue;
  // Strip trailing line comments so a hex in a `// note` doesn't trip.
  const line = raw.replace(/\/\/.*$/, '');

  // Hardcoded 6-digit hex, excluding pure black/white anchors.
  for (const m of line.matchAll(/#[0-9a-fA-F]{6}\b/g)) {
    const hex = m[0].toLowerCase();
    if (hex === '#ffffff' || hex === '#000000') continue;
    // Hex passed into a function / concatenated for alpha (e.g. hexToRgba("#..."),
    // `${c}11`) is a legitimate non-token pattern — skip when adjacent to ( or a
    // string-concat quote+backtick. Heuristic: preceded by (" or ('  or  followed by "+ / `.
    const before = line.slice(Math.max(0, m.index - 2), m.index);
    if (before === '("' || before === "('") continue;
    hits.push({ ln: i + 1, tok: m[0], kind: 'hex' });
  }

  // Hardcoded rgba() with a numeric base (not var(), not 0,0,0 / 255,255,255).
  for (const m of line.matchAll(/rgba\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/g)) {
    const [r, g, b] = [m[1], m[2], m[3]].map(Number);
    if (r === 0 && g === 0 && b === 0) continue;          // black shadow anchor
    if (r === 255 && g === 255 && b === 255) continue;    // white overlay anchor
    hits.push({ ln: i + 1, tok: `rgba(${r},${g},${b},…)`, kind: 'rgba' });
  }
}

if (!hits.length) process.exit(0);

const rel = file.replace(process.cwd() + '/', '');
console.error(`\n⚠️  Design-system check — ${rel}: ${hits.length} hardcoded color(s).`);
console.error(`   Use app/globals.css tokens instead: var(--color-*) for solids, rgba(var(--color-*-rgb), α) for tints.`);
for (const h of hits.slice(0, 20)) {
  console.error(`   L${h.ln}: ${h.tok}`);
}
if (hits.length > 20) console.error(`   …and ${hits.length - 20} more.`);
console.error(`   If a value is a genuine one-off (brand/provider color, contrast anchor), it's fine — otherwise tokenize it.`);
process.exit(2);
