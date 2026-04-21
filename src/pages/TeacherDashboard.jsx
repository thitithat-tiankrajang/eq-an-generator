import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "@/api/apiClient";
import { Plus, BarChart2, Users, BookOpen, ChevronRight, AlertTriangle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function TeacherDashboard() {
  const navigate = useNavigate();
  const [assignments, setAssignments] = useState([]);
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const init = async () => {
      const [asgnsData, studsData] = await Promise.all([
        api.assignments.admin.getAll({ limit: 100 }),
        api.assignments.admin.getAvailableStudents(),
      ]);
      setAssignments(asgnsData.assignments || []);
      setStudents(studsData.students || []);
      setLoading(false);
    };
    init();
  }, []);

  const now = new Date();
  const activeCount  = assignments.filter(a => new Date(a.dueDate) > now).length;
  const overdueCount = assignments.filter(a => new Date(a.dueDate) <= now).length;

  return (
    <div className="min-h-screen bg-linear-to-br from-stone-50 to-amber-50/40 p-4 md:p-8">
      <div className="max-w-5xl mx-auto space-y-5">

        {/* Header */}
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-xl md:text-2xl font-bold text-stone-900">Assignment Dashboard</h1>
            <p className="text-stone-500 text-xs md:text-sm mt-0.5">
              {students.length} student{students.length !== 1 ? "s" : ""} · {assignments.length} assignments
            </p>
          </div>
          <Button
            onClick={() => navigate('/create-assignment')}
            size="sm"
            className="bg-amber-700 hover:bg-amber-600 active:bg-amber-800 shadow-sm shrink-0"
          >
            <Plus className="w-4 h-4 md:mr-1.5" />
            <span className="hidden md:inline">New Assignment</span>
          </Button>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <MiniStat label="Total"    value={assignments.length} icon={BookOpen}  color="text-amber-600"  bg="bg-amber-50" />
          <MiniStat label="Active"   value={activeCount}        icon={BarChart2} color="text-emerald-600" bg="bg-emerald-50" />
          <MiniStat label="Students" value={students.length}    icon={Users}     color="text-stone-500"  bg="bg-stone-100" />
          <MiniStat label="Overdue"  value={overdueCount}       icon={AlertTriangle} color="text-rose-600" bg="bg-rose-50" />
        </div>

        {/* Assignment list */}
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-2 px-4 pt-4 md:px-5 md:pt-5">
            <CardTitle className="text-sm md:text-base font-semibold text-stone-800">
              Assignments
            </CardTitle>
          </CardHeader>
          <CardContent className="px-3 pb-3 md:px-4 md:pb-4 pt-0 space-y-1.5">
            {loading && (
              <div className="space-y-2">
                {[1, 2, 3].map(i => (
                  <div key={i} className="h-16 bg-amber-50 rounded-xl animate-pulse" />
                ))}
              </div>
            )}

            {!loading && assignments.length === 0 && (
              <div className="text-center py-10 text-stone-400">
                <BookOpen className="w-8 h-8 mx-auto mb-2 opacity-40" />
                <p className="text-sm">No assignments yet. Create one to get started.</p>
              </div>
            )}

            {assignments.map(a => {
              const over = new Date(a.dueDate) <= now;
              const studentCount = (a.students || []).length;
              const doneCount = (a.students || []).filter(
                s => s.status === "complete" || s.status === "done"
              ).length;
              const inProgressCount = (a.students || []).filter(
                s => s.status === "inprogress"
              ).length;

              return (
                <button
                  key={a.id}
                  onClick={() => navigate(`/admin-assignment/${a.id}`)}
                  className="w-full text-left flex items-center gap-3 p-3 md:p-4 rounded-xl border border-stone-100 hover:bg-amber-50/60 active:bg-amber-100/60 transition-colors group"
                >
                  {/* Color accent */}
                  <div className={`w-1 self-stretch rounded-full shrink-0 ${over ? "bg-rose-300" : "bg-emerald-400"}`} />

                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5 mb-1">
                      <p className="font-semibold text-stone-800 text-sm truncate">{a.title}</p>
                      <span className={`text-xs px-1.5 py-0.5 rounded font-medium shrink-0 ${
                        over ? "bg-rose-100 text-rose-600" : "bg-emerald-100 text-emerald-700"
                      }`}>
                        {over ? "Overdue" : "Active"}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-stone-400">
                      <span>{a.totalQuestions} problems</span>
                      <span>{studentCount} students</span>
                      {inProgressCount > 0 && (
                        <span className="text-amber-500">{inProgressCount} in progress</span>
                      )}
                      {doneCount > 0 && (
                        <span className="text-emerald-500">{doneCount} done</span>
                      )}
                      {a.dueDate && (
                        <span>Due {new Date(a.dueDate).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}</span>
                      )}
                    </div>
                  </div>

                  <ChevronRight className="w-4 h-4 text-stone-300 group-hover:text-amber-600 transition-colors shrink-0" />
                </button>
              );
            })}
          </CardContent>
        </Card>

      </div>

    </div>
  );
}

function MiniStat({ label, value, icon: Icon, color, bg }) {
  return (
    <Card className="border-0 shadow-sm">
      <CardContent className="p-3 md:p-4 flex items-center gap-2 md:gap-3">
        <div className={`w-8 h-8 md:w-9 md:h-9 ${bg} rounded-lg flex items-center justify-center shrink-0`}>
          <Icon className={`w-4 h-4 ${color}`} />
        </div>
        <div>
          <p className="text-lg md:text-xl font-bold text-stone-900">{value}</p>
          <p className="text-[10px] md:text-xs text-stone-500 leading-tight">{label}</p>
        </div>
      </CardContent>
    </Card>
  );
}
