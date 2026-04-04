import { BingoTile } from './BingoTile';

export function BingoWildcards({ wildcards }) {
  if (!wildcards.length) return null;

  return (
    <div className="bg-white rounded-2xl border border-stone-200 shadow-sm p-5 mb-4">
      <div className="text-[9px] tracking-[0.3em] uppercase font-mono font-semibold text-amber-600 mb-4">
        WILDCARD TILES
      </div>
      <div className="flex gap-3 flex-wrap">
        {wildcards.map((t, i) => (
          <div
            key={i}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-amber-200 bg-amber-50"
          >
            <BingoTile token={t.token} size="sm" />
            <span className="text-[10px] text-stone-400 font-mono">→</span>
            <span className="text-sm font-bold text-amber-700 font-mono">{t.resolved}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
