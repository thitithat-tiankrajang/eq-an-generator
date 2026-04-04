import { BingoTile } from './BingoTile';

export function BingoBlock({ result }) {
  if (!result.blockIndices) return null;

  return (
    <div className="bg-white rounded-2xl border border-emerald-200 shadow-sm p-5 mb-4" style={{ boxShadow: '0 0 20px rgba(16,185,129,0.08)' }}>
      <div className="text-[9px] tracking-[0.3em] uppercase font-mono font-semibold text-emerald-600 mb-4">
        EQUATION BLOCK
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        {result.blockIndices.map(bi => (
          <BingoTile key={bi} token={result.equationTokens[bi].token} role="block" size="sm" />
        ))}
        <div className="ml-2 px-3 py-1.5 rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-700 font-mono text-sm tracking-wide">
          {result.blockIndices.map(bi => result.equationTokens[bi].resolved || result.equationTokens[bi].token).join('')}
        </div>
      </div>
    </div>
  );
}
