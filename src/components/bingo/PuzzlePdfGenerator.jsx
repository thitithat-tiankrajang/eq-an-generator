import { useState, useCallback, useRef, useEffect } from 'react';
import { ChevronDown, ChevronUp, Printer, Download, FileText } from 'lucide-react';
import { BingoConfig, DEFAULT_SETS } from '@/components/bingo/BingoConfig';
import { generateBatchAsync, buildCfgList } from '@/lib/generateBatch';
import { TILE_POINTS } from '@/lib/amathTokens';
import { api } from '@/api/apiClient';

// ─── SLOT DISPLAY (UI text view) ──────────────────────────────────────────────
const SLOT_DISPLAY = {
  px1:     { label: '__',   cls: 'bg-stone-50 border-stone-200 text-stone-400' },
  px2:     { label: 'P×2',   cls: 'bg-orange-50 border-orange-300 text-orange-600 font-semibold' },
  px3:     { label: 'P×3',   cls: 'bg-blue-50 border-blue-300 text-blue-600 font-semibold' },
  px3star: { label: '★',    cls: 'bg-sky-50 border-sky-300 text-sky-500 font-bold' },
  ex2:     { label: 'E×2',  cls: 'bg-yellow-50 border-yellow-300 text-yellow-700 font-semibold' },
  ex3:     { label: 'E×3',  cls: 'bg-red-50 border-red-300 text-red-600 font-semibold' },
};

// ─── SCORE CALCULATOR (for solution sheet) ────────────────────────────────────
function computeSolutionScore(puzzle) {
  if (!puzzle.solutionTiles || !puzzle.boardSlots) return null;
  let letterTotal = 0, wordMult = 1;
  for (let i = 0; i < puzzle.boardSlots.length; i++) {
    const tile = puzzle.solutionTiles[i];
    const pts = TILE_POINTS[tile] ?? 0;
    const st = puzzle.boardSlots[i].isLocked ? 'px1' : (puzzle.boardSlots[i].slotType ?? 'px1');
    if (st === 'px2') letterTotal += pts * 2;
    else if (st === 'px3' || st === 'px3star') letterTotal += pts * 3;
    else letterTotal += pts;
    if (st === 'ex2') wordMult *= 2;
    if (st === 'ex3') wordMult *= 3;
  }
  return letterTotal * wordMult + 40;
}

// ─── EXPORT PAYLOAD TRIMMER ───────────────────────────────────────────────────
// Strips generator-only fields (board 15×15, tileCounts, placement coords, etc.)
// before sending to the backend export API, keeping only what PDF/DOCX need.
function toExportPuzzle(p) {
  return {
    boardSlots: p.boardSlots.map(s => ({
      tile: s.tile,
      isLocked: s.isLocked,
      slotType: s.slotType ?? 'px1',
      resolvedValue: s.resolvedValue ?? undefined,
    })),
    rackTiles: p.rackTiles,
    equation: p.equation,
    solutionTiles: p.solutionTiles,
    noBonus: p.noBonus ?? undefined,
  };
}

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

// ─── TEXT PUZZLE ROW (colored UI preview) ─────────────────────────────────────

