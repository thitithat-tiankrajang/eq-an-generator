import { useState } from 'react';
import { BingoAdvancedConfig, DEFAULT_ADV_CFG } from '@/components/bingo/BingoAdvancedConfig';

// ── Default sets config ───────────────────────────────────────────────────────
export const DEFAULT_SETS = [{ id: 1, tileCount: 9, count: 1, advancedCfg: DEFAULT_ADV_CFG }];

let _setId = 1;
const nextSetId = () => ++_setId;

const MODES = [
  {
    key: 'cross',
    title: 'CROSS BINGO',
    desc: 'Some tiles pre-placed on board (locked positions + bonus slots)',
  },
  {
    key: 'plain',
    title: 'PLAIN BINGO',
    desc: 'All tiles in rack, no locked positions, no bonus slots',
  },
  {
    key: 'expand',
    title: 'EXPAND BINGO',
    desc: 'Coming soon',
    disabled: true,
  },
];

export function BingoConfig({
  puzzleSets, setPuzzleSets,
  timerEnabled, setTimerEnabled,
  onGenerate, loading, error, genCount,
  showTimer = true,
  mode = 'cross', setMode = () => {},
}) {
  return (
    <div className="bg-white rounded-2xl border border-stone-200 shadow-sm p-5 mb-4">

      {/* Mode row */}
      <SectionLabel step="01" label="Mode" />
      <div className="flex gap-3 mb-6">
        {MODES.map(m => (
          <button
            key={m.key}
            type="button"
            onClick={() => !m.disabled && setMode(m.key)}
            disabled={m.disabled}
            className={`flex-1 text-left px-4 py-3 rounded-xl border-2 font-mono transition-colors relative ${
              m.disabled
                ? 'border-stone-100 bg-stone-50 cursor-not-allowed opacity-60'
                : mode === m.key
                  ? 'border-amber-500 bg-amber-50 shadow-sm shadow-amber-100 cursor-pointer'
                  : 'border-stone-200 bg-stone-50 hover:border-amber-300 cursor-pointer'
            }`}
          >
            <div className={`text-[11px] font-bold tracking-widest ${
              m.disabled ? 'text-stone-300' : mode === m.key ? 'text-amber-700' : 'text-stone-400'
            }`}>
              {m.title}
            </div>
            <div className={`text-[9px] mt-1 tracking-wide ${
              m.disabled ? 'text-stone-300' : mode === m.key ? 'text-amber-500' : 'text-stone-300'
            }`}>
              {m.desc}
            </div>
            {m.disabled && (
              <span className="absolute top-2 right-2 text-[8px] font-bold tracking-wider bg-stone-200 text-stone-500 px-1.5 py-0.5 rounded">
                รออัพเดต
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Sets config */}
      <SectionLabel step="02" label="Puzzle Sets" />
      <div className="space-y-2 mb-3">
        {puzzleSets.map((s, idx) => (
          <SetRow
            key={s.id}
            set={s}
            mode={mode}
            label={`SET ${String.fromCharCode(65 + idx)}`}
            onChange={updated => setPuzzleSets(prev => prev.map(p => p.id === s.id ? { ...p, ...updated } : p))}
            onRemove={puzzleSets.length > 1 ? () => setPuzzleSets(prev => prev.filter(p => p.id !== s.id)) : null}
          />
        ))}
      </div>
      {puzzleSets.length < 6 && (
        <button
          type="button"
          onClick={() => setPuzzleSets(prev => [...prev, { id: nextSetId(), tileCount: 9, count: 1 }])}
          className="w-full py-2 rounded-xl border border-dashed border-stone-300 text-stone-400 font-mono text-[9px] tracking-[0.2em] uppercase hover:border-amber-400 hover:text-amber-500 hover:bg-amber-50 transition-colors cursor-pointer"
        >
          + Add Set
        </button>
      )}

      {/* Timer toggle */}
      {showTimer && (
        <div className="mt-5 mb-1">
          <SectionLabel step="03" label="Timer" />
          <div
            className={`flex items-center justify-between px-4 py-3 rounded-xl border-2 cursor-pointer transition-colors select-none
              ${timerEnabled ? 'border-sky-400 bg-sky-50' : 'border-stone-200 bg-stone-50'}`}
            onClick={() => setTimerEnabled(v => !v)}
          >
            <div>
              <div className={`font-mono text-[11px] font-bold tracking-widest ${timerEnabled ? 'text-sky-700' : 'text-stone-500'}`}>
                TIMED MODE
              </div>
              <div className={`font-mono text-[9px] mt-0.5 ${timerEnabled ? 'text-sky-500' : 'text-stone-400'}`}>
                {timerEnabled ? 'Puzzle hidden until you start the timer' : 'Puzzle shown immediately, no timer'}
              </div>
            </div>
            <div className={`w-10 h-6 rounded-full border-2 flex items-center transition-all ${timerEnabled ? 'bg-sky-400 border-sky-500 justify-end' : 'bg-stone-200 border-stone-300 justify-start'}`}>
              <div className="w-4 h-4 rounded-full bg-white shadow mx-0.5" />
            </div>
          </div>
        </div>
      )}

      {/* Generate button */}
      <button
        onClick={onGenerate}
        disabled={loading}
        className={`w-full mt-4 py-4 rounded-xl border-2 font-mono font-bold text-[12px] tracking-[0.25em] uppercase transition-all cursor-pointer
          ${loading
            ? 'border-stone-200 bg-stone-50 text-stone-300 cursor-not-allowed'
            : 'border-amber-500 bg-amber-600 text-white hover:bg-amber-700 shadow-md shadow-amber-200 active:scale-[0.99]'}`}
      >
        {loading
          ? <span className="inline-flex items-center gap-2"><span className="inline-block animate-spin">◌</span>GENERATING …</span>
          : `◈  ${genCount > 0 ? 'REGENERATE' : 'GENERATE'} (${puzzleSets.reduce((s, p) => s + p.count, 0)} puzzles)`
        }
      </button>

      {error && (
        <div className="mt-3 px-4 py-3 rounded-lg border border-red-200 bg-red-50 text-red-600 text-[11px] font-mono tracking-wide">
          ⚠ {error}
        </div>
      )}
    </div>
  );
}

// ── SetRow ────────────────────────────────────────────────────────────────────
function SetRow({ set, mode, label, onChange, onRemove }) {
  const [advOpen, setAdvOpen] = useState(false);
  const advCfg = set.advancedCfg ?? DEFAULT_ADV_CFG;
  const minTile = 8;

  return (
    <div className="rounded-xl bg-stone-50 border border-stone-100 overflow-hidden">
      <div className="flex items-center gap-3 px-4 py-3">
        <span className="font-mono text-[9px] tracking-widest text-stone-500 w-12 shrink-0">{label}</span>

        {/* Tile count slider */}
        <div className="flex-1 min-w-0">
          <div className="text-[8px] font-mono text-stone-400 mb-1">
            Tiles: <span className="text-stone-700 font-bold">{set.tileCount}</span>
            {mode === 'cross' && (
              <span className="text-stone-300 ml-1">
                ({set.tileCount > 8 ? `${set.tileCount - 8} locked` : 'no lock'})
              </span>
            )}
            {mode === 'plain' && (
              <span className="text-emerald-400 ml-1">(all in rack)</span>
            )}
          </div>
          <input
            type="range" min={minTile} max={15} value={Math.max(minTile, set.tileCount)}
            onChange={e => onChange({ tileCount: +e.target.value })}
            className="w-full cursor-pointer accent-amber-500"
          />
        </div>

        {/* Puzzle count stepper */}
        <div className="shrink-0">
          <div className="text-[8px] font-mono text-stone-400 mb-1 text-center">Puzzles</div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => onChange({ count: Math.max(1, set.count - 1) })}
              className="w-6 h-6 rounded border border-stone-200 bg-white text-stone-500 font-mono text-sm hover:border-amber-400 hover:text-amber-600 transition-colors cursor-pointer flex items-center justify-center"
            >−</button>
            <span className="w-6 text-center font-mono text-[11px] font-bold text-stone-700">{set.count}</span>
            <button
              type="button"
              onClick={() => onChange({ count: Math.min(10, set.count + 1) })}
              className="w-6 h-6 rounded border border-stone-200 bg-white text-stone-500 font-mono text-sm hover:border-amber-400 hover:text-amber-600 transition-colors cursor-pointer flex items-center justify-center"
            >+</button>
          </div>
        </div>

        {/* Advanced config toggle */}
        <button
          type="button"
          onClick={() => setAdvOpen(o => !o)}
          className={`shrink-0 px-2 py-1 rounded-lg border font-mono text-[8px] tracking-widest uppercase transition-colors cursor-pointer
            ${advOpen ? 'border-amber-400 bg-amber-50 text-amber-600' : 'border-stone-200 bg-white text-stone-400 hover:border-amber-300'}`}
        >
          ADV {advOpen ? '▲' : '▼'}
        </button>

        {onRemove && (
          <button
            type="button"
            onClick={onRemove}
            className="w-6 h-6 rounded border border-stone-200 bg-white text-stone-300 text-sm font-mono hover:border-red-300 hover:text-red-400 transition-colors cursor-pointer flex items-center justify-center shrink-0"
          >✕</button>
        )}
      </div>

      {/* Per-set advanced config */}
      {advOpen && (
        <div className="border-t border-stone-100 px-3 pb-3 pt-1">
          <BingoAdvancedConfig
            advancedCfg={advCfg}
            setAdvancedCfg={newCfg => onChange({ advancedCfg: typeof newCfg === 'function' ? newCfg(advCfg) : newCfg })}
            mode={mode}
            inline
          />
        </div>
      )}
    </div>
  );
}

function SectionLabel({ step, label }) {
  return (
    <div className="text-[9px] tracking-[0.3em] uppercase font-mono text-stone-400 mb-3">
      {step} — {label}
    </div>
  );
}
