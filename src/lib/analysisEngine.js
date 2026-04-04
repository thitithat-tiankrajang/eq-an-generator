/**
 * analysisEngine.js
 *
 * Pure-logic extraction of the check-eq.js solver.
 * No DOM dependencies — fully usable in React.
 *
 * Main export:  findAllSolutions(tiles, maxResults?)
 * Main export:  analyzePerformance(allSolutions, userAnswer, timeMs, difficulty)
 */

// ─── Constants ────────────────────────────────────────────────────────────────

const MARKS_SET = new Set(['=', '+', '-', '*', '/']);
const UNIT_SET  = new Set(['0','1','2','3','4','5','6','7','8','9']);
const TENS_SET  = new Set(['10','11','12','13','14','15','16','17','18','19','20']);

const SPECIAL_MAP = {
  '+/-': ['+', '-'],
  '×/÷': ['*', '/'],
  '×':   ['*'],
  '÷':   ['/'],
  '?':   ['0','1','2','3','4','5','6','7','8','9',
           '10','11','12','13','14','15','16','17','18','19','20',
           '+','-','*','/','='],
};

function mustBeOp(t) { return t==='+' || t==='-' || t==='*' || t==='/'; }
function mustBeEq(t) { return t==='='; }
function couldBeEq(t){ return t==='=' || t==='?'; }
function mustBeNum(t){ return UNIT_SET.has(t) || TENS_SET.has(t); }

// ─── Structural pre-filter (fast, no wild expansion) ─────────────────────────
function conditionTemplate(seq) {
  const n = seq.length;
  if (n === 0) return false;
  if (!seq.some(couldBeEq)) return false;

  const first = seq[0];
  if (first==='+' || first==='*' || first==='/' || mustBeEq(first)) return false;
  const last = seq[n-1];
  if (mustBeOp(last) || mustBeEq(last)) return false;

  for (let i = 0; i < n-1; i++) {
    const a = seq[i], b = seq[i+1];
    if ((mustBeOp(a)||mustBeEq(a)) && (mustBeOp(b)||mustBeEq(b))) {
      if (!(couldBeEq(a) && b==='-')) return false;
    }
    if (TENS_SET.has(a) && TENS_SET.has(b)) return false;
    if (mustBeNum(a) && mustBeNum(b)) {
      if ((TENS_SET.has(a)&&UNIT_SET.has(b)) || (UNIT_SET.has(a)&&TENS_SET.has(b))) return false;
    }
    if ((a==='/'||a==='-') && b==='0') return false;
  }
  return true;
}

// ─── Prefix pruning for backtrack permutation ─────────────────────────────────
function prefixOk(prefix, totalLen) {
  const n = prefix.length;
  if (n === 0) return true;

  const first = prefix[0];
  if (first==='+' || first==='*' || first==='/' || mustBeEq(first)) return false;

  if (n === totalLen) {
    if (!prefix.some(couldBeEq)) return false;
    const last = prefix[n-1];
    if (mustBeOp(last) || mustBeEq(last)) return false;
  }

  if (n >= 2) {
    const a = prefix[n-2], b = prefix[n-1];
    if ((mustBeOp(a)||mustBeEq(a)) && (mustBeOp(b)||mustBeEq(b))) {
      if (!(couldBeEq(a) && b==='-')) return false;
    }
    if (TENS_SET.has(a) && TENS_SET.has(b)) return false;
    if (mustBeNum(a) && mustBeNum(b)) {
      if ((TENS_SET.has(a)&&UNIT_SET.has(b)) || (UNIT_SET.has(a)&&TENS_SET.has(b))) return false;
    }
    if ((a==='/'||a==='-') && b==='0') return false;
  }
  return true;
}

// ─── Permutation generator with pruning ──────────────────────────────────────
function* permsGen(arr) {
  function* rec(remaining, prefix, totalLen) {
    if (!remaining.length) { yield prefix; return; }
    const seen = new Set();
    for (let i = 0; i < remaining.length; i++) {
      const v = remaining[i];
      if (seen.has(v)) continue;
      seen.add(v);
      const next = [...prefix, v];
      if (!prefixOk(next, totalLen)) continue;
      yield* rec(remaining.filter((_,j) => j!==i), next, totalLen);
    }
  }
  yield* rec(arr, [], arr.length);
}

// ─── Wild-card expansion ──────────────────────────────────────────────────────
function* expandGen(seq) {
  function* rec(idx, current) {
    if (idx === seq.length) { yield current; return; }
    const t = seq[idx];
    const expansions = SPECIAL_MAP[t];
    if (!expansions) {
      yield* rec(idx+1, [...current, t]);
    } else {
      for (const v of expansions) {
        yield* rec(idx+1, [...current, v]);
      }
    }
  }
  yield* rec(0, []);
}

