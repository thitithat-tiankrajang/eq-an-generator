import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { api } from '@/api/apiClient';
import {
  TEST_CONFIGS,
  CATEGORY_META,
  CATEGORY_ORDER,
  getConfigsByCategory,
  cfgTags,
  ATTEMPTS_PER_CONFIG,
} from '@/lib/configTestDefs';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Play, RefreshCw, Trash2, Save, ChevronDown, ChevronRight,
  CheckCircle2, XCircle, Circle, AlertTriangle, Loader2,
  Pause, Square, ChevronsDown, CheckSquare, Minus, Filter,
  X, SlidersHorizontal, ChevronUp, Hash, Layers, Cpu,
  BarChart2, Clock, Info,
} from 'lucide-react';
import { toast } from 'sonner';

// ── Constants ─────────────────────────────────────────────────────────────────

const CONCURRENCY     = 3;
const ATTEMPT_TIMEOUT = 8_000;

// ── Worker pool ───────────────────────────────────────────────────────────────

function runWithConcurrency(testItems, { concurrency, onProgress, onDone }) {
  let idx       = 0;
  let running   = 0;
  let cancelled = false;
  const workers = new Set();

  function spawnNext() {
    if (cancelled || idx >= testItems.length) {
      if (running === 0) onDone();
      return;
    }
    const item = testItems[idx++];
    running++;

    const worker = new Worker(
      new URL('../../lib/configTestWorker.js', import.meta.url),
      { type: 'module' },
    );
    workers.add(worker);

    const BOOT_TIMEOUT = 15_000;
    let bootTimer = setTimeout(() => {
      worker.terminate();
      workers.delete(worker);
      running--;
      onProgress({
        configId: item.configId,
        result: {
          status: 'fail', successCount: 0,
          failCount: item.attempts ?? ATTEMPTS_PER_CONFIG,
          timeoutCount: item.attempts ?? ATTEMPTS_PER_CONFIG,
          attemptsCount: item.attempts ?? ATTEMPTS_PER_CONFIG,
          examples: [], avgMs: 0,
          errorMessage: `Worker boot timed out after ${BOOT_TIMEOUT}ms`,
        },
      });
      spawnNext();
    }, BOOT_TIMEOUT);

    worker.onmessage = ({ data }) => {
      if (data.type === 'progress') {
        clearTimeout(bootTimer);
        onProgress({ configId: data.configId, result: data.result });
      } else if (data.type === 'done' || data.type === 'cancelled') {
        worker.terminate();
        workers.delete(worker);
        running--;
        spawnNext();
      }
    };

    worker.onerror = (e) => {
      clearTimeout(bootTimer);
      worker.terminate();
      workers.delete(worker);
      running--;
      onProgress({
        configId: item.configId,
        result: {
          status: 'fail', successCount: 0,
          failCount: item.attempts ?? ATTEMPTS_PER_CONFIG,
          timeoutCount: 0,
          attemptsCount: item.attempts ?? ATTEMPTS_PER_CONFIG,
          examples: [], avgMs: 0,
          errorMessage: e.message ?? 'worker error',
        },
      });
      spawnNext();
    };

    worker.postMessage({ type: 'start', testItems: [item], attemptTimeoutMs: ATTEMPT_TIMEOUT });
  }

  const initial = Math.min(concurrency, testItems.length);
  for (let i = 0; i < initial; i++) spawnNext();

  return () => {
    cancelled = true;
    for (const w of workers) { try { w.postMessage({ type: 'cancel' }); w.terminate(); } catch {} }
    workers.clear();
  };
}

// ── Design tokens ─────────────────────────────────────────────────────────────

const STATUS = {
  pass:     { row: 'bg-emerald-50/40',  text: 'text-emerald-700', badge: 'bg-emerald-50 text-emerald-700 border border-emerald-200',  icon: CheckCircle2, dot: 'bg-emerald-500' },
  fail:     { row: 'bg-red-50/40',      text: 'text-red-700',     badge: 'bg-red-50 text-red-700 border border-red-200',              icon: XCircle,      dot: 'bg-red-500'     },
  untested: { row: '',                  text: 'text-slate-400',   badge: 'bg-slate-50 text-slate-400 border border-slate-200',        icon: Circle,       dot: 'bg-slate-300'   },
  running:  { row: 'bg-amber-50/30',    text: 'text-amber-700',   badge: 'bg-amber-50 text-amber-700 border border-amber-200',        icon: Loader2,      dot: 'bg-amber-400'   },
};

// ── Filter definitions ────────────────────────────────────────────────────────

/**
 * Build all unique filter option values from TEST_CONFIGS.
 */
function buildFilterOptions() {
  const tileCounts = [...new Set(TEST_CONFIGS.map(tc => tc.cfg.totalTile))].sort((a, b) => a - b);
  const modes      = [...new Set(TEST_CONFIGS.map(tc => tc.cfg.mode))].sort();
  const algorithms = [...new Set(TEST_CONFIGS.map(tc => tc.cfg.algorithm ?? 'default'))].sort();
  const categories = CATEGORY_ORDER.filter(cat => TEST_CONFIGS.some(tc => tc.category === cat));
  return { tileCounts, modes, algorithms, categories };
}

const FILTER_OPTIONS = buildFilterOptions();

