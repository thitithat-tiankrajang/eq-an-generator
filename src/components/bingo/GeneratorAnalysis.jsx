import { useCallback, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowDownUp,
  BarChart2,
  CheckCircle2,
  Gauge,
  Hash,
  ListOrdered,
  RefreshCw,
  Repeat2,
  Sigma,
  SlidersHorizontal,
  Sparkles,
  Target,
} from "lucide-react";
import { BingoConfig, DEFAULT_SETS } from "@/components/bingo/BingoConfig";
import { generateBatchAsync, buildCfgList } from "@/lib/generateBatch";
import {
  CORE_OPERATORS,
  TILE_CATEGORY_ORDER,
  analyzeGeneratedPuzzles,
  deriveAllowedOperatorsFromConfigs,
  formatPercent,
  qualityTone,
} from "@/lib/diversityAnalysis";

const OP_COLORS = {
  "+": "text-sky-600 bg-sky-50 border-sky-200",
  "-": "text-rose-600 bg-rose-50 border-rose-200",
  "×": "text-violet-600 bg-violet-50 border-violet-200",
  "÷": "text-amber-700 bg-amber-50 border-amber-200",
};

const OP_BAR_COLORS = {
  "+": "bg-sky-500",
  "-": "bg-rose-500",
  "×": "bg-violet-500",
  "÷": "bg-amber-500",
};

const TONE = {
  excellent: {
    label: "Excellent",
    text: "text-emerald-700",
    bg: "bg-emerald-50",
    border: "border-emerald-200",
  },
  good: {
    label: "Good",
    text: "text-teal-700",
    bg: "bg-teal-50",
    border: "border-teal-200",
  },
  watch: {
    label: "Watch",
    text: "text-amber-700",
    bg: "bg-amber-50",
    border: "border-amber-200",
  },
  risk: {
    label: "Risk",
    text: "text-rose-700",
    bg: "bg-rose-50",
    border: "border-rose-200",
  },
};

function selectedOperatorsFromState(state) {
  return CORE_OPERATORS.filter(operator => state[operator]);
}

function patternTokens(pattern) {
  return String(pattern).split("").map((ch, index) => {
    if (ch === "O") return { key: index, ch: "N", className: "text-slate-800 font-black" };
    if (ch === "=") return { key: index, ch, className: "text-slate-400" };
    if (ch === "+") return { key: index, ch, className: "text-sky-600" };
    if (ch === "-") return { key: index, ch, className: "text-rose-600" };
    if (ch === "×") return { key: index, ch, className: "text-violet-600" };
    if (ch === "÷") return { key: index, ch, className: "text-amber-700" };
    return { key: index, ch, className: "text-slate-500" };
  });
}

function ColoredPattern({ pattern }) {
  return (
    <span className="font-mono text-sm tracking-normal whitespace-nowrap">
      {patternTokens(pattern).map(token => (
        <span key={token.key} className={token.className}>{token.ch}</span>
      ))}
    </span>
  );
}

function pctWidth(value, max, min = 2) {
  if (!Number.isFinite(value) || !Number.isFinite(max) || max <= 0 || value <= 0) return 0;
  return Math.max(min, Math.min(100, (value / max) * 100));
}

function Panel(props) {
  const { title, icon: Icon, sub, children, action } = props;
  return (
    <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-slate-100 text-slate-600">
            <Icon className="h-4 w-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-900">{title}</h3>
            {sub && <p className="text-xs text-slate-500">{sub}</p>}
          </div>
        </div>
        {action}
      </div>
      <div className="p-4">
        {children}
      </div>
    </section>
  );
}