// ─── Full structural + zero-leading check ────────────────────────────────────
function condition(seq) {
  if (!seq.includes('=')) return false;
  const first = seq[0], last = seq[seq.length-1];
  if ((MARKS_SET.has(first) && first !== '-') || MARKS_SET.has(last)) return false;
  for (let i = 0; i < seq.length-1; i++) {
    const a = seq[i], b = seq[i+1];
    if (MARKS_SET.has(a) && MARKS_SET.has(b) && !(a==='='&&b==='-')) return false;
    if (TENS_SET.has(a) && TENS_SET.has(b)) return false;
    if (UNIT_SET.has(a) && TENS_SET.has(b)) return false;
    if (TENS_SET.has(a) && UNIT_SET.has(b)) return false;
    if ((a==='/'||a==='-') && b==='0') return false;
  }
  // no >3 consecutive digits
  let cnt = 0;
  for (const x of seq) {
    if (UNIT_SET.has(x)) { cnt++; if (cnt>3) return false; } else cnt=0;
  }
  // no leading zeros in numbers
  let temp = '';
  for (const x of seq) {
    if (!MARKS_SET.has(x)) temp += x;
    else { if (temp.length>=2 && temp[0]==='0') return false; temp=''; }
  }
  if (temp.length>=2 && temp[0]==='0') return false;
  return true;
}

// ─── Memoized expression evaluator ───────────────────────────────────────────
let _evalCache = new Map();
function cachedEval(expr) {
  if (_evalCache.has(expr)) return _evalCache.get(expr);
  let result;
  try { result = Function(`"use strict"; return (${expr})`)(); }
  catch { result = NaN; }
  _evalCache.set(expr, result);
  return result;
}

function checkEquation(seq) {
  const parts = []; let temp = [];
  for (const t of seq) {
    if (t === '=') { parts.push(temp); temp = []; } else temp.push(t);
  }
  parts.push(temp);
  try {
    const vals = parts.map(p => {
      if (!p.length) return null;
      return cachedEval(p.join(''));
    });
    if (vals.some(v => v===null || !isFinite(v))) return false;
    return vals.every(v => Math.abs(v - vals[0]) < 1e-9);
  } catch { return false; }
}

// ─── Tile list → solver tiles array ──────────────────────────────────────────
// Converts our generator's tile notation to check-eq notation
function normalizeToken(t) {
  if (t === '×')   return '*';
  if (t === '÷')   return '/';
  if (t === '×/÷') return '×/÷';  // handled in SPECIAL_MAP
  return t;
}

/**
 * findAllSolutions(tiles, maxResults?)
 *
 * tiles: string[] — source tile tokens (e.g., ['3', '+/-', '4', '=', '7'])
 * returns: Array<{ eq: string, tokens: string[] }>
 */
export function findAllSolutions(tiles, maxResults = 500) {
  _evalCache = new Map();
  const normalized = tiles.map(normalizeToken);
  const solutions = [];
  const seen = new Set();

  for (const perm of permsGen(normalized)) {
    if (solutions.length >= maxResults) break;
    if (!conditionTemplate(perm)) continue;
    for (const exp of expandGen(perm)) {
      if (solutions.length >= maxResults) break;
      if (condition(exp) && checkEquation(exp)) {
        const key = exp.join('');
        if (!seen.has(key)) {
          seen.add(key);
          // origTokens: pre-expansion permutation — preserves wildcard tokens
          // so scoring can use the wildcard's own points (not the resolved tile's).
          solutions.push({ eq: key, tokens: exp, origTokens: [...perm] });
        }
      }
    }
  }
  return solutions;
}

// ─── Score a specific equation against slot bonus types ──────────────────────
const SLOT_TYPE_BONUS = {
  px1: 'p1', px2: 'p2', px3: 'p3', px3star: 'p3',
  ex2: 'e2', ex3: 'e3',
};
// Must match check-eq.js TILE_POINTS exactly.
// Wildcards use their OWN points (not the resolved tile's points).
// '*' and '/' are internal forms after normalizeToken('×')/'÷').
const TILE_POINTS_AE = {
  '0':1,'1':1,'2':1,'3':1,'4':2,'5':2,'6':2,'7':2,'8':2,'9':2,
  '10':3,'11':4,'12':3,'13':6,'14':4,'15':4,'16':4,'17':6,'18':4,'19':7,'20':5,
  '+':2,'-':2,'×':2,'÷':2,'+/-':1,'×/÷':1,'=':1,'?':0,'*':2,'/':2,
};

