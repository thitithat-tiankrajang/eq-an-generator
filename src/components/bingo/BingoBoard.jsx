import { BingoTile, SlotLabel } from './BingoTile';
import { WILD_TILES, TILE_POINTS } from '@/lib/bingoGenerator';

export { WILD_TILES };

// ── Slot type styling ─────────────────────────────────────────────────────────
const SLOT_CFG = {
  px1:    { empty: 'bg-stone-300 border-stone-600',       label: '',    dot: ''              },
  px2:    { empty: 'bg-orange-200 border-orange-700',     label: '2×P', dot: 'bg-orange-800' },
  px3:    { empty: 'bg-sky-200 border-sky-700',           label: '3×P', dot: 'bg-sky-800'    },
  px3star:{ empty: 'bg-sky-200 border-sky-700',           label: '★',   dot: 'bg-sky-800'    },
  ex2:    { empty: 'bg-yellow-200 border-yellow-700',     label: '2×E', dot: 'bg-yellow-800' },
  ex3:    { empty: 'bg-red-200 border-red-700',           label: '3×E', dot: 'bg-red-800'    },
};

/**
 * Props:
 *   boardSlots      – [{ tile, isLocked, resolvedValue, slotType }]
 *   selected        – { source, index } | null
 *   submitResult    – { correct, message, score } | null
 *   allFilled       – boolean
 *   timerEnabled    – boolean
 *   timerRunning    – boolean  (puzzle revealed, timer going)
 *   timerMs         – number   (elapsed ms to display)
 *   puzzleHidden    – boolean  (timer mode, not yet started)
 *   onSlotClick     – fn(idx)  fires for filled (user-placed) tiles
 *   onEmptySlotClick– fn(idx)  fires for empty board slots
 *   onSubmit        – fn()
 *   onStartTimer    – fn()
 */
