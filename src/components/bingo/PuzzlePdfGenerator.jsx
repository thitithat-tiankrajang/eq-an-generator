import { useState, useCallback, useRef } from 'react';
import { BingoConfig, DEFAULT_SETS } from '@/components/bingo/BingoConfig';
import { generateBatchAsync, buildCfgList } from '@/lib/generateBatch';

// ─── SORT RACK ────────────────────────────────────────────────────────────────

const OP_ORDER = ['+', '-', '×', '÷', '+/-', '×/÷', '?'];

function sortRack(tiles) {
  return [...tiles].sort((a, b) => {
    const an = parseFloat(a), bn = parseFloat(b);
    const aNum = !isNaN(an), bNum = !isNaN(bn);
    if (aNum && bNum) return an - bn;
    if (aNum) return -1;
    if (bNum) return 1;
    if (a === '=') return -1;
    if (b === '=') return 1;
    return OP_ORDER.indexOf(a) - OP_ORDER.indexOf(b);
  });
}

// ─── TILE COMPONENT (preview) ─────────────────────────────────────────────────

function Tile({ value, locked, empty, slotType }) {
  if (locked) {
    return (
      <div className="w-7 h-7 flex items-center justify-center text-[11px] font-black border-2 border-violet-700 bg-violet-100 text-violet-900 rounded-sm shrink-0">
        {value}
      </div>
    );
  }
  if (empty) {
    if (slotType === 'px2' || slotType === 'px3' || slotType === 'px3star') {
      return (
        <div
          className="w-7 h-7 rounded-sm shrink-0 border-2 border-dashed border-blue-400"
          style={{
            background: 'repeating-linear-gradient(45deg,#dbeafe,#dbeafe 4px,#fff 4px,#fff 8px)',
          }}
        />
      );
    }
    if (slotType === 'ex2' || slotType === 'ex3') {
      return (
        <div
          className="w-7 h-7 rounded-sm shrink-0 border-2 border-dashed border-red-400"
          style={{
            background: 'repeating-linear-gradient(-45deg,#fee2e2,#fee2e2 4px,#fff 4px,#fff 8px)',
          }}
        />
      );
    }
    return (
      <div className="w-7 h-7 rounded-sm shrink-0 border border-dashed border-gray-400 bg-gray-50" />
    );
  }
  return (
    <div className="w-7 h-7 flex items-center justify-center text-[11px] font-black border border-gray-400 bg-white text-gray-900 rounded-sm shrink-0">
      {value}
    </div>
  );
}

// ─── PUZZLE CARD (preview) ────────────────────────────────────────────────────

