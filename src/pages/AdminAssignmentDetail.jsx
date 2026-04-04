/**
 * AdminAssignmentDetail — /admin-assignment/:assignmentId
 * Admin real-time view: all students' progress, current question, answers.
 * Polls every 10 s to stay up-to-date.
 */
import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { api } from "@/api/apiClient";
import { BingoTile } from "@/components/bingo/BingoTile";
import { TILE_POINTS } from "@/lib/bingoGenerator";
import {
  ArrowLeft, RefreshCw, Clock, Award, Timer,
  Target, Calendar, AlertTriangle, ChevronDown, ChevronUp,
  Layers, User, Users
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

// ── Slot type config ──────────────────────────────────────────────────────────

const SLOT_CFG = {
  px1:     { empty: "bg-stone-200 border-stone-400",    label: "",    dot: "",              text: "" },
  px2:     { empty: "bg-orange-100 border-orange-500",  label: "2×P", dot: "bg-orange-600", text: "text-orange-700" },
  px3:     { empty: "bg-sky-100 border-sky-500",        label: "3×P", dot: "bg-sky-600",    text: "text-sky-700" },
  px3star: { empty: "bg-sky-100 border-sky-500",        label: "★",   dot: "bg-sky-600",    text: "text-sky-700" },
  ex2:     { empty: "bg-yellow-100 border-yellow-500",  label: "2×E", dot: "bg-yellow-600", text: "text-yellow-700" },
  ex3:     { empty: "bg-red-100 border-red-500",        label: "3×E", dot: "bg-red-600",    text: "text-red-700" },
};
function slotCfg(type) { return SLOT_CFG[type] ?? SLOT_CFG.px1; }

// ── constants ─────────────────────────────────────────────────────────────────

const POLL_INTERVAL = 10_000;

const STATUS_CFG = {
  todo:       { label: "Not Started", cls: "bg-stone-100 text-stone-600",     dot: "bg-stone-400",   row: "border-stone-100" },
  inprogress: { label: "In Progress", cls: "bg-amber-100 text-amber-700",     dot: "bg-amber-500",   row: "border-amber-100 bg-amber-50/40" },
  complete:   { label: "Completed",   cls: "bg-emerald-100 text-emerald-700", dot: "bg-emerald-500", row: "border-emerald-100 bg-emerald-50/30" },
  done:       { label: "Graded",      cls: "bg-blue-100 text-blue-700",       dot: "bg-blue-500",    row: "border-blue-100 bg-blue-50/30" },
};

// ── helpers ───────────────────────────────────────────────────────────────────

function fmtDate(d) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function fmtDateTime(d) {
  if (!d) return "—";
  return new Date(d).toLocaleString("en-GB", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit"
  });
}

