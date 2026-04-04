import { BingoTile } from './BingoTile';
import { TILE_POINTS } from '@/lib/bingoGenerator';

/**
 * rackTiles:      Array<{ id: number, tile: string } | null>  (fixed-size; null = empty slot)
 * selected:       { source: 'rack'|'board', index: number } | null
 * onTileClick(rackIndex)      — fires only for filled slots
 * onEmptySlotClick(rackIndex) — fires only for empty slots
 */
export function BingoRack({ rackTiles, selected, onTileClick, onEmptySlotClick, onRecallAll }) {
  const remaining = rackTiles.filter(Boolean).length;
  const total     = rackTiles.length;
  const placed    = total - remaining;

  return (
    <div
      className="bg-white rounded-2xl border border-stone-200 shadow-sm p-5 mb-4"
      style={{ boxShadow: '0 0 24px rgba(180,120,20,0.07)' }}
    >
      {/* Header */}
      <div className="flex items-baseline justify-between mb-4">
        <div className="text-[9px] tracking-[0.3em] uppercase font-mono font-semibold text-amber-600">
          RACK · {remaining}/{total} TILES
        </div>
        <div className="flex items-center gap-2">
          {remaining === 0 && (
            <span className="text-[9px] font-mono text-emerald-600 tracking-wide">ALL PLACED ✓</span>
          )}
          {placed > 0 && onRecallAll && (
            <button
              type="button"
              onClick={onRecallAll}
              className="px-2.5 py-1 rounded-lg border border-stone-200 font-mono text-[8px] tracking-widest uppercase text-stone-400 hover:border-amber-400 hover:text-amber-500 hover:bg-amber-50 transition-colors cursor-pointer"
            >
              ↩ RECALL ALL
            </button>
          )}
        </div>
      </div>

      {/* Fixed-size grid — always renders all slots (null = empty) */}
      <div className="flex gap-2 flex-wrap justify-center">
        {rackTiles.map((t, i) => {
          const isSelected = selected?.source === 'rack' && selected.index === i;

          if (t === null) {
            // Empty rack slot — clickable to receive a board tile
            const isBoardSelected = selected?.source === 'board';
            return (
              <div key={`empty-${i}`} className="text-center">
                <button
                  type="button"
                  onClick={() => onEmptySlotClick(i)}
                  className={`w-[54px] h-[54px] rounded-lg border-2 border-dashed flex items-center justify-center transition-colors cursor-pointer
                    ${isBoardSelected
                      ? 'border-sky-400 bg-sky-50 hover:bg-sky-100'
                      : 'border-stone-200 bg-stone-50 hover:border-stone-300'}`}
                >
                  {isBoardSelected && (
                    <span className="text-sky-300 font-mono text-lg leading-none">+</span>
                  )}
                </button>
                <span className="block text-center font-mono mt-1" style={{ fontSize: 7, color: '#a8a29e' }}>
                  R{i + 1}
                </span>
              </div>
            );
          }

          return (
            <div key={t.id} className="text-center">
              <BingoTile
                token={t.tile}
                role={isSelected ? 'selected' : 'rack'}
                size="lg"
                onClick={() => onTileClick(i)}
                points={TILE_POINTS[t.tile] ?? 0}
              />
              <span className="block text-center font-mono mt-1" style={{ fontSize: 7, color: '#a8a29e' }}>
                R{i + 1}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
