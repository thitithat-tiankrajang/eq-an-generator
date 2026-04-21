/**
 * batch-analysis.mjs
 *
 * Generate N puzzles แล้ววิเคราะห์สถิติ pattern สมการ
 *
 * Usage:
 *   node batch-analysis.mjs
 *
 * แก้ CONFIG และ CUSTOM_POOL ในส่วน "CONFIGURATION" ด้านล่างได้เลย
 */

import { generateBingo } from './bingoGenerator.js';
import { tokenizeEquation, OPS_ALL } from './bingoMath.js';
import { HEAVY_SET } from './tileHelpers.js';

// ═══════════════════════════════════════════════════════════════
//  CONFIGURATION — แก้ตรงนี้
// ═══════════════════════════════════════════════════════════════

const N = 1000;   // จำนวน puzzle ที่ generate

/** Tile bag ที่ใช้ในการ generate */
const CUSTOM_POOL = {
  '0':  0,
  '1':  4, '2':  4, '3':  4, '4':  4, '5':  4,
  '6':  4, '7':  4, '8':  4, '9':  4,
  '10': 1, '11': 1, '12': 1, '13': 1, '14': 1,
  '15': 1, '16': 1, '17': 1, '18': 1, '19': 1, '20': 1,
  '+':  4, '-':  4, '×':  4, '÷':  4,
  '+/-': 4, '×/÷': 4,
  '=':  8,
  '?':  2,
};

/**
 * Config สำหรับ generateBingo
 * ปล่อย key ไว้ไม่ใส่ = any (ไม่มี constraint)
 *
 * ตัวอย่าง constraint เพิ่มเติม:
 *   equalCount:    1          หรือ [1, 2]
 *   operatorCount: [1, 2]
 *   heavyCount:    [0, 0]     // ไม่มี heavy
 *   wildcardCount: [0, 0]     // ไม่มี wild
 *   blankCount:    [0, 0]     // ไม่มี ?
 *   operatorSpec:  { '÷': [1, 1] }   // ต้องมี ÷ พอดี 1 ตัว
 */
const CONFIG = {
  mode: 'plain',
  totalTile: 9,
  poolDef: CUSTOM_POOL,
  // equalCount: [1, 1],
  // operatorCount: [1, 3],
  // heavyCount: [0, 0],
  // wildcardCount: [0, 0],
  // blankCount: [0, 0],
};

// ═══════════════════════════════════════════════════════════════
//  PATTERN FUNCTION
// ═══════════════════════════════════════════════════════════════

/**
 * แปลง equation string เป็น pattern โดย:
 *   - ตัวเลข (1 tile หรือ heavy) → 'O'
 *   - operator (+, -, ×, ÷) → ตัวสัญลักษณ์นั้น
 *   - '=' → '='
 *   - wildcard (+/-, ×/÷, ?) → ตัวสัญลักษณ์นั้น (ถ้าปรากฏใน equation จริง)
 *
 * ตัวอย่าง:
 *   "16=4×2+8"  → "O=O×O+O"
 *   "3+4=7=7"   → "O+O=O=O"
 *   "12÷3=4"    → "O÷O=O"
 */
function equationToPattern(eq) {
  const tokens = tokenizeEquation(eq);
  if (!tokens) return '(invalid)';
  return tokens.map(tok => {
    if (tok === '=') return '=';
    if (OPS_ALL.includes(tok)) return tok;
    // wildcard ที่ยังไม่ได้ resolve → เก็บสัญลักษณ์
    if (tok === '+/-' || tok === '×/÷' || tok === '?') return tok;
    return 'O';  // number token (ไม่ว่าจะกี่หลัก หรือ heavy)
  }).join('');
}

// ═══════════════════════════════════════════════════════════════
//  GENERATE
// ═══════════════════════════════════════════════════════════════

console.log(`\nGenerating ${N} puzzles (totalTile=${CONFIG.totalTile}, mode=${CONFIG.mode})...`);

const results   = [];
const failures  = [];
const startTime = Date.now();

for (let i = 0; i < N; i++) {
  try {
    const r = generateBingo({ ...CONFIG });
    if (r) results.push(r);
    else failures.push({ i, reason: 'returned null' });
  } catch (err) {
    failures.push({ i, reason: err.message });
  }
}

const totalTime = Date.now() - startTime;
const success   = results.length;

// ═══════════════════════════════════════════════════════════════
//  ANALYSIS HELPERS
// ═══════════════════════════════════════════════════════════════