function MetricCard(props) {
  const { label, value, sub, icon: Icon, tone = "good" } = props;
  const style = TONE[tone] || TONE.good;
  return (
    <div className={`rounded-lg border ${style.border} ${style.bg} p-4`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className={`text-2xl font-black tabular-nums ${style.text}`}>{value}</p>
          <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
          {sub && <p className="mt-1 text-xs text-slate-500">{sub}</p>}
        </div>
        <Icon className={`h-5 w-5 ${style.text}`} />
      </div>
    </div>
  );
}

function QualityGauge({ score }) {
  const toneKey = qualityTone(score);
  const tone = TONE[toneKey];
  const degrees = Math.round(score * 360);

  return (
    <div className={`rounded-lg border ${tone.border} ${tone.bg} p-4`}>
      <div className="flex items-center gap-4">
        <div
          className="grid h-24 w-24 shrink-0 place-items-center rounded-full"
          style={{
            background: `conic-gradient(#0f766e ${degrees}deg, #e2e8f0 ${degrees}deg 360deg)`,
          }}
        >
          <div className="grid h-16 w-16 place-items-center rounded-full bg-white shadow-inner">
            <span className={`text-xl font-black ${tone.text}`}>{Math.round(score * 100)}</span>
          </div>
        </div>
        <div className="min-w-0">
          <p className={`text-lg font-black ${tone.text}`}>{tone.label} diversity</p>
          <p className="mt-1 text-sm text-slate-600">
            Composite score from pattern coverage, entropy, concentration, operator balance, and repeat-number health.
          </p>
        </div>
      </div>
    </div>
  );
}

function BarRow({ label, value, max, color = "bg-teal-500", suffix, detail }) {
  return (
    <div className="grid grid-cols-[minmax(4rem,7rem)_1fr_auto] items-center gap-3">
      <span className="truncate text-xs font-semibold text-slate-600">{label}</span>
      <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
        <div className={`${color} h-full rounded-full transition-all duration-200`} style={{ width: `${pctWidth(value, max)}%` }} />
      </div>
      <span className="w-16 text-right text-xs tabular-nums text-slate-500">{suffix ?? value}</span>
      {detail && <span className="col-start-2 col-end-4 -mt-1 text-xs text-slate-400">{detail}</span>}
    </div>
  );
}

function OperatorBaselineControls({ baseline, setBaseline, onSyncFromConfig }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Balance target</span>
      {CORE_OPERATORS.map(operator => (
        <button
          type="button"
          key={operator}
          onClick={() => setBaseline(prev => ({ ...prev, [operator]: !prev[operator] }))}
          className={`h-8 min-w-8 rounded-md border px-2 text-sm font-black transition ${
            baseline[operator]
              ? OP_COLORS[operator]
              : "border-slate-200 bg-white text-slate-300 hover:text-slate-500"
          }`}
          title={`Toggle ${operator} in balance target`}
        >
          {operator}
        </button>
      ))}
      <button
        type="button"
        onClick={onSyncFromConfig}
        className="inline-flex h-8 items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
      >
        <RefreshCw className="h-3.5 w-3.5" />
        Sync config
      </button>
    </div>
  );
}

function OperatorBalancePanel({ stats }) {
  const max = Math.max(...Object.values(stats.operatorBalance.counts), 1);
  return (
    <Panel
      title="Operator Balance"
      icon={Target}
      sub={`Expected about ${stats.operatorBalance.expected.toFixed(1)} each across ${stats.operatorBalance.operators.join(" ")}.`}
    >
      <div className="space-y-3">
        {stats.operatorBalance.operators.map(operator => {
          const count = stats.operatorBalance.counts[operator] || 0;
          const share = stats.operatorBalance.total > 0 ? count / stats.operatorBalance.total : 0;
          return (
            <BarRow
              key={operator}
              label={operator}
              value={count}
              max={max}
              color={OP_BAR_COLORS[operator]}
              suffix={`${formatPercent(share)} · ${count}`}
            />
          );
        })}
        <div className="rounded-md bg-slate-50 p-3 text-xs text-slate-600">
          Balance score <span className="font-black text-slate-900">{Math.round(stats.operatorBalance.score * 100)}</span>
          <span className="mx-2 text-slate-300">|</span>
          spread {formatPercent(stats.operatorBalance.spreadPct)}
          <span className="mx-2 text-slate-300">|</span>
          mean deviation {formatPercent(stats.operatorBalance.meanDeviationPct)}
        </div>
      </div>
    </Panel>
  );
}

