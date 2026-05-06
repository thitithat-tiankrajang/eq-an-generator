import { useState } from 'react';

const CORE_OPS = ['+', '-', '×', '÷'];
const CHOICE_OPS = ['+/-', '×/÷'];
const OP_SYMBOLS = [...CORE_OPS, ...CHOICE_OPS];

// ── Default state ─────────────────────────────────────────────────────────────
export const DEFAULT_ADV_CFG = {
  algorithm:     'pattern', // 'pattern' | 'backtrack'
  operatorCount: { enabled: false, min: 1, max: 3 },
  heavyCount:    { enabled: false, min: 0, max: 2, placementEnabled: false, locked: 0, onRack: 0 },
  equalCount:    { enabled: false, min: 1, max: 1, placementEnabled: false, locked: 0, onRack: 0 },
  blankCount:    { enabled: false, min: 0, max: 2, placementEnabled: false, locked: 0, onRack: 0 },
  operatorSpec: Object.fromEntries(
    OP_SYMBOLS.map(op => [op, { enabled: false, min: 0, max: 2, placementEnabled: false, locked: 0, onRack: 0 }])
  ),
};

// ── Build config object for generateBingo ────────────────────────────────────
export function buildGeneratorConfig(mode, totalTile, adv, poolDef = null) {
  const cfg = { mode, totalTile };
  if (poolDef) cfg.poolDef = poolDef;

  if ((adv.algorithm ?? 'pattern') === 'backtrack') cfg.algorithm = 'backtrack';

  if (adv.operatorCount.enabled)
    cfg.operatorCount = [adv.operatorCount.min, adv.operatorCount.max];
  if (adv.heavyCount.enabled)
    cfg.heavyCount = [adv.heavyCount.min, adv.heavyCount.max];
  if (adv.blankCount?.enabled)
    cfg.blankCount = [adv.blankCount.min, adv.blankCount.max];
  if (adv.equalCount.enabled)
    cfg.equalCount = [adv.equalCount.min, adv.equalCount.max];

  const opSpec = {};
  const tileAssignmentSpec = {};

  for (const [op, v] of Object.entries(adv.operatorSpec)) {
    if (v.enabled) {
      opSpec[op] = [v.min, v.max];
      if (v.placementEnabled) {
        tileAssignmentSpec[op] = { locked: v.locked, onRack: v.onRack };
      }
    }
  }
  if (Object.keys(opSpec).length > 0) cfg.operatorSpec = opSpec;

  if (adv.heavyCount.enabled && adv.heavyCount.placementEnabled) {
    tileAssignmentSpec['__heavy__'] = { locked: adv.heavyCount.locked, onRack: adv.heavyCount.onRack };
  }
  if (adv.blankCount?.enabled && adv.blankCount.placementEnabled) {
    tileAssignmentSpec['?'] = { locked: adv.blankCount.locked, onRack: adv.blankCount.onRack };
  }
  if (adv.equalCount.enabled && adv.equalCount.placementEnabled) {
    tileAssignmentSpec['='] = { locked: adv.equalCount.locked, onRack: adv.equalCount.onRack };
  }

  if (Object.keys(tileAssignmentSpec).length > 0) cfg.tileAssignmentSpec = tileAssignmentSpec;

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
  const algorithmActive = (adv.algorithm ?? 'pattern') !== 'pattern' ? 1 : 0;
  const placements = [
    adv.heavyCount.placementEnabled,
    adv.blankCount?.placementEnabled,
    adv.equalCount.placementEnabled,
    ...OP_SYMBOLS.map(op => adv.operatorSpec[op].placementEnabled),
  ].filter(Boolean).length;
  return [
    adv.operatorCount.enabled,
    adv.heavyCount.enabled,
    adv.blankCount?.enabled,
    adv.equalCount.enabled,
    ...OP_SYMBOLS.map(op => adv.operatorSpec[op].enabled),
  ].filter(Boolean).length + placements + algorithmActive;
}