function countMap(arr) {
  const m = new Map();
  for (const x of arr) m.set(x, (m.get(x) || 0) + 1);
  return m;
}

function pct(n, total, pad = 5) {
  return ((n / total) * 100).toFixed(1).padStart(pad) + '%';
}

function bar(n, total, width = 20) {
  if (total === 0) return '░'.repeat(width);
  const filled = Math.round((n / total) * width);
  return '█'.repeat(filled) + '░'.repeat(width - filled);
}

// ═══════════════════════════════════════════════════════════════
//  COLLECT STATS
// ═══════════════════════════════════════════════════════════════

const equations   = results.map(r => r.equation);
const patterns    = equations.map(equationToPattern);
const eqCounts    = results.map(r => r.eqCount);

const patternMap  = countMap(patterns);
const eqCountMap  = countMap(eqCounts);

// Operator + tile usage
const opUsage      = {};
const numberValues = [];
let heavyPuzzles   = 0;
let wildPuzzles    = 0;
let totalOpTokens  = 0;

for (const r of results) {
  const tiles  = r.solutionTiles ?? [];
  const hasHeavy = tiles.some(t => HEAVY_SET.has(t));
  const hasWild  = tiles.some(t => t === '?' || t === '+/-' || t === '×/÷');
  if (hasHeavy) heavyPuzzles++;
  if (hasWild)  wildPuzzles++;

  // count operator appearances in equation
  const toks = tokenizeEquation(r.equation) ?? [];
  for (const tok of toks) {
    if (OPS_ALL.includes(tok)) {
      opUsage[tok] = (opUsage[tok] || 0) + 1;
      totalOpTokens++;
    }
    // collect number values
    if (tok !== '=' && !OPS_ALL.includes(tok)) {
      const v = parseInt(tok, 10);
      if (!isNaN(v)) numberValues.push(v);
    }
  }
}

// Operator count per puzzle distribution
const opCountPerPuzzle = results.map(r => {
  const toks = tokenizeEquation(r.equation) ?? [];
  return toks.filter(t => OPS_ALL.includes(t)).length;
});
const opCountMap = countMap(opCountPerPuzzle);

// Number value buckets
const numBuckets = { '1–9': 0, '10–20': 0, '21–99': 0, '100+': 0 };
for (const v of numberValues) {
  if (v <= 9)       numBuckets['1–9']++;
  else if (v <= 20) numBuckets['10–20']++;
  else if (v <= 99) numBuckets['21–99']++;
  else              numBuckets['100+']++;
}

// ═══════════════════════════════════════════════════════════════
//  PRINT REPORT
// ═══════════════════════════════════════════════════════════════

const LINE  = '═'.repeat(62);
const DASH  = '─'.repeat(62);

console.log('\n' + LINE);
console.log('   A-MATH BINGO — Equation Pattern Analysis Report');
console.log(`   N=${N}  |  totalTile=${CONFIG.totalTile}  |  mode=${CONFIG.mode}`);
console.log(LINE);

// ── Generation stats ──────────────────────────────────────────
console.log('\n▶  GENERATION');
console.log(`   Success : ${String(success).padStart(6)} / ${N}   ${pct(success, N)}`);
console.log(`   Failed  : ${String(failures.length).padStart(6)} / ${N}   ${pct(failures.length, N)}`);
console.log(`   Time    : ${totalTime} ms total  |  ${(totalTime / N).toFixed(2)} ms/puzzle avg`);

if (failures.length > 0) {
  console.log('\n   ⚠ Failure samples (first 5):');
  failures.slice(0, 5).forEach(f => {
    console.log(`     puzzle #${f.i}: ${f.reason.slice(0, 80)}`);
  });
}

// ── eqCount distribution ──────────────────────────────────────
console.log('\n' + DASH);
console.log('▶  EQUAL SIGN COUNT (eqCount)');
for (const [ec, cnt] of [...eqCountMap.entries()].sort(([a],[b]) => a - b)) {
  const label = `eqCount=${ec}`;
  console.log(`   ${label.padEnd(12)}  ${bar(cnt, success)}  ${String(cnt).padStart(5)}  ${pct(cnt, success)}`);
}