function SlotChip({ slot }) {
  if (slot.isLocked) {
    return (
      <span className="inline-flex items-center px-1.5 py-0.5 rounded border border-amber-400 bg-amber-100 text-amber-900 font-bold text-[11px] font-mono mr-0.5">
        {slot.resolvedValue ?? slot.tile}
      </span>
    );
  }
  const st = slot.slotType ?? 'px1';
  const cfg = SLOT_DISPLAY[st] ?? SLOT_DISPLAY.px1;
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded border text-[11px] font-mono mr-0.5 ${cfg.cls}`}>
      {cfg.label}
    </span>
  );
}

function hasBonus(puzzle) {
  return puzzle.boardSlots?.some(s => !s.isLocked && s.slotType && s.slotType !== 'px1') ?? false;
}

function TextPuzzleRow({ puzzle, index, showSolution }) {
  const rack = sortRack(puzzle.rackTiles);
  const score = showSolution && hasBonus(puzzle) ? computeSolutionScore(puzzle) : null;
  return (
    <div className="font-mono text-xs leading-relaxed">
      <div className="flex flex-wrap items-center gap-x-1 gap-y-0.5">
        <span className="text-stone-500 font-bold mr-0.5 shrink-0">{index + 1}.</span>
        <span className="text-stone-400 font-semibold shrink-0">E:</span>
        {puzzle.boardSlots.map((s, i) => <SlotChip key={i} slot={s} />)}
        <span className="text-stone-400 font-semibold mx-1 shrink-0">P:</span>
        {rack.map((t, i) => (
          <span key={i} className="inline-flex items-center px-1.5 py-0.5 rounded border border-stone-200 bg-white text-stone-700 text-[11px] font-mono mr-0.5">
            {t}
          </span>
        ))}
      </div>
      {showSolution && puzzle.equation && (
        <div className="mt-0.5 ml-6 text-emerald-600 text-[11px]">
          → {puzzle.equation}{score != null ? ` (${score}pts)` : ''}
        </div>
      )}
    </div>
  );
}

// ─── PLAIN TEXT GENERATOR (for copy) ─────────────────────────────────────────

const SLOT_TEXT = {
  px1:     '__',
  px2:     '[P×2]',
  px3:     '[P×3]',
  px3star: '[★]',
  ex2:     '[E×2]',
  ex3:     '[E×3]',
};

function buildPlainText(puzzles, showSolution) {
  return puzzles.map((p, i) => {
    const boardStr = p.boardSlots.map(s => {
      if (s.isLocked) return s.resolvedValue ?? s.tile;
      return SLOT_TEXT[s.slotType ?? 'px1'];
    }).join(' ');
    const rackStr = sortRack(p.rackTiles).join(' ');
    let line = `${i + 1}. E: ${boardStr}  P: ${rackStr}`;
    if (showSolution && p.equation) {
      const score = hasBonus(p) ? computeSolutionScore(p) : null;
      line += `\n   → ${p.equation}${score != null ? ` (${score}pts)` : ''}`;
    }
    return line;
  }).join('\n');
}

// ─── PDF BUILDER ──────────────────────────────────────────────────────────────

function buildPrintHtml({ puzzles, title, withSolution = true, subtitlePrefix = 'Bingo Generator' }) {
  const PAGE_SIZE = 20;
  const PER_COL = 10;
  const SOL_PER_PAGE = 100;

  let pageCounter = 1;

  const renderTileInner = (value) => {
    const pt = TILE_POINTS[value];
    const ptBadge = pt != null ? `<span class="tp">${pt}</span>` : '';
    return `<span class="tv">${value}</span>${ptBadge}`;
  };

  const SLOT_LABELS = {
    px1: '',
    px2: 'P×2',
    px3: 'P×3',
    px3star: '★',
    ex2: 'E×2',
    ex3: 'E×3',
  };

  const makePuzzleBlock = (p, i) => {
    const tileCount = Math.max(p.boardSlots.length, p.rackTiles.length);
    const sizeClass = tileCount <= 12 ? 'sz-lg' : 'sz-sm';

    const board = p.boardSlots.map(s => {
      if (s.isLocked) {
        return `<span class="tile locked ${sizeClass}">${renderTileInner(s.resolvedValue ?? s.tile, sizeClass)}</span>`;
      }
      const st = s.slotType ?? 'px1';
      const label = SLOT_LABELS[st] || '';
      const specialClass = st !== 'px1' ? ' special' : '';
      return `<span class="tile empty${specialClass} ${sizeClass}">${label ? `<span class="sl">${label}</span>` : ''}</span>`;
    }).join('');

    const rack = sortRack(p.rackTiles)
      .map(t => `<span class="tile rack ${sizeClass}">${renderTileInner(t, sizeClass)}</span>`)
      .join('');

    return `
<div class="q">
  <div class="qnum">${i + 1}</div>
  <div class="qbody">
    <div class="row"><span class="rlabel">B</span><div class="tiles">${board}</div></div>
    <div class="row"><span class="rlabel">R</span><div class="tiles">${rack}</div></div>
    ${p.noBonus ? '' : '<div class="ans">Pts: ________</div>'}
  </div>
</div>`;
  };

  // ─── QUESTION PAGES ─────────────────────
  const questionPages = [];
  for (let i = 0; i < puzzles.length; i += PAGE_SIZE) {
    questionPages.push(puzzles.slice(i, i + PAGE_SIZE));
  }

  const questionHtml = questionPages.map((page, pi) => {
    const left = page.slice(0, PER_COL);
    const right = page.slice(PER_COL, PAGE_SIZE);
    const offset = pi * PAGE_SIZE;

    const leftHtml = left.map((p, i) => makePuzzleBlock(p, offset + i)).join('');
    const rightHtml = right.map((p, i) => makePuzzleBlock(p, offset + PER_COL + i)).join('');

    const isFirst = pi === 0;

    return `
<div class="page${pi !== 0 ? ' page-break' : ''}">
  ${isFirst ? `
  <div class="header">
    <div class="header-left">
      <div class="title">${title}</div>
      <div class="subtitle">${subtitlePrefix} · ${puzzles.length} Questions</div>
    </div>
    <div class="header-right">
      <div class="field">Name: ______________________</div>
      <div class="field">Date: _____ / _____ / _____</div>
    </div>
  </div>` : `
  <div class="header">
    <div class="header-left">
      <div class="title-cont">${title} <span class="cont-label">(cont.)</span></div>
    </div>
    <div class="header-right"></div>
  </div>`}
  <div class="rule"></div>
  <div class="grid">
    <div class="col">${leftHtml}</div>
    <div class="col-sep"></div>
    <div class="col">${rightHtml}</div>
  </div>
  <div class="pagenum">— ${pageCounter++} —</div>
</div>`;
  }).join('');

  // ─── SOLUTION PAGES (only when withSolution) ─────────────────────
  let solutionHtml = '';
  if (withSolution) {
    const solutionPages = [];
    for (let i = 0; i < puzzles.length; i += SOL_PER_PAGE) {
      solutionPages.push(puzzles.slice(i, i + SOL_PER_PAGE));
    }
    solutionHtml = solutionPages.map((page, pi) => {
      const items = page.map((p, i) => {
        const idx = pi * SOL_PER_PAGE + i + 1;
        const score = hasBonus(p) ? computeSolutionScore(p) : null;
        const scoreStr = score != null ? ` (${score}pts)` : '';
        return `<div class="sol-item"><span class="sol-num">${idx}.</span> ${p.equation || '—'}${scoreStr}</div>`;
      }).join('');
      return `
<div class="page page-break">
  <div class="header">
    <div class="header-left">
      <div class="title">Answer Key</div>
      <div class="subtitle">${title}</div>
    </div>
    <div class="header-right"></div>
  </div>
  <div class="rule"></div>
  <div class="sol-grid">${items}</div>
  <div class="pagenum">— ${pageCounter++} —</div>
</div>`;
    }).join('');
  }

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8"/>
<title>${title}</title>
<style>
/* ═══════════════════════════════════════════
   A-MATH BINGO — PRINT STYLESHEET
   20 questions/page · 2 columns · 10 per col
   ═══════════════════════════════════════════ */

@page {
  size: A4;
  margin: 8mm 10mm 10mm 10mm;
}

* { box-sizing: border-box; margin: 0; padding: 0; }

body {
  font-family: 'Courier New', Courier, monospace;
  color: #000;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}

/* ─── PAGE ─── */
.page {
  width: 190mm;
  height: 275mm;
  position: relative;
  overflow: hidden;
}
.page-break { page-break-before: always; }

/* ─── HEADER ─── */
.header {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  padding-bottom: 1.5mm;
}
.title {
  font-size: 14px;
  font-weight: 900;
  letter-spacing: 0.5px;
  text-transform: uppercase;
}
.title-cont {
  font-size: 12px;
  font-weight: 700;
}
.cont-label {
  font-weight: 400;
  font-size: 9px;
  color: #666;
}
.subtitle {
  font-size: 8px;
  color: #555;
  margin-top: 1px;
  letter-spacing: 1px;
}
.header-right { text-align: right; }
.field {
  font-size: 8px;
  color: #333;
  margin-bottom: 1px;
}
.rule {
  border-top: 1.5px solid #000;
  margin-bottom: 2mm;
}

/* ─── GRID ─── */
.grid {
  display: flex;
  gap: 0;
  height: 256mm;
}
.col {
  flex: 1;
  display: flex;
  flex-direction: column;
}
.col-sep {
  width: 0;
  border-left: 0.5px solid #ccc;
  margin: 0 2.5mm;
}

/* ─── QUESTION BLOCK ─── */
.q {
  display: flex;
  gap: 1.5mm;
  border-bottom: 0.5px solid #ddd;
  flex: 1;
  /* key: align qnum to center vertically with the content */
  align-items: center;
}
.q:last-child { border-bottom: none; }

.qnum {
  width: 16px;
  font-size: 11px;
  font-weight: 900;
  text-align: right;
  color: #000;
  flex-shrink: 0;
}

.qbody {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  justify-content: center;
  /* spacing between B, R, Pts */
  gap: 3px;
}

/* ─── ROW (board / rack) ─── */
.row {
  display: flex;
  align-items: center;
  gap: 2px;
  flex-wrap: nowrap;
}
.rlabel {
  font-size: 7px;
  font-weight: 700;
  color: #999;
  width: 8px;
  text-align: center;
  flex-shrink: 0;
}

.tiles {
  display: flex;
  gap: 1.5px;
  flex-wrap: nowrap; /* CRITICAL: single line only */
}

/* ─── TILE SIZES ─── */
/* Large: ≤12 tiles — maximized for readability */
.tile.sz-lg {
  width: 24px;
  height: 24px;
}
.tile.sz-lg .tv { font-size: 11px; }
.tile.sz-lg .tp { font-size: 5.5px; }
.tile.sz-lg .sl { font-size: 6px; }

/* Small: 13–15 tiles — compact but still legible */
.tile.sz-sm {
  width: 18px;
  height: 18px;
}
.tile.sz-sm .tv { font-size: 9px; }
.tile.sz-sm .tp { font-size: 4.5px; }
.tile.sz-sm .sl { font-size: 5px; }

/* ─── TILE BASE ─── */
.tile {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  position: relative;
  line-height: 1;
  flex-shrink: 0;
}

.tile.locked {
  border: 1.5px solid #000;
  background: #e0e0e0;
}
.tile.empty {
  border: 1px dashed #aaa;
  background: #fff;
}
.tile.empty.special {
  border: 1.5px dashed #555;
}
.tile.rack {
  border: 1px solid #888;
  background: #fff;
}

.tv { font-weight: 800; }
.tp {
  position: absolute;
  bottom: 0px;
  right: 1px;
  font-weight: 700;
  color: #777;
}
.sl {
  font-weight: 700;
  color: #666;
}

/* ─── ANSWER LINE ─── */
.ans {
  font-size: 7px;
  color: #999;
  margin-left: 10px;
  margin-top: 10px;
  letter-spacing: 0.5px;
}

/* ─── PAGE NUMBER ─── */
.pagenum {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  text-align: center;
  font-size: 8px;
  color: #999;
}

/* ─── SOLUTIONS ─── */
.sol-grid {
  columns: 2;
  column-gap: 8mm;
  font-size: 9px;
  line-height: 1.8;
}
.sol-item { break-inside: avoid; }
.sol-num {
  display: inline-block;
  width: 24px;
  text-align: right;
  font-weight: 700;
  margin-right: 4px;
}

</style>
</head>
<body>
${questionHtml}
${solutionHtml}
</body>
</html>`;
}

