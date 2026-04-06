import { useState, useEffect } from 'react';
import { BingoAdvancedConfig, DEFAULT_ADV_CFG } from '@/components/bingo/BingoAdvancedConfig';
import { api } from '@/api/apiClient';

// ── Default sets config ───────────────────────────────────────────────────────
export const DEFAULT_SETS = [{ id: 1, tileCount: 9, count: 1, advancedCfg: DEFAULT_ADV_CFG, tileSetId: null }];

let _setId = 1;
const nextSetId = () => ++_setId;

const MODES = [
  {
    key: 'cross',
    title: 'Cross Bingo',
    desc: 'Lock positions + bonus slots',
  },
  {
    key: 'plain',
    title: 'Plain Bingo',
    desc: 'All tiles in rack',
  },
  {
    key: 'expand',
    title: 'Expand Bingo',
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
  const totalPuzzles = puzzleSets.reduce((s, p) => s + (Number(p.count) || 1), 0);

  // ── Fetch tile sets once ──────────────────────────────────────────────────
  const [tileSets, setTileSets] = useState([]);
  useEffect(() => {
    api.tileSets.list()
      .then(res => setTileSets(res.tileSets ?? res ?? []))
      .catch(() => setTileSets([]));
  }, []);

  return (
    <div className="bg-white rounded-2xl border border-stone-300 shadow-md p-4 sm:p-5 mb-4">

      {/* ── Mode ── */}
      <SectionLabel step="01" label="Mode" />
      <div className="flex gap-2 mb-5">
        {MODES.map(m => (
          <button
            key={m.key}
            type="button"
            onClick={() => !m.disabled && setMode(m.key)}
            disabled={m.disabled}
            className={`relative flex-1 text-left px-3 py-2.5 rounded-xl border-2 transition-colors min-h-[56px] ${
              m.disabled
                ? 'border-stone-200 bg-stone-100 cursor-not-allowed opacity-50'
                : mode === m.key
                  ? 'border-amber-600 bg-amber-600 shadow-md cursor-pointer'
                  : 'border-stone-300 bg-stone-50 hover:border-amber-400 hover:bg-amber-50 cursor-pointer'
            }`}
          >
            <div className={`text-xs font-bold leading-tight ${
              m.disabled ? 'text-stone-400' : mode === m.key ? 'text-white' : 'text-stone-700'
            }`}>
              {m.title}
            </div>
            <div className={`text-[10px] mt-0.5 leading-tight ${
              m.disabled ? 'text-stone-300' : mode === m.key ? 'text-amber-100' : 'text-stone-500'
            }`}>
              {m.desc}
            </div>
            {m.disabled && (
              <span className="absolute top-1.5 right-1.5 text-[9px] font-semibold bg-stone-200 text-stone-500 px-1.5 py-0.5 rounded">
                Soon
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── Puzzle Sets ── */}
      <SectionLabel step="02" label="Puzzle Sets" />
      <div className="space-y-2 mb-3">
        {puzzleSets.map((s, idx) => (
          <SetRow
            key={s.id}
            set={s}
            mode={mode}
            label={`Set ${String.fromCharCode(65 + idx)}`}
            tileSets={tileSets}
            onChange={updated => setPuzzleSets(prev => prev.map(p => p.id === s.id ? { ...p, ...updated } : p))}
            onRemove={puzzleSets.length > 1 ? () => setPuzzleSets(prev => prev.filter(p => p.id !== s.id)) : null}
          />
        ))}
      </div>
      {puzzleSets.length < 6 && (
        <button
          type="button"
          onClick={() => setPuzzleSets(prev => [...prev, { id: nextSetId(), tileCount: 9, count: 1, advancedCfg: DEFAULT_ADV_CFG, tileSetId: null }])}
          className="w-full py-2.5 rounded-xl border-2 border-dashed border-stone-300 text-stone-500 text-xs font-medium hover:border-amber-500 hover:text-amber-600 hover:bg-amber-50 transition-colors cursor-pointer min-h-[44px]"
        >
          + Add Set
        </button>
      )}

      {/* ── Timer ── */}
      {showTimer && (
        <div className="mt-5 mb-1">
          <SectionLabel step="03" label="Timer" />
          <div
            className={`flex items-center justify-between px-4 py-3 rounded-xl border-2 cursor-pointer transition-colors select-none
              ${timerEnabled ? 'border-sky-500 bg-sky-500' : 'border-stone-300 bg-stone-50 hover:border-stone-400'}`}
            onClick={() => setTimerEnabled(v => !v)}
          >
            <div>
              <div className={`text-xs font-bold ${timerEnabled ? 'text-white' : 'text-stone-700'}`}>
                Timed Mode
              </div>
              <div className={`text-[10px] mt-0.5 ${timerEnabled ? 'text-sky-100' : 'text-stone-500'}`}>
                {timerEnabled ? 'Puzzle hidden until you press Start' : 'Puzzle shown immediately, no timer'}
              </div>
            </div>
            <div className={`w-10 h-6 rounded-full border-2 flex items-center transition-all shrink-0 ${timerEnabled ? 'bg-white border-sky-200 justify-end' : 'bg-stone-200 border-stone-300 justify-start'}`}>
              <div className={`w-4 h-4 rounded-full shadow mx-0.5 ${timerEnabled ? 'bg-sky-500' : 'bg-white'}`} />
            </div>
          </div>
        </div>
      )}

      {/* ── Generate button ── */}
      <button
        onClick={onGenerate}
        disabled={loading}
        className={`w-full mt-4 py-4 rounded-xl border-2 font-bold text-sm tracking-wide transition-all cursor-pointer
          ${loading
            ? 'border-stone-200 bg-stone-100 text-stone-400 cursor-not-allowed'
            : 'border-amber-600 bg-amber-600 text-white hover:bg-amber-700 hover:border-amber-700 active:scale-[0.99]'}`}
      >
        {loading
          ? <span className="inline-flex items-center gap-2"><span className="inline-block animate-spin">◌</span>Generating…</span>
          : `${genCount > 0 ? 'Regenerate' : 'Generate'} (${totalPuzzles} puzzle${totalPuzzles !== 1 ? 's' : ''})`
        }
      </button>

      {error && (
        <div className="mt-3 px-4 py-3 rounded-lg border border-red-300 bg-red-50 text-red-700 text-xs font-medium">
          ⚠ {error}
        </div>
      )}
    </div>
  );
}

// ── SetRow ────────────────────────────────────────────────────────────────────
function SetRow({ set, mode, label, tileSets, onChange, onRemove }) {
  const [advOpen, setAdvOpen] = useState(false);
  const advCfg = set.advancedCfg ?? DEFAULT_ADV_CFG;
  const minTile = 8;
  const tileCount = Number.isFinite(set.tileCount) ? set.tileCount : 9;
  const count = Number.isFinite(set.count) ? set.count : 1;
  const lockedCount = tileCount > 8 ? tileCount - 8 : 0;

  return (
    <div className="rounded-xl bg-stone-100 border border-stone-300 overflow-hidden">

      {/* ── Row 1: label + buttons ── */}
      <div className="flex items-center justify-between gap-2 px-3 pt-3 pb-1">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <span className="text-xs font-bold text-stone-600 shrink-0">{label}</span>
          {mode === 'cross' && (
            <span className={`text-[10px] font-medium shrink-0 ${lockedCount > 0 ? 'text-amber-700' : 'text-stone-400'}`}>
              {lockedCount > 0 ? `${lockedCount} locked` : 'no lock'}
            </span>
          )}
          {mode === 'plain' && (
            <span className="text-[10px] font-medium text-emerald-600 shrink-0">all rack</span>
          )}
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={() => setAdvOpen(o => !o)}
            className={`px-2.5 py-2 rounded-lg border-2 text-xs font-bold transition-colors cursor-pointer min-h-[36px] min-w-[52px] ${
              advOpen
                ? 'border-amber-600 bg-amber-600 text-white'
                : 'border-stone-300 bg-white text-stone-600 hover:border-amber-500 hover:text-amber-600'
            }`}
          >
            ADV {advOpen ? '▲' : '▼'}
          </button>
          {onRemove && (
            <button
              type="button"
              onClick={onRemove}
              className="min-h-[36px] min-w-[36px] rounded-lg border-2 border-stone-300 bg-white text-stone-400 font-bold hover:border-red-400 hover:text-red-500 hover:bg-red-50 transition-colors cursor-pointer flex items-center justify-center"
            >✕</button>
          )}
        </div>
      </div>

      {/* ── Tile Set selector ── */}
      {tileSets.length > 0 && (
        <div className="px-3 pb-2">
          <div className="text-[10px] text-stone-500 mb-1">Tile Set</div>
          <div className="flex flex-wrap gap-1.5">

            {tileSets.map(ts => (
              <button
                key={ts.id}
                type="button"
                onClick={() => onChange({ tileSetId: ts.id })}
                className={`px-2.5 py-1.5 rounded-lg border-2 text-xs font-semibold transition-colors cursor-pointer min-h-[32px] ${
                  set.tileSetId === ts.id
                    ? 'border-amber-500 bg-amber-500 text-white'
                    : 'border-stone-300 bg-white text-stone-600 hover:border-amber-400 hover:bg-amber-50'
                }`}
              >
                {ts.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Tile slider ── */}
      <div className="px-3 pb-2">
        <div className="text-[10px] text-stone-500 mb-1">
          Tiles: <span className="text-stone-800 font-bold">{tileCount}</span>
          {mode === 'cross' && lockedCount > 0 && (
            <span className="text-stone-400 ml-1">({lockedCount} locked)</span>
          )}
          {mode === 'plain' && (
            <span className="text-emerald-600 ml-1 font-medium">(all in rack)</span>
          )}
        </div>
        <input
          type="range" min={minTile} max={15} value={tileCount}
          onChange={e => onChange({ tileCount: Number(e.target.value) })}
          className="w-full cursor-pointer accent-amber-600"
          style={{ height: 28 }}
        />
      </div>

      {/* ── Puzzle count ── */}
      <div className="px-3 pb-3">
        <div className="text-[10px] text-stone-500 mb-1.5">Puzzles</div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onChange({ count: Math.max(1, count - 1) })}
            className="h-11 w-11 rounded-lg border-2 border-stone-300 bg-white text-stone-600 font-bold text-lg hover:border-amber-500 hover:text-amber-600 transition-colors cursor-pointer flex items-center justify-center shrink-0 select-none active:scale-95"
          >−</button>
          <span className="flex-1 text-center text-base font-bold text-stone-800 tabular-nums select-none">{count}</span>
          <button
            type="button"
            onClick={() => onChange({ count: Math.min(100, count + 1) })}
            className="h-11 w-11 rounded-lg border-2 border-stone-300 bg-white text-stone-600 font-bold text-lg hover:border-amber-500 hover:text-amber-600 transition-colors cursor-pointer flex items-center justify-center shrink-0 select-none active:scale-95"
          >+</button>
        </div>
      </div>

      {/* Per-set advanced config */}
      {advOpen && (
        <div className="border-t border-stone-200 px-3 pb-3 pt-2 bg-white">
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
    <div className="flex items-center gap-2 mb-3">
      <span className="text-[10px] font-bold text-amber-600 bg-amber-100 px-1.5 py-0.5 rounded">{step}</span>
      <span className="text-xs font-semibold text-stone-700">{label}</span>
    </div>
  );
}