// ── Operator count per puzzle ─────────────────────────────────
console.log('\n' + DASH);
console.log('▶  OPERATOR COUNT PER PUZZLE');
for (const [oc, cnt] of [...opCountMap.entries()].sort(([a],[b]) => a - b)) {
  const label = `ops=${oc}`;
  console.log(`   ${label.padEnd(12)}  ${bar(cnt, success)}  ${String(cnt).padStart(5)}  ${pct(cnt, success)}`);
}

// ── Operator type distribution ────────────────────────────────
console.log('\n' + DASH);
console.log('▶  OPERATOR TYPE DISTRIBUTION (appearances in equations)');
const opOrder = ['+', '-', '×', '÷'];
for (const op of opOrder) {
  const cnt = opUsage[op] || 0;
  const label = `'${op}'`;
  console.log(`   ${label.padEnd(6)}  ${bar(cnt, totalOpTokens)}  ${String(cnt).padStart(6)}  ${pct(cnt, totalOpTokens)}`);
}

// ── Special tile presence ─────────────────────────────────────
console.log('\n' + DASH);
console.log('▶  SPECIAL TILE PRESENCE (per puzzle)');
console.log(`   Heavy tile  ${bar(heavyPuzzles, success)}  ${String(heavyPuzzles).padStart(5)}  ${pct(heavyPuzzles, success)}`);
console.log(`   Wild tile   ${bar(wildPuzzles,  success)}  ${String(wildPuzzles).padStart(5)}  ${pct(wildPuzzles,  success)}`);

// ── Number value range ────────────────────────────────────────
console.log('\n' + DASH);
console.log('▶  NUMBER VALUE DISTRIBUTION (all number tokens)');
const totalNums = numberValues.length;
for (const [bucket, cnt] of Object.entries(numBuckets)) {
  console.log(`   ${bucket.padEnd(8)}  ${bar(cnt, totalNums)}  ${String(cnt).padStart(6)}  ${pct(cnt, totalNums)}`);
}
if (numberValues.length > 0) {
  const min = Math.min(...numberValues);
  const max = Math.max(...numberValues);
  const avg = numberValues.reduce((s,v) => s+v, 0) / numberValues.length;
  console.log(`   min=${min}  max=${max}  avg=${avg.toFixed(1)}`);
}

// ── Top patterns ──────────────────────────────────────────────
const sortedPatterns = [...patternMap.entries()].sort(([,a],[,b]) => b - a);
const SHOW_TOP = 30;

console.log('\n' + DASH);
console.log(`▶  TOP EQUATION PATTERNS  (${patternMap.size} unique patterns found)`);
console.log(`   ${'Rank'.padEnd(5)}  ${'Pattern'.padEnd(24)}  ${'Bar'.padEnd(20)}  ${'Count'.padStart(5)}  ${'Pct'}`);
console.log('   ' + '─'.repeat(57));

for (let i = 0; i < Math.min(SHOW_TOP, sortedPatterns.length); i++) {
  const [pat, cnt] = sortedPatterns[i];
  const rank       = `#${i + 1}`.padEnd(5);
  console.log(`   ${rank}  ${pat.padEnd(24)}  ${bar(cnt, success)}  ${String(cnt).padStart(5)}  ${pct(cnt, success)}`);
}

if (sortedPatterns.length > SHOW_TOP) {
  const rest = sortedPatterns.slice(SHOW_TOP).reduce((s,[,c]) => s + c, 0);
  const restCount = sortedPatterns.length - SHOW_TOP;
  console.log(`   ${'...'.padEnd(5)}  ${`(${restCount} more patterns)`.padEnd(24)}  ${bar(rest, success)}  ${String(rest).padStart(5)}  ${pct(rest, success)}`);
}

// ── Pattern frequency grouping ────────────────────────────────
console.log('\n' + DASH);
console.log('▶  PATTERN RARITY BREAKDOWN');
const singletons  = sortedPatterns.filter(([,c]) => c === 1).length;
const rare        = sortedPatterns.filter(([,c]) => c >= 2 && c < 10).length;
const moderate    = sortedPatterns.filter(([,c]) => c >= 10 && c < 50).length;
const common      = sortedPatterns.filter(([,c]) => c >= 50).length;
console.log(`   ≥50x  (common)   : ${String(common).padStart(4)} patterns`);
console.log(`   10–49x            : ${String(moderate).padStart(4)} patterns`);
console.log(`   2–9x   (rare)     : ${String(rare).padStart(4)} patterns`);
console.log(`   1x     (unique)   : ${String(singletons).padStart(4)} patterns`);

console.log('\n' + LINE + '\n');
