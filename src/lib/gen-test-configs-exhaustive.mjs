#!/usr/bin/env node
// ================================================================
//  gen-test-configs.mjs
//
//  Generates configTestDefs.js for tile counts 8, 9, 10 only.
//  Coverage: EXHAUSTIVE — every feasible combination of:
//
//    mode          : cross only (plain / expand excluded; add manually)
//    totalTile     : 8 | 9 | 10
//    operatorCount : 0 (unconstrained) … maxOps(tile)
//    operatorSpec  : every non-empty subset of {op → exact count}
//                    whose total ≤ operatorCount (or ≤ maxOps if
//                    operatorCount is unconstrained)
//    algorithm     : default + backtrack (mirrored for key configs)
//    heavyCount    : NOT included in the exhaustive matrix
//                    (added as a small curated set at the end)
//    equalCount    : NOT included in the exhaustive matrix
//                    (added as a small curated set at the end)
//
//  Operator symbols : + - × ÷
//
//  Sort order (stable, lexicographic within each tier):
//    1. totalTile  ASC
//    2. category   (CATEGORY_ORDER index) ASC
//    3. operatorCount value ASC (null/unconstrained = 0)
//    4. specSum    ASC
//    5. id         ASC (tie-break)
//
//  Usage:
//    node gen-test-configs.mjs
//    node gen-test-configs.mjs --output ./src/lib/configTestDefs.js
//    node gen-test-configs.mjs --dry-run
// ================================================================

import { writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath }    from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);

// ── CLI ───────────────────────────────────────────────────────────────────────
const args    = process.argv.slice(2);
const outIdx  = args.indexOf('--output');
const dryRun  = args.includes('--dry-run');
const outPath = outIdx >= 0
  ? resolve(args[outIdx + 1])
  : resolve(__dirname, 'configTestDefs.js');

// ── Domain constants ──────────────────────────────────────────────────────────
const TILES   = [8, 9, 10];
const OPS_ALL = ['+', '-', '×', '÷'];

// Category order drives sort priority and UI section order.
const CATEGORY_ORDER = [
  'basic',       // no constraints
  'opCount',     // operatorCount pinned, no spec
  'opSpec',      // operatorSpec set, no opCount pin
  'hard',        // operatorCount + operatorSpec (partial or full)
  'backtrack',   // algorithm: backtrack mirrors of above
  'heavy',       // curated heavyCount configs
  'eqCount',     // curated equalCount configs
];

const CATEGORY_META = {
  basic:     { label: 'No constraints',             color: 'text-slate-600',   bg: 'bg-slate-50'    },
  opCount:   { label: 'Operator count pinned',      color: 'text-blue-600',    bg: 'bg-blue-50'     },
  opSpec:    { label: 'Operator type spec',         color: 'text-violet-600',  bg: 'bg-violet-50'   },
  hard:      { label: 'Count + spec combined',      color: 'text-rose-600',    bg: 'bg-rose-50'     },
  backtrack: { label: 'Backtrack algorithm',        color: 'text-indigo-600',  bg: 'bg-indigo-50'   },
  heavy:     { label: 'Heavy tiles',                color: 'text-amber-600',   bg: 'bg-amber-50'    },
  eqCount:   { label: 'Multiple equal signs',       color: 'text-teal-600',    bg: 'bg-teal-50'     },
};

// ── Feasibility helpers ───────────────────────────────────────────────────────

/** Convert a range spec to [lo, hi], or null on failure. */
function toRange(v) {
  if (v == null) return null;
  if (Array.isArray(v)) {
    const a = Number(v[0]), b = Number(v[1]);
    return (isFinite(a) && isFinite(b)) ? [a, b] : null;
  }
  const n = Number(v);
  return isFinite(n) ? [n, n] : null;
}

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/** Returns the maximum number of operators that can fit in `tile` tiles.
 *
 *  Cross mode allows number tiles to be shared between equations, so the
 *  practical limit (confirmed against the generator) is:
 *
 *    minEqs = 1 :  floor((tile − 1) / 2)
 *      → 8t = 3 ops,  9t = 4 ops,  10t = 4 ops,  11t = 5 ops …
 *
 *    minEqs ≥ 2 :  floor((tile − 2·minEqs − 1) / 2)
 *      (each extra equal sign consumes 2 additional tiles)
 */
