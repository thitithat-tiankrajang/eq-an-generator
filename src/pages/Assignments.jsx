import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "@/api/apiClient";
import { useAuth } from "@/lib/AuthContext";
import {
  BookOpen, Clock, CheckCircle2, Play, Calendar, Target,
  AlertTriangle, User, Layers, Award, ArrowRight, ChevronRight
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

// ── helpers ──────────────────────────────────────────────────────────────────

const STATUS_CONFIG = {
  todo:       { label: "Not Started",  bg: "bg-stone-100  text-stone-600",   dot: "bg-stone-400"    },
  inprogress: { label: "In Progress",  bg: "bg-amber-100  text-amber-700",   dot: "bg-amber-500"    },
  complete:   { label: "Completed",    bg: "bg-emerald-100 text-emerald-700", dot: "bg-emerald-500" },
  done:       { label: "Graded",       bg: "bg-blue-100   text-blue-700",    dot: "bg-blue-500"     },
};

function fmtDate(d) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function fmtSecs(s) {
  if (s == null) return null;
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${s % 60}s`;
}

// ── Summary bar ───────────────────────────────────────────────────────────────

function SummaryBar({ assignments }) {
  const counts = { todo: 0, inprogress: 0, complete: 0, done: 0 };
  assignments.forEach(a => {
    const s = a.studentProgress?.status ?? "todo";
    if (counts[s] !== undefined) counts[s]++;
  });
  return (
    <div className="grid grid-cols-4 gap-2 md:gap-3">
      {Object.entries(STATUS_CONFIG).map(([key, cfg]) => (
        <div key={key} className={`rounded-xl p-3 ${cfg.bg} text-center`}>
          <p className="text-xl md:text-2xl font-bold">{counts[key]}</p>
          <p className="text-[10px] md:text-xs mt-0.5 opacity-80 leading-tight">{cfg.label}</p>
        </div>
      ))}
    </div>
  );
}

// ── Assignment card ───────────────────────────────────────────────────────────

function AssignmentCard({ a, userId }) {
  const navigate = useNavigate();

  const prog = a.studentProgress;
  const answered = prog?.answeredQuestions ?? prog?.answers?.length ?? 0;
  const total = a.totalQuestions;
  const pct = total > 0 ? Math.round((answered / total) * 100) : 0;
  const status = prog?.status ?? "todo";
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.todo;
  const isDone = status === "complete" || status === "done";
  const isOverdue = a.isOverdue;

  return (
    <Card className={`border-0 shadow-sm transition-all hover:shadow-md active:shadow-sm ${isDone ? "opacity-80" : ""}`}>
      <CardContent className="p-0">
        <div className="p-4 md:p-5">
          <div className="flex items-start gap-3">
            <div className="flex-1 min-w-0">

              {/* Title + badges */}
              <div className="flex flex-wrap items-center gap-2 mb-1">
                <h3 className="font-semibold text-stone-800 text-sm md:text-base truncate">{a.title}</h3>
                <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ${cfg.bg}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
                  {cfg.label}
                </span>
                {isOverdue && !isDone && (
                  <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-600 font-medium shrink-0">
                    <AlertTriangle className="w-3 h-3" />Overdue
                  </span>
                )}
              </div>

              {/* Description */}
              {a.description && (
                <p className="text-xs text-stone-500 mb-2 line-clamp-1">{a.description}</p>
              )}

              {/* Meta */}
              <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-stone-400 mb-3">
                <span className="flex items-center gap-1"><Target className="w-3 h-3" />{total} problems</span>
                <span className={`flex items-center gap-1 ${isOverdue && !isDone ? "text-red-400" : ""}`}>
                  <Calendar className="w-3 h-3" />Due {fmtDate(a.dueDate)}
                </span>
                {a.timeLimitSeconds && (
                  <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{fmtSecs(a.timeLimitSeconds)}/q</span>
                )}
                {a.createdBy && (
                  <span className="flex items-center gap-1">
                    <User className="w-3 h-3" />
                    {a.createdBy.firstName
                      ? `${a.createdBy.firstName} ${a.createdBy.lastName ?? ""}`.trim()
                      : a.createdBy.username ?? "Teacher"}
                  </span>
                )}
              </div>

              {/* Progress bar */}
              <div>
                <div className="flex justify-between text-xs text-stone-400 mb-1">
                  <span>{answered}/{total}</span>
                  <span>{pct}%</span>
                </div>
                <div className="h-1.5 bg-stone-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${isDone ? "bg-emerald-500" : "bg-amber-500"}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="flex flex-col items-end gap-2 shrink-0 pt-0.5">
              {!isDone ? (
                <Button
                  onClick={() => navigate(`/play/${a.id}`)}
                  size="sm"
                  className="bg-amber-700 hover:bg-amber-600 active:bg-amber-800 shadow-sm text-xs px-3"
                >
                  {status === "inprogress"
                    ? <><ArrowRight className="w-3 h-3 mr-1" />Resume</>
                    : <><Play className="w-3 h-3 mr-1" />Start</>
                  }
                </Button>
              ) : (
                <CheckCircle2 className="w-5 h-5 text-emerald-500" />
              )}
              <button
                onClick={() => navigate(`/assignment-detail/${a.id}`)}
                className="flex items-center gap-0.5 text-xs text-stone-400 hover:text-amber-600 active:text-amber-700 transition-colors"
              >
                Details <ChevronRight className="w-3 h-3" />
              </button>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Filters ───────────────────────────────────────────────────────────────────

const FILTERS = [
  { value: "all",        label: "All" },
  { value: "todo",       label: "Not Started" },
  { value: "inprogress", label: "In Progress" },
  { value: "complete",   label: "Completed" },
  { value: "done",       label: "Graded" },
];

// ── Page ──────────────────────────────────────────────────────────────────────

export default function AssignmentsPage() {
  const { user } = useAuth();
  const [assignments, setAssignments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");

  useEffect(() => {
    if (!user) return;
    api.assignments.student.getAssignments(user.id, { limit: 100 })
      .then(d => setAssignments(d.assignments || []))
      .catch(() => setAssignments([]))
      .finally(() => setLoading(false));
  }, [user]);

  const visible = filter === "all"
    ? assignments
    : assignments.filter(a => (a.studentProgress?.status ?? "todo") === filter);

  return (
    <div className="min-h-screen bg-linear-to-br from-stone-50 to-amber-50/40 p-4 md:p-8">
      <div className="max-w-3xl mx-auto space-y-5">

        {/* Header */}
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-stone-900">My Assignments</h1>
          <p className="text-stone-500 text-sm mt-0.5">
            {assignments.length} assignment{assignments.length !== 1 ? "s" : ""} total
          </p>
        </div>

        {/* Skeleton */}
        {loading && (
          <div className="space-y-3">
            {[1, 2, 3].map(i => <div key={i} className="h-32 bg-amber-100 rounded-xl animate-pulse" />)}
          </div>
        )}

        {!loading && (
          <>
            {assignments.length > 0 && <SummaryBar assignments={assignments} />}

            {/* Filter tabs */}
            {assignments.length > 0 && (
              <div className="flex gap-2 flex-wrap">
                {FILTERS.map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => setFilter(opt.value)}
                    className={`px-3 py-1.5 rounded-full text-xs md:text-sm font-medium transition-colors
                      ${filter === opt.value
                        ? "bg-amber-700 text-white shadow-sm"
                        : "bg-stone-100 text-stone-600 hover:bg-amber-100 hover:text-amber-700 active:bg-amber-200"}`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            )}

            {/* Empty state */}
            {assignments.length === 0 && (
              <Card className="border-dashed border-stone-200 shadow-none">
                <CardContent className="py-12 text-center">
                  <BookOpen className="w-10 h-10 text-stone-300 mx-auto mb-3" />
                  <p className="text-stone-500">No assignments right now</p>
                  <p className="text-stone-400 text-sm mt-1">Your teacher will assign problems here</p>
                </CardContent>
              </Card>
            )}

            {/* Filtered empty */}
            {assignments.length > 0 && visible.length === 0 && (
              <p className="text-center text-stone-400 py-8 text-sm">No assignments in this category.</p>
            )}

            {/* Cards */}
            <div className="space-y-3">
              {visible.map(a => (
                <AssignmentCard key={a.id} a={a} userId={user.id} />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