// ── NumStepper ────────────────────────────────────────────────────────────────
function NumStepper({ value, onChange, min = 0, max = 9, size = 'md' }) {
  const safe = Number.isFinite(value) ? value : min;

  const btnBase =
    'font-bold flex items-center justify-center disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer active:scale-95 select-none';

  const handleDec = (e) => {
    e.stopPropagation();
    onChange(Math.max(min, safe - 1)); // ✅ FIX
  };

  const handleInc = (e) => {
    e.stopPropagation();
    onChange(Math.min(max, safe + 1));
  };

  if (size === 'sm') {
    return (
      <div
        className="flex items-center gap-0.5"
        onClick={(e) => e.stopPropagation()} // ✅ กัน click ทะลุทั้ง block
      >
        <button
          type="button"
          onClick={handleDec}
          disabled={safe <= min}
          className={`${btnBase} h-8 w-8 rounded-lg border border-stone-300 bg-white text-stone-600 text-sm hover:border-amber-500 hover:text-amber-600`}
        >
          −
        </button>

        <span className="w-5 text-center text-xs font-bold tabular-nums text-stone-800">
          {safe}
        </span>

        <button
          type="button"
          onClick={handleInc}
          disabled={safe >= max}
          className={`${btnBase} h-8 w-8 rounded-lg border border-stone-300 bg-white text-stone-600 text-sm hover:border-amber-500 hover:text-amber-600`}
        >
          +
        </button>
      </div>
    );
  }

  return (
    <div
      className="flex items-center gap-1"
      onClick={(e) => e.stopPropagation()} // ✅ กันทะลุ
    >
      <button
        type="button"
        onClick={handleDec}
        disabled={safe <= min}
        className={`${btnBase} h-10 w-10 rounded-xl border-2 border-stone-300 bg-white text-stone-600 text-base hover:border-amber-500 hover:text-amber-600`}
      >
        −
      </button>

      <span className="w-7 text-center text-sm font-bold tabular-nums text-stone-800">
        {safe}
      </span>

      <button
        type="button"
        onClick={handleInc}
        disabled={safe >= max}
        className={`${btnBase} h-10 w-10 rounded-xl border-2 border-stone-300 bg-white text-stone-600 text-base hover:border-amber-500 hover:text-amber-600`}
      >
        +
      </button>
    </div>
  );
}