function maxOpsFor(tile, minEqs = 1) {
  if (minEqs === 1) return Math.floor((tile - 1) / 2);
  return Math.max(0, Math.floor((tile - 2 * minEqs - 1) / 2));
}

/** True when the cfg object is satisfiable. */
function isFeasible(cfg) {
  const { totalTile, mode } = cfg;
  if (!totalTile || totalTile < 3) return false;
  if (mode === 'expand' && totalTile < 11) return false;

  const opRange  = toRange(cfg.operatorCount);
  const eqRange  = toRange(cfg.equalCount);
  const minEqs   = eqRange ? clamp(eqRange[0], 1, 3) : 1;
  const minOps   = opRange ? opRange[0] : 0;
  const minTiles = minEqs === 1
    ? 2 * minOps + 1
    : 2 * minOps + 2 * minEqs + 1;

  if (totalTile < minTiles) return false;
  if (minEqs > 3) return false;

  if (cfg.operatorSpec) {
    const specMin = Object.values(cfg.operatorSpec)
      .map(toRange)
      .reduce((s, r) => s + (r ? r[0] : 0), 0);
    const maxOps = opRange
      ? opRange[1]
      : maxOpsFor(totalTile, minEqs);
    if (specMin > maxOps) return false;
  }

  return true;
}

// ── Combinatorial helpers ─────────────────────────────────────────────────────

/** Symbol → safe ASCII slug for use in identifiers. */
const slug = s => s
  .replace(/\+/g, 'plus')
  .replace(/-/g,  'minus')
  .replace(/×/g,  'mul')
  .replace(/÷/g,  'div');

/**
 * Generate ALL non-empty subsets of {op → exact count ≥ 1}
 * where the total across all chosen operators is ≤ maxTotal.
 *
 * Returns an array of plain objects: { [op]: count, … }
 */
function allSpecSubsets(maxTotal) {
  const results = [];

  function recurse(opIdx, remaining, current) {
    if (opIdx === OPS_ALL.length) {
      if (Object.keys(current).length > 0) results.push({ ...current });
      return;
    }
    const op = OPS_ALL[opIdx];
    // Option A: skip this operator
    recurse(opIdx + 1, remaining, current);
    // Option B: include this operator with count c ∈ [1 … remaining]
    for (let c = 1; c <= remaining; c++) {
      current[op] = c;
      recurse(opIdx + 1, remaining - c, current);
      delete current[op];
    }
  }

  recurse(0, maxTotal, {});
  return results;
}

/** Stable ID fragment for an operator spec. */
function specToId(spec) {
  return Object.entries(spec).map(([op, c]) => `${slug(op)}${c}`).join('_');
}

/** Short human label for an operator spec, e.g. "+×2 -×1". */
function specToLabel(spec) {
  return Object.entries(spec).map(([op, c]) => `${op}×${c}`).join(' ');
}

/** Verbose description fragment, e.g. "{+: 2, -: 1}". */
function specToDesc(spec) {
  return '{' + Object.entries(spec).map(([op, c]) => `${op}: ${c}`).join(', ') + '}';
}

/** Convert a plain-count spec {op: n} to a range spec {op: [n, n]}. */
function specToRange(spec) {
  return Object.fromEntries(Object.entries(spec).map(([k, v]) => [k, [v, v]]));
}

/** Sum of all counts in a spec. */
const specSum = spec => Object.values(spec).reduce((a, b) => a + b, 0);

// ── Config accumulator ────────────────────────────────────────────────────────

const configs = [];
const seen    = new Set();

/**
 * Add a config if its id is unique and cfg is feasible.
 * Attaches a `_sortKey` for later sorting (stripped before output).
 */
function add({ id, category, label, description, cfg, _sortMeta }) {
  if (seen.has(id))     return;
  if (!isFeasible(cfg)) return;
  seen.add(id);
  configs.push({ id, category, label, description, cfg, _sortMeta });
}

