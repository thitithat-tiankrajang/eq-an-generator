import { useState } from 'react';

// ── Inline solver ─────────────────────────────────────────────────────────────
const _TILE_POINTS = {
  '0':1,'1':1,'2':1,'3':1,'4':2,'5':2,'6':2,'7':2,'8':2,'9':2,
  '10':3,'11':4,'12':3,'13':6,'14':4,'15':4,'16':4,'17':6,'18':4,'19':7,'20':5,
  '+':2,'-':2,'×':2,'÷':2,'*':2,'/':2,'+/-':1,'×/÷':1,'=':1,'?':0,
};

function calcScore(origTokens, boardSlots) {
  let letterTotal = 0, wordMult = 1;
  for (let i = 0; i < boardSlots.length; i++) {
    const tok  = origTokens[i];
    const pts  = _TILE_POINTS[tok] ?? 0;
    const type = boardSlots[i].isLocked ? 'px1' : (boardSlots[i].slotType ?? 'px1');
    if (type === 'px2') letterTotal += pts * 2;
    else if (type === 'px3' || type === 'px3star') letterTotal += pts * 3;
    else letterTotal += pts;
    if (type === 'ex2') wordMult *= 2;
    if (type === 'ex3') wordMult *= 3;
  }
  return letterTotal * wordMult + 40;
}

