import { cn } from "@/lib/utils";

const TILE_SCORES = {
  "0":2,"1":1,"2":1,"3":2,"4":3,"5":2,"6":3,"7":4,"8":4,"9":4,
  "+":2,"-":2,"*":4,"/":6,"=":3
};

const TILE_COLORS = {
  "+": "from-blue-500 to-blue-700",
  "-": "from-indigo-500 to-indigo-700",
  "*": "from-violet-500 to-violet-700",
  "/": "from-purple-500 to-purple-700",
  "=": "from-amber-500 to-amber-700",
};

function getTileStyle(value) {
  if (TILE_COLORS[value]) return TILE_COLORS[value];
  return "from-slate-500 to-slate-700";
}

export default function TileRack({ tiles, selectedTile, onSelect }) {
  return (
    <div className="space-y-2">
      <p className="text-xs text-slate-400 font-medium uppercase tracking-wide">Your Tiles ({tiles.filter(t => !t.used).length} remaining)</p>
      <div className="flex flex-wrap gap-2 justify-center">
        {tiles.map((tile) => (
          <button
            key={tile.id}
            onClick={() => onSelect(tile)}
            disabled={tile.used}
            className={cn(
              "relative w-12 h-14 md:w-14 md:h-16 rounded-xl font-bold font-mono text-xl md:text-2xl text-white shadow-lg transition-all select-none flex items-center justify-center",
              `bg-gradient-to-br ${getTileStyle(tile.value)}`,
              tile.used && "opacity-20 cursor-not-allowed scale-90",
              !tile.used && selectedTile?.id === tile.id && "ring-2 ring-white ring-offset-2 ring-offset-transparent scale-110 shadow-xl",
              !tile.used && selectedTile?.id !== tile.id && "hover:scale-105 hover:shadow-xl cursor-pointer"
            )}
          >
            {tile.value}
            <span className="absolute bottom-0.5 right-1 text-[9px] font-semibold text-white/70 leading-none">
              {TILE_SCORES[tile.value] ?? 1}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}