// ══════════════════════════════════════════════════════════════════════════════
//  EXHAUSTIVE MATRIX  (tiles 8, 9, 10 — cross mode — no heavy / eq constraint)
//
//  For each tile count t:
//
//  ┌─ n = 0  (operatorCount unconstrained) ─────────────────────────────────┐
//  │  • spec = ∅  → category 'basic'                                        │
//  │  • spec ∈ allSpecSubsets(maxOps(t))  → category 'opSpec'               │
//  └────────────────────────────────────────────────────────────────────────┘
//  ┌─ n ≥ 1  (operatorCount = n) ───────────────────────────────────────────┐
//  │  • spec = ∅  → category 'opCount'                                      │
//  │  • spec ∈ allSpecSubsets(n), specSum < n  → category 'hard' (partial)  │
//  │  • spec ∈ allSpecSubsets(n), specSum = n  → category 'hard' (full)     │
//  └────────────────────────────────────────────────────────────────────────┘
// ══════════════════════════════════════════════════════════════════════════════

for (const t of TILES) {
  const mo = maxOpsFor(t); // max operators for this tile count (1 equal sign)

  // ── n = 0: unconstrained operator count ───────────────────────────────────

  // No spec → basic
  add({
    id: `t${t}-basic`,
    category: 'basic',
    label: `${t} tiles — no constraints`,
    description: `Cross mode, ${t} tiles. No operator or structure constraints — fully random generation.`,
    cfg: { mode: 'cross', totalTile: t },
    _sortMeta: { tile: t, catIdx: 0, n: 0, sSum: 0 },
  });

  // With spec → opSpec
  for (const spec of allSpecSubsets(mo)) {
    const ss  = specSum(spec);
    const id  = `t${t}-s_${specToId(spec)}`;
    const isPartial = ss < mo; // not all operator slots are specified
    add({
      id,
      category: 'opSpec',
      label: `${t} tiles — ${specToLabel(spec)}`,
      description:
        `Cross mode, ${t} tiles. Operator type spec: ${specToDesc(spec)}.` +
        (isPartial ? ` Remaining operator slots (up to ${mo - ss} more) are random.` : ' All operator slots are specified.'),
      cfg: { mode: 'cross', totalTile: t, operatorSpec: specToRange(spec) },
      _sortMeta: { tile: t, catIdx: 2, n: 0, sSum: ss },
    });
  }

  // ── n ≥ 1: operatorCount pinned ──────────────────────────────────────────

  for (let n = 1; n <= mo; n++) {
    // No spec → opCount
    add({
      id: `t${t}-n${n}`,
      category: 'opCount',
      label: `${t} tiles — ${n} operator${n > 1 ? 's' : ''}`,
      description:
        `Cross mode, ${t} tiles. Exactly ${n} operator tile${n > 1 ? 's' : ''} placed. ` +
        `Operator types are chosen randomly.`,
      cfg: { mode: 'cross', totalTile: t, operatorCount: [n, n] },
      _sortMeta: { tile: t, catIdx: 1, n, sSum: 0 },
    });

    // With spec → hard (partial or full)
    for (const spec of allSpecSubsets(n)) {
      const ss       = specSum(spec);
      const isFull   = ss === n;
      const partial  = !isFull;
      const id       = `t${t}-n${n}-s_${specToId(spec)}`;
      add({
        id,
        category: 'hard',
        label:
          `${t} tiles — ${n} ops, ${specToLabel(spec)}` +
          (partial ? ' (partial spec)' : ''),
        description:
          `Cross mode, ${t} tiles. Exactly ${n} operator${n > 1 ? 's' : ''}. ` +
          `Operator type spec: ${specToDesc(spec)}.` +
          (partial
            ? ` ${n - ss} remaining operator slot${n - ss > 1 ? 's are' : ' is'} chosen randomly.`
            : ' All operator slots match the spec exactly.'),
        cfg: {
          mode: 'cross', totalTile: t,
          operatorCount: [n, n],
          operatorSpec:  specToRange(spec),
        },
        _sortMeta: { tile: t, catIdx: 3, n, sSum: ss },
      });
    }
  }
}

// ══════════════════════════════════════════════════════════════════════════════
//  BACKTRACK MIRRORS
//  Selected configs from the exhaustive matrix re-run with algorithm:'backtrack'
//  to compare solver behaviour between the two algorithms.
// ══════════════════════════════════════════════════════════════════════════════

/** Mirror an existing base config with backtrack algorithm. */
function btMirror({ baseId, baseCfg }) {
  const tc = configs.find(c => c.id === baseId);
  if (!tc) return; // base not added (infeasible)
  const id = `bt-${baseId}`;
  add({
    id,
    category: 'backtrack',
    label:    `[BT] ${tc.label}`,
    description: `${tc.description} Re-run using the backtrack solver for comparison.`,
    cfg:  { ...baseCfg, algorithm: 'backtrack' },
    _sortMeta: { tile: baseCfg.totalTile, catIdx: 4, n: tc._sortMeta?.n ?? 0, sSum: tc._sortMeta?.sSum ?? 0 },
  });
}

