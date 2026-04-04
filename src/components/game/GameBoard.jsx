import { cn } from "@/lib/utils";
import { Star, Lock } from "lucide-react";

const TILE_SCORES = {
  "0":2,"1":1,"2":1,"3":2,"4":3,"5":2,"6":3,"7":4,"8":4,"9":4,
  "+":2,"-":2,"*":4,"/":6,"=":3
};

export default function GameBoard({ slots, specialSlots = [], onSlotClick, onRemoveTile, selectedTile }) {
  return (
    <div className="w-full overflow-x-auto">
      <div className="flex gap-1.5 min-w-max px-1 pb-1">
        {slots.map((slot, i) => {
          const special = specialSlots.find(s => s.slot === i);
          const isEmpty = !slot;
          const isLocked = slot?.locked;
          const isActive = selectedTile && !slot?.locked;

          return (
            <div key={i} className="flex flex-col items-center gap-1">
              {/* Slot index */}
              <span className="text-[9px] text-slate-500 font-mono">{i + 1}</span>
              <div
                onClick={() => isEmpty ? onSlotClick(i) : !isLocked && onRemoveTile(i)}
                className={cn(
                  "w-10 h-12 md:w-11 md:h-14 rounded-lg border-2 flex items-center justify-center cursor-pointer relative transition-all select-none",
                  isEmpty && isActive && "border-blue-400 bg-blue-500/10 border-dashed scale-105",
                  isEmpty && !isActive && "border-white/20 bg-white/5 hover:border-white/40",
                  slot && !isLocked && "border-white/30 bg-white/10 hover:border-red-400/60",
                  isLocked && "border-amber-400/50 bg-amber-500/10 cursor-default",
                  special && isEmpty && "border-purple-400/70 bg-purple-500/10"
                )}
              >
                {/* Special slot indicator */}
                {special && isEmpty && (
                  <div className="absolute -top-1 -right-1">
                    <Star className="w-3 h-3 text-purple-400 fill-purple-400" />
                  </div>
                )}
                {special && slot && (
                  <div className="absolute -top-1 -right-1">
                    <Star className="w-3 h-3 text-purple-300 fill-purple-300" />
                  </div>
                )}

                {/* Tile content */}
                {slot ? (
                  <>
                    <span className={cn(
                      "text-lg md:text-xl font-bold font-mono",
                      isLocked ? "text-amber-300" : "text-white",
                      /[+\-*/=]/.test(slot.value) && !isLocked && "text-blue-300"
                    )}>
                      {slot.value}
                    </span>
                    {/* Tile score */}
                    <span className="absolute bottom-0.5 right-1 text-[8px] font-semibold leading-none opacity-70 text-white">
                      {TILE_SCORES[slot.value] ?? 1}
                    </span>
                    {/* Lock icon */}
                    {isLocked && (
                      <Lock className="w-2.5 h-2.5 text-amber-400 absolute top-0.5 right-0.5" />
                    )}
                  </>
                ) : (
                  <span className="text-slate-600 text-xs">—</span>
                )}
              </div>
              {/* Multiplier label */}
              {special && (
                <span className="text-[9px] text-purple-400 font-semibold">×{special.multiplier}</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}