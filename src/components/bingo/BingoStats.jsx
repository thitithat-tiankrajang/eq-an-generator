const STATS = (result) => [
  { label: 'MODE',        value: result.mode.toUpperCase(),         color: result.mode === 'cross' ? 'text-amber-600' : 'text-emerald-600' },
  { label: 'TOTAL TILES', value: result.equationTokens.length,     color: 'text-stone-700' },
  { label: 'FIXED TILES', value: result.fixedIndices.length,       color: 'text-amber-700' },
  { label: 'RACK TOKENS', value: result.rack.length,               color: 'text-emerald-700' },
];

export function BingoStats({ result }) {
  return (
    <div className="grid grid-cols-4 gap-2.5 mb-4">
      {STATS(result).map(s => (
        <div key={s.label} className="bg-white rounded-xl border border-stone-200 shadow-sm p-3 md:p-4">
          <div className="text-[8px] font-mono tracking-widest uppercase text-stone-400 mb-2">{s.label}</div>
          <div className={`text-xl font-extrabold ${s.color}`}>{s.value}</div>
        </div>
      ))}
    </div>
  );
}