// ─── MAIN COMPONENT ───────────────────────────────────────────────────────────

export function PuzzlePdfGenerator() {
  const [puzzleSets, setPuzzleSets] = useState(DEFAULT_SETS);
  const [mode, setMode] = useState('cross');
  const [crossBonus, setCrossBonus] = useState(true);
  const [puzzles, setPuzzles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [genCount, setGenCount] = useState(0);
  const [genProgress, setGenProgress] = useState(null);
  const [pdfTitle, setPdfTitle] = useState('A-MATH Bingo Sheet');
  const [subtitlePrefix, setSubtitlePrefix] = useState('Bingo Generator');
  const [tileSetsCache, setTileSetsCache] = useState([]);

  // Text output / typewriter
  const [revealedCount, setRevealedCount] = useState(0);
  const [isTyping, setIsTyping] = useState(false);
  const [showTextSolution, setShowTextSolution] = useState(false);
  const [copied, setCopied] = useState(false);
  const typingRef = useRef(null);

  // Puzzle list panel
  const [showPuzzleList, setShowPuzzleList] = useState(false);

  const [downloading, setDownloading] = useState(null); // 'pdf' | 'pdf-sol' | 'docx' | null

  const cancelRef = useRef(null);

  // Cleanup typewriter on unmount
  useEffect(() => () => clearInterval(typingRef.current), []);

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
    setRevealedCount(0);
    setShowPuzzleList(false);
    setGenProgress({ done: 0, total: puzzleSets.reduce((s, p) => s + p.count, 0) });

    const cfgList = buildCfgList(puzzleSets, mode, tileSetsCache, crossBonus);

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
  }, [puzzleSets, mode, tileSetsCache, crossBonus]);

  const handleStartTypewriter = useCallback(() => {
    clearInterval(typingRef.current);
    setRevealedCount(0);
    setIsTyping(true);
    let count = 0;
    typingRef.current = setInterval(() => {
      count++;
      setRevealedCount(count);
      if (count >= puzzles.length) {
        clearInterval(typingRef.current);
        setIsTyping(false);
      }
    }, 60);
  }, [puzzles.length]);

  const handleStopTypewriter = useCallback(() => {
    clearInterval(typingRef.current);
    setIsTyping(false);
  }, []);

  const handleContinueTypewriter = useCallback(() => {
    setIsTyping(true);
    let count = revealedCount;
    typingRef.current = setInterval(() => {
      count++;
      setRevealedCount(count);
      if (count >= puzzles.length) {
        clearInterval(typingRef.current);
        setIsTyping(false);
      }
    }, 60);
  }, [revealedCount, puzzles.length]);

  const handlePdf = useCallback((withSolution) => {
    const html = buildPrintHtml({ puzzles, title: pdfTitle, withSolution, subtitlePrefix });
    const win = window.open('', '_blank');
    if (!win) return;
    win.document.write(html);
    win.document.close();
    win.focus();
    setTimeout(() => win.print(), 300);
  }, [puzzles, pdfTitle, subtitlePrefix]);

  const handleDownloadPdf = useCallback(async (withSolution) => {
    const key = withSolution ? 'pdf-sol' : 'pdf';
    if (downloading) return;
    setDownloading(key);
    try {
      await api.export.pdf({ title: pdfTitle, puzzles: puzzles.map(toExportPuzzle), withSolution, subtitlePrefix });
    } catch (err) {
      console.error('PDF download failed:', err);
      alert(`PDF download failed: ${err.message}`);
    } finally {
      setDownloading(null);
    }
  }, [puzzles, pdfTitle, subtitlePrefix, downloading]);

  const handleDownloadDocx = useCallback(async (withSolution) => {
    const key = withSolution ? 'docx-sol' : 'docx';
    if (downloading) return;
    setDownloading(key);
    try {
      await api.export.docx({ title: pdfTitle, puzzles: puzzles.map(toExportPuzzle), withSolution, subtitlePrefix });
    } catch (err) {
      console.error('DOCX download failed:', err);
      alert(`DOCX download failed: ${err.message}`);
    } finally {
      setDownloading(null);
    }
  }, [puzzles, pdfTitle, subtitlePrefix, downloading]);

  return (
    <div className="space-y-4 max-w-3xl mx-auto">

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
        crossBonus={crossBonus}
        setCrossBonus={setCrossBonus}
        onTileSetsLoaded={setTileSetsCache}
      />

      {puzzles.length > 0 && (
        <div className="space-y-3">

          {/* Export Controls */}
          <div className="bg-white rounded-xl border border-stone-200 overflow-hidden">

            {/* Document title + subtitle */}
            <div className="p-4 pb-3 space-y-3">
              <div>
                <label className="block text-[11px] font-semibold text-stone-400 uppercase tracking-wider mb-1.5">
                  Document Title
                </label>
                <input
                  type="text"
                  value={pdfTitle}
                  onChange={e => setPdfTitle(e.target.value)}
                  placeholder="Enter document title"
                  className="w-full text-sm border border-stone-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-amber-300 focus:border-amber-400 transition-all"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-stone-400 uppercase tracking-wider mb-1.5">
                  Subtitle Prefix
                  <span className="ml-1.5 font-normal normal-case tracking-normal text-stone-300">
                    — shown as &quot;{subtitlePrefix || 'Bingo Generator'} · N Questions&quot;
                  </span>
                </label>
                <input
                  type="text"
                  value={subtitlePrefix}
                  onChange={e => setSubtitlePrefix(e.target.value)}
                  placeholder="Bingo Generator"
                  className="w-full text-sm border border-stone-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-amber-300 focus:border-amber-400 transition-all"
                />
              </div>
            </div>

            {/* Print via browser */}
            <div className="px-4 pb-3">
              <p className="text-[11px] font-semibold text-stone-400 uppercase tracking-wider mb-2">
                Print via Browser
              </p>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => handlePdf(false)}
                  className="flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg text-sm font-semibold border border-stone-200 bg-stone-50 text-stone-700 hover:bg-stone-100 hover:border-stone-300 transition-colors cursor-pointer"
                >
                  <Printer className="w-3.5 h-3.5 shrink-0" />
                  <span>Questions Only</span>
                </button>
                <button
                  onClick={() => handlePdf(true)}
                  className="flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg text-sm font-semibold border border-stone-200 bg-stone-50 text-stone-700 hover:bg-stone-100 hover:border-stone-300 transition-colors cursor-pointer"
                >
                  <Printer className="w-3.5 h-3.5 shrink-0" />
                  <span>Questions + Answer Key</span>
                </button>
              </div>
            </div>

            {/* Download file */}
            <div className="border-t border-stone-100 px-4 py-3">
              <p className="text-[11px] font-semibold text-stone-400 uppercase tracking-wider mb-2">
                Download File
              </p>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => handleDownloadPdf(false)}
                  disabled={!!downloading}
                  className="flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg text-sm font-semibold bg-amber-600 hover:bg-amber-700 text-white disabled:opacity-40 disabled:cursor-wait transition-colors cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5 shrink-0" />
                  <span>{downloading === 'pdf' ? 'Generating...' : 'PDF — Questions'}</span>
                </button>
                <button
                  onClick={() => handleDownloadPdf(true)}
                  disabled={!!downloading}
                  className="flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg text-sm font-semibold bg-amber-600 hover:bg-amber-700 text-white disabled:opacity-40 disabled:cursor-wait transition-colors cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5 shrink-0" />
                  <span>{downloading === 'pdf-sol' ? 'Generating...' : 'PDF + Answer Key'}</span>
                </button>
                <button
                  onClick={() => handleDownloadDocx(false)}
                  disabled={!!downloading}
                  className="flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg text-sm font-semibold border border-stone-200 bg-white hover:bg-stone-50 text-stone-700 disabled:opacity-40 disabled:cursor-wait transition-colors cursor-pointer"
                >
                  <FileText className="w-3.5 h-3.5 shrink-0" />
                  <span>{downloading === 'docx' ? 'Generating...' : 'Word — Questions'}</span>
                </button>
                <button
                  onClick={() => handleDownloadDocx(true)}
                  disabled={!!downloading}
                  className="flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg text-sm font-semibold border border-stone-200 bg-white hover:bg-stone-50 text-stone-700 disabled:opacity-40 disabled:cursor-wait transition-colors cursor-pointer"
                >
                  <FileText className="w-3.5 h-3.5 shrink-0" />
                  <span>{downloading === 'docx-sol' ? 'Generating...' : 'Word + Answer Key'}</span>
                </button>
              </div>
              <p className="mt-2.5 text-[10px] text-stone-400">
                {puzzles.length} puzzle{puzzles.length !== 1 ? 's' : ''} ready to export
              </p>
            </div>
          </div>

          {/* Text Preview */}
          <div className="bg-white rounded-xl border border-stone-200 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2.5 bg-stone-50 border-b border-stone-100">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-stone-600">Text Preview</span>
                {revealedCount > 0 && !isTyping && (
                  <span className="text-[10px] text-stone-400 bg-stone-100 px-1.5 py-0.5 rounded-full">
                    {revealedCount} of {puzzles.length}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setShowTextSolution(v => !v)}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-semibold border cursor-pointer transition-colors ${
                    showTextSolution
                      ? 'bg-emerald-50 border-emerald-300 text-emerald-700'
                      : 'bg-white border-stone-200 text-stone-500 hover:bg-stone-50'
                  }`}
                >
                  {showTextSolution ? 'With Answer' : 'Questions Only'}
                </button>
                {revealedCount > 0 && !isTyping && (
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(buildPlainText(puzzles.slice(0, revealedCount), showTextSolution));
                      setCopied(true);
                      setTimeout(() => setCopied(false), 2000);
                    }}
                    className={`px-2.5 py-1 rounded-md text-[11px] font-semibold border cursor-pointer transition-colors ${
                      copied
                        ? 'bg-emerald-50 border-emerald-300 text-emerald-700'
                        : 'bg-white border-stone-200 text-stone-600 hover:bg-stone-50'
                    }`}
                  >
                    {copied ? 'Copied' : 'Copy'}
                  </button>
                )}
                {isTyping ? (
                  <button
                    onClick={handleStopTypewriter}
                    className="px-2.5 py-1 rounded-md text-[11px] font-semibold border cursor-pointer bg-stone-600 border-stone-600 text-white hover:bg-stone-700 transition-colors"
                  >
                    Stop
                  </button>
                ) : revealedCount > 0 && revealedCount < puzzles.length ? (
                  <>
                    <button
                      onClick={handleContinueTypewriter}
                      className="px-2.5 py-1 rounded-md text-[11px] font-semibold border cursor-pointer bg-amber-500 border-amber-500 text-white hover:bg-amber-600 transition-colors"
                    >
                      Continue
                    </button>
                    <button
                      onClick={handleStartTypewriter}
                      className="px-2.5 py-1 rounded-md text-[11px] font-semibold border cursor-pointer bg-white border-stone-200 text-stone-600 hover:bg-stone-50 transition-colors"
                    >
                      Restart
                    </button>
                  </>
                ) : (
                  <button
                    onClick={handleStartTypewriter}
                    className="px-2.5 py-1 rounded-md text-[11px] font-semibold border cursor-pointer bg-amber-500 border-amber-500 text-white hover:bg-amber-600 transition-colors"
                  >
                    {revealedCount >= puzzles.length ? 'Regenerate' : 'Generate'}
                  </button>
                )}
              </div>
            </div>

            {revealedCount > 0 ? (
              <div className="p-3 space-y-2 max-h-80 overflow-y-auto">
                {puzzles.slice(0, revealedCount).map((p, i) => (
                  <TextPuzzleRow key={i} puzzle={p} index={i} showSolution={showTextSolution} />
                ))}
                {isTyping && (
                  <span className="inline-block w-1.5 h-4 bg-amber-400 animate-pulse rounded-sm" />
                )}
              </div>
            ) : (
              <div className="px-4 py-6 text-center text-sm text-stone-400">
                Click Generate to preview puzzles as plain text
              </div>
            )}
          </div>

          {/* Puzzle Preview (collapsible) */}
          <div className="bg-white rounded-xl border border-stone-200 overflow-hidden">
            <button
              onClick={() => setShowPuzzleList(v => !v)}
              className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-stone-50 active:bg-stone-100 transition-colors cursor-pointer"
            >
              <span className="text-sm font-semibold text-stone-700">
                Puzzle Preview
                <span className="ml-1.5 text-stone-400 font-normal text-xs">({puzzles.length})</span>
              </span>
              {showPuzzleList
                ? <ChevronUp className="w-4 h-4 text-stone-400" />
                : <ChevronDown className="w-4 h-4 text-stone-400" />
              }
            </button>
            {showPuzzleList && (
              <div className="border-t border-stone-100 p-3 space-y-2">
                {puzzles.map((p, i) => (
                  <PuzzleCard key={i} puzzle={p} index={i} />
                ))}
              </div>
            )}
          </div>

        </div>
      )}
    </div>
  );
}
