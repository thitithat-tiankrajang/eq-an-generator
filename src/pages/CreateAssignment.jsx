import { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '@/api/apiClient';
import { useAuth } from '@/lib/AuthContext';
import { BingoAdvancedConfig, DEFAULT_ADV_CFG } from '@/components/bingo/BingoAdvancedConfig';
import { toast } from 'sonner';
import {
  ChevronLeft, Search, Users, Settings2, BookOpen, X, Check, AlertCircle,
} from 'lucide-react';

// ── ID generator ──────────────────────────────────────────────────────────────
let _sid = 0;
const nextSetId = () => ++_sid;

const DEFAULT_PUZZLE_SETS = [
  { id: nextSetId(), tileCount: 9, numQuestions: 5, advancedCfg: DEFAULT_ADV_CFG },
];

// ── Puzzle mode definitions ───────────────────────────────────────────────────
const PUZZLE_MODES = [
  { key: 'cross', label: 'Cross', desc: 'Locked tiles + bonus slots' },
  { key: 'plain', label: 'Plain', desc: 'All tiles in rack' },
  { key: 'expand', label: 'Expand', desc: 'Coming soon', disabled: true },
];

// ── Convert UI puzzle set → API optionSet ─────────────────────────────────────
function puzzleSetToOptionSet(set, mode = 'cross') {
  const adv = set.advancedCfg ?? DEFAULT_ADV_CFG;
  const tileCount = set.tileCount ?? 9;
  const operatorCount = adv.operatorCount?.enabled ? adv.operatorCount.min : 2;
  const heavyNumberCount = adv.heavyCount?.enabled ? adv.heavyCount.min : 0;
  const BlankCount = adv.blankCount?.enabled ? adv.blankCount.min : 0;
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
      isLockPos: !isPlain && tileCount > 8,
      plainMode: isPlain,
      operatorFixed,
    },
    numQuestions: set.numQuestions,
    setLabel: `${tileCount}tile`,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// PAGE
// ─────────────────────────────────────────────────────────────────────────────
export default function CreateAssignment() {
  const navigate = useNavigate();
  const { user } = useAuth();

  // ── Details ─────────────────────────────────────────────────────────────────
  const [title, setTitle]             = useState('');
  const [description, setDescription] = useState('');
  const [dueDate, setDueDate]         = useState('');

  // ── Puzzle config ───────────────────────────────────────────────────────────
  const [puzzleMode, setPuzzleMode] = useState('cross');
  const [crossBonus, setCrossBonus] = useState(true);
  const [puzzleSets, setPuzzleSets] = useState(DEFAULT_PUZZLE_SETS);

  // ── Students ────────────────────────────────────────────────────────────────
  const [students, setStudents]               = useState([]);
  const [studentsLoading, setStudentsLoading] = useState(true);
  const [studentSearch, setStudentSearch]     = useState('');
  const [assignedTo, setAssignedTo]           = useState([]);

  // ── Submit ──────────────────────────────────────────────────────────────────
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState({});

  // ── Load students ───────────────────────────────────────────────────────────
  useEffect(() => {
    api.assignments.admin.getAvailableStudents()
      .then(res => setStudents(res.students ?? []))
      .catch(() => {})
      .finally(() => setStudentsLoading(false));
  }, []);

  // ── Derived ─────────────────────────────────────────────────────────────────
  const totalQuestions = useMemo(
    () => puzzleSets.reduce((s, p) => s + (p.numQuestions || 0), 0),
    [puzzleSets],
  );

  const filteredStudents = useMemo(() => {
    const q = studentSearch.trim().toLowerCase();
    if (!q) return students;
    return students.filter(s => {
      const name = (
        s.fullName || s.displayName ||
        `${s.firstName ?? ''} ${s.lastName ?? ''}`.trim() ||
        s.username || ''
      ).toLowerCase();
      const school = (s.school || '').toLowerCase();
      return name.includes(q) || school.includes(q);
    });
  }, [students, studentSearch]);

  const canCreate = title.trim() && dueDate && totalQuestions > 0 && assignedTo.length > 0;

  const displayName = user?.rawUser?.firstName
    ? `${user.rawUser.firstName}${user.rawUser.lastName ? ' ' + user.rawUser.lastName : ''}`
    : user?.email ?? '';
  const userInitial = (user?.rawUser?.firstName?.[0] || user?.email?.[0] || 'A').toUpperCase();

  // ── Student selection ───────────────────────────────────────────────────────
  const toggleStudent = useCallback((id) => {
    setAssignedTo(prev => prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id]);
    setErrors(p => ({ ...p, students: null }));
  }, []);

  const selectAll = () => setAssignedTo(filteredStudents.map(s => s.id));
  const clearAll  = () => setAssignedTo([]);

  // ── Validation ──────────────────────────────────────────────────────────────
  const validate = () => {
    const errs = {};
    if (!title.trim())   errs.title   = 'Assignment title is required.';
    if (!dueDate)        errs.dueDate = 'Due date is required.';
    else if (new Date(dueDate) <= new Date()) errs.dueDate = 'Due date must be set in the future.';
    if (totalQuestions < 1) errs.sets = 'At least one question must be configured.';
    if (assignedTo.length === 0) errs.students = 'At least one student must be assigned.';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  // ── Create ──────────────────────────────────────────────────────────────────
  const handleCreate = async () => {
    if (!validate()) {
      toast.error('Please review the errors and try again.');
      return;
    }
    setSaving(true);
    try {
      const optionSets = puzzleSets.map(s => puzzleSetToOptionSet(s, puzzleMode));
      const payload = {
        title:         title.trim(),
        description:   description.trim() || title.trim(),
        totalQuestions,
        dueDate:       new Date(dueDate).toISOString(),
        optionSets,
      };
      const created = await api.assignments.admin.create(payload);
      if (assignedTo.length > 0) {
        await api.assignments.admin.assign(created.assignment.id, assignedTo);
      }
      toast.success('Assignment created successfully.');
      navigate(`/admin-assignment/${created.assignment.id}`);
    } catch (err) {
      toast.error(err.message || 'Failed to create assignment.');
    } finally {
      setSaving(false);
    }
  };

  const updateSet = (id, updated) =>
    setPuzzleSets(prev => prev.map(p => p.id === id ? { ...p, ...updated } : p));
  const removeSet = (id) =>
    setPuzzleSets(prev => prev.filter(p => p.id !== id));
  const addSet = () => {
    if (puzzleSets.length >= 6) return;
    setPuzzleSets(prev => [
      ...prev,
      { id: nextSetId(), tileCount: 9, numQuestions: 3, advancedCfg: DEFAULT_ADV_CFG },
    ]);
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-stone-100" style={{ animation: 'pageIn 0.2s ease both' }}>
      <style>{`
        @keyframes pageIn  { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes fadeUp  { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes shimmer { 0% { background-position: -200% 0; } 100% { background-position: 200% 0; } }
        .skeleton { background: linear-gradient(90deg, #f0ede8 25%, #e5e1da 50%, #f0ede8 75%); background-size: 200% 100%; animation: shimmer 1.4s infinite; }
      `}</style>

      {/* ── Sticky header ───────────────────────────────────────────────────── */}
      <header className="bg-white border-b border-stone-200 sticky top-0 z-30">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 flex items-center gap-4">
          <button
            onClick={() => navigate(-1)}
            className="flex items-center gap-1.5 text-stone-600 hover:text-stone-900 transition-colors font-mono text-[11px] tracking-wide cursor-pointer shrink-0 select-none"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
            Back
          </button>

          <div className="w-px h-4 bg-stone-200 shrink-0" />

          <div className="flex-1 min-w-0">
            <h1 className="text-sm font-semibold text-stone-900 truncate">New Assignment</h1>
            <p className="text-[10px] text-stone-500 font-mono hidden sm:block">
              Configure puzzle sets and assign to students
            </p>
          </div>

          {user && (
            <div className="hidden sm:flex items-center gap-2 shrink-0">
              <div className="w-7 h-7 rounded-full bg-amber-100 border border-amber-200 flex items-center justify-center">
                <span className="font-mono text-[10px] font-bold text-amber-700">{userInitial}</span>
              </div>
              <span className="text-[11px] text-stone-600 font-mono max-w-[120px] truncate">{displayName}</span>
            </div>
          )}
        </div>
      </header>

      {/* ── Main content ────────────────────────────────────────────────────── */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-5 pb-28 md:pb-10">
        <div className="md:grid md:grid-cols-[1fr_300px] lg:grid-cols-[1fr_320px] md:gap-6 md:items-start">

          {/* ── Left column ─────────────────────────────────────────────────── */}
          <div className="space-y-4">

            {/* Section 01: Details */}
            <SectionCard step="01" title="Assignment Details" icon={BookOpen} delay={0}>
              <div className="space-y-4">

                <FieldGroup label="Title" required error={errors.title}>
                  <input
                    type="text"
                    value={title}
                    onChange={e => { setTitle(e.target.value); setErrors(p => ({ ...p, title: null })); }}
                    placeholder="e.g. Week 3 — Linear Equations"
                    className={fieldCls(!!errors.title)}
                  />
                </FieldGroup>

                <FieldGroup label="Description" hint="Optional — visible to students">
                  <textarea
                    value={description}
                    onChange={e => setDescription(e.target.value)}
                    rows={2}
                    placeholder="Brief instructions or context for this assignment…"
                    className="w-full px-3 py-2.5 rounded-xl border border-stone-300 text-sm text-stone-800 bg-white placeholder:text-stone-400 outline-none focus:border-amber-500 transition-colors resize-none font-mono"
                  />
                </FieldGroup>

                <FieldGroup label="Due Date" required error={errors.dueDate}>
                  <input
                    type="datetime-local"
                    value={dueDate}
                    onChange={e => { setDueDate(e.target.value); setErrors(p => ({ ...p, dueDate: null })); }}
                    className={fieldCls(!!errors.dueDate)}
                  />
                </FieldGroup>
              </div>
            </SectionCard>

            {/* Section 02: Puzzle Configuration */}
            <SectionCard step="02" title="Puzzle Configuration" icon={Settings2} delay={60} error={errors.sets}>

              {/* Mode selector */}
              <div className="mb-5">
                <FieldLabel>Game Mode</FieldLabel>
                <div className="grid grid-cols-3 gap-2 mt-2">
                  {PUZZLE_MODES.map(m => (
                    <button
                      key={m.key}
                      type="button"
                      onClick={() => !m.disabled && setPuzzleMode(m.key)}
                      disabled={m.disabled}
                      className={`relative text-left px-3 py-2.5 rounded-xl border-2 transition-all min-h-[60px]
                        ${m.disabled
                          ? 'border-stone-200 bg-stone-100 cursor-not-allowed opacity-50'
                          : puzzleMode === m.key
                            ? 'border-amber-500 bg-amber-600 cursor-pointer shadow-sm'
                            : 'border-stone-200 bg-stone-50 hover:border-amber-300 hover:bg-amber-50/60 cursor-pointer'
                        }`}
                    >
                      <div className={`font-mono text-[10px] font-bold tracking-widest uppercase
                        ${m.disabled ? 'text-stone-400' : puzzleMode === m.key ? 'text-white' : 'text-stone-700'}`}>
                        {m.label}
                      </div>
                      <div className={`text-[9px] mt-0.5 leading-tight
                        ${m.disabled ? 'text-stone-400' : puzzleMode === m.key ? 'text-amber-100' : 'text-stone-500'}`}>
                        {m.desc}
                      </div>
                      {m.disabled && (
                        <span className="absolute top-1.5 right-1.5 font-mono text-[7px] font-bold bg-stone-200 text-stone-600 px-1 py-0.5 rounded tracking-widest">
                          SOON
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              </div>

              {/* Cross bonus toggle */}
              {puzzleMode === 'cross' && (
                <div
                  style={{ animation: 'fadeUp 0.15s ease both' }}
                  className={`flex items-center justify-between px-4 py-3 rounded-xl border-2 cursor-pointer transition-colors select-none mb-5
                    ${crossBonus ? 'border-amber-300 bg-amber-50' : 'border-stone-200 bg-stone-50 hover:border-stone-300'}`}
                  onClick={() => setCrossBonus(v => !v)}
                >
                  <div>
                    <div className={`text-xs font-semibold ${crossBonus ? 'text-amber-800' : 'text-stone-700'}`}>
                      Bonus Slots
                    </div>
                    <div className={`text-[10px] mt-0.5 font-mono ${crossBonus ? 'text-amber-700' : 'text-stone-500'}`}>
                      {crossBonus
                        ? 'P×2, P×3, E×2, E×3 multipliers active'
                        : 'All positions scored at base value (px1)'}
                    </div>
                  </div>
                  <ToggleSwitch enabled={crossBonus} onChange={setCrossBonus} color="amber" />
                </div>
              )}

              {/* Puzzle sets */}
              <FieldLabel className="mb-1">Puzzle Sets</FieldLabel>
              <p className="text-[11px] text-stone-600 font-mono mb-3">
                Each set defines a tile count and number of questions. Students work through sets in order.
              </p>

              <div className="space-y-2">
                {puzzleSets.map((set, idx) => (
                  <PuzzleSetRow
                    key={set.id}
                    set={set}
                    mode={puzzleMode}
                    label={`Set ${String.fromCharCode(65 + idx)}`}
                    onChange={updated => updateSet(set.id, updated)}
                    onRemove={puzzleSets.length > 1 ? () => removeSet(set.id) : null}
                  />
                ))}
              </div>

              {puzzleSets.length < 6 && (
                <button
                  type="button"
                  onClick={addSet}
                  className="w-full mt-2 py-2.5 rounded-xl border-2 border-dashed border-stone-300 text-stone-500 font-mono text-[10px] tracking-widest uppercase hover:border-amber-400 hover:text-amber-600 hover:bg-amber-50/40 transition-colors cursor-pointer"
                >
                  + Add Set
                </button>
              )}

              <div className="mt-3 px-4 py-3 rounded-xl bg-stone-50 border border-stone-200 flex items-center justify-between">
                <span className="font-mono text-[10px] tracking-widest uppercase text-stone-600">Total Questions</span>
                <span className={`font-mono text-xl font-bold ${totalQuestions > 0 ? 'text-amber-600' : 'text-stone-400'}`}>
                  {totalQuestions}
                </span>
              </div>
            </SectionCard>

            {/* Section 03: Students */}
            <SectionCard step="03" title="Assign Students" icon={Users} delay={120} error={errors.students}>

              <div className="relative mb-3">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-stone-400 pointer-events-none" />
                <input
                  type="text"
                  value={studentSearch}
                  onChange={e => setStudentSearch(e.target.value)}
                  placeholder="Search by name or school…"
                  className="w-full pl-9 pr-4 py-2.5 text-sm rounded-xl border border-stone-300 bg-stone-50 font-mono outline-none focus:border-amber-500 focus:bg-white transition-colors text-stone-800 placeholder:text-stone-400"
                />
              </div>

              <div className="flex items-center justify-between mb-3">
                <span className="font-mono text-[10px] text-stone-500">
                  {studentsLoading
                    ? 'Loading students…'
                    : `${filteredStudents.length} student${filteredStudents.length !== 1 ? 's' : ''}${assignedTo.length > 0 ? ` · ${assignedTo.length} selected` : ''}`}
                </span>
                <div className="flex gap-3">
                  {!studentsLoading && filteredStudents.length > 0 && (
                    <button
                      onClick={selectAll}
                      className="font-mono text-[10px] text-amber-700 hover:text-amber-900 transition-colors cursor-pointer tracking-wide font-semibold"
                    >
                      Select All
                    </button>
                  )}
                  {assignedTo.length > 0 && (
                    <button
                      onClick={clearAll}
                      className="font-mono text-[10px] text-stone-500 hover:text-stone-700 transition-colors cursor-pointer tracking-wide"
                    >
                      Clear
                    </button>
                  )}
                </div>
              </div>

              {studentsLoading ? (
                <div className="space-y-2">
                  {[1, 2, 3, 4, 5].map(i => (
                    <div key={i} className="skeleton h-14 rounded-xl" style={{ animationDelay: `${i * 70}ms` }} />
                  ))}
                </div>
              ) : students.length === 0 ? (
                <div className="text-center py-12">
                  <Users className="w-8 h-8 mx-auto mb-2 text-stone-300" />
                  <p className="text-sm text-stone-600">No active students available.</p>
                  <p className="text-xs text-stone-400 font-mono mt-1">
                    Approve students from the User Management panel first.
                  </p>
                </div>
              ) : filteredStudents.length === 0 ? (
                <div className="text-center py-10">
                  <p className="text-sm text-stone-600">No students match your search.</p>
                </div>
              ) : (
                <div className="space-y-1.5">
                  {filteredStudents.map(s => {
                    const name = s.fullName || s.displayName ||
                      `${s.firstName ?? ''} ${s.lastName ?? ''}`.trim() || s.username;
                    const sub = s.nickname || s.school;
                    const initial = (name?.[0] || 'S').toUpperCase();
                    return (
                      <StudentCard
                        key={s.id}
                        name={name}
                        sub={sub && sub !== name ? sub : null}
                        school={s.school && s.school !== sub ? s.school : null}
                        initial={initial}
                        selected={assignedTo.includes(s.id)}
                        onClick={() => toggleStudent(s.id)}
                      />
                    );
                  })}
                </div>
              )}
            </SectionCard>
          </div>

          {/* ── Right: summary sidebar (desktop) ─────────────────────────────── */}
          <div className="hidden md:block">
            <SummaryPanel
              title={title}
              puzzleMode={puzzleMode}
              puzzleSets={puzzleSets}
              totalQuestions={totalQuestions}
              assignedCount={assignedTo.length}
              dueDate={dueDate}
              saving={saving}
              canCreate={!!canCreate}
              onCreate={handleCreate}
            />
          </div>
        </div>
      </div>

      {/* ── Mobile sticky bottom bar ─────────────────────────────────────────── */}
      <div className="md:hidden fixed bottom-0 inset-x-0 bg-white/95 border-t border-stone-200 px-4 py-3 z-30 shadow-lg backdrop-blur-sm">
        <div className="flex items-center gap-3 max-w-lg mx-auto">
          <div className="flex-1 min-w-0 space-y-0.5">
            <p className="font-mono text-[10px] text-stone-600 font-semibold truncate">
              {title.trim() || 'Untitled Assignment'}
            </p>
            <p className="font-mono text-[9px] text-stone-500">
              {totalQuestions} question{totalQuestions !== 1 ? 's' : ''}
              &nbsp;·&nbsp;{assignedTo.length} student{assignedTo.length !== 1 ? 's' : ''}
            </p>
          </div>
          <button
            onClick={handleCreate}
            disabled={saving || !canCreate}
            className={`px-5 py-2.5 rounded-xl text-sm font-semibold font-mono tracking-wide transition-all shrink-0
              ${canCreate && !saving
                ? 'bg-amber-600 text-white hover:bg-amber-700 cursor-pointer active:scale-[0.97] shadow-sm'
                : 'bg-stone-200 text-stone-500 cursor-not-allowed'
              }`}
          >
            {saving ? (
              <span className="inline-flex items-center gap-1.5">
                <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Creating
              </span>
            ) : (
              'Create'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SUMMARY PANEL
// ─────────────────────────────────────────────────────────────────────────────
function SummaryPanel({
  title, puzzleMode, puzzleSets, totalQuestions,
  assignedCount, dueDate, saving, canCreate, onCreate,
}) {
  const blockers = [];
  if (!title.trim())      blockers.push('Enter an assignment title');
  if (!dueDate)           blockers.push('Set a due date');
  if (totalQuestions < 1) blockers.push('Configure at least one question');
  if (assignedCount < 1)  blockers.push('Select at least one student');

  return (
    <div className="sticky top-[73px] space-y-3" style={{ animation: 'fadeUp 0.3s ease both' }}>
      <div className="bg-white rounded-2xl border border-stone-200 shadow-sm p-4">
        <div className="font-mono text-[9px] tracking-[0.3em] uppercase text-stone-500 mb-3">Summary</div>

        {title.trim() ? (
          <p className="text-sm font-semibold text-stone-800 mb-3 leading-snug line-clamp-2">{title.trim()}</p>
        ) : (
          <p className="text-sm text-stone-400 italic mb-3">Untitled Assignment</p>
        )}

        <div className="space-y-2 mb-3">
          <SumRow label="Mode"      value={puzzleMode.charAt(0).toUpperCase() + puzzleMode.slice(1)} />
          <SumRow label="Sets"      value={puzzleSets.length} />
          <SumRow
            label="Questions"
            value={
              <span className={totalQuestions > 0 ? 'text-amber-600 font-bold' : 'text-stone-400'}>
                {totalQuestions}
              </span>
            }
          />
          <SumRow
            label="Students"
            value={
              assignedCount > 0
                ? <span className="text-emerald-700 font-bold">{assignedCount}</span>
                : <span className="text-stone-400">—</span>
            }
          />
          {dueDate && (
            <SumRow
              label="Due"
              value={new Date(dueDate).toLocaleDateString('en-GB', {
                day: '2-digit', month: 'short', year: 'numeric',
              })}
            />
          )}
        </div>

        {puzzleSets.length > 0 && (
          <div className="border-t border-stone-100 pt-3">
            <div className="font-mono text-[9px] uppercase tracking-widest text-stone-500 mb-2">Puzzle Sets</div>
            <div className="space-y-1.5">
              {puzzleSets.map((set, i) => {
                const locked = set.tileCount > 8 ? set.tileCount - 8 : 0;
                return (
                  <div key={set.id} className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="font-mono text-[9px] font-bold text-stone-600 shrink-0">
                        {String.fromCharCode(65 + i)}
                      </span>
                      <span className="font-mono text-[10px] text-stone-600 truncate">
                        {set.tileCount} tiles
                        {puzzleMode === 'cross' && locked > 0 && (
                          <span className="text-amber-600"> · {locked} locked</span>
                        )}
                      </span>
                    </div>
                    <span className="font-mono text-[10px] font-bold text-stone-800 shrink-0">
                      {set.numQuestions}q
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {blockers.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5">
          <div className="font-mono text-[9px] uppercase tracking-widest text-amber-700 mb-1.5">Required</div>
          <ul className="space-y-1">
            {blockers.map((b, i) => (
              <li key={i} className="flex items-start gap-1.5">
                <AlertCircle className="w-3 h-3 text-amber-500 mt-0.5 shrink-0" />
                <span className="font-mono text-[10px] text-amber-800">{b}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <button
        onClick={onCreate}
        disabled={saving || !canCreate}
        className={`w-full py-3.5 rounded-xl font-semibold text-sm font-mono tracking-wide transition-all
          ${canCreate && !saving
            ? 'bg-amber-600 text-white hover:bg-amber-700 active:scale-[0.99] cursor-pointer shadow-sm'
            : 'bg-stone-200 text-stone-500 cursor-not-allowed'
          }`}
      >
        {saving ? (
          <span className="inline-flex items-center gap-2 justify-center">
            <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            Creating…
          </span>
        ) : (
          'Create Assignment'
        )}
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PUZZLE SET ROW
// ─────────────────────────────────────────────────────────────────────────────
function PuzzleSetRow({ set, mode, label, onChange, onRemove }) {
  const [advOpen, setAdvOpen] = useState(false);
  const adv       = set.advancedCfg ?? DEFAULT_ADV_CFG;
  const tileCount = Number.isFinite(set.tileCount) ? set.tileCount : 9;
  const locked    = mode === 'cross' && tileCount > 8 ? tileCount - 8 : 0;

  return (
    <div className="rounded-xl bg-stone-50 border border-stone-200 overflow-hidden">
      <div className="flex items-center gap-2 sm:gap-3 px-3 py-3">

        {/* Label */}
        <span className="font-mono text-[9px] font-bold tracking-widest text-stone-600 w-10 shrink-0">{label}</span>

        {/* Tile slider */}
        <div className="flex-1 min-w-0">
          <div className="font-mono text-[9px] text-stone-600 mb-1">
            <span className="font-bold text-stone-800">{tileCount}</span> tiles
            {mode === 'cross' && locked > 0 && (
              <span className="text-amber-600 ml-1.5">· {locked} locked</span>
            )}
            {mode === 'plain' && (
              <span className="text-emerald-700 ml-1.5">· all rack</span>
            )}
          </div>
          <input
            type="range"
            min={8}
            max={15}
            value={tileCount}
            onChange={e => onChange({ tileCount: +e.target.value })}
            className="w-full cursor-pointer accent-amber-500"
          />
        </div>

        {/* Questions count input */}
        <div className="shrink-0 text-center">
          <div className="font-mono text-[9px] text-stone-600 mb-1">Questions</div>
          <CountInput
            value={set.numQuestions}
            min={1}
            max={50}
            onChange={v => onChange({ numQuestions: v })}
          />
        </div>

        {/* Advanced toggle */}
        <button
          type="button"
          onClick={() => setAdvOpen(o => !o)}
          className={`shrink-0 px-2 py-1.5 rounded-lg border font-mono text-[8px] tracking-widest uppercase transition-colors cursor-pointer
            ${advOpen
              ? 'border-amber-500 bg-amber-600 text-white'
              : 'border-stone-300 bg-white text-stone-600 hover:border-amber-300 hover:text-amber-600'
            }`}
        >
          ADV
        </button>

        {onRemove && (
          <button
            type="button"
            onClick={onRemove}
            className="w-6 h-6 rounded-lg border border-stone-200 bg-white text-stone-400 hover:border-red-300 hover:text-red-500 hover:bg-red-50 transition-colors cursor-pointer flex items-center justify-center shrink-0"
          >
            <X className="w-3 h-3" />
          </button>
        )}
      </div>

      {advOpen && (
        <div className="border-t border-stone-100 bg-white px-3 pb-3 pt-2" style={{ animation: 'fadeUp 0.15s ease both' }}>
          <BingoAdvancedConfig
            advancedCfg={adv}
            setAdvancedCfg={newCfg =>
              onChange({ advancedCfg: typeof newCfg === 'function' ? newCfg(adv) : newCfg })
            }
            mode={mode}
            totalTile={tileCount}
            inline
          />
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// COUNT INPUT — matches BingoConfig style (typeable + +/- buttons)
// ─────────────────────────────────────────────────────────────────────────────
function CountInput({ value, min = 1, max = 50, onChange }) {
  const [raw, setRaw]           = useState(String(value));
  const [prevValue, setPrev]    = useState(value);
  const [isFocused, setFocused] = useState(false);

  // Sync from parent only while not typing
  if (!isFocused && prevValue !== value) {
    setPrev(value);
    setRaw(String(value));
  }

  const handleChange = (e) => {
    const str = e.target.value.replace(/\D/g, '');
    setRaw(str);
    const num = parseInt(str, 10);
    if (!isNaN(num) && num >= min && num <= max) onChange(num);
  };

  const handleBlur = () => {
    setFocused(false);
    const num = parseInt(raw, 10);
    const clamped = !isNaN(num) ? Math.min(max, Math.max(min, num)) : value;
    setRaw(String(clamped));
    if (clamped !== value) onChange(clamped);
  };

  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        onClick={() => onChange(Math.max(min, value - 1))}
        className="w-7 h-7 rounded-lg border border-stone-200 bg-white text-stone-600 font-mono font-bold hover:border-amber-400 hover:text-amber-600 transition-colors cursor-pointer flex items-center justify-center text-sm select-none active:scale-95"
      >−</button>
      <input
        type="text"
        inputMode="numeric"
        value={raw}
        onChange={handleChange}
        onFocus={() => setFocused(true)}
        onBlur={handleBlur}
        className="w-10 text-center text-sm font-bold font-mono tabular-nums text-stone-800 border border-stone-200 rounded-lg h-7 bg-white focus:border-amber-500 focus:outline-none"
      />
      <button
        type="button"
        onClick={() => onChange(Math.min(max, value + 1))}
        className="w-7 h-7 rounded-lg border border-stone-200 bg-white text-stone-600 font-mono font-bold hover:border-amber-400 hover:text-amber-600 transition-colors cursor-pointer flex items-center justify-center text-sm select-none active:scale-95"
      >+</button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// STUDENT CARD
// ─────────────────────────────────────────────────────────────────────────────
function StudentCard({ name, sub, school, initial, selected, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border-2 text-left transition-all cursor-pointer active:scale-[0.99]
        ${selected
          ? 'border-amber-400 bg-amber-50/90 shadow-sm'
          : 'border-stone-100 bg-white hover:border-stone-300 hover:bg-stone-50/80'
        }`}
    >
      <div className={`w-8 h-8 rounded-full flex items-center justify-center font-mono text-xs font-bold shrink-0 transition-all
        ${selected ? 'bg-amber-500 text-white scale-105' : 'bg-stone-200 text-stone-600'}`}>
        {selected ? <Check className="w-3.5 h-3.5" /> : initial}
      </div>
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-medium truncate transition-colors ${selected ? 'text-amber-900' : 'text-stone-800'}`}>
          {name}
        </p>
        {(sub || school) && (
          <p className="font-mono text-[10px] text-stone-500 truncate">
            {sub}{sub && school ? ' · ' : ''}{school}
          </p>
        )}
      </div>
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SMALL COMPONENTS
// ─────────────────────────────────────────────────────────────────────────────
function SectionCard({ step, title, icon: Icon, children, error, delay = 0 }) {
  return (
    <div
      className="bg-white rounded-2xl border border-stone-200 shadow-sm overflow-hidden"
      style={{ animation: `fadeUp 0.25s ease ${delay}ms both` }}
    >
      <div className="flex items-center gap-3 px-5 py-3.5 border-b border-stone-100">
        <span className="font-mono text-[9px] font-bold bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">
          {step}
        </span>
        <h2 className="text-sm font-semibold text-stone-800 flex-1">{title}</h2>
        {Icon && <Icon className="w-4 h-4 text-stone-400" />}
      </div>
      <div className="px-5 py-4">
        {children}
        {error && (
          <div className="mt-3 flex items-start gap-2 px-3 py-2 rounded-lg bg-red-50 border border-red-200">
            <AlertCircle className="w-3.5 h-3.5 text-red-400 mt-0.5 shrink-0" />
            <p className="font-mono text-[11px] text-red-700">{error}</p>
          </div>
        )}
      </div>
    </div>
  );
}

function FieldGroup({ label, required, hint, error, children }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <label className="font-mono text-[10px] font-bold uppercase tracking-widest text-stone-600">
          {label}
          {required && <span className="text-red-500 ml-0.5">*</span>}
        </label>
        {hint && <span className="font-mono text-[10px] text-stone-500">{hint}</span>}
      </div>
      {children}
      {error && <p className="mt-1 font-mono text-[11px] text-red-600">{error}</p>}
    </div>
  );
}

function FieldLabel({ children, className = '' }) {
  return (
    <div className={`font-mono text-[10px] font-bold uppercase tracking-widest text-stone-600 ${className}`}>
      {children}
    </div>
  );
}

function ToggleSwitch({ enabled, onChange, color = 'stone' }) {
  const track = {
    amber: enabled ? 'bg-amber-500 border-amber-400' : 'bg-stone-200 border-stone-300',
    stone: enabled ? 'bg-stone-700 border-stone-600' : 'bg-stone-200 border-stone-300',
  }[color] ?? 'bg-stone-200 border-stone-300';

  return (
    <button
      type="button"
      onClick={() => onChange(v => !v)}
      className={`w-10 h-6 rounded-full border-2 flex items-center transition-all cursor-pointer shrink-0 select-none
        ${track} ${enabled ? 'justify-end' : 'justify-start'}`}
      role="switch"
      aria-checked={enabled}
    >
      <div className="w-4 h-4 rounded-full bg-white shadow-sm mx-0.5 transition-all" />
    </button>
  );
}

function SumRow({ label, value }) {
  return (
    <div className="flex items-center justify-between">
      <span className="font-mono text-[9px] uppercase tracking-widest text-stone-500">{label}</span>
      <span className="font-mono text-[11px] text-stone-700">{value}</span>
    </div>
  );
}

const fieldCls = (hasError) =>
  `w-full px-3 py-2.5 rounded-xl border text-sm font-mono text-stone-800 bg-white placeholder:text-stone-400 outline-none transition-colors
   ${hasError ? 'border-red-300 focus:border-red-400 bg-red-50/20' : 'border-stone-300 focus:border-amber-500'}`;
