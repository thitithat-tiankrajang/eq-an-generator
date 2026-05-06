import { BingoTile } from './BingoTile';
import { TILE_POINTS } from '@/lib/bingoGenerator';

// Reuse the same CSS variable as BingoBoard so rack tiles always match board slots
const TILE_CSS = 'var(--rack-tile, calc(var(--board-tile) * 1.06))';
/**
 * rackTiles:      Array<{ id: number, tile: string } | null>  (fixed-size; null = empty slot)
 * selected:       { source: 'rack'|'board', index: number } | null
 * onTileClick(rackIndex)      — fires only for filled slots
 * onEmptySlotClick(rackIndex) — fires only for empty slots
 */
export function BingoRack({ rackTiles, selected, onTileClick, onEmptySlotClick, onRecallAll }) {
  const remaining = rackTiles.filter(Boolean).length;
  const total     = rackTiles.length;
  const OP_ORDER = ['+', '-', '×', '÷', '+/-', '×/÷', '=', '?'];

  function sortRackTilesWithIndex(rackTiles) {
    return rackTiles
      .map((tile, index) => ({ tile, index }))
      .sort((a, b) => {
        if (!a.tile) return 1;
        if (!b.tile) return -1;
  
        const av = a.tile.tile;
        const bv = b.tile.tile;
  
        const an = parseFloat(av);
        const bn = parseFloat(bv);
  
        const aNum = !isNaN(an);
        const bNum = !isNaN(bn);
  
        if (aNum && bNum) return an - bn;
        if (aNum) return -1;
        if (bNum) return 1;
  
        // 👇 ใช้ list อย่างเดียว
        return OP_ORDER.indexOf(av) - OP_ORDER.indexOf(bv);
      });
  }

  return (
    <div className="bg-white rounded-2xl border border-stone-300 shadow-md p-3 mb-3">
      {/* Header */}
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[10px] font-semibold text-stone-500 uppercase">
          Rack · {remaining}/{total} tiles
        </span>
        <div className="flex items-center gap-1.5">
          {remaining === 0 && (
            <span className="text-[10px] text-emerald-600 font-semibold">All placed ✓</span>
          )}
          {onRecallAll && (
            <button
              type="button"
              onClick={onRecallAll}
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg border border-stone-200 bg-white text-stone-500 font-mono text-[10px] font-semibold uppercase tracking-wide hover:border-stone-300 hover:bg-stone-50 hover:text-stone-700 active:scale-95 transition-all cursor-pointer"
            >
              <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
                <path d="M2 5.5C2 3.567 3.567 2 5.5 2c1.2 0 2.26.594 2.9 1.5M9 5.5C9 7.433 7.433 9 5.5 9c-1.2 0-2.26-.594-2.9-1.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                <path d="M7.5 1.5L8.4 3.5l-2 .5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              Recall
            </button>
          )}
        </div>
      </div>

      {/* Tiles */}
      <div className="overflow-x-auto">
        <div className="flex gap-1 w-max mx-auto">
          {sortRackTilesWithIndex(rackTiles).map(({ tile: t, index: originalIndex }) => {
            const isSelected =
              selected?.source === 'rack' && selected.index === originalIndex;

            if (t === null) {
              const isBoardSelected = selected?.source === 'board';
              return (
                <button
                  key={`empty-${originalIndex}`}
                  type="button"
                  onClick={() => onEmptySlotClick(originalIndex)}
                  style={{ width: TILE_CSS, height: TILE_CSS }}
                  className={`rounded-lg border-2 border-dashed flex items-center justify-center transition-colors cursor-pointer
                    ${
                      isBoardSelected
                        ? 'border-blue-300 bg-blue-50'
                        : 'border-stone-200 bg-stone-50'
                    }`}
                >
                  {isBoardSelected && (
                    <span className="text-blue-300 text-xl font-bold leading-none">+</span>
                  )}
                </button>
              );
            }

            return (
              <BingoTile
                key={t.id}
                token={t.tile}
                role={isSelected ? 'selected' : 'rack'}
                size="lg"
                onClick={() => onTileClick(originalIndex)}
                points={TILE_POINTS[t.tile] ?? 0}
                dimCss={TILE_CSS}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}
