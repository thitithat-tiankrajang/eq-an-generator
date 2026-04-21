import { BingoTile } from './BingoTile';
import { WILD_TILES, TILE_POINTS } from '@/lib/bingoGenerator';

// Board tile size — smaller on mobile portrait via CSS variable
const TILE_CSS = 'var(--board-tile)';

// Injected once into <head> so the variable responds to media query
const STYLE_ID = '__board_tile_style__';
if (typeof document !== 'undefined' && !document.getElementById(STYLE_ID)) {
  const s = document.createElement('style');
  s.id = STYLE_ID;
  // clamp(min, preferred, max)
  // preferred = (100vw - 48px) / 9  → fills viewport with exactly 9 tiles
  // 48px offset covers card padding + borders
  // max = 48px (default size on wide screens)
  // min = 28px (absolute floor)
  s.textContent = `:root { --board-tile: clamp(28px, calc((100vw - 48px) / 9.1), 48px); }`;
  document.head.appendChild(s);
}

export { WILD_TILES };

// ── Slot background colors (muted, Scrabble-inspired) ─────────────────────────
const SLOT_BG = {
  px1:    'bg-stone-300',
  px2:    'bg-orange-200',
  px3:    'bg-blue-200',
  px3star:'bg-blue-200',
  ex2:    'bg-yellow-200',
  ex3:    'bg-red-300',
};

const SLOT_LABEL = {
  px2: '2P', px3: '3P', px3star: '★', ex2: '2E', ex3: '3E',
};

const SLOT_LABEL_COLOR = {
  px2: 'text-amber-700', px3: 'text-sky-700', px3star: 'text-sky-700',
  ex2: 'text-yellow-700', ex3: 'text-rose-800',
};

export function BingoBoard({
  boardSlots, selected, onSlotClick, onEmptySlotClick,
  submitResult, allFilled, onSubmit,
  timerEnabled = false,
  timerMs = 0, puzzleHidden = false,
  onStartTimer,
}) {
  return (
    <div className="bg-white rounded-2xl border border-stone-300 shadow-md p-3 mb-3">

      {/* ── Header ── */}
      <div className="flex items-center justify-between mb-1.5 gap-2">
        <span className="text-[10px] font-semibold text-stone-500 uppercase ">
          Board · {boardSlots.length} tiles
        </span>

        <div className="flex items-center gap-1.5 shrink-0">
          {puzzleHidden ? (
            <button
              type="button"
              onClick={onStartTimer}
              className="px-3 py-1 rounded-lg border-2 border-sky-500 bg-sky-500 text-white text-[11px] font-bold hover:bg-sky-600 cursor-pointer transition-colors"
            >
              ▶ Start
            </button>
          ) : (
            <>
              {timerEnabled && (
                <span className="font-mono text-sm font-bold tabular-nums text-stone-700">
                  {formatTime(timerMs)}
                </span>
              )}
              <CheckButton allFilled={allFilled} submitResult={submitResult} onSubmit={onSubmit} />
            </>
          )}
        </div>
      </div>

      {/* ── Hidden overlay ── */}
      {puzzleHidden ? (
        <div className="flex items-center justify-center rounded-xl border-2 border-dashed border-stone-300 bg-stone-50"
             style={{ minHeight: 100 }}>
          <div className="text-center">
            <p className="text-stone-400 text-xs font-semibold uppercase mb-1">Timed Mode</p>
            <p className="text-stone-400 text-[10px]">Press Start to reveal the puzzle</p>
          </div>
        </div>
      ) : (
        /* ── Grid array ── */
        <div className="overflow-x-auto">
          {/* mx-auto + w-fit centres when small; allows full scroll when wide */}
          <div className="w-fit mx-auto px-1 py-0.5">
          {/* Outer border provides top-left edges; each cell provides right-bottom */}
          <div className="inline-flex border-l-2 border-t-2 border-stone-500">
            {boardSlots.map((slot, si) => {
              const isSelected    = selected?.source === 'board' && selected.index === si;
              const isWild        = slot.tile !== null && WILD_TILES.has(slot.tile);
              const hasResolved   = isWild && !!slot.resolvedValue;
              const needsResolved = isWild && !slot.resolvedValue;
              const displayTile   = hasResolved ? slot.resolvedValue : slot.tile;

              let role;
              const isLockedWild   = slot.isLocked && isWild && hasResolved;
              const isLockedWildQ  = isLockedWild && slot.tile === '?';
              const isLockedWildOp = isLockedWild && (slot.tile === '+/-' || slot.tile === '×/÷');

              if (slot.isLocked) {
                if (isLockedWildQ)        role = 'locked-wild-question';
                else if (isLockedWildOp)  role = 'locked-wild';
                else if (needsResolved)   role = 'wild-unresolved';
                else                      role = 'locked';
              } else if (isSelected) {
                role = 'selected';
              } else if (slot.tile !== null) {
                role = needsResolved ? 'wild-unresolved' : 'board-placed';
              } else {
                role = 'normal';
              }

              const pts = slot.tile !== null ? (TILE_POINTS[slot.tile] ?? 0) : undefined;
              const slotBg = SLOT_BG[slot.slotType] ?? SLOT_BG.px1;
              const slotLabel = SLOT_LABEL[slot.slotType];
              const slotLabelCls = SLOT_LABEL_COLOR[slot.slotType] ?? '';

              return (
                <div key={si} className="relative shrink-0" style={{ lineHeight: 0, width: TILE_CSS, height: TILE_CSS }}>
                  {slot.tile === null ? (
                    <GridEmptySlot
                      bg={slotBg}
                      label={slotLabel}
                      labelCls={slotLabelCls}
                      isStar={slot.slotType === 'px3star'}
                      onClick={() => onEmptySlotClick(si)}
                      dimCss={TILE_CSS}
                    />
                  ) : (
                    <>
                      <BingoTile
                        token={displayTile}
                        role={role}
                        size="md"
                        onClick={() => onSlotClick(si)}
                        points={pts}
                        sourceTile={isLockedWild ? slot.tile : undefined}
                        grid={true}
                        dimCss={TILE_CSS}
                      />
                      {/* Slot type corner pip for filled special squares */}
                      {slot.slotType && slot.slotType !== 'px1' && slotLabel && (
                        <span
                          className={`absolute top-0.5 left-0.5 font-bold pointer-events-none leading-none ${slotLabelCls}`}
                          style={{ fontSize: 7 }}
                        >{slotLabel}</span>
                      )}
                      {/* Wildcard resolved label */}
                      {hasResolved && !slot.isLocked && (
                        <div
                          className="absolute bottom-0 left-0 bg-amber-400/80 text-amber-900 font-mono font-bold leading-none pointer-events-none"
                          style={{ fontSize: 7, padding: '1px 2px' }}
                        >{slot.tile}</div>
                      )}
                    </>
                  )}
                </div>
              );
            })}
          </div>
          </div>
        </div>
      )}


    </div>
  );
}

