import { useState } from 'react';

const CORE_OPS = ['+', '-', '×', '÷'];
const CHOICE_OPS = ['+/-', '×/÷'];
const OP_SYMBOLS = [...CORE_OPS, ...CHOICE_OPS];

// ── Default state ─────────────────────────────────────────────────────────────
export const DEFAULT_ADV_CFG = {
  operatorCount: { enabled: false, min: 1, max: 3 },
  heavyCount:    { enabled: false, min: 0, max: 2 },
  equalCount:    { enabled: false, value: 2 },
  blankCount:    { enabled: false, min: 0, max: 2 },
  operatorSpec: Object.fromEntries(
    OP_SYMBOLS.map(op => [op, { enabled: false, min: 0, max: 2 }])
  ),
};

// ── Build config object for generateBingo ────────────────────────────────────
export function buildGeneratorConfig(mode, totalTile, adv) {
  const cfg = { mode, totalTile };

  if (adv.operatorCount.enabled)
    cfg.operatorCount = [adv.operatorCount.min, adv.operatorCount.max];
  if (adv.heavyCount.enabled)
    cfg.heavyCount = [adv.heavyCount.min, adv.heavyCount.max];
  if (adv.blankCount?.enabled)
    cfg.blankCount = [adv.blankCount.min, adv.blankCount.max];
  if (adv.equalCount.enabled && mode === 'expand')
    cfg.equalCount = adv.equalCount.value;

  const opSpec = {};
  for (const [op, v] of Object.entries(adv.operatorSpec)) {
    if (v.enabled) opSpec[op] = [v.min, v.max];
  }
  if (Object.keys(opSpec).length > 0) cfg.operatorSpec = opSpec;

  return cfg;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function deepUpdate(obj, path, value) {
  const next = structuredClone(obj);
  const keys = path.split('.');
  let cur = next;
  for (let i = 0; i < keys.length - 1; i++) cur = cur[keys[i]];
  cur[keys[keys.length - 1]] = value;
  return next;
}

function countActive(adv) {
  return [
    adv.operatorCount.enabled,
    adv.heavyCount.enabled,
    adv.blankCount?.enabled,
    ...OP_SYMBOLS.map(op => adv.operatorSpec[op].enabled),
  ].filter(Boolean).length;
}

// ── Sub-components ────────────────────────────────────────────────────────────
function Toggle({ active, onToggle, labelOn = 'RANGE', labelOff = 'ANY' }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={`px-2.5 py-1 rounded-md font-mono text-[9px] tracking-widest uppercase font-bold cursor-pointer transition-all border
        ${active
          ? 'border-amber-500 bg-amber-500 text-white'
          : 'border-stone-200 bg-white text-stone-400 hover:border-amber-300'}`}
    >
      {active ? labelOn : labelOff}
    </button>
  );
}

function NumStepper({ value, onChange, min = 0, max = 9 }) {
  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        onClick={() => onChange(Math.max(min, value - 1))}
        disabled={value <= min}
        className="w-6 h-6 rounded border border-stone-200 bg-white text-stone-500 text-[13px] font-mono
          hover:border-amber-400 hover:text-amber-600 disabled:opacity-30 disabled:cursor-not-allowed
          transition-colors flex items-center justify-center cursor-pointer leading-none"
      >
        −
      </button>
      <span className="w-5 text-center font-mono text-[11px] text-stone-700 font-bold tabular-nums">
        {value}
      </span>
      <button
        type="button"
        onClick={() => onChange(Math.min(max, value + 1))}
        disabled={value >= max}
        className="w-6 h-6 rounded border border-stone-200 bg-white text-stone-500 text-[13px] font-mono
          hover:border-amber-400 hover:text-amber-600 disabled:opacity-30 disabled:cursor-not-allowed
          transition-colors flex items-center justify-center cursor-pointer leading-none"
      >
        +
      </button>
    </div>
  );
}

/**
 * RangeRow — a single constraint row with ANY/RANGE toggle + min-max steppers
 */
function RangeRow({ label, enabled, onToggle, min, max, onMinChange, onMaxChange, minBound = 0, maxBound = 9 }) {
  return (
    <div className={`flex items-center gap-2 px-3 py-2 rounded-xl transition-colors
      ${enabled ? 'bg-amber-50 border border-amber-100' : 'bg-stone-50 border border-transparent'}`}
    >
      <span className={`font-mono text-[10px] tracking-wide flex-1 truncate
        ${enabled ? 'text-stone-700' : 'text-stone-400'}`}
      >
        {label}
      </span>

      {enabled ? (
        <div className="flex items-center gap-1 flex-shrink-0">
          <NumStepper value={min} onChange={v => onMinChange(Math.min(v, max))} min={minBound} max={maxBound} />
          <span className="text-stone-300 font-mono text-[9px] px-0.5">–</span>
          <NumStepper value={max} onChange={v => onMaxChange(Math.max(v, min))} min={minBound} max={maxBound} />
        </div>
      ) : (
        <span className="text-[9px] font-mono text-stone-300 flex-shrink-0 mr-1">any</span>
      )}

      <Toggle active={enabled} onToggle={onToggle} />
    </div>
  );
}