export function BingoBoard({
  boardSlots, selected, onSlotClick, onEmptySlotClick,
  submitResult, allFilled, onSubmit,
  timerEnabled = false, timerRunning = false,
  timerMs = 0, puzzleHidden = false,
  onStartTimer,
}) {
  return (
    <div
      className="bg-white rounded-2xl border border-stone-200 shadow-sm p-5 mb-4"
      style={{ boxShadow: '0 0 24px rgba(120,100,30,0.06)' }}
    >
      {/* ── Header ─────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
        <div className="flex items-baseline gap-3 flex-wrap flex-1 min-w-0">
          <span className="text-[9px] tracking-[0.3em] uppercase font-mono font-semibold text-stone-500 shrink-0">
            BOARD · {boardSlots.length} SLOTS
          </span>
          {!puzzleHidden && (
            <div className="flex gap-2 flex-wrap">
              <LegendDot cls="bg-stone-300"   label="px1" />
              <LegendDot cls="bg-orange-400"  label="2×P" />
              <LegendDot cls="bg-sky-400"     label="3×P" />
              <LegendDot cls="bg-yellow-400"  label="2×E" />
              <LegendDot cls="bg-red-400"     label="3×E" />
              <LegendDot cls="bg-orange-400 ring-2 ring-orange-200" label="!" />
            </div>
          )}
        </div>

        {/* ── Right-side button area ──────────────────────────────── */}
        <div className="flex items-center gap-2 shrink-0">
          {puzzleHidden ? (
            /* START TIMER button — replaces CHECK when puzzle is hidden */
            <button
              type="button"
              onClick={onStartTimer}
              className="px-3 py-1.5 rounded-lg border-2 border-sky-400 bg-sky-50 text-sky-700 font-mono text-[9px] tracking-[0.2em] uppercase font-bold hover:bg-sky-100 cursor-pointer transition-all"
            >
              ▶ START
            </button>
          ) : (
            <>
              {/* Timer display (only when running or stopped) */}
              {timerEnabled && (
                <span className="font-mono text-[11px] font-bold tabular-nums text-sky-600 tracking-wider">
                  {formatTime(timerMs)}
                </span>
              )}
              {/* CHECK button */}
              <CheckButton allFilled={allFilled} submitResult={submitResult} onSubmit={onSubmit} />
            </>
          )}
        </div>
      </div>

      {/* ── Hidden puzzle overlay ───────────────────────────────────── */}
      {puzzleHidden ? (
        <div className="flex items-center justify-center rounded-xl border-2 border-dashed border-sky-200 bg-sky-50/50"
             style={{ minHeight: 120 }}>
          <div className="text-center">
            <div className="text-sky-300 font-mono text-[11px] tracking-[0.3em] uppercase mb-2">
              TIMED MODE
            </div>
            <div className="text-sky-400 font-mono text-[9px] tracking-wide">
              Press ▶ START to begin timing and reveal the puzzle
            </div>
          </div>
        </div>
      ) : (
        /* ── Board slots ─────────────────────────────────────────── */
        <div className="flex gap-2 flex-wrap justify-center">
          {boardSlots.map((slot, si) => {
            const isSelected    = selected?.source === 'board' && selected.index === si;
            const isWild        = slot.tile !== null && WILD_TILES.has(slot.tile);
            const hasResolved   = isWild && !!slot.resolvedValue;
            const needsResolved = isWild && !slot.resolvedValue;
            const cfg           = SLOT_CFG[slot.slotType] ?? SLOT_CFG.px1;

            const displayTile = hasResolved ? slot.resolvedValue : slot.tile;

            let role;
            const isLockedWild  = slot.isLocked && isWild && hasResolved;
            const isLockedWildQ  = isLockedWild && slot.tile === '?';
            const isLockedWildOp = isLockedWild && (slot.tile === '+/-' || slot.tile === '×/÷');

            if (slot.isLocked) {
              if (isLockedWildQ)   role = 'locked-wild-question';
              else if (isLockedWildOp) role = 'locked-wild';
              else if (needsResolved)  role = 'wild-unresolved';
              else                     role = 'locked';
            } else if (isSelected) {
              role = 'selected';
            } else if (slot.tile !== null) {
              role = needsResolved ? 'wild-unresolved' : 'board-placed';
            } else {
              role = 'normal';
            }

            const pts = slot.tile !== null ? (TILE_POINTS[slot.tile] ?? 0) : undefined;

            return (
              <div key={si} className="text-center">
                <div className="relative inline-block">
                  {slot.tile === null ? (
                    <EmptySlot slotType={slot.slotType} cfg={cfg} onClick={() => onEmptySlotClick(si)} />
                  ) : (
                    <>
                      <BingoTile
                        token={displayTile}
                        role={role}
                        size="md"
                        onClick={() => onSlotClick(si)}
                        points={pts}
                        sourceTile={isLockedWild ? slot.tile : undefined}
                      />
                      {slot.slotType && slot.slotType !== 'px1' && cfg.dot && (
                        <div className={`absolute -top-1 -left-1 w-2.5 h-2.5 rounded-full ${cfg.dot} border-2 border-white pointer-events-none z-10`} />
                      )}
                      {needsResolved && (
                        <div
                          className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-orange-400 text-white flex items-center justify-center pointer-events-none z-20"
                          style={{ fontSize: 9, fontWeight: 'bold' }}
                        >!</div>
                      )}
                      {hasResolved && !slot.isLocked && (
                        <div
                          className="absolute -bottom-1 -right-1 bg-amber-200 text-amber-700 font-mono rounded px-0.5 leading-tight pointer-events-none z-10"
                          style={{ fontSize: 7 }}
                        >{slot.tile}</div>
                      )}
                    </>
                  )}
                </div>
                <SlotLabel n={si + 1} />
                {slot.slotType && slot.slotType !== 'px1' && (
                  <span style={{ display: 'block', fontSize: 6, fontFamily: 'monospace', color: slotTypeTextColor(slot.slotType), marginTop: 1, letterSpacing: 0.3 }}>
                    {cfg.label}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function EmptySlot({ slotType, cfg, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-[46px] h-[46px] rounded-lg border-2 flex flex-col items-center justify-center cursor-pointer transition-colors hover:opacity-80 ${cfg.empty}`}
    >
      {slotType === 'px3star' && <span className="text-sky-300 leading-none" style={{ fontSize: 18 }}>★</span>}
      {slotType !== 'px1' && slotType !== 'px3star' && (
        <span className="font-mono font-bold leading-none" style={{ fontSize: 7, color: slotTypeTextColor(slotType) }}>
          {cfg.label}
        </span>
      )}
    </button>
  );
}

function CheckButton({ allFilled, submitResult, onSubmit }) {
  let label = 'CHECK';
  let cls   = 'border-stone-200 text-stone-400 bg-stone-50 cursor-not-allowed';
  let score = null;

  if (submitResult?.correct === true) {
    label = '✓ CORRECT';
    cls   = 'border-emerald-500 bg-emerald-500 text-white cursor-pointer';
    score = submitResult.score;
  } else if (submitResult?.correct === false) {
    label = '✗ WRONG';
    cls   = 'border-red-400 bg-red-50 text-red-600 cursor-pointer';
  } else if (allFilled) {
    cls   = 'border-amber-400 bg-amber-50 text-amber-700 hover:bg-amber-100 cursor-pointer';
  }

  return (
    <div className="flex flex-col items-end">
      <button
        type="button"
        disabled={!allFilled && !submitResult}
        onClick={onSubmit}
        className={`px-3 py-1.5 rounded-lg border-2 font-mono text-[9px] tracking-[0.2em] uppercase font-bold transition-all ${cls}`}
      >
        {label}
      </button>
      {score != null && (
        <span className="mt-1 font-mono text-[9px] tracking-wide text-emerald-600 font-bold">
          {score} pts
        </span>
      )}
    </div>
  );
}

function LegendDot({ cls, label }) {
  return (
    <div className="flex items-center gap-1 text-[7px] text-stone-400 font-mono">
      <div className={`w-2 h-2 rounded-full ${cls}`} />
      {label}
    </div>
  );
}

function slotTypeTextColor(type) {
  const map = { px2: '#f97316', px3: '#0ea5e9', px3star: '#0ea5e9', ex2: '#ca8a04', ex3: '#ef4444' };
  return map[type] ?? '#a8a29e';
}

export function formatTime(ms) {
  if (!ms && ms !== 0) return '--:--.--';
  const totalSec = Math.floor(ms / 1000);
  const min = String(Math.floor(totalSec / 60)).padStart(2, '0');
  const sec = String(totalSec % 60).padStart(2, '0');
  const cent = String(Math.floor((ms % 1000) / 10)).padStart(2, '0');
  return `${min}:${sec}.${cent}`;
}
