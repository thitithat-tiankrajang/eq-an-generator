/**
 * AssignmentDetail — /assignment-detail/:assignmentId
 * Student read-only view: question board (locked tiles + bonus slots) + answer board.
 */
import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { api } from "@/api/apiClient";
import { useAuth } from "@/lib/AuthContext";
import { BingoTile } from "@/components/bingo/BingoTile";
import { TILE_POINTS } from "@/lib/bingoGenerator";
import {
  ArrowLeft, CheckCircle2, Clock, Award, Timer,
  Target, Calendar, AlertTriangle, Play, Layers
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

// ── Slot type config (mirrors BingoBoard) ─────────────────────────────────────

const SLOT_CFG = {
  px1:     { empty: "bg-stone-200 border-stone-400",    label: "",    dot: "",              text: "" },
  px2:     { empty: "bg-orange-100 border-orange-500",  label: "2×P", dot: "bg-orange-600", text: "text-orange-700" },
  px3:     { empty: "bg-sky-100 border-sky-500",        label: "3×P", dot: "bg-sky-600",    text: "text-sky-700" },
  px3star: { empty: "bg-sky-100 border-sky-500",        label: "★",   dot: "bg-sky-600",    text: "text-sky-700" },
  ex2:     { empty: "bg-yellow-100 border-yellow-500",  label: "2×E", dot: "bg-yellow-600", text: "text-yellow-700" },
  ex3:     { empty: "bg-red-100 border-red-500",        label: "3×E", dot: "bg-red-600",    text: "text-red-700" },
};

function slotCfg(type) { return SLOT_CFG[type] ?? SLOT_CFG.px1; }

// ── helpers ───────────────────────────────────────────────────────────────────

const STATUS_CFG = {
  todo:       { label: "Not Started", cls: "bg-stone-100 text-stone-600",    dot: "bg-stone-400"    },
  inprogress: { label: "In Progress", cls: "bg-amber-100 text-amber-700",    dot: "bg-amber-500"    },
  complete:   { label: "Completed",   cls: "bg-emerald-100 text-emerald-700", dot: "bg-emerald-500" },
  done:       { label: "Graded",      cls: "bg-blue-100 text-blue-700",      dot: "bg-blue-500"     },
};

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

// ── Static board slot ─────────────────────────────────────────────────────────
// Renders a single board position: locked tile, placed tile, or empty slot.

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
          <div
            className={`w-9 h-9 rounded-lg border-2 flex flex-col items-center justify-center ${cfg.empty}`}
          >
            {slotType === "px3star"
              ? <span className="text-sky-400 leading-none" style={{ fontSize: 14 }}>★</span>
              : hasBonus
                ? <span className={`font-mono font-bold leading-none ${cfg.text}`} style={{ fontSize: 7 }}>{cfg.label}</span>
                : null
            }
          </div>
        )}
      </div>
      {/* slot index label */}
      <span className="font-mono" style={{ fontSize: 7, color: "#a8a29e" }}>{idx + 1}</span>
      {/* bonus label below tile */}
      {hasBonus && tile && (
        <span className={`font-mono font-bold leading-none ${cfg.text}`} style={{ fontSize: 6 }}>
          {slotType === "px3star" ? "★3×L" : cfg.label}
        </span>
      )}
    </div>
  );
}

// ── Static board ──────────────────────────────────────────────────────────────
/**
 * Reconstructs a read-only board from stored answer data.
 *
 * questionMode=true  → show only locked tiles; empty slots remain empty
 *                      (represents the board as given to the student)
 * questionMode=false → show all placed tiles with slot type indicators
 *                      (represents the student's submitted answer)
 */