function fmtSecs(s) {
  if (s == null) return "—";
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${s % 60}s`;
}

function studentName(studentMap, id) {
  const s = studentMap[id];
  if (!s) return `Student (${id.slice(-6)})`;
  return s.firstName ? `${s.firstName} ${s.lastName ?? ""}`.trim() : s.username;
}

function studentSchool(studentMap, id) {
  return studentMap[id]?.school ?? "";
}

// ── Board slot ────────────────────────────────────────────────────────────────

function BoardSlot({ slotType, tile, isLocked, idx }) {
  const cfg = slotCfg(slotType);
  const hasBonus = slotType && slotType !== "px1";

  return (
    <div className="flex flex-col items-center gap-0.5">
      <div className="relative">
        {tile ? (
          <>
            <BingoTile
              token={tile}
              role={isLocked ? "locked" : "board-placed"}
              size="sm"
              points={TILE_POINTS[tile]}
            />
            {hasBonus && (
              <div className={`absolute -top-1 -left-1 w-2.5 h-2.5 rounded-full ${cfg.dot} border border-white pointer-events-none z-10`} />
            )}
          </>
        ) : (
          <div className={`w-9 h-9 rounded-lg border-2 flex flex-col items-center justify-center ${cfg.empty}`}>
            {slotType === "px3star"
              ? <span className="text-sky-400 leading-none" style={{ fontSize: 14 }}>★</span>
              : hasBonus
                ? <span className={`font-mono font-bold leading-none ${cfg.text}`} style={{ fontSize: 7 }}>{cfg.label}</span>
                : null
            }
          </div>
        )}
      </div>
      <span className="font-mono" style={{ fontSize: 7, color: "#a8a29e" }}>{idx + 1}</span>
      {hasBonus && tile && (
        <span className={`font-mono font-bold leading-none ${cfg.text}`} style={{ fontSize: 6 }}>
          {slotType === "px3star" ? "★3×L" : cfg.label}
        </span>
      )}
    </div>
  );
}

// ── Static board ──────────────────────────────────────────────────────────────

function StaticBoard({ answerText, listPosLock, slotTypes, questionMode, label }) {
  const boardTiles = (answerText || "").split(" ").filter(Boolean);
  const n = slotTypes?.length || boardTiles.length;
  if (n === 0) return <span className="text-xs text-stone-300 italic">no data</span>;

  const lockedMap = {};
  (listPosLock || []).forEach(({ pos, value }) => { lockedMap[pos] = value; });

  return (
    <div>
      <p className="text-[8px] tracking-[0.25em] uppercase font-mono font-semibold text-stone-300 mb-2">{label}</p>
      <div
        className="bg-white rounded-xl border border-stone-100 p-2.5"
        style={{ boxShadow: "0 0 12px rgba(120,100,30,0.04)" }}
      >
        <div className="flex flex-wrap gap-1.5">
          {Array.from({ length: n }).map((_, i) => {
            const st = slotTypes?.[i] ?? "px1";
            const lockedTile = lockedMap[i];
            const placedTile = questionMode ? undefined : boardTiles[i];
            return (
              <BoardSlot
                key={i}
                idx={i}
                slotType={st}
                tile={lockedTile ?? placedTile ?? null}
                isLocked={!!lockedTile}
              />
            );
          })}
        </div>
        {/* Legend */}
        {slotTypes?.some(t => t && t !== "px1") && (
          <div className="mt-2 pt-2 border-t border-stone-50 flex flex-wrap gap-x-3 gap-y-0.5">
            {[
              { type: "px2",  show: slotTypes.includes("px2") },
              { type: "px3",  show: slotTypes.includes("px3") || slotTypes.includes("px3star") },
              { type: "ex2",  show: slotTypes.includes("ex2") },
              { type: "ex3",  show: slotTypes.includes("ex3") },
            ].filter(l => l.show).map(l => {
              const c = slotCfg(l.type);
              return (
                <div key={l.type} className="flex items-center gap-1">
                  <div className={`w-2 h-2 rounded-full ${c.dot}`} />
                  <span className={`font-mono text-[8px] font-semibold ${c.text}`}>{c.label}</span>
                </div>
              );
            })}
            {listPosLock?.length > 0 && (
              <div className="flex items-center gap-1">
                <div className="w-2 h-2 rounded-full bg-amber-400" />
                <span className="font-mono text-[8px] font-semibold text-amber-600">Fixed</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Rack strip fallback ───────────────────────────────────────────────────────

function RackStrip({ text, label }) {
  const tokens = (text || "").split(" ").filter(Boolean);
  return (
    <div>
      <p className="text-[8px] tracking-[0.25em] uppercase font-mono font-semibold text-stone-300 mb-1.5">{label}</p>
      {tokens.length === 0
        ? <span className="text-stone-300 text-xs italic">empty</span>
        : (
          <div className="flex flex-wrap gap-1">
            {tokens.map((t, i) => (
              <BingoTile key={i} token={t} role="rack" size="sm" points={TILE_POINTS[t]} />
            ))}
          </div>
        )
      }
    </div>
  );
}

// ── Per-student answers section ───────────────────────────────────────────────

function StudentAnswers({ answers }) {
  if (!answers || answers.length === 0) {
    return <p className="text-xs text-stone-400 text-center py-4">No answers yet.</p>;
  }
  return (
    <div className="space-y-3">
      {answers.map((a, i) => {
        const hasBoard = a.slotTypes?.length > 0;
        return (
          <div key={i} className="rounded-xl border border-stone-100 overflow-hidden bg-white">
            {/* header */}
            <div className="flex items-center justify-between px-3 py-2 bg-stone-50 border-b border-stone-100">
              <div className="flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-amber-200 text-amber-800 text-[10px] font-bold flex items-center justify-center font-mono">
                  {a.questionNumber}
                </span>
                <span className="text-[10px] font-mono font-semibold text-stone-500 uppercase tracking-wider">
                  Q{a.questionNumber}
                </span>
              </div>
              <div className="flex items-center gap-3 text-xs">
                {a.score != null && (
                  <span className="flex items-center gap-1 font-semibold text-emerald-600">
                    <Award className="w-3 h-3" />{a.score} pts
                  </span>
                )}
                {a.timeTaken != null && (
                  <span className="flex items-center gap-1 text-stone-400">
                    <Timer className="w-3 h-3" />{fmtSecs(a.timeTaken)}
                  </span>
                )}
                <span className="text-stone-300 text-[10px] font-mono">{fmtDateTime(a.answeredAt)}</span>
              </div>
            </div>

            {/* board / tiles */}
            <div className="px-3 py-3 space-y-3">
              {hasBoard ? (
                <>
                  <StaticBoard
                    answerText={a.answerText}
                    listPosLock={a.listPosLock}
                    slotTypes={a.slotTypes}
                    questionMode={true}
                    label="BOARD · question layout"
                  />
                  <StaticBoard
                    answerText={a.answerText}
                    listPosLock={a.listPosLock}
                    slotTypes={a.slotTypes}
                    questionMode={false}
                    label="BOARD · answer (with slot bonuses)"
                  />
                </>
              ) : (
                <>
                  <RackStrip text={a.questionText} label="RACK · given tiles" />
                  <RackStrip text={a.answerText}   label="ANSWER · placed tiles" />
                </>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Student row ───────────────────────────────────────────────────────────────

function StudentRow({ student, studentMap, totalQuestions, optionSets }) {
  const [expanded, setExpanded] = useState(false);

  const status = student.status ?? "todo";
  const cfg = STATUS_CFG[status] ?? STATUS_CFG.todo;
  const answered = student.answeredQuestions ?? student.answers?.length ?? 0;
  const pct = totalQuestions > 0 ? Math.round((answered / totalQuestions) * 100) : 0;
  const sid = typeof student.studentId === "string" ? student.studentId : String(student.studentId);

  const setIdx = student.currentQuestionSet ?? 0;
  const qInSet = student.questionsCompletedInCurrentSet ?? 0;
  const currentSet = optionSets?.[setIdx];
  const overallQ = (optionSets?.slice(0, setIdx).reduce((s, os) => s + os.numQuestions, 0) ?? 0) + qInSet + 1;

  const sortedAnswers = [...(student.answers || [])].sort(
    (a, b) => a.questionNumber - b.questionNumber
  );
  const totalScore = sortedAnswers.reduce((s, a) => s + (a.score ?? 0), 0);

  return (
    <div className={`rounded-xl border ${cfg.row} overflow-hidden transition-all`}>
      <button
        className="w-full text-left px-4 py-3.5 hover:bg-black/2 active:bg-black/4 transition-colors"
        onClick={() => setExpanded(v => !v)}
      >
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-stone-200 flex items-center justify-center shrink-0">
            <User className="w-4 h-4 text-stone-500" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-semibold text-stone-800 text-sm truncate">
                {studentName(studentMap, sid)}
              </p>
              <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${cfg.cls}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
                {cfg.label}
              </span>
            </div>
            {studentSchool(studentMap, sid) && (
              <p className="text-xs text-stone-400 truncate mt-0.5">{studentSchool(studentMap, sid)}</p>
            )}
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <div className="text-right hidden sm:block">
              <p className="text-sm font-bold text-stone-800">{answered}/{totalQuestions}</p>
              <p className="text-xs text-stone-400">{pct}%</p>
            </div>
            {expanded ? <ChevronUp className="w-4 h-4 text-stone-400" /> : <ChevronDown className="w-4 h-4 text-stone-400" />}
          </div>
        </div>

        {/* Progress bar */}
        <div className="mt-2.5 h-1.5 bg-stone-100 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${
              status === "complete" || status === "done" ? "bg-emerald-500"
              : status === "inprogress" ? "bg-amber-500"
              : "bg-stone-300"
            }`}
            style={{ width: `${pct}%` }}
          />
        </div>

        {/* Current position */}
        {status === "inprogress" && (
          <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-stone-400">
            <span className="flex items-center gap-1">
              <Layers className="w-3 h-3" />
              Set {setIdx + 1}{currentSet?.setLabel ? ` · ${currentSet.setLabel}` : ""}
            </span>
            <span className="flex items-center gap-1">
              <Target className="w-3 h-3" />
              Currently on Q{overallQ}
            </span>
            {totalScore > 0 && (
              <span className="flex items-center gap-1 text-emerald-500">
                <Award className="w-3 h-3" />{totalScore} pts so far
              </span>
            )}
          </div>
        )}
        {(status === "complete" || status === "done") && totalScore > 0 && (
          <div className="mt-1.5 text-xs text-emerald-500 flex items-center gap-1">
            <Award className="w-3 h-3" />{totalScore} total pts
          </div>
        )}

        {/* Timestamps */}
        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-stone-300 font-mono">
          {student.startedAt && <span>Started {fmtDateTime(student.startedAt)}</span>}
          {student.completedAt && <span>Completed {fmtDateTime(student.completedAt)}</span>}
          {student.markedDoneAt && <span>Graded {fmtDateTime(student.markedDoneAt)}</span>}
        </div>
      </button>

      {expanded && (
        <div className="border-t border-stone-100 px-4 pb-4 pt-3">
          <p className="text-[8px] tracking-[0.3em] uppercase font-mono font-semibold text-stone-300 mb-3">
            ANSWERS · {sortedAnswers.length}
          </p>
          <StudentAnswers answers={sortedAnswers} />
        </div>
      )}
    </div>
  );
}