// Default (empty) filter state
const DEFAULT_FILTERS = {
  status:     'all',        // 'all' | 'pass' | 'fail' | 'untested'
  tiles:      [],           // number[] — empty = any
  categories: [],           // string[] — empty = any
  modes:      [],           // string[] — empty = any
  algorithms: [],           // string[] — empty = any
  hasSpec:    null,         // null | true | false
  hasHeavy:   null,         // null | true | false
  hasEqual:   null,         // null | true | false
  search:     '',           // free-text on label / description / id
};

function applyFilters(configs, results, filters) {
  return configs.filter(tc => {
    const res = results[tc.id];

    // Status
    if (filters.status !== 'all') {
      const s = res?.status ?? 'untested';
      if (s !== filters.status) return false;
    }

    // Tile count
    if (filters.tiles.length && !filters.tiles.includes(tc.cfg.totalTile)) return false;

    // Category
    if (filters.categories.length && !filters.categories.includes(tc.category)) return false;

    // Mode
    if (filters.modes.length && !filters.modes.includes(tc.cfg.mode)) return false;

    // Algorithm
    if (filters.algorithms.length) {
      const algo = tc.cfg.algorithm ?? 'default';
      if (!filters.algorithms.includes(algo)) return false;
    }

    // Has operator spec
    if (filters.hasSpec === true  && !tc.cfg.operatorSpec) return false;
    if (filters.hasSpec === false &&  tc.cfg.operatorSpec) return false;

    // Has heavy tiles
    if (filters.hasHeavy === true  && !tc.cfg.heavyCount) return false;
    if (filters.hasHeavy === false &&  tc.cfg.heavyCount) return false;

    // Has equal count constraint
    if (filters.hasEqual === true  && !tc.cfg.equalCount) return false;
    if (filters.hasEqual === false &&  tc.cfg.equalCount) return false;

    // Free-text search
    if (filters.search) {
      const q = filters.search.toLowerCase();
      const hay = `${tc.id} ${tc.label} ${tc.description}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }

    return true;
  });
}

function activeFilterCount(filters) {
  let n = 0;
  if (filters.status !== 'all')    n++;
  if (filters.tiles.length)        n += filters.tiles.length;
  if (filters.categories.length)   n += filters.categories.length;
  if (filters.modes.length)        n += filters.modes.length;
  if (filters.algorithms.length)   n += filters.algorithms.length;
  if (filters.hasSpec  !== null)   n++;
  if (filters.hasHeavy !== null)   n++;
  if (filters.hasEqual !== null)   n++;
  if (filters.search)              n++;
  return n;
}

// ── Small primitives ──────────────────────────────────────────────────────────

function Tag({ text }) {
  return (
    <span className="inline-block font-mono text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 border border-slate-200 leading-none">
      {text}
    </span>
  );
}

function StatusBadge({ status, running }) {
  const s     = running ? STATUS.running : (STATUS[status] ?? STATUS.untested);
  const Icon  = s.icon;
  const label = running ? 'running' : status === 'untested' ? 'untested' : status;
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full ${s.badge}`}>
      <Icon className={`w-3 h-3 ${running ? 'animate-spin' : ''}`} />
      {label}
    </span>
  );
}

function TriCheckbox({ state, onChange, className = '' }) {
  return (
    <button
      className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors ${
        state === 'all'  ? 'bg-slate-700 border-slate-700' :
        state === 'some' ? 'bg-slate-200 border-slate-400' :
                           'bg-white border-slate-300 hover:border-slate-500'
      } ${className}`}
      onClick={onChange}
      aria-label="toggle selection"
    >
      {state === 'all'  && <CheckSquare className="w-3 h-3 text-white" strokeWidth={3} />}
      {state === 'some' && <Minus       className="w-3 h-3 text-slate-600" strokeWidth={3} />}
    </button>
  );
}

// ── Config description renderer ───────────────────────────────────────────────

/**
 * Renders a human-readable breakdown of what a config tests.
 * Groups constraints into semantic sections.
 */
function ConfigSpec({ tc }) {
  const { cfg } = tc;

  const pills = [];

  // Mode
  const modeColor = { cross: 'bg-blue-50 text-blue-700 border-blue-200', plain: 'bg-emerald-50 text-emerald-700 border-emerald-200', expand: 'bg-violet-50 text-violet-700 border-violet-200' };
  pills.push(
    <span key="mode" className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded border ${modeColor[cfg.mode] ?? 'bg-slate-50 text-slate-600 border-slate-200'}`}>
      <Layers className="w-2.5 h-2.5" /> {cfg.mode}
    </span>
  );

  // Algorithm
  if (cfg.algorithm) {
    pills.push(
      <span key="algo" className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded border bg-indigo-50 text-indigo-700 border-indigo-200">
        <Cpu className="w-2.5 h-2.5" /> {cfg.algorithm}
      </span>
    );
  }

  // Tile count
  pills.push(
    <span key="tiles" className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded border bg-slate-50 text-slate-700 border-slate-200">
      <Hash className="w-2.5 h-2.5" /> {cfg.totalTile} tiles
    </span>
  );

  // Operator count
  if (cfg.operatorCount) {
    const [lo, hi] = cfg.operatorCount;
    const label = lo === hi ? `ops = ${lo}` : `ops ${lo}–${hi}`;
    pills.push(
      <span key="opcount" className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded border bg-amber-50 text-amber-700 border-amber-200">
        {label}
      </span>
    );
  }

  // Operator spec
  if (cfg.operatorSpec) {
    const entries = Object.entries(cfg.operatorSpec).map(([op, r]) => {
      const [lo, hi] = Array.isArray(r) ? r : [r, r];
      return lo === hi ? `${op}×${lo}` : `${op}×${lo}–${hi}`;
    });
    entries.forEach((e, i) => pills.push(
      <span key={`spec-${i}`} className="inline-flex items-center text-[10px] font-mono font-semibold px-2 py-0.5 rounded border bg-orange-50 text-orange-700 border-orange-200">
        {e}
      </span>
    ));
  }

  // Heavy count
  if (cfg.heavyCount) {
    const [lo, hi] = cfg.heavyCount;
    pills.push(
      <span key="heavy" className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded border bg-stone-100 text-stone-600 border-stone-300">
        heavy {lo === hi ? `= ${lo}` : `${lo}–${hi}`}
      </span>
    );
  }

  // Equal count
  if (cfg.equalCount) {
    const [lo, hi] = cfg.equalCount;
    pills.push(
      <span key="eq" className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded border bg-teal-50 text-teal-700 border-teal-200">
        = signs {lo === hi ? `= ${lo}` : `${lo}–${hi}`}
      </span>
    );
  }

  return <div className="flex flex-wrap gap-1.5">{pills}</div>;
}