export function scoreEquation(sourceTiles, slotTypes) {
  let sum = 0, eMult = 1;
  sourceTiles.forEach((t, i) => {
    const bonus = SLOT_TYPE_BONUS[slotTypes[i]] ?? 'p1';
    const pt    = TILE_POINTS_AE[t] ?? 0;
    if      (bonus === 'p2') sum += pt * 2;
    else if (bonus === 'p3') sum += pt * 3;
    else                     sum += pt;
    if (bonus === 'e2') eMult *= 2;
    if (bonus === 'e3') eMult *= 3;
  });
  return sum * eMult;
}

// ─── Analysis ─────────────────────────────────────────────────────────────────
/**
 * analyzePerformance({
 *   allSolutions,       // Array<{ eq, tokens }>
 *   userEquation,       // string (e.g. "3+4=7")
 *   userScore,          // number
 *   timeMs,             // ms taken by user (null if no timer)
 *   difficulty,         // 1-10
 * })
 *
 * Returns:
 * {
 *   performance: 0-100,
 *   label: 'Excellent' | 'Good' | 'Average' | 'Hard' | ...
 *   patternCount: number,
 *   maxPossibleScore: number,
 *   scoreRatio: 0-1,
 *   difficultyClass: 'easy'|'medium'|'hard'|'very-hard',
 *   timeComponent: 0-100 | null,
 *   breakdown: { score: 0-50, time: 0-30, optionality: 0-20 }
 * }
 */
export function analyzePerformance({
  allSolutions,
  userScore,
  timeMs,
}) {
  const n = allSolutions.length || 1;

  // ─────────────────────────────────────────────
  // 1. SCORE (Percentile + Z-score)
  // ─────────────────────────────────────────────
  const scores = allSolutions.map(s => s.score ?? 0).sort((a,b)=>a-b);

  const rank = scores.filter(s => s <= userScore).length;
  const scorePercentile = rank / n;

  const mean = scores.reduce((a,b)=>a+b,0) / n;
  const variance = scores.reduce((a,b)=>a + (b-mean)**2, 0) / n;
  const std = Math.sqrt(variance) || 1;

  const zScore = (userScore - mean) / std;

  // normalize z-score → 0-1
  const scoreZNormalized = 1 / (1 + Math.exp(-zScore));

  // final score component (0–50)
  const scoreComponent = Math.round(
    (0.7 * scorePercentile + 0.3 * scoreZNormalized) * 50
  );

  // ─────────────────────────────────────────────
  // 2. SPEED (log-based expected time)
  // ─────────────────────────────────────────────
  let speedComponent = 15; // default (กลาง)

  if (timeMs != null && timeMs > 0) {
    // complexity from solution space
    const complexity = n;

    // expected time grows logarithmically
    const expectedMs = 8000 * Math.log2(complexity + 2);

    const ratio = timeMs / expectedMs;

    // exponential decay → smooth & fair
    const speedScore = Math.exp(-ratio);

    speedComponent = Math.round(speedScore * 30);
  }

  // ─────────────────────────────────────────────
  // 3. RARITY (entropy-based)
  // ─────────────────────────────────────────────
  const freq = {};
  for (const s of allSolutions) {
    const sc = s.score ?? 0;
    freq[sc] = (freq[sc] || 0) + 1;
  }

  const userFreq = freq[userScore] || 1;
  const p = userFreq / n;

  // information content (bits)
  const info = -Math.log2(p);

  // normalize (assuming max ~ log2(n))
  const maxInfo = Math.log2(n);
  const rarityScore = maxInfo > 0 ? info / maxInfo : 0;

  const rarityComponent = Math.round(rarityScore * 20);

  // ─────────────────────────────────────────────
  // FINAL SCORE
  // ─────────────────────────────────────────────
  const total = scoreComponent + speedComponent + rarityComponent;
  const performance = Math.min(100, Math.max(0, total));

  // ─────────────────────────────────────────────
  // LABEL (smarter)
  // ─────────────────────────────────────────────
  let label;
  if (performance >= 90) label = 'Elite';
  else if (performance >= 75) label = 'Excellent';
  else if (performance >= 60) label = 'Good';
  else if (performance >= 40) label = 'Average';
  else if (performance >= 25) label = 'Low';
  else label = 'Poor';

  return {
    performance,
    label,

    // 🔥 useful stats
    patternCount: n,
    scorePercentile,
    zScore,
    rarityScore,
    speedComponent,

    breakdown: {
      score: scoreComponent,
      speed: speedComponent,
      rarity: rarityComponent,
    },
  };
}