// ── Summary stat tile ─────────────────────────────────────────────────────────

function StatTile({ label, value, cls }) {
  return (
    <div className={`rounded-xl p-3 text-center ${cls}`}>
      <p className="text-2xl font-bold">{value}</p>
      <p className="text-xs mt-0.5 opacity-75">{label}</p>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function AdminAssignmentDetail() {
  const { assignmentId } = useParams();
  const navigate = useNavigate();

  const [assignment, setAssignment] = useState(null);
  const [studentMap, setStudentMap] = useState({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [error, setError] = useState(null);
  const intervalRef = useRef(null);

  const fetchData = useCallback(async (silent = false) => {
    if (!silent) setRefreshing(true);
    try {
      const [aData, studsData] = await Promise.all([
        api.assignments.admin.getAssignment(assignmentId),
        api.assignments.admin.getAvailableStudents(),
      ]);
      setAssignment(aData.assignment);
      const map = {};
      (studsData.students || []).forEach(s => { map[s.id] = s; });
      setStudentMap(map);
      setLastUpdated(new Date());
      setError(null);
    } catch (e) {
      if (!silent) setError(e.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [assignmentId]);

  useEffect(() => { fetchData(false); }, [fetchData]);

  useEffect(() => {
    intervalRef.current = setInterval(() => fetchData(true), POLL_INTERVAL);
    return () => clearInterval(intervalRef.current);
  }, [fetchData]);

  if (loading) return (
    <div className="min-h-screen bg-stone-50 p-4 md:p-8">
      <div className="max-w-4xl mx-auto space-y-4 animate-pulse">
        <div className="h-6 bg-amber-100 rounded w-36" />
        <div className="h-44 bg-amber-100 rounded-xl" />
        {[1, 2, 3].map(i => <div key={i} className="h-24 bg-amber-100 rounded-xl" />)}
      </div>
    </div>
  );

  if (error) return (
    <div className="min-h-screen bg-stone-50 p-8 flex flex-col items-center justify-center gap-4">
      <p className="text-red-500 text-sm">{error}</p>
      <Button variant="outline" onClick={() => navigate(-1)}>Go Back</Button>
    </div>
  );

  const a = assignment;
  const stats = a?.statistics ?? {};
  const students = a?.students ?? [];
  const total = a?.totalQuestions ?? 0;
  const isOverdue = a?.dueDate && new Date(a.dueDate) <= new Date();

  const ORDER = { inprogress: 0, todo: 1, complete: 2, done: 3 };
  const sortedStudents = [...students].sort(
    (a, b) => (ORDER[a.status] ?? 99) - (ORDER[b.status] ?? 99)
  );

  return (
    <div className="min-h-screen bg-linear-to-br from-stone-50 to-amber-50/40 p-4 md:p-8">
      <div className="max-w-4xl mx-auto space-y-5">

        {/* Back + refresh */}
        <div className="flex items-center justify-between">
          <button
            onClick={() => navigate(-1)}
            className="flex items-center gap-1.5 text-stone-500 hover:text-amber-700 active:text-amber-800 text-sm transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Dashboard
          </button>
          <div className="flex items-center gap-2">
            {lastUpdated && (
              <span className="text-[10px] text-stone-400 font-mono hidden sm:inline">
                Updated {lastUpdated.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
              </span>
            )}
            <button
              onClick={() => fetchData(false)}
              disabled={refreshing}
              className="p-2 rounded-lg hover:bg-amber-50 active:bg-amber-100 transition-colors"
            >
              <RefreshCw className={`w-4 h-4 text-stone-400 ${refreshing ? "animate-spin" : ""}`} />
            </button>
          </div>
        </div>

        {/* Assignment header */}
        <Card className="border-0 shadow-sm">
          <CardContent className="p-5">
            <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
              <div className="flex-1 min-w-0">
                <h1 className="text-xl font-bold text-stone-900 leading-tight">{a?.title}</h1>
                {a?.description && (
                  <p className="text-sm text-stone-500 mt-1">{a.description}</p>
                )}
              </div>
              {isOverdue && (
                <span className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full bg-red-100 text-red-600 font-medium shrink-0">
                  <AlertTriangle className="w-3 h-3" />Overdue
                </span>
              )}
            </div>

            <div className="flex flex-wrap gap-x-5 gap-y-1.5 text-xs text-stone-500 mb-4">
              <span className="flex items-center gap-1.5"><Target className="w-3.5 h-3.5" />{total} problems</span>
              <span className="flex items-center gap-1.5"><Calendar className="w-3.5 h-3.5" />Due {fmtDate(a?.dueDate)}</span>
              {a?.timeLimitSeconds && (
                <span className="flex items-center gap-1.5"><Clock className="w-3.5 h-3.5" />{fmtSecs(a.timeLimitSeconds)}/question</span>
              )}
              <span className="flex items-center gap-1.5"><Users className="w-3.5 h-3.5" />{students.length} students</span>
            </div>

            <div className="grid grid-cols-4 gap-2">
              <StatTile label="Not Started" value={stats.statusBreakdown?.todo ?? 0}       cls="bg-stone-100 text-stone-600" />
              <StatTile label="In Progress" value={stats.statusBreakdown?.inprogress ?? 0} cls="bg-amber-100 text-amber-700" />
              <StatTile label="Completed"   value={stats.statusBreakdown?.complete ?? 0}   cls="bg-emerald-100 text-emerald-700" />
              <StatTile label="Graded"      value={stats.statusBreakdown?.done ?? 0}       cls="bg-blue-100 text-blue-700" />
            </div>

            {students.length > 0 && (
              <div className="mt-4">
                <div className="flex justify-between text-xs text-stone-400 mb-1.5">
                  <span>Completion rate</span>
                  <span>{stats.completionRate ?? 0}%</span>
                </div>
                <div className="h-2 bg-stone-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-emerald-500 rounded-full transition-all"
                    style={{ width: `${stats.completionRate ?? 0}%` }}
                  />
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Students */}
        <div>
          <p className="text-[9px] tracking-[0.3em] uppercase font-mono font-semibold text-stone-400 mb-3">
            STUDENTS · {students.length} · click to expand answers
          </p>
          {students.length === 0 ? (
            <Card className="border-dashed border-stone-200 shadow-none">
              <CardContent className="py-12 text-center">
                <Users className="w-8 h-8 text-stone-300 mx-auto mb-2" />
                <p className="text-stone-400 text-sm">No students assigned yet</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {sortedStudents.map((s, i) => (
                <StudentRow
                  key={i}
                  student={s}
                  studentMap={studentMap}
                  totalQuestions={total}
                  optionSets={a?.optionSets}
                />
              ))}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