// Mirror: basic
for (const t of TILES) {
  btMirror({ baseId: `t${t}-basic`, baseCfg: { mode: 'cross', totalTile: t } });
}

// Mirror: opCount n=2, 3, 4
for (const t of TILES) {
  for (const n of [2, 3, 4]) {
    if (n <= maxOpsFor(t)) {
      btMirror({ baseId: `t${t}-n${n}`, baseCfg: { mode: 'cross', totalTile: t, operatorCount: [n, n] } });
    }
  }
}

// Mirror: single-op specs (+×1, -×1, ××1, ÷×1) at each tile
for (const t of TILES) {
  for (const op of OPS_ALL) {
    btMirror({
      baseId:  `t${t}-s_${slug(op)}1`,
      baseCfg: { mode: 'cross', totalTile: t, operatorSpec: { [op]: [1, 1] } },
    });
  }
}

// Mirror: hard combos — n=3 with -×1 or ÷×1 spec
for (const t of TILES) {
  const n = 3;
  if (n <= maxOpsFor(t)) {
    for (const op of ['-', '÷']) {
      btMirror({
        baseId:  `t${t}-n${n}-s_${slug(op)}1`,
        baseCfg: { mode: 'cross', totalTile: t, operatorCount: [n, n], operatorSpec: { [op]: [1, 1] } },
      });
    }
  }
}

// ══════════════════════════════════════════════════════════════════════════════
//  CURATED EXTRAS — heavyCount and equalCount
//  These aren't part of the exhaustive matrix (too many combos with little gain)
//  but are worth testing explicitly.
// ══════════════════════════════════════════════════════════════════════════════

for (const t of TILES) {
  const maxH = Math.min(3, Math.floor(t / 3));
  for (let h = 1; h <= maxH; h++) {
    add({
      id: `t${t}-heavy${h}`,
      category: 'heavy',
      label: `${t} tiles — ${h} heavy tile${h > 1 ? 's' : ''}`,
      description:
        `Cross mode, ${t} tiles. Exactly ${h} "heavy" (2-digit) number tile${h > 1 ? 's' : ''} included. ` +
        `Heavy tiles increase number range and difficulty.`,
      cfg: { mode: 'cross', totalTile: t, heavyCount: [h, h] },
      _sortMeta: { tile: t, catIdx: 5, n: 0, sSum: 0 },
    });

    // heavy + opCount
    for (const n of [2, 3]) {
      if (!isFeasible({ mode: 'cross', totalTile: t, heavyCount: [h, h], operatorCount: [n, n] })) continue;
      add({
        id: `t${t}-heavy${h}-n${n}`,
        category: 'heavy',
        label: `${t} tiles — ${h} heavy, ${n} ops`,
        description:
          `Cross mode, ${t} tiles. ${h} heavy tile${h > 1 ? 's' : ''} + exactly ${n} operator${n > 1 ? 's' : ''}.`,
        cfg: { mode: 'cross', totalTile: t, heavyCount: [h, h], operatorCount: [n, n] },
        _sortMeta: { tile: t, catIdx: 5, n, sSum: 0 },
      });
    }
  }
}

for (const t of TILES) {
  for (const eq of [2, 3]) {
    if (!isFeasible({ mode: 'cross', totalTile: t, equalCount: [eq, eq] })) continue;
    add({
      id: `t${t}-eq${eq}`,
      category: 'eqCount',
      label: `${t} tiles — ${eq} equal signs`,
      description:
        `Cross mode, ${t} tiles. Layout contains exactly ${eq} equal-sign tiles. ` +
        `This creates ${eq} linked equation${eq > 1 ? 's' : ''} sharing number tiles.`,
      cfg: { mode: 'cross', totalTile: t, equalCount: [eq, eq] },
      _sortMeta: { tile: t, catIdx: 6, n: 0, sSum: 0 },
    });

    // eq + opCount
    for (const n of [1, 2, 3]) {
      const mo = maxOpsFor(t, eq);
      if (n > mo) continue;
      if (!isFeasible({ mode: 'cross', totalTile: t, equalCount: [eq, eq], operatorCount: [n, n] })) continue;
      add({
        id: `t${t}-eq${eq}-n${n}`,
        category: 'eqCount',
        label: `${t} tiles — ${eq} equal signs, ${n} ops`,
        description:
          `Cross mode, ${t} tiles. ${eq} equal signs + exactly ${n} operator${n > 1 ? 's' : ''}.`,
        cfg: { mode: 'cross', totalTile: t, equalCount: [eq, eq], operatorCount: [n, n] },
        _sortMeta: { tile: t, catIdx: 6, n, sSum: 0 },
      });
    }
  }
}

