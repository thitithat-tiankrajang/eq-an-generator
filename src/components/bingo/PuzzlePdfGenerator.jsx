import { useState, useCallback } from 'react';
import { generateBingo, TILE_POINTS } from '@/lib/bingoGenerator';
import { BingoConfig, DEFAULT_SETS } from '@/components/bingo/BingoConfig';
import { DEFAULT_ADV_CFG, buildGeneratorConfig } from '@/components/bingo/BingoAdvancedConfig';

// ── Slot type metadata ────────────────────────────────────────────────────────
const SLOT_META = {
  px1:    { label: '',    border: '#d6d3d1', text: '#78716c', emptyBg: '#f5f5f4' },
  px2:    { label: '2xL', border: '#fb923c', text: '#9a3412', emptyBg: '#fff7ed' },
  px3:    { label: '3xL', border: '#38bdf8', text: '#0c4a6e', emptyBg: '#f0f9ff' },
  px3star:{ label: '3xL', border: '#38bdf8', text: '#0c4a6e', emptyBg: '#f0f9ff' },
  ex2:    { label: '2xW', border: '#facc15', text: '#713f12', emptyBg: '#fefce8' },
  ex3:    { label: '3xW', border: '#f87171', text: '#7f1d1d', emptyBg: '#fef2f2' },
};

// ── Tile sort ─────────────────────────────────────────────────────────────────
const OP_ORDER = ['=', '+', '-', '×', '÷', '+/-', '×/÷', '?'];

function sortTiles(tiles) {
  return [...tiles].sort((a, b) => {
    const an = parseFloat(a), bn = parseFloat(b);
    const aIsNum = !isNaN(an), bIsNum = !isNaN(bn);
    if (aIsNum && bIsNum) return an - bn;
    if (aIsNum) return -1;
    if (bIsNum) return 1;
    const ai = OP_ORDER.indexOf(a), bi = OP_ORDER.indexOf(b);
    return (ai < 0 ? 999 : ai) - (bi < 0 ? 999 : bi);
  });
}

// ── Tile colour (by point value) ──────────────────────────────────────────────
function tileColors(tile) {
  const pts = TILE_POINTS[tile] ?? 0;
  if (pts >= 7) return { bg: '#fef3c7', border: '#f59e0b', text: '#92400e' };
  if (pts >= 4) return { bg: '#fce7f3', border: '#ec4899', text: '#9d174d' };
  if (pts >= 3) return { bg: '#dbeafe', border: '#3b82f6', text: '#1e3a8a' };
  if (pts >= 2) return { bg: '#dcfce7', border: '#22c55e', text: '#14532d' };
  return { bg: '#f5f5f4', border: '#a8a29e', text: '#44403c' };
}

// ── HTML helpers ──────────────────────────────────────────────────────────────

function tilePillHtml(tile, opts = {}) {
  const { locked = false, small = false } = opts;
  const pts  = TILE_POINTS[tile] ?? 0;
  const col  = tileColors(tile);
  const size = small ? 34 : 46;
  const fs   = small ? 11 : 15;
  const pfs  = small ? 6  : 8;

  const lockBadge = locked
    ? `<span style="position:absolute;top:-4px;right:-4px;background:#334155;color:#e2e8f0;
         border-radius:3px;padding:0 2px;font-size:6px;font-family:'Courier New',monospace;
         font-weight:700;line-height:10px;letter-spacing:0.05em;">LK</span>`
    : '';

  return `<span style="
    display:inline-flex;flex-direction:column;align-items:center;justify-content:center;
    width:${size}px;height:${size}px;
    border:2.5px solid ${locked ? '#334155' : col.border};border-radius:7px;
    background:${col.bg};color:${col.text};
    font-family:'Courier New',monospace;font-weight:800;
    font-size:${fs}px;position:relative;margin:2px;vertical-align:middle;
  ">
    ${tile}
    ${pts > 0 ? `<span style="position:absolute;bottom:1px;right:3px;font-size:${pfs}px;opacity:0.65;">${pts}</span>` : ''}
    ${lockBadge}
  </span>`;
}

