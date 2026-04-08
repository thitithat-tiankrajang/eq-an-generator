import { useState } from 'react';

// ── Inline solver for board-constrained solutions ─────────────────────────────
// (mirrors analysisEngine logic but supports fixed locked positions)

// Tile point values — matches TILE_POINTS in bingoGenerator + normalized * /
const _TILE_POINTS = {
  '0':1,'1':1,'2':1,'3':1,'4':2,'5':2,'6':2,'7':2,'8':2,'9':2,
  '10':3,'11':4,'12':3,'13':6,'14':4,'15':4,'16':4,'17':6,'18':4,'19':7,'20':5,
  '+':2,'-':2,'×':2,'÷':2,'*':2,'/':2,'+/-':1,'×/÷':1,'=':1,'?':0,
};

/**
 * calcScore — matches ui.jsx calcScore exactly:
 *   - locked positions always treated as px1 (no bonus)
 *   - uses original wildcard token's own points (not resolved value)
 *   - no bingo bonus
 */
function calcScore(origTokens, boardSlots) {
  let letterTotal = 0, wordMult = 1;
  for (let i = 0; i < boardSlots.length; i++) {
    const tok = origTokens[i];
    const pts = _TILE_POINTS[tok] ?? 0;
    const type = boardSlots[i].isLocked ? 'px1' : (boardSlots[i].slotType ?? 'px1');
    if (type === 'px2') letterTotal += pts * 2;
    else if (type === 'px3' || type === 'px3star') letterTotal += pts * 3;
    else letterTotal += pts;
    if (type === 'ex2') wordMult *= 2;
    if (type === 'ex3') wordMult *= 3;
  }
  return letterTotal * wordMult + 40;
}

const _MARKS  = new Set(['=', '+', '-', '*', '/']);
const _UNIT   = new Set(['0','1','2','3','4','5','6','7','8','9']);
const _TENS   = new Set(['10','11','12','13','14','15','16','17','18','19','20']);
const _SMAP   = {
  '+/-':  ['+', '-'],
  '×/÷':  ['*', '/'],
  '×':    ['*'],
  '÷':    ['/'],
  '?':    ['0','1','2','3','4','5','6','7','8','9',
            '10','11','12','13','14','15','16','17','18','19','20',
            '+','-','*','/','='],
};

function _norm(t) { return t === '×' ? '*' : t === '÷' ? '/' : t; }
function _isOp(t) { return t==='+' || t==='-' || t==='*' || t==='/'; }
function _isEq(t) { return t==='='; }
function _mayEq(t) { return t==='=' || t==='?'; }
function _isNum(t) { return _UNIT.has(t) || _TENS.has(t); }

function _template(seq) {
  const n = seq.length;
  if (!n || !seq.some(_mayEq)) return false;
  const f = seq[0], l = seq[n-1];
  if (f==='+' || f==='*' || f==='/' || _isEq(f)) return false;
  if (_isOp(l) || _isEq(l)) return false;
  for (let i = 0; i < n-1; i++) {
    const a = seq[i], b = seq[i+1];
    if ((_isOp(a)||_isEq(a)) && (_isOp(b)||_isEq(b))) {
      if (!(_mayEq(a) && b==='-')) return false;
    }
    if (_TENS.has(a) && _TENS.has(b)) return false;
    if (_isNum(a) && _isNum(b)) {
      if ((_TENS.has(a) && _UNIT.has(b)) || (_UNIT.has(a) && _TENS.has(b))) return false;
    }
    if ((a==='/'||a==='-') && b==='0') return false;
  }
  return true;
}

function* _expand(seq) {
  function* rec(i, cur) {
    if (i === seq.length) { yield cur; return; }
    const exps = _SMAP[seq[i]];
    if (!exps) yield* rec(i+1, [...cur, seq[i]]);
    else for (const v of exps) yield* rec(i+1, [...cur, v]);
  }
  yield* rec(0, []);
}

function _condition(seq) {
  if (!seq.includes('=')) return false;
  const f = seq[0], l = seq[seq.length-1];
  if ((_MARKS.has(f) && f!=='-') || _MARKS.has(l)) return false;
  for (let i = 0; i < seq.length-1; i++) {
    const a = seq[i], b = seq[i+1];
    if (_MARKS.has(a) && _MARKS.has(b) && !(a==='='&&b==='-')) return false;
    if (_TENS.has(a) && _TENS.has(b)) return false;
    if (_UNIT.has(a) && _TENS.has(b)) return false;
    if (_TENS.has(a) && _UNIT.has(b)) return false;
    if ((a==='/'||a==='-') && b==='0') return false;
  }
  let cnt = 0;
  for (const x of seq) { if (_UNIT.has(x)) { if (++cnt > 3) return false; } else cnt = 0; }
  let tmp = '';
  for (const x of seq) {
    if (!_MARKS.has(x)) tmp += x;
    else { if (tmp.length >= 2 && tmp[0]==='0') return false; tmp = ''; }
  }
  if (tmp.length >= 2 && tmp[0]==='0') return false;
  return true;
}

