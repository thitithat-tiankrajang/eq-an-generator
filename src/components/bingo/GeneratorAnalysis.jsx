import { useState, useRef, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { BingoConfig, DEFAULT_SETS } from "@/components/bingo/BingoConfig";
import { generateBatchAsync, buildCfgList } from "@/lib/generateBatch";
import { tokenizeEquation, OPS_ALL } from "@/lib/bingoMath";
import { HEAVY_SET } from "@/lib/tileHelpers";
import { BarChart2, ListOrdered, ArrowDownUp, SortAsc } from "lucide-react";

// ── Pattern helpers ───────────────────────────────────────────────────────────

function equationToPattern(eq) {
  const tokens = tokenizeEquation(eq);
  if (!tokens) return "(invalid)";
  return tokens.map(tok => {
    if (tok === "=") return "=";
    if (OPS_ALL.includes(tok)) return tok;
    if (tok === "+/-" || tok === "×/÷" || tok === "?") return tok;
    return "O";
  }).join("");
}

const OP_COLORS = {
  "=": "text-stone-400",
  "+": "text-blue-500",
  "-": "text-rose-500",
  "×": "text-violet-500",
  "÷": "text-amber-500",
  "+/-": "text-teal-500",
  "×/÷": "text-fuchsia-500",
  "?": "text-stone-400",
  "O": "text-stone-700 font-bold",
};

function ColoredPattern({ pattern }) {
  const chars = [];
  let i = 0;
  while (i < pattern.length) {
    if (pattern.slice(i, i + 3) === "+/-") {
      chars.push({ key: i, tok: "+/-", ch: "+/-" }); i += 3;
    } else if (pattern.slice(i, i + 3) === "×/÷") {
      chars.push({ key: i, tok: "×/÷", ch: "×/÷" }); i += 3;
    } else {
      const ch = pattern[i];
      const tok = ch === "O" ? "O" : ch === "=" ? "=" : OPS_ALL.includes(ch) ? ch : ch === "?" ? "?" : "O";
      chars.push({ key: i, tok, ch }); i++;
    }
  }
  return (
    <span className="font-mono text-sm tracking-wide">
      {chars.map(({ key, tok, ch }) => (
        <span key={key} className={OP_COLORS[tok] || "text-stone-700"}>{ch}</span>
      ))}
    </span>
  );
}

// ── Empty stats factory ───────────────────────────────────────────────────────

function emptyAcc() {
  return {
    success: 0,
    failed: 0,
    totalMs: 0,
    patternMap: {},
    eqCountMap: {},
    opTypeMap: { "+": 0, "-": 0, "×": 0, "÷": 0 },
    heavyCount: 0,
    wildCount: 0,
  };
}

function updateAcc(acc, result, t0) {
  if (!result) { acc.failed++; return; }
  acc.success++;
  const pat = equationToPattern(result.equation);
  acc.patternMap[pat] = (acc.patternMap[pat] || 0) + 1;
  acc.eqCountMap[result.eqCount] = (acc.eqCountMap[result.eqCount] || 0) + 1;

  const tiles = result.solutionTiles ?? [];
  if (tiles.some(t => HEAVY_SET.has(t))) acc.heavyCount++;
  if (tiles.some(t => t === "?" || t === "+/-" || t === "×/÷")) acc.wildCount++;

  const toks = tokenizeEquation(result.equation) ?? [];
  for (const tok of toks) {
    if (OPS_ALL.includes(tok)) acc.opTypeMap[tok] = (acc.opTypeMap[tok] || 0) + 1;
  }
  acc.totalMs = performance.now() - t0;
}

function snapshotAcc(acc) {
  return {
    success: acc.success,
    failed: acc.failed,
    totalMs: acc.totalMs,
    patternMap: { ...acc.patternMap },
    eqCountMap: { ...acc.eqCountMap },
    opTypeMap: { ...acc.opTypeMap },
    heavyCount: acc.heavyCount,
    wildCount: acc.wildCount,
  };
}

// ── Mini components ───────────────────────────────────────────────────────────

function MiniBar({ value, max, color = "bg-amber-400" }) {
  const pct = max > 0 ? Math.max(2, (value / max) * 100) : 0;
  return (
    <div className="flex-1 bg-stone-100 rounded-full h-2 overflow-hidden">
      <div className={`${color} h-full rounded-full transition-all duration-200`} style={{ width: `${pct}%` }} />
    </div>
  );
}

function StatCard({ label, value, sub, color = "text-amber-700", bg = "bg-amber-50" }) {
  return (
    <div className={`${bg} rounded-xl p-3 flex flex-col gap-0.5`}>
      <p className={`text-xl font-bold ${color}`}>{value}</p>
      <p className="text-xs text-stone-500">{label}</p>
      {sub && <p className="text-xs text-stone-400">{sub}</p>}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

const EQ_COLORS = ["bg-stone-300", "bg-amber-400", "bg-amber-600", "bg-amber-800"];
const OP_BAR_COLORS = { "+": "bg-blue-400", "-": "bg-rose-400", "×": "bg-violet-400", "÷": "bg-amber-400" };

export function GeneratorAnalysis() {
  const [mode, setMode] = useState("cross");
  const [crossBonus, setCrossBonus] = useState(true);
  const [puzzleSets, setPuzzleSets] = useState(DEFAULT_SETS);

  const [running, setRunning] = useState(false);
  const [genProgress, setGenProgress] = useState(null);
  const [genCount, setGenCount] = useState(0);
  const [error, setError] = useState("");
  const [stats, setStats] = useState(null);
  const [sortMode, setSortMode] = useState("freq");

  const cancelRef = useRef(null);
  const tileSetsCache = useRef([]);
  const accRef = useRef(null);
  const t0Ref = useRef(0);
  const lastRenderRef = useRef(0);

  const handleRun = useCallback(() => {
    cancelRef.current?.();
    setError("");
    setStats(null);
    setRunning(true);

    const cfgList = buildCfgList(puzzleSets, mode, tileSetsCache.current, crossBonus);
    setGenProgress({ done: 0, total: cfgList.length });

    const acc = emptyAcc();
    accRef.current = acc;
    t0Ref.current = performance.now();

    cancelRef.current = generateBatchAsync(cfgList, {
      onEach: (result, done, total) => {
        updateAcc(acc, result, t0Ref.current);
        setGenProgress({ done, total });

        // Throttle React re-renders to ~20fps
        const now = performance.now();
        if (now - lastRenderRef.current > 50 || done === total) {
          lastRenderRef.current = now;
          setStats(snapshotAcc(acc));
        }
      },
      onDone: () => {
        setStats(snapshotAcc(acc));
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
  }, [mode, crossBonus, puzzleSets]);

  const handleCancel = useCallback(() => {
    cancelRef.current?.();
    cancelRef.current = null;
    setRunning(false);
    setGenProgress(null);
  }, []);

  // ── Derived display ───────────────────────────────────────────────────────

  let sortedPatterns = [];
  if (stats) {
    sortedPatterns = Object.entries(stats.patternMap);
    sortedPatterns.sort(sortMode === "freq"
      ? ([, a], [, b]) => b - a
      : ([a], [b]) => a.localeCompare(b)
    );
  }
  const maxPatternCount = sortedPatterns[0]?.[1] ?? 1;
  const totalOpTokens = stats ? Object.values(stats.opTypeMap).reduce((s, v) => s + v, 0) : 0;
  const maxEqCount = stats ? Math.max(...Object.values(stats.eqCountMap), 1) : 1;
  const total = stats ? stats.success + stats.failed : 0;

  return (
    <div className="space-y-5">

      {/* BingoConfig — same as Generator.jsx */}
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

      {/* Results */}
      {stats && (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard
              label="Success rate"
              value={total > 0 ? `${((stats.success / total) * 100).toFixed(1)}%` : "—"}
              sub={`${stats.success} / ${total} puzzles`}
              color="text-emerald-700" bg="bg-emerald-50"
            />
            <StatCard
              label="Unique patterns"
              value={Object.keys(stats.patternMap).length}
              sub={`from ${stats.success} puzzles`}
              color="text-amber-700" bg="bg-amber-50"
            />
            <StatCard
              label="Avg time"
              value={stats.success > 0 ? `${(stats.totalMs / stats.success).toFixed(2)}ms` : "—"}
              sub={`total ${stats.totalMs.toFixed(0)}ms`}
              color="text-violet-700" bg="bg-violet-50"
            />
            <StatCard
              label="Heavy tiles"
              value={stats.success > 0 ? `${((stats.heavyCount / stats.success) * 100).toFixed(1)}%` : "—"}
              sub={`wild: ${stats.success > 0 ? ((stats.wildCount / stats.success) * 100).toFixed(1) : "—"}%`}
              color="text-stone-700" bg="bg-stone-100"
            />
          </div>

          {/* Charts row */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

            {/* eqCount chart */}
            <Card className="border-0 shadow-sm">
              <CardContent className="p-4 space-y-3">
                <p className="text-xs font-semibold text-stone-600 uppercase tracking-wider">Equal signs per puzzle</p>
                {Object.entries(stats.eqCountMap)
                  .sort(([a], [b]) => Number(a) - Number(b))
                  .map(([ec, cnt], idx) => (
                    <div key={ec} className="flex items-center gap-3">
                      <span className="text-xs text-stone-500 w-16 shrink-0">eqCount={ec}</span>
                      <MiniBar value={cnt} max={maxEqCount} color={EQ_COLORS[idx] || "bg-amber-400"} />
                      <span className="text-xs text-stone-600 w-12 text-right shrink-0">
                        {stats.success > 0 ? ((cnt / stats.success) * 100).toFixed(1) : 0}%
                      </span>
                    </div>
                  ))}
              </CardContent>
            </Card>

            {/* Operator type chart */}
            <Card className="border-0 shadow-sm">
              <CardContent className="p-4 space-y-3">
                <p className="text-xs font-semibold text-stone-600 uppercase tracking-wider">Operator type distribution</p>
                {["+", "-", "×", "÷"].map(op => {
                  const cnt = stats.opTypeMap[op] || 0;
                  return (
                    <div key={op} className="flex items-center gap-3">
                      <span className={`text-sm font-mono w-6 shrink-0 ${OP_COLORS[op]}`}>{op}</span>
                      <MiniBar value={cnt} max={totalOpTokens} color={OP_BAR_COLORS[op]} />
                      <span className="text-xs text-stone-600 w-12 text-right shrink-0">
                        {totalOpTokens > 0 ? ((cnt / totalOpTokens) * 100).toFixed(1) : 0}%
                      </span>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          </div>

          {/* Pattern list */}
          <Card className="border-0 shadow-sm">
            <CardContent className="p-4 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-stone-600 uppercase tracking-wider flex items-center gap-1.5">
                  <ListOrdered className="w-3.5 h-3.5" />
                  Equation patterns
                  <span className="normal-case font-normal text-stone-400 ml-1">
                    ({Object.keys(stats.patternMap).length} unique)
                  </span>
                </p>
                <div className="flex bg-stone-100 rounded-lg p-0.5 gap-0.5">
                  <button
                    onClick={() => setSortMode("freq")}
                    className={`flex items-center gap-1 text-xs px-2.5 py-1 rounded-md transition-all ${sortMode === "freq" ? "bg-white shadow-sm text-amber-700 font-semibold" : "text-stone-400 hover:text-stone-600"}`}>
                    <ArrowDownUp className="w-3 h-3" /> Frequency
                  </button>
                  <button
                    onClick={() => setSortMode("az")}
                    className={`flex items-center gap-1 text-xs px-2.5 py-1 rounded-md transition-all ${sortMode === "az" ? "bg-white shadow-sm text-amber-700 font-semibold" : "text-stone-400 hover:text-stone-600"}`}>
                    <SortAsc className="w-3 h-3" /> A–Z
                  </button>
                </div>
              </div>

              <div className="max-h-96 overflow-y-auto space-y-1.5 pr-1">
                {sortedPatterns.map(([pat, cnt], idx) => {
                  const pct = stats.success > 0 ? (cnt / stats.success) * 100 : 0;
                  const barW = maxPatternCount > 0 ? Math.max(2, (cnt / maxPatternCount) * 100) : 0;
                  return (
                    <div key={pat}
                      className="flex items-center gap-3 py-1.5 px-2 rounded-lg hover:bg-amber-50/60 transition-colors group">
                      {sortMode === "freq" && (
                        <span className="text-xs text-stone-300 w-6 shrink-0 group-hover:text-stone-400">
                          #{idx + 1}
                        </span>
                      )}
                      <div className="w-40 shrink-0">
                        <ColoredPattern pattern={pat} />
                      </div>
                      <div className="flex-1 flex items-center gap-2">
                        <div className="flex-1 bg-stone-100 rounded-full h-2 overflow-hidden">
                          <div className="bg-amber-300 h-full rounded-full transition-all duration-200"
                            style={{ width: `${barW}%` }} />
                        </div>
                        <span className="text-xs text-stone-500 w-10 text-right shrink-0">{pct.toFixed(1)}%</span>
                        <span className="text-xs text-stone-400 w-8 text-right shrink-0">{cnt}</span>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Rarity summary */}
              <div className="pt-2 border-t border-stone-100 grid grid-cols-2 md:grid-cols-4 gap-2">
                {[
                  { label: "≥50× common",   filter: ([, c]) => c >= 50,              color: "text-amber-700"  },
                  { label: "10–49× moderate",filter: ([, c]) => c >= 10 && c < 50,   color: "text-stone-600"  },
                  { label: "2–9× rare",      filter: ([, c]) => c >= 2  && c < 10,   color: "text-stone-500"  },
                  { label: "1× unique",      filter: ([, c]) => c === 1,             color: "text-stone-400"  },
                ].map(({ label, filter, color }) => (
                  <div key={label} className="text-center">
                    <p className={`text-base font-bold ${color}`}>{sortedPatterns.filter(filter).length}</p>
                    <p className="text-xs text-stone-400">{label}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {!stats && !running && (
        <div className="text-center py-16 text-stone-300">
          <BarChart2 className="w-12 h-12 mx-auto mb-3 opacity-40" />
          <p className="text-sm">Configure and press Generate to see pattern analysis</p>
        </div>
      )}
    </div>
  );
}