// ── RangeRow — click whole row to toggle ──────────────────────────────────────
function RangeRow({
  label, enabled, onToggle,
  min, max, onMinChange, onMaxChange,
  minBound = 0, maxBound = 9
}) {
  return (
    <div
      onClick={onToggle}
      className={`rounded-xl border-2 transition-colors p-3 cursor-pointer ${
        enabled
          ? 'bg-amber-50 border-amber-400'
          : 'bg-stone-50 border-stone-200 hover:border-amber-300 hover:bg-amber-50'
      }`}
    >
      {/* TOP: label + toggle */}
      <div className="flex items-center justify-between">
        <span className={`text-xs font-semibold ${enabled ? 'text-stone-800' : 'text-stone-500'}`}>
          {label}
        </span>

        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation(); 
            onToggle();
          }}
          className={`text-[10px] font-bold px-2 py-1 rounded ${
            enabled
              ? 'bg-amber-200 text-amber-800'
              : 'bg-stone-200 text-stone-500'
          }`}
        >
          {enabled ? 'ON' : 'ANY'}
        </button>
      </div>

      {/* BOTTOM: controls */}
      {enabled && (
        <div className="mt-3 bg-white border border-stone-200 rounded-lg px-3 py-2">
          <div className="flex items-center justify-between gap-2">
        
            <NumStepper
              value={min}
              onChange={v => onMinChange(Math.min(v, max))}
              min={minBound}
              max={maxBound}
              size="sm"
            />
        
            <span className="text-stone-400 font-bold text-sm px-1">–</span>
        
            <NumStepper
              value={max}
              onChange={v => onMaxChange(Math.max(v, min))}
              min={minBound}
              max={maxBound}
              size="sm"
            />
        
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * PlacementRow
 *
 * Constraint: locked + onRack ≤ budget (= spec.min — the guaranteed tile count).
 * Each stepper max is dynamically capped: locked max = budget - onRack, vice versa.
 */
function PlacementRow({
  placementEnabled,
  onToggle,
  locked,
  onRack,
  onLockedChange,
  onRackChange,
  budget,
}) {
  // ── Safety clamp ───────────────────────────────────────────────
  const safeLocked = Math.max(0, Math.min(locked, budget));
  const safeRack = Math.max(0, Math.min(onRack, budget - safeLocked));
  const used = safeLocked + safeRack;

  // dynamic caps
  const maxLocked = budget - safeRack;
  const maxRack = budget - safeLocked;

  return (
    <div className="mt-2 space-y-2">
      {/* ── Toggle ─────────────────────────────────────────────── */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onToggle();
        }}
        className={`flex items-center justify-between w-full px-3 py-2 rounded-lg border text-xs font-bold transition-colors
          ${placementEnabled
            ? 'border-sky-400 bg-sky-100 text-sky-700'
            : 'border-stone-200 bg-white text-stone-400 hover:border-sky-300 hover:text-sky-600'}`}
      >
        <span>⊞ placement</span>
        {budget > 0 && (
          <span className="text-[10px] font-bold tabular-nums">
            {used}/{budget}
          </span>
        )}
      </button>

      {/* ── Controls ────────────────────────────────────────────── */}
      {placementEnabled && (
        <div className="flex flex-col sm:grid sm:grid-cols-2 gap-2">

          {/* ── LOCKED ─────────────────────────────────────────── */}
          <div className="flex items-center justify-between bg-white rounded-lg px-2 py-2 border border-stone-200">
            <span className="text-[11px] font-bold text-stone-600">
              lock
            </span>

            <NumStepper
              size="sm"
              value={safeLocked}
              min={0}
              max={maxLocked}
              onChange={(v) => onLockedChange(Math.min(v, maxLocked))}
            />
          </div>

          {/* ── ON RACK ────────────────────────────────────────── */}
          <div className="flex items-center justify-between bg-white rounded-lg px-2 py-2 border border-stone-200">
            <span className="text-[11px] font-bold text-stone-600">
              rack
            </span>

            <NumStepper
              size="sm"
              value={safeRack}
              min={0}
              max={maxRack}
              onChange={(v) => onRackChange(Math.min(v, maxRack))}
            />
          </div>

          {/* ── Usage indicator ───────────────────────────────── */}
          {budget > 0 && (
            <div className="sm:col-span-2">
              <span
                className={`text-[10px] font-bold px-2 py-1 rounded tabular-nums ${
                  used >= budget
                    ? 'bg-amber-200 text-amber-800'
                    : 'bg-stone-200 text-stone-500'
                }`}
              >
                {used}/{budget} used
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── OperatorCard ──────────────────────────────────────────────────────────────
function OperatorCard({ op, spec, upd, isCross, maxForOp }) {
  const budget = spec.min;

  return (
    <div
      onClick={() => upd(`operatorSpec.${op}.enabled`, !spec.enabled)}
      className={`rounded-xl border-2 p-2 transition-colors cursor-pointer ${
        spec.enabled
          ? 'bg-amber-50 border-amber-400'
          : 'bg-stone-50 border-stone-200'
      }`}
    >

      {/* Header */}
      <div className="flex items-center justify-between">
        <span className={`font-mono font-bold text-sm ${
          spec.enabled ? 'text-amber-700' : 'text-stone-500'
        }`}>
          {op}
        </span>

        <button
          onClick={(e) => {
            e.stopPropagation();
            upd(`operatorSpec.${op}.enabled`, !spec.enabled);
          }}
          className="text-[10px] px-2 py-1 rounded bg-stone-200 text-stone-600"
        >
          {spec.enabled ? 'ON' : 'ANY'}
        </button>
      </div>

      {/* Range */}
      {spec.enabled && (
        <div className="flex justify-between mt-2">
          <NumStepper
            size="sm"
            value={spec.min}
            onChange={v => upd(`operatorSpec.${op}.min`, Math.min(v, spec.max))}
            max={maxForOp}
          />
          <NumStepper
            size="sm"
            value={spec.max}
            onChange={v => upd(`operatorSpec.${op}.max`, Math.max(v, spec.min))}
            max={maxForOp}
          />
        </div>
      )}

      {/* Placement */}
      {isCross && spec.enabled && (
        <PlacementRow
          placementEnabled={spec.placementEnabled}
          onToggle={() => upd(`operatorSpec.${op}.placementEnabled`, !spec.placementEnabled)}
          locked={spec.locked}
          onRack={spec.onRack}
          onLockedChange={v => upd(`operatorSpec.${op}.locked`, v)}
          onRackChange={v => upd(`operatorSpec.${op}.onRack`, v)}
          budget={budget}
        />
      )}
    </div>
  );
}

// ── AdvancedConfigBody ────────────────────────────────────────────────────────
function AdvancedConfigBody({ advancedCfg, setAdvancedCfg, mode, totalTile = 9 }) {
  const [opExpand, setOpExpand] = useState(false);
  const upd = (path, value) => setAdvancedCfg(prev => deepUpdate(prev, path, value));
  const active = countActive(advancedCfg);
  const anyOpSpecActive = OP_SYMBOLS.some(op => advancedCfg.operatorSpec[op].enabled);
  const isCross = mode === 'cross';

  // Derived: sum of all per-op minimums = effective minimum total operators
  const sumOpMin = OP_SYMBOLS.reduce((s, op) => {
    const spec = advancedCfg.operatorSpec[op];
    return s + (spec.enabled ? spec.min : 0);
  }, 0);


  const algorithm = advancedCfg.algorithm ?? 'pattern';

  return (
    <>
      {/* ── Algorithm ── */}
      <section className="mt-4">
        <div className="text-[10px] font-bold text-stone-600 uppercase mb-2">
          Algorithm
        </div>
        <div className="grid grid-cols-2 gap-2">
          {[
            { id: 'pattern',   label: 'Pattern',   desc: 'Fast random-pattern search' },
            { id: 'backtrack', label: 'Backtrack',  desc: 'Systematic structure-first DFS' },
          ].map(({ id, label, desc }) => {
            const active = algorithm === id;
            return (
              <button
                key={id}
                type="button"
                onClick={(e) => { e.stopPropagation(); upd('algorithm', id); }}
                className={`flex flex-col items-start px-3 py-2.5 rounded-xl border-2 text-left transition-colors cursor-pointer min-h-[44px] ${
                  active
                    ? 'border-amber-400 bg-amber-50'
                    : 'border-stone-200 bg-stone-50 hover:border-amber-300 hover:bg-amber-50/60'
                }`}
              >
                <span className={`text-xs font-bold ${active ? 'text-amber-800' : 'text-stone-500'}`}>
                  {label}
                </span>
                <span className="text-[10px] text-stone-400 mt-0.5 leading-tight">{desc}</span>
              </button>
            );
          })}
        </div>
      </section>

      {/* ── A: Operators ── */}
      <section className="mt-4">
        <div className="text-[10px] font-bold text-stone-600 uppercase mb-2">
          A — Operators
        </div>

        <RangeRow
          label="TOTAL OPERATOR COUNT"
          enabled={advancedCfg.operatorCount.enabled}
          onToggle={() => upd('operatorCount.enabled', !advancedCfg.operatorCount.enabled)}
          min={advancedCfg.operatorCount.min}
          max={advancedCfg.operatorCount.max}
          onMinChange={v => upd('operatorCount.min', v)}
          onMaxChange={v => upd('operatorCount.max', v)}
          minBound={0} maxBound={9}
        />

        {/* Per-operator toggle */}
        <button
          type="button"
          onClick={() => setOpExpand(o => !o)}
          className="mt-2 w-full flex items-center justify-between px-3 py-2.5 rounded-xl border-2 border-dashed border-stone-300 hover:border-amber-400 hover:bg-amber-50 transition-colors cursor-pointer min-h-[44px]"
        >
          <span className="text-xs font-medium text-stone-600">
            Per-operator count{isCross && <span className="text-stone-400 ml-1 text-[9px]">+ placement</span>}
          </span>
          <div className="flex items-center gap-1.5">
            {anyOpSpecActive && (
              <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 text-[10px] font-bold">
                {OP_SYMBOLS.filter(op => advancedCfg.operatorSpec[op].enabled).length} set
              </span>
            )}
            <span className="text-stone-500 text-[11px] font-bold">{opExpand ? '▲' : '▼'}</span>
          </div>
        </button>

        {opExpand && (
          <div className="mt-1.5 space-y-1.5">
            <div className="text-[10px] text-stone-400 px-1 mb-1">
              Per-operator ranges override the total count
              {isCross && ' · ⊞ placement: lock+rack ≤ min count'}
            </div>

            {/* Constraint hint: sum of mins */}
            {sumOpMin > 0 && (
              <div className="flex items-center gap-1.5 px-1 mb-1">
                <span className="text-[10px] text-stone-500">
                  Effective min operators:
                </span>
                <span className="text-[10px] font-bold text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded">
                  ≥ {sumOpMin}
                </span>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {CORE_OPS.map(op => (
                <OperatorCard key={op} op={op} spec={advancedCfg.operatorSpec[op]} upd={upd} isCross={isCross} maxForOp={4} />
              ))}
            </div>
            <div className="text-[10px] text-stone-500 font-medium px-1 mt-1.5 mb-1">Choice operators</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {CHOICE_OPS.map(op => (
                <OperatorCard key={op} op={op} spec={advancedCfg.operatorSpec[op]} upd={upd} isCross={isCross} maxForOp={3} />
              ))}
            </div>
          </div>
        )}
      </section>

      {/* ── B: Heavy Tiles ── */}
      <section>
        <div className="text-[10px] font-bold text-stone-600 uppercase mb-2">
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
        {isCross && advancedCfg.heavyCount.enabled && (
          <PlacementRow
            placementEnabled={advancedCfg.heavyCount.placementEnabled}
            onToggle={() => upd('heavyCount.placementEnabled', !advancedCfg.heavyCount.placementEnabled)}
            locked={advancedCfg.heavyCount.locked}
            onRack={advancedCfg.heavyCount.onRack}
            onLockedChange={v => upd('heavyCount.locked', v)}
            onRackChange={v => upd('heavyCount.onRack', v)}
            budget={advancedCfg.heavyCount.min}
          />
        )}
      </section>

      {/* ── C: Blank (?) ── */}
      <section>
        <div className="text-[10px] font-bold text-stone-600 uppercase mb-2">
          C — Blank <span className="text-stone-400 font-normal">(?)</span>
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
        {isCross && (advancedCfg.blankCount?.enabled ?? false) && (
          <PlacementRow
            placementEnabled={advancedCfg.blankCount?.placementEnabled ?? false}
            onToggle={() => upd('blankCount.placementEnabled', !(advancedCfg.blankCount?.placementEnabled))}
            locked={advancedCfg.blankCount?.locked ?? 0}
            onRack={advancedCfg.blankCount?.onRack ?? 0}
            onLockedChange={v => upd('blankCount.locked', v)}
            onRackChange={v => upd('blankCount.onRack', v)}
            budget={advancedCfg.blankCount?.min ?? 0}
          />
        )}
        <div className="mt-1.5 px-1 text-[10px] text-stone-400">
          Counts only ? (Blank) — excludes +/- and ×/÷ wildcards
        </div>
      </section>

      {/* ── D: Equal Count ── */}
      <section>
        <div className="text-[10px] font-bold text-stone-600 uppercase mb-2">
          D — Equal Sign <span className="text-stone-400 font-normal">(=)</span>
        </div>
        <RangeRow
          label="EQUAL COUNT (=)"
          enabled={advancedCfg.equalCount.enabled}
          onToggle={() => upd('equalCount.enabled', !advancedCfg.equalCount.enabled)}
          min={advancedCfg.equalCount.min}
          max={advancedCfg.equalCount.max}
          onMinChange={v => upd('equalCount.min', Math.min(v, advancedCfg.equalCount.max))}
          onMaxChange={v => upd('equalCount.max', Math.max(v, advancedCfg.equalCount.min))}
          minBound={1} maxBound={9}
        />
        {isCross && advancedCfg.equalCount.enabled && (
          <PlacementRow
            placementEnabled={advancedCfg.equalCount.placementEnabled}
            onToggle={() => upd('equalCount.placementEnabled', !advancedCfg.equalCount.placementEnabled)}
            locked={advancedCfg.equalCount.locked}
            onRack={advancedCfg.equalCount.onRack}
            onLockedChange={v => upd('equalCount.locked', v)}
            onRackChange={v => upd('equalCount.onRack', v)}
            budget={advancedCfg.equalCount.min}
          />
        )}
        <div className="mt-1.5 px-1 text-[10px] text-stone-400">
          จำนวน = ที่เป็นไปได้ขึ้นอยู่กับ totalTile — generator จะแจ้ง error ถ้า config เป็นไปไม่ได้
        </div>
      </section>
    

      {/* Reset */}
      {active > 0 && (
        <button
          type="button"
          onClick={() => setAdvancedCfg(DEFAULT_ADV_CFG)}
          className="w-full py-3 rounded-xl border-2 border-stone-300 text-stone-500 text-xs font-semibold
            hover:border-red-400 hover:text-red-500 hover:bg-red-50 transition-colors cursor-pointer min-h-[44px]"
        >
          ✕  Reset All
        </button>
      )}
    </>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────
export function BingoAdvancedConfig({ advancedCfg, setAdvancedCfg, mode, totalTile = 9, inline = false }) {
  const [open, setOpen] = useState(false);
  const active = countActive(advancedCfg);

  if (inline) {
    return (
      <div className="space-y-4">
        <AdvancedConfigBody advancedCfg={advancedCfg} setAdvancedCfg={setAdvancedCfg} mode={mode} totalTile={totalTile} />
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl border-2 border-stone-300 shadow-md mb-4 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-5 py-4 cursor-pointer hover:bg-stone-50 transition-colors min-h-[52px]"
      >
        <div className="flex items-center gap-2.5">
          <span className="text-sm font-semibold text-stone-700">Advanced Config</span>
          {active > 0 && (
            <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 text-[10px] font-bold">
              {active} active
            </span>
          )}
        </div>
        <span className="text-stone-500 text-sm font-bold transition-transform duration-200"
          style={{ display: 'inline-block', transform: open ? 'rotate(180deg)' : 'rotate(0deg)' }}>
          ▾
        </span>
      </button>
      {open && (
        <div className="px-5 pb-5 border-t border-stone-100 space-y-5">
          <AdvancedConfigBody advancedCfg={advancedCfg} setAdvancedCfg={setAdvancedCfg} mode={mode} totalTile={totalTile} />
        </div>
      )}
    </div>
  );
}
