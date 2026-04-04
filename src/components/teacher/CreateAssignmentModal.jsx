import { useState } from "react";
import { api } from "@/api/apiClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { X, BookOpen, Settings2, Users, Search } from "lucide-react";
import { toast } from "sonner";
import { BingoAdvancedConfig, DEFAULT_ADV_CFG } from "@/components/bingo/BingoAdvancedConfig";

// ── Helpers ───────────────────────────────────────────────────────────────────

let _setId = 0;
const nextSetId = () => ++_setId;

const DEFAULT_SETS = [{ id: nextSetId(), tileCount: 9, numQuestions: 5, advancedCfg: DEFAULT_ADV_CFG }];

/**
 * Convert a UI puzzle set to the API optionSet format.
 * Mirrors what PlayAssignment.buildBingoConfig consumes.
 */
function puzzleSetToOptionSet(set, mode = 'cross') {
  const adv = set.advancedCfg ?? DEFAULT_ADV_CFG;
  const tileCount = set.tileCount ?? 9;

  // operator count: use advancedCfg range min if enabled, else default 2
  const operatorCount = adv.operatorCount?.enabled ? adv.operatorCount.min : 2;
  const heavyNumberCount = adv.heavyCount?.enabled ? adv.heavyCount.min : 0;
  const BlankCount = adv.blankCount?.enabled ? adv.blankCount.min : 0;

  // Per-operator fixed counts (null = unconstrained)
  const operatorFixed = { '+': null, '-': null, '×': null, '÷': null, '+/-': null, '×/÷': null };
  if (adv.operatorSpec) {
    for (const [op, spec] of Object.entries(adv.operatorSpec)) {
      if (spec?.enabled) operatorFixed[op] = spec.min;
    }
  }
  const hasSpecificOps = Object.values(operatorFixed).some(v => v !== null);
  const isPlain = mode === 'plain';

  return {
    options: {
      totalCount: tileCount,
      operatorMode: hasSpecificOps ? 'specific' : 'random',
      operatorCount,
      equalsCount: 1,
      heavyNumberCount,
      BlankCount,
      zeroCount: 0,
      // plain mode: no locks, no bonus slots; cross mode: lock excess tiles when count > 8
      isLockPos: !isPlain && tileCount > 8,
      plainMode: isPlain,
      operatorFixed,
    },
    numQuestions: set.numQuestions,
    setLabel: `${tileCount}tile`,
  };
}

// ── Puzzle set row ─────────────────────────────────────────────────────────────

function SetRow({ set, mode = 'cross', label, onChange, onRemove }) {
  const [advOpen, setAdvOpen] = useState(false);
  const adv = set.advancedCfg ?? DEFAULT_ADV_CFG;
  const isPlain = mode === 'plain';
  const minTile = 8;

  return (
    <div className="rounded-xl bg-stone-50 border border-stone-200 overflow-hidden">
      <div className="flex items-center gap-3 px-4 py-3">
        <span className="font-mono text-[9px] tracking-widest text-stone-500 w-12 shrink-0">{label}</span>

        {/* Tile count slider */}
        <div className="flex-1 min-w-0">
          <div className="text-[8px] font-mono text-stone-400 mb-1">
            Tiles: <span className="text-stone-700 font-bold">{set.tileCount}</span>
            {isPlain ? (
              <span className="text-emerald-400 ml-1">(all in rack)</span>
            ) : (
              <span className="text-stone-300 ml-1">
                ({set.tileCount > 8 ? `${set.tileCount - 8} locked` : 'no lock'})
              </span>
            )}
          </div>
          <input
            type="range" min={minTile} max={15} value={Math.max(minTile, set.tileCount)}
            onChange={e => onChange({ tileCount: +e.target.value })}
            className="w-full cursor-pointer accent-amber-500"
          />
        </div>

        {/* Questions count stepper */}
        <div className="shrink-0 text-center">
          <div className="text-[8px] font-mono text-stone-400 mb-1">Questions</div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => onChange({ numQuestions: Math.max(1, set.numQuestions - 1) })}
              className="w-6 h-6 rounded border border-stone-200 bg-white text-stone-500 font-mono text-sm
                hover:border-amber-400 hover:text-amber-600 transition-colors cursor-pointer flex items-center justify-center"
            >−</button>
            <span className="w-6 text-center font-mono text-[11px] font-bold text-stone-700">{set.numQuestions}</span>
            <button
              type="button"
              onClick={() => onChange({ numQuestions: Math.min(50, set.numQuestions + 1) })}
              className="w-6 h-6 rounded border border-stone-200 bg-white text-stone-500 font-mono text-sm
                hover:border-amber-400 hover:text-amber-600 transition-colors cursor-pointer flex items-center justify-center"
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
            className="w-6 h-6 rounded border border-stone-200 bg-white text-stone-300 text-sm font-mono
              hover:border-red-300 hover:text-red-400 transition-colors cursor-pointer flex items-center justify-center shrink-0"
          >✕</button>
        )}
      </div>

      {advOpen && (
        <div className="border-t border-stone-100 px-3 pb-3 pt-1">
          <BingoAdvancedConfig
            advancedCfg={adv}
            setAdvancedCfg={newCfg =>
              onChange({ advancedCfg: typeof newCfg === 'function' ? newCfg(adv) : newCfg })
            }
            mode={mode}
            inline
          />
        </div>
      )}
    </div>
  );
}