// ── Grid empty slot — same border-r/b collapse as BingoTile ──────────────────
function GridEmptySlot({ bg, label, labelCls, isStar, onClick, dimCss }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center justify-center border-r-2 border-b-2 border-stone-500 rounded-none cursor-pointer hover:brightness-95 transition-all ${bg}`}
      style={{ width: dimCss, height: dimCss, minWidth: dimCss }}
    >
      {isStar && <span className="text-sky-600 font-bold" style={{ fontSize: 17 }}>★</span>}
      {!isStar && label && (
        <span className={`font-bold leading-none ${labelCls}`} style={{ fontSize: 9 }}>{label}</span>
      )}
    </button>
  );
}

function CheckButton({ allFilled, submitResult, onSubmit }) {
  let label = 'Check';
  let cls   = 'border-stone-200 text-stone-400 bg-stone-100 cursor-not-allowed';
  let score = null;

  if (submitResult?.correct === true) {
    label = '✓ Correct';
    cls   = 'border-emerald-500 bg-emerald-500 text-white cursor-pointer';
    score = submitResult.score;
  } else if (submitResult?.correct === false) {
    label = '✗ Wrong';
    cls   = 'border-red-400 bg-red-50 text-red-600 cursor-pointer';
  } else if (allFilled) {
    cls   = 'border-amber-500 bg-amber-500 text-white hover:bg-amber-600 cursor-pointer';
  }

  return (
    <div className="flex flex-col items-end">
      <button
        type="button"
        disabled={!allFilled && !submitResult}
        onClick={onSubmit}
        className={`px-3 py-1 rounded-lg border-2 text-[11px] font-bold transition-colors ${cls}`}
      >
        {label}
      </button>
      {score != null && (
        <span className="mt-1 text-xs text-emerald-600 font-bold">
          {score} pts
        </span>
      )}
    </div>
  );
}

export function formatTime(ms) {
  if (!ms && ms !== 0) return '--:--.--';
  const totalSec = Math.floor(ms / 1000);
  const min = String(Math.floor(totalSec / 60)).padStart(2, '0');
  const sec = String(totalSec % 60).padStart(2, '0');
  const cent = String(Math.floor((ms % 1000) / 10)).padStart(2, '0');
  return `${min}:${sec}.${cent}`;
}