const _MARKS = new Set(['=', '+', '-', '*', '/']);
const _UNIT  = new Set(['0','1','2','3','4','5','6','7','8','9']);
const _TENS  = new Set(['10','11','12','13','14','15','16','17','18','19','20']);
const _SMAP  = {
  '+/-': ['+', '-'], '×/÷': ['*', '/'], '×': ['*'], '÷': ['/'],
  '?': ['0','1','2','3','4','5','6','7','8','9','10','11','12','13','14','15','16','17','18','19','20','+','-','*','/','='],
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
  for (const x of seq) {
    if (_UNIT.has(x)) { if (++cnt > 3) return false; } else cnt = 0;
  }
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

function findBoardSolutions(boardSlots, rackTiles, maxResults = 300) {
  _ec = new Map();
  const n        = boardSlots.length;
  const unlocked = boardSlots.reduce((acc, s, i) => { if (!s.isLocked) acc.push(i); return acc; }, []);
  const slotTypes = boardSlots.map(s => s.slotType);
  const normRack  = rackTiles.map(_norm);
  const results   = [];
  const seen      = new Set();

  for (const idxPerm of _permIdx(normRack)) {
    if (results.length >= maxResults) break;
    const fullNorm = Array(n);
    boardSlots.forEach((s, i) => { if (s.isLocked) fullNorm[i] = _norm(s.tile); });
    unlocked.forEach((si, pi) => { fullNorm[si] = normRack[idxPerm[pi]]; });
    if (!_template(fullNorm)) continue;
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

// ── Slot type badge ───────────────────────────────────────────────────────────
const SLOT_COLORS = {
  px1:     'bg-stone-100 text-stone-500',
  px2:     'bg-sky-100 text-sky-700',
  px3:     'bg-indigo-100 text-indigo-700',
  px3star: 'bg-indigo-100 text-indigo-700',
  ex2:     'bg-amber-100 text-amber-700',
  ex3:     'bg-rose-100 text-rose-700',
};
const SLOT_LABEL = {
  px1: '×1', px2: '×2P', px3: '×3P', px3star: '★×3', ex2: '×2E', ex3: '×3E',
};

function SlotBadge({ type }) {
  return (
    <span className={`text-[7px] font-mono font-bold px-1 py-0.5 rounded ${SLOT_COLORS[type] ?? 'bg-stone-100 text-stone-400'}`}>
      {SLOT_LABEL[type] ?? type}
    </span>
  );
}

// ── Token chip ────────────────────────────────────────────────────────────────
function TokenChip({ token, slotType, isLocked }) {
  const display = token === '*' ? '×' : token === '/' ? '÷' : token;
  const base = isLocked
    ? 'bg-amber-50 border-amber-300 text-amber-800'
    : 'bg-white border-stone-200 text-stone-800';
  return (
    <div className="flex flex-col items-center gap-0.5">
      <div className={`w-8 h-8 rounded-lg border flex items-center justify-center font-mono font-bold text-[11px] ${base}`}>
        {display}
      </div>
      <SlotBadge type={slotType} />
    </div>
  );
}

// ── BingoSolution ─────────────────────────────────────────────────────────────
export function BingoSolution({ result }) {
  const [solutions,   setSolutions]   = useState(null);
  const [computing,   setComputing]   = useState(false);
  const [open,        setOpen]        = useState(false);
  const [prevResult,  setPrevResult]  = useState(result);

  // Reset when puzzle changes
  if (result !== prevResult) {
    setPrevResult(result);
    setSolutions(null);
    setOpen(false);
  }

  const handleClick = () => {
    if (computing) return;
    if (solutions !== null) { setOpen(v => !v); return; }
    setComputing(true);
    setTimeout(() => {
      try {
        const sols = findBoardSolutions(result.boardSlots, result.rackTiles);
        setSolutions(sols);
        setOpen(true);
      } catch (e) {
        console.error('[BingoSolution] solver error', e);
        setSolutions([]);
        setOpen(true);
      }
      setComputing(false);
    }, 0);
  };

  if (!result) return null;

  const computed = solutions !== null;
  const count    = solutions?.length ?? 0;

  return (
    <>
      <style>{`
        @keyframes solEnter {
          from { opacity: 0; transform: translateY(10px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes solRowIn {
          from { opacity: 0; transform: translateX(-8px); }
          to   { opacity: 1; transform: translateX(0); }
        }
        .sol-enter   { animation: solEnter  0.25s cubic-bezier(0.22,1,0.36,1) both; }
        .sol-row-in  { animation: solRowIn  0.2s  cubic-bezier(0.22,1,0.36,1) both; }

        .sol-btn {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 8px 20px;
          border-radius: 8px;
          border: 1px solid;
          font-family: "JetBrains Mono", monospace;
          font-size: 10px;
          font-weight: 700;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          cursor: pointer;
          transition: background 0.12s ease, border-color 0.12s ease, transform 0.08s ease;
          user-select: none;
        }
        .sol-btn:active { transform: scale(0.97); }
        .sol-btn:disabled { opacity: 0.4; cursor: not-allowed; }

        .sol-btn-idle {
          background: #fafaf9;
          border-color: #d6d3d1;
          color: #78716c;
        }
        .sol-btn-idle:hover { background: #f5f5f4; border-color: #a8a29e; color: #292524; }

        .sol-btn-open {
          background: #f0fdf4;
          border-color: #86efac;
          color: #166534;
        }
        .sol-btn-open:hover { background: #dcfce7; }

        .sol-btn-loading {
          background: #fafaf9;
          border-color: #e7e5e4;
          color: #a8a29e;
          cursor: wait;
        }
      `}</style>

      <div className="text-center mb-3">
        <button
          onClick={handleClick}
          disabled={computing}
          className={`sol-btn ${computing ? 'sol-btn-loading' : computed && open ? 'sol-btn-open' : 'sol-btn-idle'}`}
        >
          {computing ? (
            <>
              <svg className="animate-spin" width="12" height="12" viewBox="0 0 12 12" fill="none">
                <circle cx="6" cy="6" r="5" stroke="currentColor" strokeWidth="1.5" strokeDasharray="10 20" strokeLinecap="round"/>
              </svg>
              Computing
            </>
          ) : computed ? (
            <>
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path d={open ? 'M2 8l4-4 4 4' : 'M2 4l4 4 4-4'} stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              {count} solution{count !== 1 ? 's' : ''} {open ? 'hide' : 'show'}
            </>
          ) : (
            <>
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path d="M6 1v10M1 6h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
              Calculate solutions
            </>
          )}
        </button>
      </div>

      {open && computed && (
        <div className="bg-white rounded-2xl border border-stone-200 shadow-sm p-4 mb-4 sol-enter">

          {/* Header */}
          <div className="flex items-center justify-between mb-3">
            <div className="font-mono text-[9px] font-semibold text-stone-400 uppercase tracking-widest">
              All solutions
            </div>
            {count > 0 && (
              <span className="font-mono text-[9px] text-stone-400">
                {count}{count >= 300 ? '+' : ''} found
              </span>
            )}
          </div>

          {count === 0 && (
            <p className="text-center text-sm text-stone-400 py-6 font-mono">No solutions found</p>
          )}

          {count > 0 && (
            <div className="space-y-2">
              {solutions.map((sol, idx) => (
                <div
                  key={idx}
                  className={`rounded-xl border p-3 sol-row-in transition-colors
                    ${idx === 0
                      ? 'border-amber-200 bg-amber-50'
                      : 'border-stone-100 bg-stone-50 hover:bg-stone-100'}`}
                  style={{ animationDelay: `${Math.min(idx * 35, 300)}ms` }}
                >
                  {/* Row header */}
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[9px] text-stone-400">#{idx + 1}</span>
                      {idx === 0 && (
                        <span className="font-mono text-[8px] font-bold bg-amber-400 text-white px-1.5 py-0.5 rounded tracking-wider">
                          Best
                        </span>
                      )}
                    </div>
                    <span className={`font-mono font-bold text-sm ${idx === 0 ? 'text-amber-700' : 'text-stone-600'}`}>
                      {sol.score} pts
                    </span>
                  </div>

                  {/* Token chips */}
                  <div className="flex gap-1 overflow-x-auto pb-1 mb-2">
                    {sol.tokens.map((tok, ti) => (
                      <TokenChip
                        key={ti}
                        token={tok}
                        slotType={sol.slotTypes[ti]}
                        isLocked={result.boardSlots[ti]?.isLocked}
                      />
                    ))}
                  </div>

                  {/* Equation string */}
                  <div className={`px-3 py-2 rounded-lg font-mono text-sm tracking-widest
                    ${idx === 0 ? 'bg-amber-100 text-amber-800' : 'bg-stone-100 text-stone-600'}`}>
                    {sol.eq.replace(/\*/g, '×').replace(/\//g, '÷')}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </>
  );
}