function TileCategoryPanel({ stats }) {
  const max = Math.max(...Object.values(stats.tileCategoryMap), 1);
  const labels = {
    light: "Light numbers",
    heavy: "Heavy numbers",
    operator: "Operators",
    equal: "Equals",
    wild: "Wildcards",
    other: "Other",
  };
  const colors = {
    light: "bg-teal-500",
    heavy: "bg-indigo-500",
    operator: "bg-sky-500",
    equal: "bg-slate-400",
    wild: "bg-fuchsia-500",
    other: "bg-stone-400",
  };

  return (
    <Panel title="Tile Category Mix" icon={Sigma} sub={`${stats.totalTileTokens} generated tile tokens analyzed.`}>
      <div className="space-y-3">
        {TILE_CATEGORY_ORDER.map(category => {
          const count = stats.tileCategoryMap[category] || 0;
          const share = stats.totalTileTokens > 0 ? count / stats.totalTileTokens : 0;
          return (
            <BarRow
              key={category}
              label={labels[category]}
              value={count}
              max={max}
              color={colors[category]}
              suffix={`${formatPercent(share)} · ${count}`}
            />
          );
        })}
      </div>
    </Panel>
  );
}

function RepeatRiskPanel({ stats }) {
  const maxRepeat = Math.max(...Object.values(stats.repeatedNumberMap), 1);
  const repeatedEntries = Object.entries(stats.repeatedNumberMap)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 8);

  return (
    <Panel
      title="Repeated Number Risk"
      icon={Repeat2}
      sub="Flags puzzles where the same number value appears too often."
    >
      <div className="grid gap-4 lg:grid-cols-[1fr_1.15fr]">
        <div className="space-y-2">
          <div className="rounded-md bg-slate-50 p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Repeat health</p>
            <p className="mt-1 text-2xl font-black text-slate-900">{Math.round(stats.repeatRisk.score * 100)}</p>
            <p className="text-xs text-slate-500">
              Excessive repeats: {formatPercent(stats.repeatRisk.excessiveRate)} · Severe: {formatPercent(stats.repeatRisk.severeRate)}
            </p>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-md bg-white p-2 ring-1 ring-slate-100">
              <p className="text-lg font-black text-slate-800">{stats.repeatRisk.duplicatePuzzles}</p>
              <p className="text-[11px] text-slate-500">duplicate</p>
            </div>
            <div className="rounded-md bg-amber-50 p-2 ring-1 ring-amber-100">
              <p className="text-lg font-black text-amber-700">{stats.repeatRisk.excessivePuzzles}</p>
              <p className="text-[11px] text-amber-700">3+ same</p>
            </div>
            <div className="rounded-md bg-rose-50 p-2 ring-1 ring-rose-100">
              <p className="text-lg font-black text-rose-700">{stats.repeatRisk.severePuzzles}</p>
              <p className="text-[11px] text-rose-700">4+ same</p>
            </div>
          </div>
        </div>

        <div className="space-y-2">
          {repeatedEntries.length === 0 ? (
            <div className="rounded-md border border-dashed border-slate-200 p-4 text-sm text-slate-400">
              No repeated-number pressure detected in this sample.
            </div>
          ) : (
            repeatedEntries.map(([number, pressure]) => (
              <BarRow
                key={number}
                label={`number ${number}`}
                value={pressure}
                max={maxRepeat}
                color="bg-amber-500"
                suffix={pressure}
              />
            ))
          )}
        </div>
      </div>

      {stats.warningExamples.length > 0 && (
        <div className="mt-4 space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Examples to inspect</p>
          <div className="grid gap-2">
            {stats.warningExamples.slice(0, 4).map(example => (
              <div key={example.equation} className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 font-mono text-xs text-amber-900">
                {example.equation}
              </div>
            ))}
          </div>
        </div>
      )}
    </Panel>
  );
}