// ══════════════════════════════════════════════════════════════════════════════
//  SORT
//  Primary  : totalTile ASC
//  Secondary: category (CATEGORY_ORDER index) ASC
//  Tertiary : operatorCount value ASC (unconstrained = 0)
//  Quaternary: specSum ASC
//  Quinary  : id ASC (tie-break)
// ══════════════════════════════════════════════════════════════════════════════

configs.sort((a, b) => {
  const ma = a._sortMeta, mb = b._sortMeta;
  if (ma.tile   !== mb.tile)   return ma.tile   - mb.tile;
  if (ma.catIdx !== mb.catIdx) return ma.catIdx - mb.catIdx;
  if (ma.n      !== mb.n)      return ma.n      - mb.n;
  if (ma.sSum   !== mb.sSum)   return ma.sSum   - mb.sSum;
  return a.id.localeCompare(b.id);
});

// ── Summary table ─────────────────────────────────────────────────────────────

const counts = {};
for (const cat of CATEGORY_ORDER) counts[cat] = 0;
for (const c of configs) counts[c.category] = (counts[c.category] ?? 0) + 1;

const PAD = 30;
console.log('');
console.log('┌' + '─'.repeat(PAD + 2) + '┬' + '─'.repeat(10) + '┐');
console.log('│ ' + 'Category'.padEnd(PAD) + '│ Count    │');
console.log('├' + '─'.repeat(PAD + 2) + '┼' + '─'.repeat(10) + '┤');
for (const cat of CATEGORY_ORDER) {
  const n = counts[cat] ?? 0;
  if (!n) continue;
  console.log(`│ ${(CATEGORY_META[cat]?.label ?? cat).padEnd(PAD)}│ ${String(n).padEnd(8)}│`);
}
console.log('├' + '─'.repeat(PAD + 2) + '┼' + '─'.repeat(10) + '┤');
console.log('│ ' + 'TOTAL'.padEnd(PAD) + '│ ' + String(configs.length).padEnd(8) + '│');
console.log('└' + '─'.repeat(PAD + 2) + '┴' + '─'.repeat(10) + '┘');
console.log('');
console.log('Tile range : 8–10 only (exhaustive within each tile)');
console.log('Coverage   : basic / opCount / opSpec / hard (count+spec)');
console.log('             + backtrack mirrors + curated heavy / eqCount');
console.log('');

if (dryRun) {
  console.log('[dry-run] File not written.');
  process.exit(0);
}

// ── File serialisation ────────────────────────────────────────────────────────

function serializeCfg(cfg) {
  const parts = [`mode: '${cfg.mode}'`, `totalTile: ${cfg.totalTile}`];
  if (cfg.operatorCount) {
    parts.push(`operatorCount: [${cfg.operatorCount}]`);
  }
  if (cfg.operatorSpec) {
    const entries = Object.entries(cfg.operatorSpec)
      .map(([k, v]) => `'${k}': [${v}]`)
      .join(', ');
    parts.push(`operatorSpec: { ${entries} }`);
  }
  if (cfg.heavyCount) parts.push(`heavyCount: [${cfg.heavyCount}]`);
  if (cfg.equalCount) parts.push(`equalCount: [${cfg.equalCount}]`);
  if (cfg.algorithm)  parts.push(`algorithm: '${cfg.algorithm}'`);
  return `{ ${parts.join(', ')} }`;
}