let _ec = new Map();
function _eval(expr) {
  if (_ec.has(expr)) return _ec.get(expr);
  let r; try { r = Function(`"use strict"; return (${expr})`)(); } catch { r = NaN; }
  _ec.set(expr, r); return r;
}

function _checkEq(seq) {
  const parts = []; let tmp = [];
  for (const t of seq) { if (t==='=') { parts.push(tmp); tmp=[]; } else tmp.push(t); }
  parts.push(tmp);
  try {
    const vals = parts.map(p => p.length ? _eval(p.join('')) : null);
    if (vals.some(v => v===null || !isFinite(v))) return false;
    return vals.every(v => Math.abs(v - vals[0]) < 1e-9);
  } catch { return false; }
}

// Permute indices of an array (dedup by normalized value at each index)
function* _permIdx(normArr) {
  const indices = normArr.map((_, i) => i);
  function* rec(rem, pre) {
    if (!rem.length) { yield pre; return; }
    const seen = new Set();
    for (let i = 0; i < rem.length; i++) {
      const v = normArr[rem[i]];
      if (seen.has(v)) continue;
      seen.add(v);
      yield* rec(rem.filter((_,j) => j!==i), [...pre, rem[i]]);
    }
  }
  yield* rec(indices, []);
}

/**
 * findBoardSolutions(boardSlots, rackTiles, maxResults?)
 *
 * boardSlots: Array<{ isLocked, tile, slotType }>
 *   locked slots have tile set; unlocked slots have tile=null
 * rackTiles: string[] — shuffled tiles for unlocked positions
 *
 * Returns solutions that use ALL rack tiles, sorted by score desc.
 */
function findBoardSolutions(boardSlots, rackTiles, maxResults = 300) {
  _ec = new Map();
  const n = boardSlots.length;
  const unlocked = boardSlots.reduce((acc, s, i) => { if (!s.isLocked) acc.push(i); return acc; }, []);
  const slotTypes = boardSlots.map(s => s.slotType);
  const normRack = rackTiles.map(_norm);

  const results = [];
  const seen = new Set();

  for (const idxPerm of _permIdx(normRack)) {
    if (results.length >= maxResults) break;

    // Build normalized full sequence
    const fullNorm = Array(n);
    boardSlots.forEach((s, i) => { if (s.isLocked) fullNorm[i] = _norm(s.tile); });
    unlocked.forEach((si, pi) => { fullNorm[si] = normRack[idxPerm[pi]]; });

    if (!_template(fullNorm)) continue;

    // Original sequence (for scoring with wildcard points)
    const fullOrig = Array(n);
    boardSlots.forEach((s, i) => { if (s.isLocked) fullOrig[i] = s.tile; });
    unlocked.forEach((si, pi) => { fullOrig[si] = rackTiles[idxPerm[pi]]; });

    for (const exp of _expand(fullNorm)) {
      if (results.length >= maxResults) break;
      if (_condition(exp) && _checkEq(exp)) {
        const key = exp.join('');
        if (!seen.has(key)) {
          seen.add(key);
          const score = calcScore(fullOrig, boardSlots);
          results.push({ eq: key, tokens: exp, origTokens: fullOrig, slotTypes, score });
        }
      }
    }
  }

  return results.sort((a, b) => b.score - a.score);
}

// ── Slot bonus badge ──────────────────────────────────────────────────────────

const SLOT_COLORS = {
  px1: 'bg-stone-100 text-stone-500',
  px2: 'bg-sky-100 text-sky-700',
  px3: 'bg-indigo-100 text-indigo-700',
  px3star: 'bg-yellow-100 text-yellow-700',
  ex2: 'bg-orange-100 text-orange-700',
  ex3: 'bg-red-100 text-red-700',
};

const SLOT_LABEL = {
  px1: '×1', px2: '×2', px3: '×3', px3star: '★×3',
  ex2: 'EQ×2', ex3: 'EQ×3',
};

function SlotBadge({ type }) {
  return (
    <span className={`text-[7px] font-bold px-1 py-0.5 rounded ${SLOT_COLORS[type] ?? 'bg-stone-100 text-stone-400'}`}>
      {SLOT_LABEL[type] ?? type}
    </span>
  );
}

// ── Token chip ────────────────────────────────────────────────────────────────