function PuzzleCard({ puzzle, index }) {
  const rack = sortRack(puzzle.rackTiles);
  const diffColor =
    puzzle.difficulty === 'hard'
      ? 'text-red-500'
      : puzzle.difficulty === 'medium'
      ? 'text-amber-500'
      : 'text-emerald-500';

  return (
    <div className="border border-gray-200 rounded-lg p-3 bg-white">
      <div className="flex justify-between items-center mb-2">
        <span className="text-xs font-semibold text-gray-500">#{index + 1}</span>
        {puzzle.difficulty && (
          <span className={`text-[11px] font-semibold ${diffColor}`}>
            {puzzle.difficulty}
          </span>
        )}
        <span className="text-[11px] text-gray-400 font-mono">{puzzle.equation}</span>
      </div>

      {/* Board row */}
      <div className="flex items-center gap-1.5 mb-1.5">
        <span className="text-[11px] font-semibold text-gray-400 w-5 shrink-0">B</span>
        <div className="flex gap-1 flex-wrap">
          {puzzle.boardSlots.map((s, i) => (
            <Tile
              key={i}
              value={s.isLocked ? (s.resolvedValue ?? s.tile) : s.tile}
              locked={s.isLocked}
              empty={!s.isLocked && s.tile === null}
              slotType={s.slotType}
            />
          ))}
        </div>
      </div>

      {/* Rack row */}
      <div className="flex items-center gap-1.5">
        <span className="text-[11px] font-semibold text-gray-400 w-5 shrink-0">R</span>
        <div className="flex gap-1 flex-wrap">
          {rack.map((t, i) => (
            <Tile key={i} value={t} />
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── PDF BUILDER ──────────────────────────────────────────────────────────────

function buildPrintHtml({ puzzles, title }) {
  const blocks = puzzles.map((p, i) => {
    const board = p.boardSlots.map(s => {
      if (s.isLocked)
        return `<span class="tile locked">${s.resolvedValue ?? s.tile}</span>`;
      const st = s.slotType ?? 'px1';
      const label = st !== 'px1' ? `<span class="slot-label">${st}</span>` : '';
      return `<span class="tile empty ${st}">${label}</span>`;
    }).join('');

    const rack = sortRack(p.rackTiles)
      .map(t => `<span class="tile given">${t}</span>`)
      .join('');

    return `
<div class="puzzle">
  <div class="row"><div class="idx">#${i + 1}</div><div class="line">${board}</div></div>
  <div class="row"><div class="idx">R</div><div class="line">${rack}</div></div>
  <div class="ans">Point: ______ </div>
</div>`;
  }).join('');

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8"/>
<title>${title}</title>
<style>
@page { size: A4; margin: 12mm; }
body { width: 186mm; font-family: monospace; }
h1 { font-size: 13px; margin-bottom: 2px; }
.sub { font-size: 9px; margin-bottom: 8px; color: #666; }
.grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  column-gap: 8mm;
  row-gap: 5px;
}
.puzzle { border-bottom: 1px solid #ddd; padding-bottom: 4px; break-inside: avoid; }
.row { display: flex; align-items: center; gap: 3px; margin-bottom: 2px; }
.idx { width: 18px; font-size: 9px; font-weight: bold; color: #555; }
.line { display: flex; gap: 1.5px; flex-wrap: wrap; }
.tile {
  width: 18px; height: 18px;
  display: flex; align-items: center; justify-content: center;
  font-size: 9px; font-weight: 800;
  border: 1.5px solid #444;
  position: relative;
}
.tile.locked { border: 1.5px solid #000; background: #f0f0f0; }
.tile.given  { border: 1px solid #888; }

/* ── Empty slots — monochrome, faint label ── */
.tile.empty {
  border: 1px dashed #c0c0c0;
  background: #fafafa;
}
.tile.empty.px2,
.tile.empty.px3,
.tile.empty.px3star {
  border: 1.5px dashed #aaa;
  background: #f4f4f4;
}
.tile.empty.ex2,
.tile.empty.ex3 {
  border: 1.5px dashed #aaa;
  background: #f4f4f4;
}
.slot-label {
  font-size: 4.5px;
  font-weight: 700;
  color: #ccc;
  letter-spacing: -0.2px;
  line-height: 1;
  font-family: monospace;
}

.ans { font-size: 8px; color: #888; margin-left: 21px; margin-top: 2px; }
</style>
</head>
<body>
<h1>${title}</h1>
<div class="sub">A-MATH BINGO · ${puzzles.length} QUESTIONS</div>
<div class="grid">${blocks}</div>
</body>
</html>`;
}

// ─── MAIN COMPONENT ───────────────────────────────────────────────────────────

export function PuzzlePdfGenerator() {
  const [puzzleSets, setPuzzleSets] = useState(DEFAULT_SETS);
  const [mode, setMode] = useState('cross');
  const [puzzles, setPuzzles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [genCount, setGenCount] = useState(0);
  const [genProgress, setGenProgress] = useState(null);
  const [pdfTitle, setPdfTitle] = useState('A-MATH Bingo Sheet');
  const cancelRef = useRef(null);

  const handleCancel = useCallback(() => {
    cancelRef.current?.();
    cancelRef.current = null;
    setLoading(false);
    setGenProgress(null);
  }, []);

  const handleGenerate = useCallback(() => {
    cancelRef.current?.();
    setLoading(true);
    setError(null);
    setPuzzles([]);
    setGenProgress({ done: 0, total: puzzleSets.reduce((s, p) => s + p.count, 0) });

    const cfgList = buildCfgList(puzzleSets, mode);

    cancelRef.current = generateBatchAsync(cfgList, {
      onEach: (result, done, total) => {
        setGenProgress({ done, total });
        setPuzzles(prev => [...prev, result]);
      },
      onDone: () => {
        setGenCount(c => c + 1);
        setLoading(false);
        setGenProgress(null);
        cancelRef.current = null;
      },
      onError: (e) => {
        setError(e.message);
        setLoading(false);
        setGenProgress(null);
        cancelRef.current = null;
      },
    });
  }, [puzzleSets, mode]);

  const handlePdf = useCallback(() => {
    const html = buildPrintHtml({ puzzles, title: pdfTitle });
    const win = window.open('', '_blank');
    if (!win) return;
    win.document.write(html);
    win.document.close();
    win.focus();
    setTimeout(() => win.print(), 300);
  }, [puzzles, pdfTitle]);

  return (
    <div className="space-y-4 max-w-3xl mx-auto p-4">

      <BingoConfig
        puzzleSets={puzzleSets}
        setPuzzleSets={setPuzzleSets}
        onGenerate={handleGenerate}
        loading={loading}
        error={error}
        genCount={genCount}
        genProgress={genProgress}
        onCancel={handleCancel}
        showTimer={false}
        mode={mode}
        setMode={setMode}
      />

      {puzzles.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <input
              type="text"
              value={pdfTitle}
              onChange={e => setPdfTitle(e.target.value)}
              placeholder="ชื่อ PDF"
              className="flex-1 text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white"
            />
            <button
              onClick={handlePdf}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-semibold cursor-pointer border-none shrink-0"
            >
              พิมพ์ / PDF ({puzzles.length})
            </button>
          </div>

          <div className="space-y-2">
            {puzzles.map((p, i) => (
              <PuzzleCard key={i} puzzle={p} index={i} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
