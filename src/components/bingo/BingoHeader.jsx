export function BingoHeader() {
  return (
    <div className="bg-linear-to-br from-stone-50 via-amber-50/60 to-stone-100 border-b border-stone-200 px-4 py-6 relative overflow-hidden">
      {/* subtle grid pattern */}
      <div
        className="absolute inset-0 opacity-30 pointer-events-none"
        style={{
          backgroundImage: 'linear-gradient(hsl(40 24% 84%) 1px, transparent 1px), linear-gradient(90deg, hsl(40 24% 84%) 1px, transparent 1px)',
          backgroundSize: '48px 48px',
        }}
      />

      <div className="max-w-3xl mx-auto relative flex items-center gap-4">
        {/* logo tile */}
        <div className="w-12 h-12 shrink-0 rounded-xl border-2 border-amber-400 bg-amber-50 flex items-center justify-center text-xl shadow-sm shadow-amber-200">
          ⊞
        </div>

        <div>
          <h1 className="text-xl font-extrabold tracking-[0.3em] text-amber-700 uppercase">
            Equation Anagram Bingo
          </h1>
          <p className="text-[9px] tracking-[0.35em] text-stone-400 uppercase mt-0.5 font-mono">
            Equation Puzzle Generator · Guaranteed Success
          </p>
        </div>
      </div>
    </div>
  );
}