// ── Body sub-component ───────────────────────────────────────────────────────
function AdvancedConfigBody({ advancedCfg, setAdvancedCfg, mode }) {
  const [opExpand, setOpExpand] = useState(false);
  const upd = (path, value) => setAdvancedCfg(prev => deepUpdate(prev, path, value));
  const active = countActive(advancedCfg);
  const anyOpSpecActive = OP_SYMBOLS.some(op => advancedCfg.operatorSpec[op].enabled);

  return (
    <>
          {/* ── A: Operators ───────────────────────────────────────── */}
          <section className="mt-4">
            <div className="text-[9px] tracking-[0.3em] uppercase font-mono text-stone-400 mb-2">
              A — Operators
            </div>

            {/* Total operator count */}
            <RangeRow
              label="TOTAL OPERATOR COUNT"
              enabled={advancedCfg.operatorCount.enabled}
              onToggle={() => upd('operatorCount.enabled', !advancedCfg.operatorCount.enabled)}
              min={advancedCfg.operatorCount.min}
              max={advancedCfg.operatorCount.max}
              onMinChange={v => upd('operatorCount.min', v)}
              onMaxChange={v => upd('operatorCount.max', v)}
              minBound={1} maxBound={6}
            />

            {/* Per-operator toggle */}
            <button
              type="button"
              onClick={() => setOpExpand(o => !o)}
              className="mt-2 w-full flex items-center justify-between px-3 py-2 rounded-xl border border-dashed border-stone-200 hover:border-amber-300 transition-colors cursor-pointer"
            >
              <span className="font-mono text-[9px] tracking-widest uppercase text-stone-400">
                Per-operator count
              </span>
              <div className="flex items-center gap-1.5">
                {anyOpSpecActive && (
                  <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-600 font-mono text-[7px] font-bold">
                    {OP_SYMBOLS.filter(op => advancedCfg.operatorSpec[op].enabled).length} set
                  </span>
                )}
                <span className="text-stone-300 font-mono text-[9px]">{opExpand ? '▲' : '▼'}</span>
              </div>
            </button>

            {opExpand && (
              <div className="mt-1.5 space-y-1">
                <div className="text-[8px] font-mono text-stone-300 px-3 mb-1.5">
                  Per-operator ranges override the total operator count
                </div>
                <div className="grid grid-cols-2 gap-1">
                  {CORE_OPS.map(op => {
                    const spec = advancedCfg.operatorSpec[op];
                    return (
                      <div key={op} className={`flex items-center gap-2 px-3 py-2 rounded-xl transition-colors ${spec.enabled ? 'bg-amber-50 border border-amber-100' : 'bg-stone-50 border border-transparent'}`}>
                        <span className={`font-mono text-[13px] font-bold w-7 text-center flex-shrink-0 ${spec.enabled ? 'text-amber-600' : 'text-stone-400'}`}>{op}</span>
                        {spec.enabled ? (
                          <div className="flex items-center gap-0.5 ml-auto">
                            <NumStepper value={spec.min} onChange={v => upd(`operatorSpec.${op}.min`, Math.min(v, spec.max))} min={0} max={4} />
                            <span className="text-stone-300 font-mono text-[8px]">–</span>
                            <NumStepper value={spec.max} onChange={v => upd(`operatorSpec.${op}.max`, Math.max(v, spec.min))} min={0} max={4} />
                          </div>
                        ) : (
                          <span className="text-[9px] font-mono text-stone-300 ml-auto mr-1">any</span>
                        )}
                        <button type="button" onClick={() => upd(`operatorSpec.${op}.enabled`, !spec.enabled)}
                          className={`w-4 h-4 rounded border-2 flex-shrink-0 flex items-center justify-center transition-colors cursor-pointer ${spec.enabled ? 'border-amber-500 bg-amber-500' : 'border-stone-300 bg-white hover:border-amber-300'}`}>
                          {spec.enabled && <span className="text-white text-[8px] leading-none font-bold">✓</span>}
                        </button>
                      </div>
                    );
                  })}
                </div>
                <div className="text-[8px] font-mono text-stone-300 px-3 mt-2 mb-1">Choice operators</div>
                <div className="grid grid-cols-2 gap-1">
                  {CHOICE_OPS.map(op => {
                    const spec = advancedCfg.operatorSpec[op];
                    return (
                      <div key={op} className={`flex items-center gap-2 px-3 py-2 rounded-xl transition-colors ${spec.enabled ? 'bg-amber-50 border border-amber-100' : 'bg-stone-50 border border-transparent'}`}>
                        <span className={`font-mono text-[10px] font-bold w-8 text-center flex-shrink-0 ${spec.enabled ? 'text-amber-600' : 'text-stone-400'}`}>{op}</span>
                        {spec.enabled ? (
                          <div className="flex items-center gap-0.5 ml-auto">
                            <NumStepper value={spec.min} onChange={v => upd(`operatorSpec.${op}.min`, Math.min(v, spec.max))} min={0} max={3} />
                            <span className="text-stone-300 font-mono text-[8px]">–</span>
                            <NumStepper value={spec.max} onChange={v => upd(`operatorSpec.${op}.max`, Math.max(v, spec.min))} min={0} max={3} />
                          </div>
                        ) : (
                          <span className="text-[9px] font-mono text-stone-300 ml-auto mr-1">any</span>
                        )}
                        <button type="button" onClick={() => upd(`operatorSpec.${op}.enabled`, !spec.enabled)}
                          className={`w-4 h-4 rounded border-2 flex-shrink-0 flex items-center justify-center transition-colors cursor-pointer ${spec.enabled ? 'border-amber-500 bg-amber-500' : 'border-stone-300 bg-white hover:border-amber-300'}`}>
                          {spec.enabled && <span className="text-white text-[8px] leading-none font-bold">✓</span>}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </section>

          {/* ── B: Heavy Tiles ─────────────────────────────────────── */}
          <section>
            <div className="text-[9px] tracking-[0.3em] uppercase font-mono text-stone-400 mb-2">
              B — Heavy Tiles (10–20)
            </div>
            <RangeRow
              label="HEAVY TILE COUNT"
              enabled={advancedCfg.heavyCount.enabled}
              onToggle={() => upd('heavyCount.enabled', !advancedCfg.heavyCount.enabled)}
              min={advancedCfg.heavyCount.min}
              max={advancedCfg.heavyCount.max}
              onMinChange={v => upd('heavyCount.min', v)}
              onMaxChange={v => upd('heavyCount.max', v)}
              minBound={0} maxBound={5}
            />
          </section>

          {/* ── C: Blank (? only) ──────────────────────────────────── */}
          <section>
            <div className="text-[9px] tracking-[0.3em] uppercase font-mono text-stone-400 mb-2">
              C — Blank  <span className="text-stone-300">(?)</span>
            </div>
            <RangeRow
              label="BLANK COUNT (?)"
              enabled={advancedCfg.blankCount?.enabled ?? false}
              onToggle={() => upd('blankCount.enabled', !(advancedCfg.blankCount?.enabled))}
              min={advancedCfg.blankCount?.min ?? 0}
              max={advancedCfg.blankCount?.max ?? 2}
              onMinChange={v => upd('blankCount.min', v)}
              onMaxChange={v => upd('blankCount.max', v)}
              minBound={0} maxBound={4}
            />
            <div className="mt-1.5 px-3 text-[8px] font-mono text-stone-300">
              Counts only ? (Blank) — excludes +/- and ×/÷ wildcards
            </div>
          </section>

          {/* Reset */}
          {active > 0 && (
            <button
              type="button"
              onClick={() => setAdvancedCfg(DEFAULT_ADV_CFG)}
              className="w-full py-2.5 rounded-xl border border-stone-200 text-stone-400 font-mono
                text-[9px] tracking-[0.2em] uppercase hover:border-red-300 hover:text-red-400
                hover:bg-red-50 transition-colors cursor-pointer"
            >
              ✕  Reset All
            </button>
          )}
    </>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
// inline=true: render body directly without the collapsible card wrapper
export function BingoAdvancedConfig({ advancedCfg, setAdvancedCfg, mode, inline = false }) {
  const [open, setOpen] = useState(false);
  const active = countActive(advancedCfg);

  // Inline mode: render body directly (used inside SetRow)
  if (inline) {
    return (
      <div className="space-y-4">
        <AdvancedConfigBody advancedCfg={advancedCfg} setAdvancedCfg={setAdvancedCfg} mode={mode} />
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl border border-stone-200 shadow-sm mb-4 overflow-hidden">

      {/* ── Collapse toggle ─────────────────────────────────────────── */}
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-5 py-4 cursor-pointer hover:bg-stone-50 transition-colors"
      >
        <div className="flex items-center gap-2.5">
          <span className="font-mono text-[10px] tracking-[0.25em] uppercase text-stone-500">
            Advanced Config
          </span>
          {active > 0 && (
            <span className="px-1.5 py-0.5 rounded-md bg-amber-100 text-amber-600 font-mono text-[8px] font-bold tracking-wide">
              {active} active
            </span>
          )}
        </div>
        <span
          className="text-stone-400 text-xs transition-transform duration-200 font-mono"
          style={{ display: 'inline-block', transform: open ? 'rotate(180deg)' : 'rotate(0deg)' }}
        >
          ▾
        </span>
      </button>

      {/* ── Body ────────────────────────────────────────────────────── */}
      {open && (
        <div className="px-5 pb-5 border-t border-stone-100 space-y-5">
          <AdvancedConfigBody advancedCfg={advancedCfg} setAdvancedCfg={setAdvancedCfg} mode={mode} />
        </div>
      )}
    </div>
  );
}