function PatternList({ stats, sortMode, setSortMode }) {
  const entries = [...stats.patternEntries].sort(sortMode === "az"
    ? ([a], [b]) => a.localeCompare(b)
    : ([, a], [, b]) => b - a
  );
  const max = entries[0]?.[1] || 1;

  return (
    <Panel
      title="Pattern Distribution"
      icon={ListOrdered}
      sub={`${stats.uniquePatternCount} unique patterns from ${stats.success} generated puzzles.`}
      action={
        <div className="flex rounded-md bg-slate-100 p-0.5">
          <button
            type="button"
            onClick={() => setSortMode("freq")}
            className={`inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-semibold ${sortMode === "freq" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"}`}
          >
            <ArrowDownUp className="h-3 w-3" />
            Frequency
          </button>
          <button
            type="button"
            onClick={() => setSortMode("az")}
            className={`rounded px-2 py-1 text-xs font-semibold ${sortMode === "az" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"}`}
          >
            A-Z
          </button>
        </div>
      }
    >
      <div className="max-h-[28rem] space-y-1.5 overflow-y-auto pr-1">
        {entries.map(([pattern, count], index) => {
          const share = stats.success > 0 ? count / stats.success : 0;
          return (
            <div key={pattern} className="grid grid-cols-[2rem_minmax(8rem,12rem)_1fr_4rem] items-center gap-3 rounded-md px-2 py-2 hover:bg-slate-50">
              <span className="text-xs text-slate-300">#{index + 1}</span>
              <div className="min-w-0">
                <ColoredPattern pattern={pattern} />
                <p className="truncate text-[11px] text-slate-400">{stats.examplesByPattern[pattern]}</p>
              </div>
              <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
                <div className="h-full rounded-full bg-teal-500" style={{ width: `${pctWidth(count, max)}%` }} />
              </div>
              <div className="text-right text-xs tabular-nums text-slate-500">
                <p>{formatPercent(share)}</p>
                <p className="text-slate-300">{count}</p>
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 border-t border-slate-100 pt-3 md:grid-cols-4">
        {[
          { label: "Common 20%+", value: entries.filter(([, count]) => stats.success > 0 && count / stats.success >= 0.2).length, tone: "text-rose-600" },
          { label: "Moderate 5-20%", value: entries.filter(([, count]) => stats.success > 0 && count / stats.success >= 0.05 && count / stats.success < 0.2).length, tone: "text-amber-700" },
          { label: "Rare 2-5%", value: entries.filter(([, count]) => stats.success > 0 && count / stats.success >= 0.02 && count / stats.success < 0.05).length, tone: "text-slate-600" },
          { label: "Singleton", value: entries.filter(([, count]) => count === 1).length, tone: "text-teal-700" },
        ].map(item => (
          <div key={item.label} className="rounded-md bg-slate-50 p-2 text-center">
            <p className={`text-lg font-black ${item.tone}`}>{item.value}</p>
            <p className="text-[11px] text-slate-500">{item.label}</p>
          </div>
        ))}
      </div>
    </Panel>
  );
}

function OperatorMixPanel({ stats }) {
  const entries = stats.operatorMixEntries.slice(0, 10);
  const max = entries[0]?.[1] || 1;

  return (
    <Panel title="Operator Shape Mix" icon={Hash} sub="Counts by per-puzzle operator signature.">
      <div className="space-y-2">
        {entries.map(([signature, count]) => (
          <BarRow
            key={signature}
            label={signature}
            value={count}
            max={max}
            color="bg-indigo-500"
            suffix={`${formatPercent(count / stats.success)} · ${count}`}
          />
        ))}
      </div>
    </Panel>
  );
}

function QualityNotes({ stats }) {
  const notes = [];
  if (stats.sampleCoverage < 0.75) {
    notes.push({
      tone: "risk",
      text: "Pattern reuse is high for this sample size. Candidate selection should spread chosen patterns more aggressively.",
    });
  }
  if (stats.topPatternShare > 0.22) {
    notes.push({
      tone: "risk",
      text: "One pattern is taking too much share. Add concentration penalty during pattern selection.",
    });
  }
  if (stats.operatorBalance.score < 0.68) {
    notes.push({
      tone: "watch",
      text: "Operator mix is biased against the selected baseline. Future generator work should balance allowed operators before realization.",
    });
  }
  if (stats.repeatRisk.excessiveRate > 0.08) {
    notes.push({
      tone: "watch",
      text: "Repeated number values appear often. Add repeat-number penalties after realization or during candidate ranking.",
    });
  }
  if (notes.length === 0) {
    notes.push({
      tone: "excellent",
      text: "This sample looks healthy: patterns are spread, operator bias is low, and repeated-number pressure is controlled.",
    });
  }

  return (
    <Panel title="Quality Review" icon={Sparkles} sub="AI-safe recommendations for the next generator balancing phase.">
      <div className="space-y-2">
        {notes.map((note, index) => {
          const tone = TONE[note.tone];
          return (
            <div key={index} className={`flex gap-2 rounded-md border ${tone.border} ${tone.bg} p-3`}>
              {note.tone === "excellent" ? (
                <CheckCircle2 className={`mt-0.5 h-4 w-4 shrink-0 ${tone.text}`} />
              ) : (
                <AlertTriangle className={`mt-0.5 h-4 w-4 shrink-0 ${tone.text}`} />
              )}
              <p className="text-sm text-slate-700">{note.text}</p>
            </div>
          );
        })}
      </div>
    </Panel>
  );
}

export function GeneratorAnalysis() {
  const [mode, setMode] = useState("cross");
  const [crossBonus, setCrossBonus] = useState(true);
  const [puzzleSets, setPuzzleSets] = useState(DEFAULT_SETS);
  const [operatorBaseline, setOperatorBaseline] = useState({ "+": true, "-": true, "×": true, "÷": true });
  const [possiblePatternInput, setPossiblePatternInput] = useState("");

  const [running, setRunning] = useState(false);
  const [genProgress, setGenProgress] = useState(null);
  const [genCount, setGenCount] = useState(0);
  const [error, setError] = useState("");
  const [stats, setStats] = useState(null);
  const [sortMode, setSortMode] = useState("freq");

  const cancelRef = useRef(null);
  const tileSetsCache = useRef([]);
  const resultsRef = useRef([]);
  const analysisOptionsRef = useRef({});
  const t0Ref = useRef(0);
  const lastRenderRef = useRef(0);

  const selectedOperators = useMemo(() => {
    const selected = selectedOperatorsFromState(operatorBaseline);
    return selected.length > 0 ? selected : [...CORE_OPERATORS];
  }, [operatorBaseline]);

  const syncBaselineFromConfig = useCallback(() => {
    const cfgList = buildCfgList(puzzleSets, mode, tileSetsCache.current, crossBonus);
    const inferred = deriveAllowedOperatorsFromConfigs(cfgList);
    setOperatorBaseline(Object.fromEntries(CORE_OPERATORS.map(operator => [operator, inferred.includes(operator)])));
  }, [crossBonus, mode, puzzleSets]);

  const analyzeNow = useCallback(() => {
    return analyzeGeneratedPuzzles(resultsRef.current, {
      ...analysisOptionsRef.current,
      elapsedMs: performance.now() - t0Ref.current,
    });
  }, []);

  const handleRun = useCallback(() => {
    cancelRef.current?.();
    setError("");
    setStats(null);
    setRunning(true);

    const cfgList = buildCfgList(puzzleSets, mode, tileSetsCache.current, crossBonus);
    const inferred = deriveAllowedOperatorsFromConfigs(cfgList);
    const allowedOperators = inferred.length !== CORE_OPERATORS.length ? inferred : selectedOperators;
    const possiblePatternCount = Number.parseInt(possiblePatternInput, 10);

    if (inferred.length !== CORE_OPERATORS.length) {
      setOperatorBaseline(Object.fromEntries(CORE_OPERATORS.map(operator => [operator, inferred.includes(operator)])));
    }

    resultsRef.current = [];
    analysisOptionsRef.current = {
      requestedCount: cfgList.length,
      possiblePatternCount: Number.isFinite(possiblePatternCount) && possiblePatternCount > 0 ? possiblePatternCount : null,
      allowedOperators,
    };
    t0Ref.current = performance.now();
    setGenProgress({ done: 0, total: cfgList.length });

    cancelRef.current = generateBatchAsync(cfgList, {
      onEach: (result, done, total) => {
        resultsRef.current.push(result);
        setGenProgress({ done, total });

        const now = performance.now();
        if (now - lastRenderRef.current > 80 || done === total) {
          lastRenderRef.current = now;
          setStats(analyzeNow());
        }
      },
      onDone: () => {
        setStats(analyzeNow());
        setGenCount(n => n + 1);
        setRunning(false);
        setGenProgress(null);
        cancelRef.current = null;
      },
      onError: (e) => {
        setError(e.message);
        setRunning(false);
        setGenProgress(null);
        cancelRef.current = null;
      },
    });
  }, [analyzeNow, crossBonus, mode, possiblePatternInput, puzzleSets, selectedOperators]);

  const handleCancel = useCallback(() => {
    cancelRef.current?.();
    cancelRef.current = null;
    setRunning(false);
    setGenProgress(null);
  }, []);

  return (
    <div className="space-y-5">
      <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-2xl">
            <div className="flex items-center gap-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-teal-50 text-teal-700">
                <Gauge className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-lg font-black text-slate-950">Generator Diversity Lab</h2>
                <p className="text-sm text-slate-500">
                  Generate a sample batch, then inspect pattern spread, operator bias, tile mix, and repeated-number pressure.
                </p>
              </div>
            </div>
          </div>

          <div className="grid gap-3">
            <OperatorBaselineControls
              baseline={operatorBaseline}
              setBaseline={setOperatorBaseline}
              onSyncFromConfig={syncBaselineFromConfig}
            />
            <label className="flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
              Possible pattern universe
              <input
                value={possiblePatternInput}
                onChange={event => setPossiblePatternInput(event.target.value.replace(/[^\d]/g, ""))}
                placeholder="optional, e.g. 1000"
                inputMode="numeric"
                className="h-8 w-40 rounded-md border border-slate-200 bg-white px-2 text-sm font-medium normal-case tracking-normal text-slate-800 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
              />
            </label>
          </div>
        </div>
      </div>

      <BingoConfig
        mode={mode} setMode={setMode}
        crossBonus={crossBonus} setCrossBonus={setCrossBonus}
        puzzleSets={puzzleSets} setPuzzleSets={setPuzzleSets}
        timerEnabled={false} setTimerEnabled={() => {}}
        showTimer={false}
        onGenerate={handleRun}
        loading={running}
        error={error}
        genCount={genCount}
        genProgress={genProgress}
        onCancel={handleCancel}
        onTileSetsLoaded={sets => { tileSetsCache.current = sets; }}
      />

      {stats && (
        <>
          <div className="grid gap-3 lg:grid-cols-[1.2fr_1fr_1fr]">
            <QualityGauge score={stats.score} />
            <MetricCard
              label="Sample Coverage"
              value={formatPercent(stats.sampleCoverage)}
              sub={`${stats.uniquePatternCount} unique from ${stats.success} generated`}
              icon={BarChart2}
              tone={stats.sampleCoverage >= 0.8 ? "excellent" : stats.sampleCoverage >= 0.65 ? "good" : "watch"}
            />
            <MetricCard
              label="Possible Coverage"
              value={stats.possibleCoverage == null ? "—" : formatPercent(stats.possibleCoverage, 2)}
              sub={stats.possiblePatternCount ? `${stats.uniquePatternCount} / ${stats.possiblePatternCount} possible patterns` : "Add a universe size to show this."}
              icon={SlidersHorizontal}
              tone={stats.possibleCoverage == null || stats.possibleCoverage < 0.03 ? "good" : "excellent"}
            />
          </div>

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <MetricCard
              label="Entropy Evenness"
              value={formatPercent(stats.normalizedPatternEntropy)}
              sub={`${stats.patternEntropy.toFixed(2)} bits`}
              icon={Sparkles}
              tone={stats.normalizedPatternEntropy >= 0.82 ? "excellent" : "watch"}
            />
            <MetricCard
              label="Top Pattern Share"
              value={formatPercent(stats.topPatternShare)}
              sub={`${stats.topPatternCount} hits`}
              icon={Target}
              tone={stats.topPatternShare <= 0.12 ? "excellent" : stats.topPatternShare <= 0.22 ? "good" : "risk"}
            />
            <MetricCard
              label="Operator Balance"
              value={Math.round(stats.operatorBalance.score * 100)}
              sub={`target: ${stats.operatorBalance.operators.join(" ")}`}
              icon={Sigma}
              tone={qualityTone(stats.operatorBalance.score)}
            />
            <MetricCard
              label="Repeat Health"
              value={Math.round(stats.repeatRisk.score * 100)}
              sub={`${stats.repeatRisk.excessivePuzzles} puzzles with 3+ same number`}
              icon={Repeat2}
              tone={qualityTone(stats.repeatRisk.score)}
            />
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <OperatorBalancePanel stats={stats} />
            <OperatorMixPanel stats={stats} />
            <TileCategoryPanel stats={stats} />
            <RepeatRiskPanel stats={stats} />
          </div>

          <QualityNotes stats={stats} />
          <PatternList stats={stats} sortMode={sortMode} setSortMode={setSortMode} />
        </>
      )}

      {!stats && !running && (
        <div className="rounded-lg border border-dashed border-slate-200 bg-white py-16 text-center text-slate-400">
          <BarChart2 className="mx-auto mb-3 h-12 w-12 opacity-40" />
          <p className="text-sm font-medium">Configure a batch and press Generate to visualize diversity quality.</p>
          <p className="mt-1 text-xs">Use 50-200 samples for quick checks, or 1000+ for deeper bias review.</p>
        </div>
      )}
    </div>
  );
}