// ── Modal ──────────────────────────────────────────────────────────────────────

const PUZZLE_MODES = [
  { key: 'cross', title: 'CROSS', desc: 'Locked tiles + bonus slots' },
  { key: 'plain', title: 'PLAIN', desc: 'All tiles in rack, no locks' },
  { key: 'expand', title: 'EXPAND', desc: 'Coming soon', disabled: true },
];

export default function CreateAssignmentModal({ students, onCreated, onClose }) {
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [puzzleMode, setPuzzleMode] = useState('cross');

  const [form, setForm] = useState({
    title: "",
    description: "",
    dueDate: "",
  });
  const [puzzleSets, setPuzzleSets] = useState(DEFAULT_SETS);
  const [assignedTo, setAssignedTo] = useState([]);
  const [studentSearch, setStudentSearch] = useState("");

  const set = (key, val) => setForm(prev => ({ ...prev, [key]: val }));

  const toggleStudent = (id) =>
    setAssignedTo(prev => prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id]);
  const selectAll = () => setAssignedTo(students.map(s => s.id));
  const clearAll = () => setAssignedTo([]);

  const totalQuestions = puzzleSets.reduce((s, p) => s + p.numQuestions, 0);

  const handleCreate = async () => {
    console.log("🚀 handleCreate fired", { form, assignedTo, totalQuestions, puzzleSets });

    if (!form.title.trim()) return toast.error("Title is required");
    if (!form.dueDate) return toast.error("Due date is required");
    if (assignedTo.length === 0) return toast.error("Assign to at least one student");
    if (totalQuestions < 1) return toast.error("At least 1 question required");

    setSaving(true);
    try {
      const optionSets = puzzleSets.map(s => puzzleSetToOptionSet(s, puzzleMode));
      console.log("📦 optionSets payload:", JSON.stringify(optionSets, null, 2));

      const payload = {
        title: form.title.trim(),
        description: form.description.trim() || form.title.trim(),
        totalQuestions,
        dueDate: new Date(form.dueDate).toISOString(),
        optionSets,
      };
      console.log("📦 create assignment payload:", JSON.stringify(payload, null, 2));

      // Step 1: create assignment (no students yet)
      const created = await api.assignments.admin.create(payload);
      console.log("✅ assignment created:", created);

      // Step 2: assign selected students
      let finalAssignment = created.assignment;
      if (assignedTo.length > 0) {
        const assigned = await api.assignments.admin.assign(created.assignment.id, assignedTo);
        finalAssignment = assigned.assignment ?? finalAssignment;
        console.log("✅ students assigned:", assigned);
      }

      toast.success("Assignment created!");
      onCreated(finalAssignment);
    } catch (err) {
      console.error("❌ handleCreate error:", err);
      toast.error(err.message || "Failed to create assignment");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-hidden flex flex-col shadow-2xl">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="font-bold text-slate-900">New Assignment</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Step nav */}
        <div className="flex border-b">
          {[
            { icon: BookOpen, label: "Details" },
            { icon: Settings2, label: "Config" },
            { icon: Users, label: "Students" },
          ].map((s, i) => (
            <button
              key={i}
              onClick={() => setStep(i)}
              className={`flex-1 flex items-center justify-center gap-1.5 py-3 text-xs font-medium transition-colors ${
                step === i
                  ? "text-amber-700 border-b-2 border-amber-600"
                  : "text-slate-400 hover:text-slate-600"
              }`}
            >
              <s.icon className="w-3.5 h-3.5" />{s.label}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">

          {/* ── Step 0: Details ── */}
          {step === 0 && (
            <>
              <div className="space-y-1.5">
                <Label>Title *</Label>
                <Input
                  value={form.title}
                  onChange={e => set("title", e.target.value)}
                  placeholder="e.g. Week 3 Equations"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Description</Label>
                <Textarea
                  value={form.description}
                  onChange={e => set("description", e.target.value)}
                  rows={2}
                  placeholder="Optional"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Deadline *</Label>
                <Input
                  type="datetime-local"
                  value={form.dueDate}
                  onChange={e => set("dueDate", e.target.value)}
                />
                <p className="text-[11px] text-stone-400">
                  Timer counts up per question — no hard limit. Time taken is recorded for each problem.
                </p>
              </div>
            </>
          )}

          {/* ── Step 1: Config (multiset) ── */}
          {step === 1 && (
            <>
              <div className="text-[9px] tracking-[0.3em] uppercase font-mono text-stone-400 mb-1">
                01 — Mode
              </div>
              <div className="flex gap-2 mb-4">
                {PUZZLE_MODES.map(m => (
                  <button
                    key={m.key}
                    type="button"
                    onClick={() => !m.disabled && setPuzzleMode(m.key)}
                    disabled={m.disabled}
                    className={`flex-1 text-left px-3 py-2.5 rounded-xl border-2 font-mono transition-colors relative ${
                      m.disabled
                        ? 'border-stone-100 bg-stone-50 cursor-not-allowed opacity-60'
                        : puzzleMode === m.key
                          ? 'border-amber-500 bg-amber-50 cursor-pointer'
                          : 'border-stone-200 bg-stone-50 hover:border-amber-300 cursor-pointer'
                    }`}
                  >
                    <div className={`text-[10px] font-bold tracking-widest ${
                      m.disabled ? 'text-stone-300' : puzzleMode === m.key ? 'text-amber-700' : 'text-stone-400'
                    }`}>
                      {m.title}
                    </div>
                    <div className={`text-[9px] mt-0.5 ${
                      m.disabled ? 'text-stone-300' : puzzleMode === m.key ? 'text-amber-500' : 'text-stone-300'
                    }`}>
                      {m.desc}
                    </div>
                    {m.disabled && (
                      <span className="absolute top-1.5 right-1.5 text-[7px] font-bold bg-stone-200 text-stone-500 px-1 py-0.5 rounded">
                        รออัพเดต
                      </span>
                    )}
                  </button>
                ))}
              </div>

              <div className="text-[9px] tracking-[0.3em] uppercase font-mono text-stone-400 mb-1">
                02 — Puzzle Sets
              </div>
              <p className="text-xs text-stone-400 mb-3">
                Each set generates questions of a specific tile count. Students work through sets in order.
              </p>

              <div className="space-y-2">
                {puzzleSets.map((s, idx) => (
                  <SetRow
                    key={s.id}
                    set={s}
                    mode={puzzleMode}
                    label={`SET ${String.fromCharCode(65 + idx)}`}
                    onChange={updated =>
                      setPuzzleSets(prev => prev.map(p => p.id === s.id ? { ...p, ...updated } : p))
                    }
                    onRemove={
                      puzzleSets.length > 1
                        ? () => setPuzzleSets(prev => prev.filter(p => p.id !== s.id))
                        : null
                    }
                  />
                ))}
              </div>

              {puzzleSets.length < 6 && (
                <button
                  type="button"
                  onClick={() =>
                    setPuzzleSets(prev => [
                      ...prev,
                      { id: nextSetId(), tileCount: 9, numQuestions: 3, advancedCfg: DEFAULT_ADV_CFG },
                    ])
                  }
                  className="w-full py-2 rounded-xl border border-dashed border-stone-300 text-stone-400
                    font-mono text-[9px] tracking-[0.2em] uppercase hover:border-amber-400 hover:text-amber-500
                    hover:bg-amber-50 transition-colors cursor-pointer"
                >
                  + Add Set
                </button>
              )}

              <div className="mt-2 px-4 py-3 rounded-xl bg-amber-50 border border-amber-100 flex items-center justify-between">
                <span className="text-xs text-amber-700 font-medium">Total Questions</span>
                <span className="text-lg font-bold text-amber-700 font-mono">{totalQuestions}</span>
              </div>
            </>
          )}

          {/* ── Step 2: Students ── */}
          {step === 2 && (
            <>
              {/* Search box */}
              <div className="relative mb-2">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-stone-400" />
                <input
                  type="text"
                  value={studentSearch}
                  onChange={e => setStudentSearch(e.target.value)}
                  placeholder="Search by name or school…"
                  className="w-full pl-8 pr-3 py-2 text-sm rounded-lg border border-stone-200 bg-stone-50 outline-none focus:border-amber-400 focus:bg-white transition-colors"
                />
              </div>

              <div className="flex items-center justify-between mb-2">
                <Label className="text-slate-500 text-xs">
                  {(() => {
                    const q = studentSearch.trim().toLowerCase();
                    const count = q
                      ? students.filter(s => {
                          const name = (s.fullName || s.displayName || `${s.firstName ?? ''} ${s.lastName ?? ''}`.trim() || s.username || '').toLowerCase();
                          const school = (s.school || '').toLowerCase();
                          return name.includes(q) || school.includes(q);
                        }).length
                      : students.length;
                    return `${count} student${count !== 1 ? 's' : ''} shown`;
                  })()}
                </Label>
                <div className="flex gap-2">
                  <button onClick={selectAll} className="text-xs text-amber-600 hover:underline">All</button>
                  <button onClick={clearAll} className="text-xs text-slate-400 hover:underline">Clear</button>
                </div>
              </div>

              <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                {students.length === 0 && (
                  <p className="text-sm text-slate-400 text-center py-6">
                    No active students available yet
                  </p>
                )}
                {students
                  .filter(s => {
                    const q = studentSearch.trim().toLowerCase();
                    if (!q) return true;
                    const name = (s.fullName || s.displayName || `${s.firstName ?? ''} ${s.lastName ?? ''}`.trim() || s.username || '').toLowerCase();
                    const school = (s.school || '').toLowerCase();
                    return name.includes(q) || school.includes(q);
                  })
                  .map(s => {
                    const name = s.fullName || s.displayName || `${s.firstName ?? ''} ${s.lastName ?? ''}`.trim() || s.username;
                    const sub = s.school || s.username;
                    return (
                      <label
                        key={s.id}
                        className="flex items-center gap-3 p-3 rounded-lg border border-slate-100 hover:bg-slate-50 cursor-pointer"
                      >
                        <Checkbox
                          checked={assignedTo.includes(s.id)}
                          onCheckedChange={() => toggleStudent(s.id)}
                        />
                        <div>
                          <p className="text-sm font-medium text-slate-800">{name}</p>
                          {sub && <p className="text-xs text-slate-400">{sub}</p>}
                        </div>
                      </label>
                    );
                  })}
                {students.length > 0 && studentSearch.trim() && students.filter(s => {
                  const q = studentSearch.trim().toLowerCase();
                  const name = (s.fullName || s.displayName || `${s.firstName ?? ''} ${s.lastName ?? ''}`.trim() || s.username || '').toLowerCase();
                  const school = (s.school || '').toLowerCase();
                  return name.includes(q) || school.includes(q);
                }).length === 0 && (
                  <p className="text-sm text-slate-400 text-center py-6">No students match your search</p>
                )}
              </div>

              <p className="text-xs text-slate-400 pt-1">{assignedTo.length} selected</p>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t flex justify-between">
          <Button variant="ghost" onClick={() => (step > 0 ? setStep(s => s - 1) : onClose)}>
            {step === 0 ? "Cancel" : "Back"}
          </Button>
          {step < 2 ? (
            <Button onClick={() => setStep(s => s + 1)} className="bg-amber-700 hover:bg-amber-600">
              Next
            </Button>
          ) : (
            <Button
              onClick={handleCreate}
              disabled={saving}
              className="bg-emerald-600 hover:bg-emerald-500"
            >
              {saving ? "Creating…" : `Create (${totalQuestions} questions)`}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