function StaticBoard({ answerText, listPosLock, slotTypes, questionMode, label }) {
  const boardTiles = (answerText || "").split(" ").filter(Boolean);
  const n = slotTypes?.length || boardTiles.length;
  if (n === 0) return <span className="text-xs text-stone-300 italic">no data</span>;

  // Build locked position map
  const lockedMap = {};
  (listPosLock || []).forEach(({ pos, value }) => { lockedMap[pos] = value; });

  return (
    <div>
      <p className="text-[9px] tracking-[0.25em] uppercase font-mono font-semibold text-stone-400 mb-2">
        {label}
      </p>
      <div
        className="bg-white rounded-xl border border-stone-100 shadow-sm p-3"
        style={{ boxShadow: "0 0 16px rgba(120,100,30,0.05)" }}
      >
        <div className="flex flex-wrap gap-1.5">
          {Array.from({ length: n }).map((_, i) => {
            const slotType = slotTypes?.[i] ?? "px1";
            const lockedTile = lockedMap[i];
            const placedTile = questionMode ? undefined : boardTiles[i];

            return (
              <BoardSlot
                key={i}
                idx={i}
                slotType={slotType}
                tile={lockedTile ?? placedTile ?? null}
                isLocked={!!lockedTile}
              />
            );
          })}
        </div>

        {/* Legend */}
        {slotTypes && slotTypes.some(t => t && t !== "px1") && (
          <div className="mt-2 pt-2 border-t border-stone-50 flex flex-wrap gap-x-3 gap-y-0.5">
            {[
              { type: "px2",  show: slotTypes.includes("px2")     },
              { type: "px3",  show: slotTypes.includes("px3") || slotTypes.includes("px3star") },
              { type: "ex2",  show: slotTypes.includes("ex2")     },
              { type: "ex3",  show: slotTypes.includes("ex3")     },
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

// ── Rack strip ────────────────────────────────────────────────────────────────

function RackStrip({ text, label }) {
  const tokens = (text || "").split(" ").filter(Boolean);
  return (
    <div>
      <p className="text-[9px] tracking-[0.25em] uppercase font-mono font-semibold text-stone-400 mb-2">
        {label}
      </p>
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

// ── Question card ─────────────────────────────────────────────────────────────

function QuestionCard({ answer }) {
  const hasBoard = answer.slotTypes?.length > 0;

  return (
    <Card className="border-0 shadow-sm overflow-hidden">
      <CardContent className="p-0">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-2.5 bg-stone-50 border-b border-stone-100">
          <div className="flex items-center gap-2">
            <span className="w-6 h-6 rounded-full bg-amber-200 text-amber-800 text-xs font-bold flex items-center justify-center shrink-0 font-mono">
              {answer.questionNumber}
            </span>
            <span className="text-xs font-semibold text-stone-600 font-mono uppercase tracking-wider">
              Q {answer.questionNumber}
            </span>
          </div>
          <div className="flex items-center gap-3 text-xs">
            {answer.score != null && (
              <span className="flex items-center gap-1 font-semibold text-emerald-600">
                <Award className="w-3.5 h-3.5" />{answer.score} pts
              </span>
            )}
            {answer.timeTaken != null && (
              <span className="flex items-center gap-1 text-stone-400">
                <Timer className="w-3.5 h-3.5" />{fmtSecs(answer.timeTaken)}
              </span>
            )}
          </div>
        </div>

        <div className="px-4 py-4 space-y-5">
          {/* ── Question section ── */}
          {hasBoard ? (
            <StaticBoard
              answerText={answer.answerText}
              listPosLock={answer.listPosLock}
              slotTypes={answer.slotTypes}
              questionMode={true}
              label="BOARD · question layout"
            />
          ) : (
            <RackStrip text={answer.questionText} label="RACK · given tiles" />
          )}

          {/* ── Answer section ── */}
          {hasBoard ? (
            <StaticBoard
              answerText={answer.answerText}
              listPosLock={answer.listPosLock}
              slotTypes={answer.slotTypes}
              questionMode={false}
              label="BOARD · your answer (with slot bonuses)"
            />
          ) : (
            <RackStrip text={answer.answerText} label="ANSWER · placed tiles" />
          )}
        </div>

        <div className="px-4 pb-2.5 text-right">
          <span className="text-[10px] text-stone-300 font-mono">{fmtDateTime(answer.answeredAt)}</span>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function AssignmentDetail() {
  const { assignmentId } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [assignment, setAssignment] = useState(null);
  const [answers, setAnswers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!user) return;
    Promise.all([
      api.assignments.student.getAssignment(assignmentId, user.id),
      api.assignments.student.getAnswers(assignmentId, user.id),
    ])
      .then(([aData, ansData]) => {
        setAssignment(aData.assignment);
        setAnswers(ansData.answers || []);
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [assignmentId, user]);

  if (loading) return (
    <div className="min-h-screen bg-stone-50 p-4 md:p-8">
      <div className="max-w-3xl mx-auto space-y-4 animate-pulse">
        <div className="h-6 bg-amber-100 rounded w-36" />
        <div className="h-40 bg-amber-100 rounded-xl" />
        {[1, 2, 3].map(i => <div key={i} className="h-56 bg-amber-100 rounded-xl" />)}
      </div>
    </div>
  );

  if (error) return (
    <div className="min-h-screen bg-stone-50 p-8 flex flex-col items-center justify-center gap-4">
      <p className="text-red-500 text-sm">{error}</p>
      <Button variant="outline" onClick={() => navigate(-1)}>Go Back</Button>
    </div>
  );

  const prog = assignment?.studentProgress;
  const status = prog?.status ?? "todo";
  const cfg = STATUS_CFG[status] ?? STATUS_CFG.todo;
  const answered = prog?.answeredQuestions ?? answers.length;
  const total = assignment?.totalQuestions ?? 0;
  const pct = total > 0 ? Math.round((answered / total) * 100) : 0;
  const isDone = status === "complete" || status === "done";
  const totalScore = answers.reduce((s, a) => s + (a.score ?? 0), 0);
  const timedAnswers = answers.filter(a => a.timeTaken != null);
  const avgTime = timedAnswers.length
    ? Math.round(timedAnswers.reduce((s, a) => s + a.timeTaken, 0) / timedAnswers.length)
    : null;

  return (
    <div className="min-h-screen bg-linear-to-br from-stone-50 to-amber-50/40 p-4 md:p-8">
      <div className="max-w-3xl mx-auto space-y-5">

        {/* Back */}
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-1.5 text-stone-500 hover:text-amber-700 active:text-amber-800 text-sm transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Assignments
        </button>

        {/* Assignment header */}
        <Card className="border-0 shadow-sm">
          <CardContent className="p-5">
            <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
              <div className="flex-1 min-w-0">
                <h1 className="text-xl font-bold text-stone-900 leading-tight">{assignment?.title}</h1>
                {assignment?.description && (
                  <p className="text-sm text-stone-500 mt-1">{assignment.description}</p>
                )}
              </div>
              <span className={`inline-flex items-center gap-1.5 text-xs px-3 py-1 rounded-full font-medium shrink-0 ${cfg.cls}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
                {cfg.label}
              </span>
            </div>

            {/* Meta */}
            <div className="flex flex-wrap gap-x-5 gap-y-1.5 text-xs text-stone-500 mb-4">
              <span className="flex items-center gap-1.5"><Target className="w-3.5 h-3.5" />{total} problems</span>
              <span className="flex items-center gap-1.5"><Calendar className="w-3.5 h-3.5" />Due {fmtDate(assignment?.dueDate)}</span>
              {assignment?.timeLimitSeconds && (
                <span className="flex items-center gap-1.5"><Clock className="w-3.5 h-3.5" />{fmtSecs(assignment.timeLimitSeconds)}/question</span>
              )}
              <span className="flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5" />
                Set {(prog?.currentQuestionSet ?? 0) + 1}
                {prog?.questionsCompletedInCurrentSet != null
                  ? `, Q${prog.questionsCompletedInCurrentSet} done in set` : ""}
              </span>
              {assignment?.isOverdue && !isDone && (
                <span className="flex items-center gap-1.5 text-red-500 font-medium">
                  <AlertTriangle className="w-3.5 h-3.5" />Overdue
                </span>
              )}
            </div>

            {/* Progress */}
            <div className="mb-4">
              <div className="flex justify-between text-xs text-stone-400 mb-1.5">
                <span>{answered}/{total} answered</span>
                <span>{pct}%</span>
              </div>
              <div className="h-2.5 bg-stone-100 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${isDone ? "bg-emerald-500" : "bg-amber-500"}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>

            {/* Score summary */}
            {answers.length > 0 && (
              <div className="grid grid-cols-3 gap-3 p-3 bg-stone-50 rounded-xl text-center">
                <div>
                  <p className="text-lg font-bold text-stone-900">{answers.length}</p>
                  <p className="text-xs text-stone-400">Answered</p>
                </div>
                <div>
                  <p className="text-lg font-bold text-emerald-600">{totalScore}</p>
                  <p className="text-xs text-stone-400">Total pts</p>
                </div>
                <div>
                  <p className="text-lg font-bold text-stone-700">{avgTime != null ? fmtSecs(avgTime) : "—"}</p>
                  <p className="text-xs text-stone-400">Avg time</p>
                </div>
              </div>
            )}

            {/* Timestamps */}
            {(prog?.startedAt || prog?.completedAt || prog?.markedDoneAt) && (
              <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-stone-400">
                {prog.startedAt && (
                  <span className="flex items-center gap-1">
                    <Play className="w-3 h-3" />Started {fmtDateTime(prog.startedAt)}
                  </span>
                )}
                {prog.completedAt && (
                  <span className="flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3 text-emerald-400" />Completed {fmtDateTime(prog.completedAt)}
                  </span>
                )}
                {prog.markedDoneAt && (
                  <span className="flex items-center gap-1">
                    <Award className="w-3 h-3 text-blue-400" />Graded {fmtDateTime(prog.markedDoneAt)}
                  </span>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Answers */}
        <div>
          <p className="text-[9px] tracking-[0.3em] uppercase font-mono font-semibold text-stone-400 mb-3">
            ANSWERED QUESTIONS · {answers.length}
          </p>
          {answers.length === 0 ? (
            <Card className="border-dashed border-stone-200 shadow-none">
              <CardContent className="py-12 text-center">
                <p className="text-stone-400 text-sm">No answers yet</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {answers.map((a, i) => <QuestionCard key={i} answer={a} />)}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
