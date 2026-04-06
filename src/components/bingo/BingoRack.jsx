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
              className="px-2 py-0.5 rounded-lg border-2 border-stone-300 text-stone-500 text-[11px] font-semibold hover:border-stone-400 hover:bg-stone-50 transition-colors cursor-pointer"
            >
              ↩ Recall
            </button>
          )}
        </div>
      </div>

      {/* Tiles */}
      <div className="overflow-x-auto">
      <div className="flex gap-1 w-max mx-auto">
        {rackTiles.map((t, i) => {
          const isSelected = selected?.source === 'rack' && selected.index === i;

          if (t === null) {
            const isBoardSelected = selected?.source === 'board';
            return (
              <button
                key={`empty-${i}`}
                type="button"
                onClick={() => onEmptySlotClick(i)}
                style={{ width: TILE_CSS, height: TILE_CSS }}
                className={`rounded-lg border-2 border-dashed flex items-center justify-center transition-colors cursor-pointer
                  ${isBoardSelected
                    ? 'border-blue-300 bg-blue-50'
                    : 'border-stone-200 bg-stone-50'}`}
              >
                {isBoardSelected && <span className="text-blue-300 text-xl font-bold leading-none">+</span>}
              </button>
            );
          }

          return (
            <BingoTile
              key={t.id}
              token={t.tile}
              role={isSelected ? 'selected' : 'rack'}
              size="lg"
              onClick={() => onTileClick(i)}
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