// ── Summary bar ───────────────────────────────────────────────────────────────

function SummaryBar({ results, selected, visibleCount }) {
  const total    = TEST_CONFIGS.length;
  const pass     = TEST_CONFIGS.filter(tc => results[tc.id]?.status === 'pass').length;
  const fail     = TEST_CONFIGS.filter(tc => results[tc.id]?.status === 'fail').length;
  const untested = total - pass - fail;

  const stats = [
    { label: 'Pass',     value: pass,          sub: `of ${total}`, color: 'text-emerald-700', bg: 'bg-emerald-50', border: 'border-emerald-200', icon: CheckCircle2 },
    { label: 'Fail',     value: fail,          sub: `of ${total}`, color: 'text-red-600',     bg: 'bg-red-50',     border: 'border-red-200',     icon: XCircle      },
    { label: 'Untested', value: untested,      sub: `of ${total}`, color: 'text-slate-500',   bg: 'bg-slate-50',   border: 'border-slate-200',   icon: Circle       },
    { label: 'Visible',  value: visibleCount,  sub: `of ${total}`, color: 'text-slate-600',   bg: 'bg-slate-50',   border: 'border-slate-200',   icon: Filter       },
    { label: 'Selected', value: selected.size, sub: `of ${total}`, color: 'text-slate-700',   bg: 'bg-slate-100',  border: 'border-slate-300',   icon: CheckSquare  },
  ];

  return (
    <div className="grid grid-cols-5 gap-2 mb-4">
      {stats.map(s => (
        <div key={s.label} className={`rounded-lg border ${s.border} ${s.bg} px-3 py-2.5 flex items-center gap-2`}>
          <s.icon className={`w-3.5 h-3.5 ${s.color} shrink-0`} />
          <div>
            <p className={`text-base font-bold leading-none ${s.color}`}>{s.value}</p>
            <p className="text-[10px] text-slate-400 mt-0.5">{s.label}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Progress banner ───────────────────────────────────────────────────────────

function ProgressBanner({ progress, paused, onPause, onResume, onStop }) {
  const pct = progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;
  return (
    <div className="border border-slate-200 rounded-lg p-3 mb-4 flex items-center gap-3 bg-white">
      {paused
        ? <Pause  className="w-4 h-4 text-slate-400 shrink-0" />
        : <Loader2 className="w-4 h-4 text-slate-500 animate-spin shrink-0" />}
      <div className="flex-1 min-w-0">
        <div className="flex justify-between mb-1">
          <p className="text-xs font-medium text-slate-600">
            {paused ? 'Paused' : `Testing — ${pct}% complete`}
          </p>
          <p className="text-xs text-slate-400 shrink-0 ml-2 font-mono">{progress.done} / {progress.total}</p>
        </div>
        <div className="h-1 bg-slate-100 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-300 ${paused ? 'bg-slate-300' : 'bg-slate-600'}`}
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
      <div className="flex gap-1 shrink-0">
        {paused
          ? <Button size="sm" variant="ghost" className="h-7 px-2 text-slate-600 hover:bg-slate-100" onClick={onResume}><Play className="w-3.5 h-3.5" /></Button>
          : <Button size="sm" variant="ghost" className="h-7 px-2 text-slate-600 hover:bg-slate-100" onClick={onPause}><Pause className="w-3.5 h-3.5" /></Button>
        }
        <Button size="sm" variant="ghost" className="h-7 px-2 text-red-400 hover:bg-red-50" onClick={onStop}><Square className="w-3.5 h-3.5" /></Button>
      </div>
    </div>
  );
}

// ── Advanced filter panel ─────────────────────────────────────────────────────

function FilterPanel({ filters, onChange, onReset, totalVisible }) {
  const toggle = (key, value) => {
    onChange(prev => {
      const arr = prev[key];
      return { ...prev, [key]: arr.includes(value) ? arr.filter(x => x !== value) : [...arr, value] };
    });
  };

  const setTriState = (key, value) => {
    onChange(prev => ({ ...prev, [key]: prev[key] === value ? null : value }));
  };

  const ToggleBtn = ({ active, onClick, children }) => (
    <button
      onClick={onClick}
      className={`text-[11px] font-medium px-2.5 py-1 rounded-md border transition-colors ${
        active
          ? 'bg-slate-700 border-slate-700 text-white'
          : 'bg-white border-slate-200 text-slate-600 hover:border-slate-400'
      }`}
    >
      {children}
    </button>
  );

  const TriBtn = ({ stateKey, value, label }) => {
    const current = filters[stateKey];
    const active  = current === value;
    return (
      <ToggleBtn active={active} onClick={() => setTriState(stateKey, value)}>
        {label}
      </ToggleBtn>
    );
  };

  return (
    <div className="border border-slate-200 rounded-lg bg-white mb-4 divide-y divide-slate-100">

      {/* Row: Status */}
      <div className="px-4 py-3 flex items-start gap-4">
        <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide w-28 pt-0.5 shrink-0">Result</p>
        <div className="flex flex-wrap gap-1.5">
          {['all', 'pass', 'fail', 'untested'].map(s => (
            <ToggleBtn key={s} active={filters.status === s} onClick={() => onChange(p => ({ ...p, status: s }))}>
              {s === 'all' ? 'All statuses' : s.charAt(0).toUpperCase() + s.slice(1)}
            </ToggleBtn>
          ))}
        </div>
      </div>

      {/* Row: Tile count */}
      <div className="px-4 py-3 flex items-start gap-4">
        <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide w-28 pt-0.5 shrink-0">Tile count</p>
        <div className="flex flex-wrap gap-1.5">
          {FILTER_OPTIONS.tileCounts.map(t => (
            <ToggleBtn key={t} active={filters.tiles.includes(t)} onClick={() => toggle('tiles', t)}>
              {t} tiles
            </ToggleBtn>
          ))}
        </div>
      </div>

      {/* Row: Category */}
      <div className="px-4 py-3 flex items-start gap-4">
        <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide w-28 pt-0.5 shrink-0">Category</p>
        <div className="flex flex-wrap gap-1.5">
          {FILTER_OPTIONS.categories.map(cat => (
            <ToggleBtn key={cat} active={filters.categories.includes(cat)} onClick={() => toggle('categories', cat)}>
              {CATEGORY_META[cat]?.label ?? cat}
            </ToggleBtn>
          ))}
        </div>
      </div>

      {/* Row: Mode + Algorithm */}
      <div className="px-4 py-3 flex items-start gap-4">
        <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide w-28 pt-0.5 shrink-0">Mode</p>
        <div className="flex flex-wrap gap-1.5">
          {FILTER_OPTIONS.modes.map(m => (
            <ToggleBtn key={m} active={filters.modes.includes(m)} onClick={() => toggle('modes', m)}>{m}</ToggleBtn>
          ))}
          {FILTER_OPTIONS.algorithms.length > 1 && (
            <>
              <span className="w-px bg-slate-200 mx-1 self-stretch" />
              {FILTER_OPTIONS.algorithms.map(a => (
                <ToggleBtn key={a} active={filters.algorithms.includes(a)} onClick={() => toggle('algorithms', a)}>
                  {a === 'default' ? 'default algo' : a}
                </ToggleBtn>
              ))}
            </>
          )}
        </div>
      </div>

      {/* Row: Constraint toggles */}
      <div className="px-4 py-3 flex items-start gap-4">
        <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide w-28 pt-0.5 shrink-0">Constraints</p>
        <div className="flex flex-wrap gap-3">
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] text-slate-500">Operator spec</span>
            <TriBtn stateKey="hasSpec"  value={true}  label="yes" />
            <TriBtn stateKey="hasSpec"  value={false} label="no"  />
          </div>
          <span className="w-px bg-slate-200 self-stretch" />
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] text-slate-500">Heavy tiles</span>
            <TriBtn stateKey="hasHeavy" value={true}  label="yes" />
            <TriBtn stateKey="hasHeavy" value={false} label="no"  />
          </div>
          <span className="w-px bg-slate-200 self-stretch" />
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] text-slate-500">Equal count</span>
            <TriBtn stateKey="hasEqual" value={true}  label="yes" />
            <TriBtn stateKey="hasEqual" value={false} label="no"  />
          </div>
        </div>
      </div>

      {/* Row: Search */}
      <div className="px-4 py-3 flex items-start gap-4">
        <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide w-28 pt-0.5 shrink-0">Search</p>
        <div className="flex-1 flex items-center gap-2">
          <input
            type="text"
            value={filters.search}
            onChange={e => onChange(p => ({ ...p, search: e.target.value }))}
            placeholder="Search by id, label, or description…"
            className="w-full max-w-sm text-xs border border-slate-200 rounded-md px-3 py-1.5 text-slate-700 placeholder:text-slate-300 focus:outline-none focus:border-slate-400 bg-white"
          />
          {filters.search && (
            <button onClick={() => onChange(p => ({ ...p, search: '' }))} className="text-slate-300 hover:text-slate-500">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
          <span className="text-[11px] text-slate-400 ml-1">{totalVisible} visible</span>
        </div>
      </div>
    </div>
  );
}

// ── Examples panel ────────────────────────────────────────────────────────────

function ExamplesPanel({ examples, errorMessage, status, timeoutCount, successCount, attemptsCount, avgMs }) {
  if (status === 'fail') {
    return (
      <div className="mt-2 space-y-1.5">
        {timeoutCount > 0 && (
          <div className="flex items-center gap-1.5 text-[11px] text-amber-600">
            <Clock className="w-3 h-3" />
            {timeoutCount} attempt(s) timed out (of {attemptsCount})
          </div>
        )}
        {errorMessage && (
          <div className="bg-red-50 border border-red-100 rounded-md p-2.5">
            <p className="text-[11px] font-semibold text-red-600 mb-1 flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" /> Error
            </p>
            <p className="text-[11px] font-mono text-red-700 break-all">{errorMessage}</p>
          </div>
        )}
        {successCount === 0 && !errorMessage && !timeoutCount && (
          <p className="text-[11px] text-slate-400">All {attemptsCount} attempts failed — config may be infeasible.</p>
        )}
      </div>
    );
  }
  if (!examples?.length) return null;
  return (
    <div className="mt-2">
      <div className="flex items-center gap-2 mb-1.5">
        <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">
          Sample equations ({examples.length})
        </p>
        {avgMs > 0 && (
          <span className="text-[10px] text-slate-300 font-mono">avg {avgMs.toFixed(0)}ms</span>
        )}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {examples.map((eq, i) => (
          <span key={i} className="font-mono text-[11px] bg-slate-50 border border-slate-200 text-slate-700 px-2 py-0.5 rounded">
            {eq}
          </span>
        ))}
      </div>
    </div>
  );
}

// ── Config row ────────────────────────────────────────────────────────────────

function ConfigRow({ tc, result, running, expanded, selected, onToggle, onSelect, onRetestOne }) {
  const status = result?.status ?? 'untested';
  const style  = running ? STATUS.running : (STATUS[status] ?? STATUS.untested);
  const rate   = result ? `${result.successCount}/${result.attemptsCount}` : '—';

  return (
    <>
      <tr className={`${style.row} border-b border-slate-100 hover:bg-slate-50/60 transition-colors`}>
        {/* Checkbox */}
        <td className="px-2 py-2.5 w-8" onClick={e => e.stopPropagation()}>
          <input
            type="checkbox"
            checked={selected}
            onChange={() => onSelect(tc.id)}
            className="w-3.5 h-3.5 rounded accent-slate-600 cursor-pointer"
          />
        </td>

        {/* Expand toggle */}
        <td className="px-1 py-2.5 w-6 cursor-pointer" onClick={onToggle}>
          {expanded
            ? <ChevronDown  className="w-3.5 h-3.5 text-slate-400" />
            : <ChevronRight className="w-3.5 h-3.5 text-slate-300" />}
        </td>

        {/* Status */}
        <td className="px-3 py-2.5 cursor-pointer w-24" onClick={onToggle}>
          <StatusBadge status={status} running={running} />
        </td>

        {/* Label */}
        <td className="px-3 py-2.5 cursor-pointer" onClick={onToggle}>
          <span className="text-xs font-medium text-slate-700">{tc.label}</span>
        </td>

        {/* Spec pills (compact) */}
        <td className="px-3 py-2.5 cursor-pointer" onClick={onToggle}>
          <div className="flex flex-wrap gap-1">
            {cfgTags(tc).map(t => <Tag key={t} text={t} />)}
          </div>
        </td>

        {/* Pass rate */}
        <td className="px-3 py-2.5 text-right cursor-pointer w-20" onClick={onToggle}>
          <span className={`text-xs font-mono font-semibold ${
            status === 'pass' ? 'text-emerald-600' : status === 'fail' ? 'text-red-500' : 'text-slate-300'
          }`}>{rate}</span>
        </td>

        {/* Retest button */}
        <td className="px-3 py-2.5 text-right w-10">
          <Button
            size="sm" variant="ghost" disabled={running}
            onClick={e => { e.stopPropagation(); onRetestOne(tc.id); }}
            className="h-6 w-6 p-0 text-slate-300 hover:text-slate-600 hover:bg-slate-100"
            title="Re-run this config"
          >
            <RefreshCw className="w-3 h-3" />
          </Button>
        </td>
      </tr>

      {expanded && (
        <tr className={`${style.row} border-b border-slate-100`}>
          <td colSpan={7} className="px-5 pb-3 pt-1">
            {/* Full config spec breakdown */}
            <ConfigSpec tc={tc} />
            <p className="text-[11px] text-slate-400 mt-1.5 mb-2">{tc.description}</p>
            <ExamplesPanel
              examples={result?.examples}
              errorMessage={result?.errorMessage}
              timeoutCount={result?.timeoutCount ?? 0}
              successCount={result?.successCount ?? 0}
              attemptsCount={result?.attemptsCount ?? ATTEMPTS_PER_CONFIG}
              avgMs={result?.avgMs ?? 0}
              status={status}
            />
          </td>
        </tr>
      )}
    </>
  );
}

// ── Category section ──────────────────────────────────────────────────────────

function CategorySection({
  catKey, configs, results, runningIds, expandedId,
  selected, onToggle, onSelect, onSelectCategory, onRetestOne,
}) {
  const meta     = CATEGORY_META[catKey] ?? { label: catKey, color: 'text-slate-600', bg: 'bg-slate-50' };
  const passing  = configs.filter(tc => results[tc.id]?.status === 'pass').length;
  const failing  = configs.filter(tc => results[tc.id]?.status === 'fail').length;
  const tested   = passing + failing;
  const selCount = configs.filter(tc => selected.has(tc.id)).length;
  const selState = selCount === 0 ? 'none' : selCount === configs.length ? 'all' : 'some';
  const [collapsed, setCollapsed] = useState(false);

  const passRate = tested > 0 ? Math.round((passing / tested) * 100) : null;

  return (
    <Card className="border border-slate-200 shadow-none overflow-hidden mb-2">
      <div className="px-4 py-2.5 flex items-center gap-2.5 bg-slate-50 border-b border-slate-200">
        <TriCheckbox state={selState} onChange={() => onSelectCategory(catKey)} />
        <button onClick={() => setCollapsed(c => !c)} className="flex-1 flex items-center gap-2 text-left min-w-0">
          {collapsed
            ? <ChevronRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            : <ChevronDown  className="w-3.5 h-3.5 text-slate-400 shrink-0" />}
          <p className="text-xs font-semibold text-slate-700 truncate">{meta.label}</p>
        </button>
        <div className="flex items-center gap-3 shrink-0">
          {tested > 0 && (
            <div className="flex items-center gap-1.5">
              <div className="w-20 h-1 bg-slate-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-emerald-500 rounded-full transition-all"
                  style={{ width: `${passRate}%` }}
                />
              </div>
              <span className="text-[10px] text-slate-400 font-mono w-14 text-right">{passing}/{tested} pass</span>
            </div>
          )}
          <span className="text-[10px] text-slate-400 font-mono">{configs.length} configs</span>
          {selCount > 0 && (
            <span className="text-[10px] font-semibold text-slate-600">{selCount} sel</span>
          )}
        </div>
      </div>

      {!collapsed && (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="text-[10px] text-slate-400 uppercase tracking-wide border-b border-slate-100 bg-white">
                <th className="px-2 py-2 w-8" />
                <th className="px-1 py-2 w-6" />
                <th className="px-3 py-2 text-left w-24">Status</th>
                <th className="px-3 py-2 text-left">Config label</th>
                <th className="px-3 py-2 text-left">Tags</th>
                <th className="px-3 py-2 text-right w-20">Pass rate</th>
                <th className="px-3 py-2 w-10" />
              </tr>
            </thead>
            <tbody>
              {configs.map(tc => (
                <ConfigRow
                  key={tc.id}
                  tc={tc}
                  result={results[tc.id]}
                  running={runningIds.has(tc.id)}
                  expanded={expandedId === tc.id}
                  selected={selected.has(tc.id)}
                  onToggle={() => onToggle(tc.id)}
                  onSelect={onSelect}
                  onRetestOne={onRetestOne}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
//  Main component
// ══════════════════════════════════════════════════════════════════════════════

// 'as-defined' keeps each config's own algorithm; 'pattern' / 'backtrack' overrides all
const ALGO_OVERRIDES = [
  { value: 'as-defined', label: 'As defined' },
  { value: 'pattern',    label: 'Pattern'    },
  { value: 'backtrack',  label: 'Backtrack'  },
];

function applyAlgoOverride(cfg, override) {
  if (override === 'as-defined') return cfg;
  const next = { ...cfg };
  if (override === 'backtrack') next.algorithm = 'backtrack';
  else delete next.algorithm;
  return next;
}

export function ConfigTestDashboard() {
  const [results,      setResults]      = useState({});
  const [progress,     setProgress]     = useState(null);
  const [runningIds,   setRunningIds]   = useState(new Set());
  const [isRunning,    setIsRunning]    = useState(false);
  const [paused,       setPaused]       = useState(false);
  const [expandedId,   setExpandedId]   = useState(null);
  const [selected,     setSelected]     = useState(new Set());
  const [saveState,    setSaveState]    = useState('idle');
  const [filters,      setFilters]      = useState(DEFAULT_FILTERS);
  const [showFilter,   setShowFilter]   = useState(false);
  const [algoOverride,     setAlgoOverride]     = useState('as-defined');
  const [tileSets,         setTileSets]         = useState([]);  // from API
  const [selectedTileSetId, setSelectedTileSetId] = useState(null); // null = default pool

  const cancelRef     = useRef(null);
  const pauseRef      = useRef(false);
  const doneCount     = useRef(0);
  const totalCount    = useRef(0);
  const latestResults = useRef({});

  useEffect(() => { latestResults.current = results; }, [results]);

  // ── Load ──────────────────────────────────────────────────────────
  useEffect(() => {
    api.configTests.getAll()
      .then(({ results: saved }) => {
        const map = {};
        for (const r of saved) map[r.configId] = r;
        setResults(map);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    api.tileSets.list()
      .then(res => setTileSets(res.tileSets ?? []))
      .catch(() => {});
  }, []);

  // ── Save ──────────────────────────────────────────────────────────
  const saveToDb = useCallback(async (resultsMap) => {
    setSaveState('saving');
    try {
      const payload = TEST_CONFIGS
        .filter(tc => resultsMap[tc.id])
        .map(tc => ({
          configId: tc.id, configLabel: tc.label, configCategory: tc.category,
          configSpec: tc.cfg, mode: tc.cfg.mode, totalTile: tc.cfg.totalTile,
          ...resultsMap[tc.id],
        }));
      await api.configTests.saveBatch(payload);
      setSaveState('saved');
      setTimeout(() => setSaveState('idle'), 2000);
      toast.success(`Saved ${payload.length} results`);
    } catch (err) {
      setSaveState('idle');
      toast.error(err.message || 'Save failed');
    }
  }, []);

  // ── Run core ──────────────────────────────────────────────────────
  const runItems = useCallback((testItems) => {
    if (!testItems.length) return;
    doneCount.current  = 0;
    totalCount.current = testItems.length;
    pauseRef.current   = false;
    setIsRunning(true);
    setProgress({ done: 0, total: testItems.length });
    setRunningIds(new Set(testItems.map(i => i.configId)));

    cancelRef.current = runWithConcurrency(testItems, {
      concurrency: CONCURRENCY,
      onProgress: ({ configId, result }) => {
        doneCount.current++;
        setProgress({ done: doneCount.current, total: totalCount.current });
        setRunningIds(prev => { const n = new Set(prev); n.delete(configId); return n; });
        setResults(prev => {
          const next = { ...prev, [configId]: result };
          latestResults.current = next;
          return next;
        });
      },
      onDone: async () => {
        setIsRunning(false); setPaused(false);
        setProgress(null); setRunningIds(new Set());
        cancelRef.current = null;
        await saveToDb(latestResults.current);
      },
    });
  }, [saveToDb]);

  // ── Actions ───────────────────────────────────────────────────────
  const toItem = useCallback((tc) => {
    let cfg = applyAlgoOverride(tc.cfg, algoOverride);
    const activeSet = selectedTileSetId
      ? tileSets.find(ts => ts.id === selectedTileSetId)
      : null;
    if (activeSet?.tiles) cfg = { ...cfg, poolDef: activeSet.tiles };
    else { cfg = { ...cfg }; delete cfg.poolDef; }
    return { configId: tc.id, configSpec: cfg, attempts: ATTEMPTS_PER_CONFIG };
  }, [algoOverride, selectedTileSetId, tileSets]);

  const handleRunAll = useCallback(() => {
    cancelRef.current?.();
    runItems(TEST_CONFIGS.map(toItem));
  }, [runItems, toItem]);

  const handleRunSelected = useCallback(() => {
    if (!selected.size) return;
    cancelRef.current?.();
    runItems(TEST_CONFIGS.filter(tc => selected.has(tc.id)).map(toItem));
  }, [selected, runItems, toItem]);

  const handleRunFiltered = useCallback((visibleConfigs) => {
    if (!visibleConfigs.length) return;
    cancelRef.current?.();
    runItems(visibleConfigs.map(toItem));
  }, [runItems, toItem]);

  const handleRetestOne = useCallback((configId) => {
    const tc = TEST_CONFIGS.find(t => t.id === configId);
    if (!tc) return;
    setRunningIds(prev => new Set([...prev, configId]));
    runWithConcurrency([toItem(tc)], {
      concurrency: 1,
      onProgress: ({ result }) => {
        setResults(prev => ({ ...prev, [configId]: result }));
        setRunningIds(prev => { const n = new Set(prev); n.delete(configId); return n; });
      },
      onDone: async () => { await saveToDb(latestResults.current); },
    });
  }, [saveToDb, toItem]);

  const handleStop = useCallback(() => {
    cancelRef.current?.(); cancelRef.current = null;
    setIsRunning(false); setPaused(false); setProgress(null); setRunningIds(new Set());
  }, []);

  const handlePause = useCallback(() => {
    setPaused(true); pauseRef.current = true;
    cancelRef.current?.(); cancelRef.current = null;
    setIsRunning(false); setRunningIds(new Set());
  }, []);

  const handleResume = useCallback(() => {
    const untested = TEST_CONFIGS.filter(tc => !latestResults.current[tc.id] || latestResults.current[tc.id].status === 'untested');
    if (!untested.length) { setPaused(false); setProgress(null); return; }
    setPaused(false);
    runItems(untested.map(toItem));
  }, [runItems, toItem]);

  // ── Selection ─────────────────────────────────────────────────────
  const handleSelect = useCallback((id) => {
    setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }, []);

  const handleSelectCategory = useCallback((catKey) => {
    const byCategory = getConfigsByCategory();
    const catIds = (byCategory[catKey] ?? []).map(tc => tc.id);
    setSelected(prev => {
      const n = new Set(prev);
      const allSel = catIds.every(id => n.has(id));
      catIds.forEach(id => allSel ? n.delete(id) : n.add(id));
      return n;
    });
  }, []);

  const handleSelectAll = useCallback(() => {
    setSelected(prev => prev.size === TEST_CONFIGS.length ? new Set() : new Set(TEST_CONFIGS.map(tc => tc.id)));
  }, []);

  // ── Derived ───────────────────────────────────────────────────────
  const byCategory = useMemo(() => getConfigsByCategory(), []);

  const filteredByCategory = useMemo(() => {
    const out = {};
    for (const cat of CATEGORY_ORDER) {
      out[cat] = applyFilters(byCategory[cat] ?? [], results, filters);
    }
    return out;
  }, [byCategory, results, filters]);

  const visibleConfigs = useMemo(
    () => CATEGORY_ORDER.flatMap(cat => filteredByCategory[cat] ?? []),
    [filteredByCategory],
  );

  const selState    = selected.size === 0 ? 'none' : selected.size === TEST_CONFIGS.length ? 'all' : 'some';
  const anyRunning  = isRunning || runningIds.size > 0;
  const filterCount = activeFilterCount(filters);
  const saveLabel   = saveState === 'saving' ? 'Saving…' : saveState === 'saved' ? 'Saved ✓' : 'Save';

  return (
    <div className="space-y-3">

      {/* ── Toolbar ── */}
      <div className="flex flex-wrap items-center gap-2">
        <TriCheckbox state={selState} onChange={handleSelectAll} />

        <Button
          size="sm"
          className="bg-slate-800 hover:bg-slate-700 text-white gap-1.5 text-xs h-8"
          disabled={anyRunning}
          onClick={handleRunAll}
        >
          {isRunning ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
          {isRunning ? 'Running…' : `Run all (${TEST_CONFIGS.length})`}
        </Button>

        {selected.size > 0 && (
          <Button
            size="sm"
            className="bg-slate-600 hover:bg-slate-500 text-white gap-1.5 text-xs h-8"
            disabled={anyRunning}
            onClick={handleRunSelected}
          >
            <Play className="w-3.5 h-3.5" />
            Run selected ({selected.size})
          </Button>
        )}

        {filterCount > 0 && visibleConfigs.length > 0 && (
          <Button
            size="sm"
            variant="outline"
            className="border-slate-300 text-slate-600 gap-1.5 text-xs h-8 hover:bg-slate-50"
            disabled={anyRunning}
            onClick={() => handleRunFiltered(visibleConfigs)}
          >
            <Play className="w-3.5 h-3.5" />
            Run filtered ({visibleConfigs.length})
          </Button>
        )}

        <Button
          size="sm" variant="outline"
          className="border-slate-200 text-slate-500 gap-1.5 text-xs h-8"
          disabled={anyRunning || saveState !== 'idle'}
          onClick={() => saveToDb(results)}
        >
          <Save className="w-3.5 h-3.5" />
          {saveLabel}
        </Button>

        <Button
          size="sm" variant="outline"
          className="border-slate-200 text-red-400 hover:bg-red-50 hover:border-red-200 gap-1.5 text-xs h-8"
          disabled={anyRunning}
          onClick={async () => {
            if (!confirm('Clear all test results from DB?')) return;
            try { await api.configTests.clearAll(); setResults({}); toast.success('Results cleared'); }
            catch (err) { toast.error(err.message || 'Clear failed'); }
          }}
        >
          <Trash2 className="w-3.5 h-3.5" />
          Clear
        </Button>

        {/* Algorithm override */}
        <div className="flex items-center gap-1 rounded-md border border-slate-200 bg-white p-0.5 text-xs">
          <Cpu className="w-3.5 h-3.5 text-slate-400 ml-1.5" />
          {ALGO_OVERRIDES.map(({ value, label }) => (
            <button
              key={value}
              onClick={() => setAlgoOverride(value)}
              className={`px-2 py-1 rounded transition-colors leading-none ${
                algoOverride === value
                  ? 'bg-slate-800 text-white font-medium'
                  : 'text-slate-500 hover:text-slate-800 hover:bg-slate-100'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Tile bag selector */}
        {tileSets.length > 0 && (
          <select
            value={selectedTileSetId ?? ''}
            onChange={e => setSelectedTileSetId(e.target.value || null)}
            className="text-xs h-8 rounded-md border border-slate-200 bg-white px-2 text-slate-600 focus:outline-none focus:border-slate-400"
          >
            <option value="">Default tile bag</option>
            {tileSets.map(ts => (
              <option key={ts.id} value={ts.id}>{ts.name}</option>
            ))}
          </select>
        )}

        {/* Filter toggle */}
        <button
          onClick={() => setShowFilter(f => !f)}
          className={`ml-auto flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md border transition-colors ${
            showFilter || filterCount > 0
              ? 'bg-slate-800 border-slate-800 text-white'
              : 'bg-white border-slate-200 text-slate-500 hover:border-slate-400'
          }`}
        >
          <SlidersHorizontal className="w-3.5 h-3.5" />
          Filters
          {filterCount > 0 && (
            <span className="ml-0.5 bg-white/20 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none">
              {filterCount}
            </span>
          )}
          {filterCount > 0 && (
            <button
              onClick={e => { e.stopPropagation(); setFilters(DEFAULT_FILTERS); }}
              className="ml-1 text-white/60 hover:text-white"
              title="Reset filters"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </button>
      </div>

      {/* ── Filter panel ── */}
      {showFilter && (
        <FilterPanel
          filters={filters}
          onChange={setFilters}
          onReset={() => setFilters(DEFAULT_FILTERS)}
          totalVisible={visibleConfigs.length}
        />
      )}

      {/* ── Progress ── */}
      {(isRunning || paused) && progress && (
        <ProgressBanner
          progress={progress} paused={paused}
          onPause={handlePause} onResume={handleResume} onStop={handleStop}
        />
      )}

      {/* ── Summary ── */}
      <SummaryBar results={results} selected={selected} visibleCount={visibleConfigs.length} />

      {/* ── Tables ── */}
      {CATEGORY_ORDER.map(cat => {
        const configs = filteredByCategory[cat] ?? [];
        if (!configs.length) return null;
        return (
          <CategorySection
            key={cat} catKey={cat} configs={configs}
            results={results} runningIds={runningIds}
            expandedId={expandedId} selected={selected}
            onToggle={id => setExpandedId(prev => prev === id ? null : id)}
            onSelect={handleSelect}
            onSelectCategory={handleSelectCategory}
            onRetestOne={handleRetestOne}
          />
        );
      })}

      {!visibleConfigs.length && (
        <div className="text-center py-16 text-slate-300">
          <Filter className="w-8 h-8 mx-auto mb-3 opacity-40" />
          <p className="text-sm text-slate-400">No configs match the current filters</p>
          <button
            onClick={() => setFilters(DEFAULT_FILTERS)}
            className="mt-2 text-xs text-slate-400 underline hover:text-slate-600"
          >
            Reset filters
          </button>
        </div>
      )}
    </div>
  );
}