function emptySlotHtml(slotType) {
  const m    = SLOT_META[slotType] ?? SLOT_META.px1;
  const size = 46;

  return `<span style="
    display:inline-flex;flex-direction:column;align-items:center;justify-content:center;
    width:${size}px;height:${size}px;
    border:2px dashed ${m.border};border-radius:7px;
    background:${m.emptyBg};color:${m.text};
    font-family:'Courier New',monospace;font-weight:700;
    font-size:9px;position:relative;margin:2px;vertical-align:middle;
  ">
    ${m.label ? `<span style="font-size:8px;font-weight:800;letter-spacing:0.05em;">${m.label}</span>` : ''}
  </span>`;
}

function boardRowHtml(boardSlots) {
  return boardSlots.map(slot => {
    if (slot.isLocked) {
      const display = slot.resolvedValue ?? slot.tile;
      return tilePillHtml(display, { locked: true });
    }
    return emptySlotHtml(slot.slotType ?? 'px1');
  }).join('');
}

// ── Build printable HTML ──────────────────────────────────────────────────────
function buildPrintHtml({ puzzles, includeSolution, title }) {
  const legend = `
    <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:16px;padding:8px 12px;
      background:#fafaf9;border:1px solid #e7e5e4;border-radius:8px;align-items:center;">
      <span style="font-family:'Courier New',monospace;font-size:8px;color:#a8a29e;
        text-transform:uppercase;letter-spacing:0.15em;margin-right:4px;">Bonus slots:</span>
      ${[
        ['#fb923c','2xL','Letter x2'],
        ['#38bdf8','3xL','Letter x3'],
        ['#facc15','2xW','Word x2'],
        ['#f87171','3xW','Word x3'],
      ].map(([c, l, t]) =>
        `<span style="display:inline-flex;align-items:center;gap:4px;">
           <span style="display:inline-block;width:12px;height:12px;border-radius:3px;
             background:${c};opacity:0.8;"></span>
           <span style="font-family:'Courier New',monospace;font-size:9px;color:#57534e;">${l}</span>
           <span style="font-family:'Courier New',monospace;font-size:8px;color:#a8a29e;">(${t})</span>
         </span>`
      ).join('')}
      <span style="display:inline-flex;align-items:center;gap:4px;margin-left:6px;">
        <span style="font-family:'Courier New',monospace;font-size:8px;background:#334155;
          color:#e2e8f0;padding:0 3px;border-radius:3px;font-weight:700;">LK</span>
        <span style="font-family:'Courier New',monospace;font-size:9px;color:#57534e;">= Fixed position</span>
      </span>
    </div>`;

  const puzzleBlocks = puzzles.map((p, i) => {
    const sortedRack = sortTiles(p.rackTiles);
    const boardHtml  = boardRowHtml(p.boardSlots);
    const rackHtml   = sortedRack.map(t => tilePillHtml(t)).join('');

    const solHtml = includeSolution
      ? `<div style="margin-top:10px;padding:8px 12px;background:#f0fdf4;
           border:1.5px solid #86efac;border-radius:8px;">
           <div style="font-family:'Courier New',monospace;font-size:8px;color:#16a34a;
             text-transform:uppercase;letter-spacing:0.2em;margin-bottom:6px;">Solution</div>
           <div>${p.solutionTiles.map(t => tilePillHtml(t, { small: true })).join('')}</div>
           <div style="margin-top:4px;font-family:'Courier New',monospace;font-size:10px;
             color:#15803d;letter-spacing:0.15em;">${p.equation ?? ''}</div>
         </div>`
      : '';

    const bonusSlots = p.boardSlots
      .map((s, idx) => ({ idx: idx + 1, type: s.slotType }))
      .filter(s => s.type && s.type !== 'px1');
    const bonusLine = bonusSlots.length > 0
      ? `<div style="font-family:'Courier New',monospace;font-size:8px;color:#a8a29e;margin-top:4px;">
           Bonus: ${bonusSlots.map(s => `#${s.idx} ${SLOT_META[s.type]?.label ?? s.type}`).join(' · ')}
         </div>`
      : '';

    return `
      <div style="
        border:1.5px solid #e7e5e4;border-radius:12px;padding:16px 18px;
        background:#fff;break-inside:avoid;margin-bottom:18px;
      ">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;">
          <span style="
            font-family:'Courier New',monospace;font-weight:800;font-size:13px;
            background:#fef3c7;color:#92400e;padding:3px 10px;border-radius:20px;
            border:1px solid #fcd34d;min-width:30px;text-align:center;
          ">#${i + 1}</span>
          <span style="font-family:'Courier New',monospace;font-size:9px;color:#a8a29e;letter-spacing:0.2em;">
            ${p.boardSlots.length} SLOTS · RACK ${p.rackTiles.length} TILES
            ${p.difficulty?.label ? ' · ' + p.difficulty.label : ''}
          </span>
        </div>

        <div style="margin-bottom:10px;">
          <div style="font-family:'Courier New',monospace;font-size:8px;color:#a8a29e;
            text-transform:uppercase;letter-spacing:0.2em;margin-bottom:6px;">Board</div>
          <div style="display:flex;flex-wrap:wrap;gap:1px;align-items:center;">
            ${boardHtml}
          </div>
          ${bonusLine}
        </div>

        <div style="margin-bottom:12px;">
          <div style="font-family:'Courier New',monospace;font-size:8px;color:#a8a29e;
            text-transform:uppercase;letter-spacing:0.2em;margin-bottom:6px;">Rack</div>
          <div style="display:flex;flex-wrap:wrap;gap:1px;align-items:center;">
            ${rackHtml}
          </div>
        </div>

        <div style="border-top:1px dashed #e7e5e4;padding-top:10px;">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
            <span style="font-family:'Courier New',monospace;font-size:9px;color:#a8a29e;
              text-transform:uppercase;white-space:nowrap;">Answer:</span>
            <div style="flex:1;border-bottom:1.5px solid #d6d3d1;min-height:26px;"></div>
          </div>
          <div style="display:flex;justify-content:flex-end;">
            <span style="font-family:'Courier New',monospace;font-size:9px;color:#d6d3d1;">Score: _______</span>
          </div>
        </div>

        ${solHtml}
      </div>`;
  }).join('');

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${title}</title>
  <style>
    * { box-sizing:border-box; margin:0; padding:0; }
    body {
      font-family:'Courier New',monospace; background:#fff;
      color:#1c1917; padding:20px 24px; max-width:780px; margin:0 auto;
    }
    h1 {
      font-size:20px; font-weight:800; letter-spacing:0.15em;
      text-transform:uppercase; color:#1c1917; margin-bottom:4px;
    }
    .sub { font-size:10px; color:#a8a29e; letter-spacing:0.2em; margin-bottom:16px; }
    @media print {
      body { padding:10mm 12mm; max-width:none; }
    }
  </style>
</head>
<body>
  <h1>${title}</h1>
  <div class="sub">A-MATH CROSS BINGO · ${puzzles.length} PUZZLES · ${new Date().toLocaleDateString('en-GB')}</div>
  ${legend}
  ${puzzleBlocks}
</body>
</html>`;
}

// ── Text pattern builder ──────────────────────────────────────────────────────
const SLOT_LABEL_TEXT = { px1: '    ', px2: '2xL ', px3: '3xL ', px3star: '3xL ', ex2: '2xW ', ex3: '3xW ' };

function buildTextPattern(puzzles) {
  return puzzles.map((p, i) => {
    const boardLine = p.boardSlots.map(slot => {
      if (slot.isLocked) {
        const display = (slot.resolvedValue ?? slot.tile).padEnd(3);
        return `[${display}LK]`;
      }
      const label = SLOT_LABEL_TEXT[slot.slotType] ?? '    ';
      return slot.slotType && slot.slotType !== 'px1' ? `[${label}]` : '[    ]';
    }).join(' ');

    const sortedRack = sortTiles(p.rackTiles);
    const rackLine = `Rack:  ${sortedRack.join(', ')}`;

    return `${i + 1}.\n  Board: ${boardLine}\n  ${rackLine}`;
  }).join('\n\n');
}

// ── Main component ────────────────────────────────────────────────────────────
export function PuzzlePdfGenerator() {
  const [puzzleSets,      setPuzzleSets]      = useState(DEFAULT_SETS);
  const [loading,         setLoading]         = useState(false);
  const [error,           setError]           = useState('');
  const [genCount,        setGenCount]        = useState(0);
  const [puzzles,         setPuzzles]         = useState([]);
  const [includeSolution, setIncludeSolution] = useState(false);
  const [pdfTitle,        setPdfTitle]        = useState('Bingo Puzzle Sheet');
  const [mode,            setMode]            = useState('cross');

  const handleGenerate = useCallback(() => {
    setLoading(true);
    setError('');
    setTimeout(() => {
      try {
        const results = [];
        for (const s of puzzleSets) {
          const cfg = buildGeneratorConfig(mode, s.tileCount, s.advancedCfg ?? DEFAULT_ADV_CFG);
          for (let i = 0; i < s.count; i++) {
            const r = generateBingo(cfg);
            results.push({
              boardSlots:    r.boardSlots,
              rackTiles:     r.rackTiles,
              solutionTiles: r.solutionTiles,
              equation:      r.equation,
              difficulty:    r.difficulty,
            });
          }
        }
        setPuzzles(results);
        setGenCount(n => n + 1);
      } catch (e) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    }, 20);
  }, [puzzleSets, mode]);

  const handleOpenPdf = useCallback(() => {
    const html = buildPrintHtml({ puzzles, includeSolution, title: pdfTitle });
    const win  = window.open('', '_blank');
    if (!win) return;
    win.document.write(html);
    win.document.close();
    win.focus();
    setTimeout(() => win.print(), 500);
  }, [puzzles, includeSolution, pdfTitle]);

  const textPattern = puzzles.length > 0 ? buildTextPattern(puzzles) : '';

  return (
    <div className="space-y-4">

      <BingoConfig
        puzzleSets={puzzleSets}
        setPuzzleSets={setPuzzleSets}
        timerEnabled={false}
        setTimerEnabled={() => {}}
        onGenerate={handleGenerate}
        loading={loading}
        error={error}
        genCount={genCount}
        showTimer={false}
        mode={mode}
        setMode={setMode}
      />

      {puzzles.length > 0 && (
        <div className="bg-white rounded-2xl border border-stone-200 shadow-sm p-5 space-y-4">

          <div className="text-[9px] tracking-[0.3em] uppercase font-mono text-stone-400">
            Generated Puzzles — Text Pattern
          </div>

          <pre className="bg-stone-50 border border-stone-100 rounded-xl px-4 py-3 font-mono text-[10px] text-stone-700 leading-relaxed overflow-x-auto whitespace-pre">
{textPattern}
          </pre>

          <div className="border-t border-stone-100 pt-4 space-y-3">
            <div className="text-[9px] tracking-[0.3em] uppercase font-mono text-stone-400">
              PDF Options
            </div>

            <div>
              <label className="block text-[8px] font-mono text-stone-400 mb-1 uppercase tracking-widest">
                Sheet Title
              </label>
              <input
                type="text"
                value={pdfTitle}
                onChange={e => setPdfTitle(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-stone-200 font-mono text-[11px] text-stone-700 outline-none focus:border-amber-400"
              />
            </div>

            <div
              className={`flex items-center justify-between px-4 py-3 rounded-xl border-2 cursor-pointer transition-colors select-none
                ${includeSolution ? 'border-emerald-400 bg-emerald-50' : 'border-stone-200 bg-stone-50'}`}
              onClick={() => setIncludeSolution(v => !v)}
            >
              <div>
                <div className={`font-mono text-[11px] font-bold tracking-widest ${includeSolution ? 'text-emerald-700' : 'text-stone-500'}`}>
                  INCLUDE SOLUTION
                </div>
                <div className={`font-mono text-[9px] mt-0.5 ${includeSolution ? 'text-emerald-500' : 'text-stone-400'}`}>
                  {includeSolution ? 'Solution shown below each puzzle' : 'No solution (for students)'}
                </div>
              </div>
              <div className={`w-10 h-6 rounded-full border-2 flex items-center transition-all ${includeSolution ? 'bg-emerald-400 border-emerald-500 justify-end' : 'bg-stone-200 border-stone-300 justify-start'}`}>
                <div className="w-4 h-4 rounded-full bg-white shadow mx-0.5" />
              </div>
            </div>

            <button
              onClick={handleOpenPdf}
              className="w-full py-4 rounded-xl border-2 border-violet-500 bg-violet-600 text-white font-mono font-bold text-[12px] tracking-[0.25em] uppercase hover:bg-violet-700 shadow-md shadow-violet-200 active:scale-[0.99] transition-all cursor-pointer"
            >
              Create PDF ({puzzles.length} {puzzles.length === 1 ? 'puzzle' : 'puzzles'})
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