const STATIC_FUNCTIONS = `
// ── Utility exports ────────────────────────────────────────────────────────

/**
 * Returns configs grouped by category in display order.
 * @returns {{ [category: string]: TestConfig[] }}
 */
export function getConfigsByCategory() {
  const map = {};
  for (const cat of CATEGORY_ORDER) map[cat] = [];
  for (const tc of TEST_CONFIGS) {
    (map[tc.category] ??= []).push(tc);
  }
  return map;
}

/**
 * Compact tag array for a config — shown as pills in the dashboard.
 * Examples: ["9t", "ops=4", "-×2", "h=2", "BT"]
 *
 * Tag conventions:
 *   Nt       → tile count
 *   ops=N    → exact operator count
 *   +×N      → operator type + count from spec
 *   h=N      → heavy tile count
 *   eq=N     → equal sign count
 *   BT       → backtrack algorithm
 */
export function cfgTags(tc) {
  const { cfg } = tc;
  const tags = [\`\${cfg.totalTile}t\`];

  if (cfg.operatorCount) {
    const [lo, hi] = cfg.operatorCount;
    tags.push(\`ops=\${lo}\${lo !== hi ? \`–\${hi}\` : ''}\`);
  }

  if (cfg.operatorSpec) {
    for (const [op, r] of Object.entries(cfg.operatorSpec)) {
      const [lo, hi] = Array.isArray(r) ? r : [r, r];
      tags.push(\`\${op}×\${lo}\${lo !== hi ? \`–\${hi}\` : ''}\`);
    }
  }

  if (cfg.heavyCount) {
    const [lo] = cfg.heavyCount;
    tags.push(\`h=\${lo}\`);
  }

  if (cfg.equalCount) {
    const [lo] = cfg.equalCount;
    tags.push(\`eq=\${lo}\`);
  }

  if (cfg.algorithm === 'backtrack') tags.push('BT');

  return tags;
}
`;

// Section header comments for readability inside the generated file
function sectionHeader(tile, catKey) {
  const catLabel = (CATEGORY_META[catKey]?.label ?? catKey).toUpperCase();
  const line = `  // ${'─'.repeat(4)} ${tile} TILES · ${catLabel} ${'─'.repeat(Math.max(0, 52 - catLabel.length))}`;
  return line;
}

const lines = [
  '// ================================================================',
  '//  configTestDefs.js',
  '//  AUTO-GENERATED by gen-test-configs.mjs — DO NOT EDIT BY HAND',
  `//${' '.repeat(2)}Generated : ${new Date().toISOString()}`,
  `//${' '.repeat(2)}Configs   : ${configs.length}`,
  '//',
  '//  Tile range : 8 – 10 (exhaustive combination coverage)',
  '//  Modes      : cross (default algorithm + backtrack mirrors)',
  '//               + curated heavyCount / equalCount extras',
  '//',
  '//  Regenerate : node gen-test-configs.mjs',
  '// ================================================================',
  '',
  '/** Number of attempts run per config during a test run. */',
  'export const ATTEMPTS_PER_CONFIG = 10;',
  '',
  '/** UI metadata for each category (label + Tailwind color classes). */',
  `export const CATEGORY_META = ${JSON.stringify(CATEGORY_META, null, 2)};`,
  '',
  '/** Stable display order for category sections. */',
  `export const CATEGORY_ORDER = ${JSON.stringify(CATEGORY_ORDER)};`,
  '',
  '/**',
  ' * Full list of test configurations.',
  ' *',
  ' * Each entry has:',
  ' *   id          — stable unique key (used as DB configId)',
  ' *   category    — key into CATEGORY_META',
  ' *   label       — short human-readable name',
  ' *   description — one-sentence explanation of what is being tested',
  ' *   cfg         — config object passed directly to generateBingo()',
  ' */',
  'export const TEST_CONFIGS = [',
];

let lastTile = null;
let lastCat  = null;

for (const tc of configs) {
  const { tile, catIdx } = tc._sortMeta;
  const cat = tc.category;

  if (tile !== lastTile || cat !== lastCat) {
    if (lastTile !== null) lines.push('');
    lines.push(sectionHeader(tile, cat));
    lastTile = tile;
    lastCat  = cat;
  }

  lines.push(
    `  { id: '${tc.id}', category: '${tc.category}', ` +
    `label: ${JSON.stringify(tc.label)}, ` +
    `description: ${JSON.stringify(tc.description)}, ` +
    `cfg: ${serializeCfg(tc.cfg)} },`,
  );
}

lines.push('];', '', STATIC_FUNCTIONS);

writeFileSync(outPath, lines.join('\n'), 'utf8');
console.log(`✓  Wrote ${configs.length} configs → ${outPath}`);