function TokenChip({ token, slotType, isLocked }) {
  const display = token === '*' ? '×' : token === '/' ? '÷' : token;
  const base = isLocked
    ? 'bg-amber-100 border-amber-400 text-amber-800'
    : 'bg-white border-stone-300 text-stone-800';
  return (
    <div className="flex flex-col items-center gap-0.5">
      <div className={`w-8 h-8 rounded-md border-2 flex items-center justify-center font-mono font-bold text-[11px] ${base}`}>
        {display}
      </div>
      <SlotBadge type={slotType} />
    </div>
  );
}

// ── BingoSolution ─────────────────────────────────────────────────────────────

export function BingoSolution({ result }) {
  // solutions: null = not computed yet, array = computed (may be empty)
  const [solutions, setSolutions] = useState(null);
  const [computing, setComputing] = useState(false);
  const [open, setOpen] = useState(false);
  const [prevResult, setPrevResult] = useState(result);

  // Reset when puzzle changes (derived state pattern — no useEffect)
  if (result !== prevResult) {
    setPrevResult(result);
    setSolutions(null);
    setOpen(false);
  }

  const handleClick = () => {
    if (computing) return;

    // Already computed → just toggle visibility
    if (solutions !== null) {
      setOpen(v => !v);
      return;
    }

    // First time → compute then open
    setComputing(true);
    setTimeout(() => {
      try {
        const sols = findBoardSolutions(result.boardSlots, result.rackTiles);
        setSolutions(sols);
      } catch (e) {
        console.error('[BingoSolution] solver error', e);
        setSolutions([]);
      }
      setComputing(false);
    }, 0);
  };

  if (!result) return null;

  const computed = solutions !== null;
  const count = solutions?.length ?? 0;

  return (
    <>
      <div className="text-center mb-3">
        <button
          onClick={handleClick}
          disabled={computing}
          className={`px-6 py-2 rounded-lg border font-mono text-[10px] tracking-[0.25em] transition-all
            ${computing
              ? 'border-stone-200 bg-stone-50 text-stone-400 cursor-wait'
              : computed
                ? 'border-emerald-300 bg-emerald-50 text-emerald-600 cursor-pointer hover:bg-emerald-100'
                : 'border-stone-200 bg-stone-50 text-stone-400 hover:border-stone-300 cursor-pointer'}`}
        >
          {computing
            ? <span className="inline-flex items-center gap-2"><span className="inline-block animate-spin">◌</span>COMPUTING…</span>
            : computed
              ? `${count} SOLUTION${count !== 1 ? 'S' : ''} ${open ? '▲' : '▼'}`
              : '▶ CALCULATE SOLUTIONS'
          }
        </button>
      </div>

      {open && computed && (
        <div className="bg-white rounded-2xl border border-emerald-200 shadow-sm p-5 mb-4 animate-[fadeUp_0.25s_ease]">
          <div className="text-[9px] tracking-[0.3em] uppercase font-mono font-semibold text-emerald-600 mb-4">
            ALL SOLUTIONS (8-TILE BINGO)
          </div>

          {count === 0 && (
            <p className="text-center text-sm text-stone-400 py-4">No solutions found</p>
          )}

          {count > 0 && (
            <div className="space-y-3">
              {solutions.map((sol, idx) => (
                <div
                  key={idx}
                  className={`rounded-xl border p-3 ${idx === 0 ? 'border-amber-300 bg-amber-50' : 'border-stone-100 bg-stone-50'}`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-mono text-[9px] text-stone-400">#{idx + 1}</span>
                    <div className="flex items-center gap-2">
                      {idx === 0 && (
                        <span className="text-[8px] font-bold bg-amber-400 text-white px-1.5 py-0.5 rounded tracking-wide">
                          BEST
                        </span>
                      )}
                      <span className={`font-mono font-bold text-sm ${idx === 0 ? 'text-amber-700' : 'text-stone-700'}`}>
                        {sol.score} pts
                      </span>
                    </div>
                  </div>

                  <div className="flex gap-1.5 overflow-x-auto pb-1 mb-2">
                    {sol.tokens.map((tok, ti) => (
                      <TokenChip
                        key={ti}
                        token={tok}
                        slotType={sol.slotTypes[ti]}
                        isLocked={result.boardSlots[ti]?.isLocked}
                      />
                    ))}
                  </div>

                  <div className={`px-3 py-2 rounded-lg font-mono text-sm tracking-widest ${
                    idx === 0 ? 'bg-amber-100 text-amber-800' : 'bg-stone-100 text-stone-700'
                  }`}>
                    {sol.eq.replace(/\*/g, '×').replace(/\//g, '÷')}
                  </div>
                </div>
              ))}

              <p className="text-[10px] text-stone-400 text-center font-mono pt-1">
                {count} solution{count !== 1 ? 's' : ''} found
                {count >= 300 ? ' (showing first 300)' : ''}
              </p>
            </div>
          )}
        </div>
      )}
    </>
  );
}
