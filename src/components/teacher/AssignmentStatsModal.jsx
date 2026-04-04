import { useState, useEffect } from "react";
import { api } from "@/api/apiClient";
import { X, CheckCircle2, Clock, Star, BarChart2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export default function AssignmentStatsModal({ assignment, students, onClose }) {
  const [assignmentDetail, setAssignmentDetail] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.assignments.admin.getAssignment(assignment.id).then(data => {
      setAssignmentDetail(data.assignment || data);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [assignment.id]);

  const assignedStudents = assignmentDetail?.students || [];

  // Aggregate stats from all stored answers
  const allAnswers = assignedStudents.flatMap(s => s.answers || []);
  const timedAnswers = allAnswers.filter(a => a.timeTaken != null && a.timeTaken >= 0);
  const scoredAnswers = allAnswers.filter(a => a.score != null && a.score >= 0);

  const avgTime = timedAnswers.length > 0
    ? Math.round(timedAnswers.reduce((s, a) => s + a.timeTaken, 0) / timedAnswers.length)
    : null;
  const avgScore = scoredAnswers.length > 0
    ? Math.round(scoredAnswers.reduce((s, a) => s + a.score, 0) / scoredAnswers.length)
    : null;

  const totalAnswers = assignedStudents.reduce((sum, s) => sum + (s.answeredQuestions || 0), 0);
  const completedStudents = assignedStudents.filter(
    s => s.status === "complete" || s.status === "done"
  ).length;

  // Per-student stats
  const getStudentStats = (s) => {
    const answers = s.answers || [];
    const answered = s.answeredQuestions ?? answers.length;
    const progress = s.progressPercentage ?? (assignment.totalQuestions > 0
      ? Math.round((answered / assignment.totalQuestions) * 100)
      : 0);
    const timed = answers.filter(a => a.timeTaken != null);
    const scored = answers.filter(a => a.score != null);
    const studentAvgTime = timed.length > 0
      ? Math.round(timed.reduce((sum, a) => sum + a.timeTaken, 0) / timed.length)
      : null;
    const studentTotalScore = scored.length > 0
      ? scored.reduce((sum, a) => sum + a.score, 0)
      : null;
    return { answered, progress, avgTime: studentAvgTime, totalScore: studentTotalScore };
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col shadow-2xl">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <div>
            <h2 className="font-bold text-slate-900">{assignment.title}</h2>
            <p className="text-xs text-slate-500">Assignment Statistics</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Summary row */}
        <div className="grid grid-cols-4 gap-0 border-b">
          {[
            {
              label: "Completed",
              value: `${completedStudents}/${assignedStudents.length}`,
              icon: CheckCircle2,
              color: "text-emerald-500",
            },
            {
              label: "Total Answers",
              value: totalAnswers,
              icon: BarChart2,
              color: "text-purple-500",
            },
            {
              label: "Avg Time",
              value: avgTime != null ? `${avgTime}s` : "—",
              icon: Clock,
              color: "text-blue-500",
            },
            {
              label: "Avg Score",
              value: avgScore != null ? avgScore : "—",
              icon: Star,
              color: "text-amber-500",
            },
          ].map((stat, i) => (
            <div key={i} className="p-4 text-center border-r last:border-r-0">
              <stat.icon className={`w-4 h-4 ${stat.color} mx-auto mb-1`} />
              <p className="text-lg font-bold text-slate-900">{stat.value}</p>
              <p className="text-xs text-slate-400">{stat.label}</p>
            </div>
          ))}
        </div>

        {/* Per-student breakdown */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {loading && <div className="text-center py-8 text-slate-400">Loading…</div>}
          {!loading && assignedStudents.map((s, idx) => {
            const matchedStudent = students.find(
              st => st.id === s.studentId || st.id === s.studentId?.toString()
            );
            const name = matchedStudent
              ? matchedStudent.fullName ||
                matchedStudent.displayName ||
                `${matchedStudent.firstName ?? ''} ${matchedStudent.lastName ?? ''}`.trim() ||
                matchedStudent.username
              : `Student ${idx + 1}`;
            const stats = getStudentStats(s);

            return (
              <div key={s.studentId || idx} className="border border-slate-100 rounded-xl p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-slate-800 text-sm">{name}</p>
                    <p className="text-xs text-slate-400 capitalize">{s.status}</p>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-slate-500 flex-wrap justify-end">
                    {stats.avgTime != null && (
                      <span className="flex items-center gap-1 text-blue-600">
                        <Clock className="w-3 h-3" />{stats.avgTime}s avg
                      </span>
                    )}
                    {stats.totalScore != null && (
                      <span className="flex items-center gap-1 text-amber-600">
                        <Star className="w-3 h-3" />{stats.totalScore} pts
                      </span>
                    )}
                    <Badge
                      className={`text-xs ${
                        stats.progress >= 100
                          ? "bg-green-100 text-green-700"
                          : "bg-slate-100 text-slate-600"
                      }`}
                    >
                      {stats.answered}/{assignment.totalQuestions}
                    </Badge>
                  </div>
                </div>
                <div className="mt-2">
                  <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-amber-500 rounded-full transition-all"
                      style={{ width: `${stats.progress}%` }}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
