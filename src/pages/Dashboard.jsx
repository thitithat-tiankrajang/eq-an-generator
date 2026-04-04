import { useState, useEffect } from "react";
import { api } from "@/api/apiClient";
import { useAuth } from "@/lib/AuthContext";
import { createPageUrl } from "@/utils";
import { Link } from "react-router-dom";
import {
  BookOpen, Play, Trophy, Users, BarChart2, Clock,
  ChevronRight, Zap, Target, TrendingUp, Award,
  ArrowRight, Circle, CheckCircle2, AlertCircle,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";

const STATUS_CFG = {
  todo:        { label: 'Not Started', color: 'text-stone-500',   bg: 'bg-stone-100',   icon: Circle },
  inprogress:  { label: 'In Progress', color: 'text-amber-700',   bg: 'bg-amber-100',   icon: Zap },
  complete:    { label: 'Complete',    color: 'text-emerald-700', bg: 'bg-emerald-100', icon: CheckCircle2 },
  done:        { label: 'Reviewed',   color: 'text-sky-700',     bg: 'bg-sky-100',     icon: Award },
};

export default function Dashboard() {
  const { user } = useAuth();
  const [assignments, setAssignments] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    const init = async () => {
      if (user.role === "student") {
        try {
          const data = await api.assignments.student.getAssignments(user.id, { limit: 10 });
          setAssignments(data.assignments || []);
        } catch (_) {}
      }
      setLoading(false);
    };
    init();
  }, [user]);

  if (loading) return <DashboardSkeleton />;

  const active   = assignments.filter(a => a.studentProgress?.status === 'inprogress');
  const pending  = assignments.filter(a => a.studentProgress?.status === 'todo');
  const done     = assignments.filter(a => ['complete','done'].includes(a.studentProgress?.status));

  const roleConfig = {
    admin:   { color: 'bg-amber-100 text-amber-700 border border-amber-200',   label: 'Administrator' },
    student: { color: 'bg-emerald-100 text-emerald-700 border border-emerald-200', label: 'Student' },
  };
  const rc = roleConfig[user?.role] || { color: 'bg-stone-100 text-stone-600', label: 'User' };

  return (
    <div className="min-h-screen bg-linear-to-br from-stone-50 via-amber-50/30 to-stone-100 p-4 md:p-8">
      <div className="max-w-7xl mx-auto space-y-6">

        {/* ── Hero Header ─────────────────────────────────────────────────── */}
        <div className="relative overflow-hidden rounded-2xl bg-linear-to-br from-amber-700 via-amber-600 to-yellow-500 p-6 md:p-8 text-white shadow-xl shadow-amber-200/50">
          <div className="absolute inset-0 opacity-10"
            style={{ backgroundImage: 'radial-gradient(circle at 20% 50%, white 1px, transparent 1px), radial-gradient(circle at 80% 20%, white 1px, transparent 1px)', backgroundSize: '40px 40px' }} />
          <div className="relative flex items-start justify-between gap-4">
            <div>
              <p className="text-amber-200 text-xs font-mono tracking-widest uppercase mb-1">Welcome back</p>
              <h1 className="text-2xl md:text-3xl font-bold leading-tight">
                {user?.full_name || `${user?.firstName ?? ''} ${user?.lastName ?? ''}`.trim() || user?.email || 'Player'}
              </h1>
              <p className="text-amber-100/80 text-sm mt-1">Ready to solve some equations?</p>
            </div>
            <Badge className={`${rc.color} text-xs px-3 py-1.5 shrink-0 font-medium`}>{rc.label}</Badge>
          </div>

          {/* Student quick stats inline */}
          {user?.role === 'student' && (
            <div className="relative mt-5 grid grid-cols-3 gap-3">
              {[
                { label: 'Active',   value: active.length,  icon: Zap },
                { label: 'Pending',  value: pending.length, icon: Clock },
                { label: 'Done',     value: done.length,    icon: CheckCircle2 },
              ].map(s => (
                <div key={s.label} className="bg-white/15 backdrop-blur-sm rounded-xl px-3 py-2.5 text-center">
                  <p className="text-xl font-bold">{s.value}</p>
                  <p className="text-amber-100/80 text-xs mt-0.5">{s.label}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Action Grid ─────────────────────────────────────────────────── */}
        <div>
          <h2 className="text-sm font-semibold text-stone-500 uppercase tracking-widest mb-3">Quick Actions</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <ActionCard
              to={createPageUrl("Play")}
              icon={Play}
              title="Free Play"
              description="Competitive mode — set difficulty and race the clock."
              gradient="from-amber-600 to-amber-800"
              badge="Open to all"
              accent="amber"
            />
            {user?.role === "student" && (
              <ActionCard
                to={createPageUrl("Assignments")}
                icon={BookOpen}
                title="My Assignments"
                description="View and complete assignments set by your teacher."
                gradient="from-green-800 to-green-950"
                badge={active.length > 0 ? `${active.length} active` : pending.length > 0 ? `${pending.length} pending` : 'All done'}
                accent="green"
              />
            )}
            <ActionCard
              to={createPageUrl("Leaderboard")}
              icon={Trophy}
              title="Leaderboard"
              description="See where you rank globally against other players."
              gradient="from-yellow-500 to-amber-600"
              badge="Rankings"
              accent="yellow"
            />
            {user?.role === "admin" && (
              <>
                <ActionCard
                  to={createPageUrl("TeacherDashboard")}
                  icon={BarChart2}
                  title="Manage Assignments"
                  description="Create, configure and monitor student assignments."
                  gradient="from-emerald-700 to-emerald-900"
                  badge="Admin"
                  accent="emerald"
                />
                <ActionCard
                  to={createPageUrl("UserManagement")}
                  icon={Users}
                  title="User Management"
                  description="Approve or reject student registrations."
                  gradient="from-yellow-600 to-yellow-800"
                  badge="Admin"
                  accent="yellow"
                />
                <ActionCard
                  to={createPageUrl("AdminPanel")}
                  icon={Target}
                  title="Admin Panel"
                  description="Generate puzzle PDFs and manage platform settings."
                  gradient="from-green-600 to-green-800"
                  badge="Admin"
                  accent="green"
                />
              </>
            )}
          </div>
        </div>

        {/* ── Student: Active Assignments ─────────────────────────────────── */}
        {user?.role === 'student' && active.length > 0 && (
          <section>
            <SectionHeader title="In Progress" icon={Zap} count={active.length} linkTo={createPageUrl("Assignments")} />
            <div className="space-y-2">
              {active.map(a => <AssignmentRow key={a.id} assignment={a} />)}
            </div>
          </section>
        )}

        {/* ── Student: Pending Assignments ────────────────────────────────── */}
        {user?.role === 'student' && pending.length > 0 && (
          <section>
            <SectionHeader title="Not Started" icon={Clock} count={pending.length} linkTo={createPageUrl("Assignments")} />
            <div className="space-y-2">
              {pending.slice(0, 3).map(a => <AssignmentRow key={a.id} assignment={a} />)}
              {pending.length > 3 && (
                <Link to={createPageUrl("Assignments")} className="flex items-center justify-center gap-1.5 py-3 rounded-xl border border-dashed border-stone-200 text-stone-400 text-xs hover:border-amber-300 hover:text-amber-600 transition-colors">
                  View {pending.length - 3} more <ArrowRight className="w-3 h-3" />
                </Link>
              )}
            </div>
          </section>
        )}

        {/* ── Student: Completed ──────────────────────────────────────────── */}
        {user?.role === 'student' && done.length > 0 && (
          <section>
            <SectionHeader title="Completed" icon={CheckCircle2} count={done.length} linkTo={createPageUrl("Assignments")} />
            <div className="space-y-2">
              {done.slice(0, 2).map(a => <AssignmentRow key={a.id} assignment={a} />)}
            </div>
          </section>
        )}

        {/* ── Student empty state ─────────────────────────────────────────── */}
        {user?.role === 'student' && assignments.length === 0 && (
          <Card className="border-0 shadow-sm">
            <CardContent className="py-12 text-center">
              <div className="w-14 h-14 bg-amber-50 rounded-full flex items-center justify-center mx-auto mb-4">
                <BookOpen className="w-6 h-6 text-amber-400" />
              </div>
              <p className="font-medium text-stone-700">No assignments yet</p>
              <p className="text-stone-400 text-sm mt-1">Your teacher hasn't assigned any work yet.</p>
              <Link to={createPageUrl("Play")}
                className="inline-flex items-center gap-2 mt-4 px-4 py-2 bg-amber-600 text-white rounded-xl text-sm font-medium hover:bg-amber-700 transition-colors">
                <Play className="w-3.5 h-3.5" /> Try Free Play
              </Link>
            </CardContent>
          </Card>
        )}

        {/* ── Admin overview ──────────────────────────────────────────────── */}
        {user?.role === 'admin' && (
          <Card className="border-0 shadow-sm bg-linear-to-br from-amber-50 to-stone-50">
            <CardContent className="p-5">
              <div className="flex items-center gap-2 mb-3">
                <TrendingUp className="w-4 h-4 text-amber-600" />
                <span className="text-sm font-semibold text-stone-700">Platform Overview</span>
              </div>
              <p className="text-xs text-stone-400 leading-relaxed">
                Use the actions above to manage assignments, review student progress, approve registrations, and generate puzzle PDFs.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                {[
                  { label: 'Assignments', to: createPageUrl("TeacherDashboard"), color: 'bg-amber-100 text-amber-700 hover:bg-amber-200' },
                  { label: 'Students',    to: createPageUrl("UserManagement"),   color: 'bg-stone-100 text-stone-700 hover:bg-stone-200' },
                  { label: 'PDF Generator', to: createPageUrl("AdminPanel"),     color: 'bg-green-100 text-green-700 hover:bg-green-200' },
                ].map(l => (
                  <Link key={l.label} to={l.to}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${l.color}`}>
                    {l.label} <ArrowRight className="w-3 h-3" />
                  </Link>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

      </div>
    </div>
  );
}

// ── AssignmentRow ─────────────────────────────────────────────────────────────
function AssignmentRow({ assignment }) {
  const prog   = assignment.studentProgress;
  const status = prog?.status ?? 'todo';
  const cfg    = STATUS_CFG[status] ?? STATUS_CFG.todo;
  const Icon   = cfg.icon;
  const answered  = prog?.answeredQuestions ?? 0;
  const total     = assignment.totalQuestions ?? 1;
  const pct       = Math.round((answered / total) * 100);
  const overdue   = assignment.dueDate && new Date(assignment.dueDate) < new Date() && !['complete','done'].includes(status);

  return (
    <Link to={`/assignment-detail/${assignment.id}`}>
      <div className="flex items-center gap-3 p-3.5 rounded-xl bg-white border border-stone-100 hover:border-amber-200 hover:shadow-sm transition-all group">
        <div className={`w-8 h-8 rounded-lg ${cfg.bg} flex items-center justify-center shrink-0`}>
          <Icon className={`w-3.5 h-3.5 ${cfg.color}`} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="font-medium text-stone-800 text-sm truncate">{assignment.title}</p>
            {overdue && <AlertCircle className="w-3 h-3 text-red-400 shrink-0" />}
          </div>
          <div className="flex items-center gap-2 mt-1">
            <Progress value={pct} className="h-1.5 flex-1 max-w-24" />
            <span className="text-[10px] text-stone-400 font-mono shrink-0">{answered}/{total}</span>
          </div>
        </div>
        <div className="shrink-0 text-right">
          <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${cfg.bg} ${cfg.color}`}>{cfg.label}</span>
          {assignment.dueDate && (
            <p className={`text-[10px] mt-1 ${overdue ? 'text-red-400' : 'text-stone-300'}`}>
              {overdue ? 'Overdue' : `Due ${new Date(assignment.dueDate).toLocaleDateString('en-GB', { month: 'short', day: 'numeric' })}`}
            </p>
          )}
        </div>
        <ChevronRight className="w-4 h-4 text-stone-300 group-hover:text-amber-500 transition-colors shrink-0" />
      </div>
    </Link>
  );
}

// ── ActionCard ────────────────────────────────────────────────────────────────
function ActionCard({ to, icon: Icon, title, description, gradient, badge }) {
  return (
    <Link to={to}>
      <Card className="border-0 shadow-sm hover:shadow-lg active:shadow-sm transition-all group cursor-pointer overflow-hidden h-full">
        <CardContent className="p-0 h-full flex flex-col">
          <div className={`bg-linear-to-br ${gradient} p-4 text-white`}>
            <div className="flex items-center justify-between">
              <div className="w-9 h-9 bg-white/20 rounded-xl flex items-center justify-center">
                <Icon className="w-4.5 h-4.5" />
              </div>
              <span className="text-[10px] bg-white/20 backdrop-blur-sm px-2 py-0.5 rounded-full font-medium">{badge}</span>
            </div>
          </div>
          <div className="p-4 flex-1 flex flex-col justify-between">
            <div>
              <h3 className="font-semibold text-sm text-stone-800 group-hover:text-amber-700 transition-colors">{title}</h3>
              <p className="text-xs text-stone-400 mt-1 leading-relaxed">{description}</p>
            </div>
            <div className="flex items-center gap-1 mt-3 text-xs text-stone-400 group-hover:text-amber-600 transition-colors">
              <span>Open</span><ArrowRight className="w-3 h-3" />
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

// ── SectionHeader ─────────────────────────────────────────────────────────────
function SectionHeader({ title, icon: Icon, count, linkTo }) {
  return (
    <div className="flex items-center justify-between mb-2">
      <div className="flex items-center gap-2">
        <Icon className="w-3.5 h-3.5 text-stone-400" />
        <span className="text-sm font-semibold text-stone-600">{title}</span>
        {count > 0 && (
          <span className="text-[10px] bg-amber-100 text-amber-700 font-medium px-1.5 py-0.5 rounded-full">{count}</span>
        )}
      </div>
      <Link to={linkTo} className="text-xs text-stone-400 hover:text-amber-600 transition-colors flex items-center gap-1">
        View all <ArrowRight className="w-3 h-3" />
      </Link>
    </div>
  );
}

// ── Skeleton ──────────────────────────────────────────────────────────────────
function DashboardSkeleton() {
  return (
    <div className="min-h-screen bg-linear-to-br from-stone-50 to-amber-50/40 p-4 md:p-8">
      <div className="max-w-7xl mx-auto space-y-6 animate-pulse">
        <div className="h-36 bg-amber-200/50 rounded-2xl" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {[1,2,3].map(i => <div key={i} className="h-40 bg-amber-100/60 rounded-2xl" />)}
        </div>
        <div className="space-y-2">
          {[1,2].map(i => <div key={i} className="h-16 bg-stone-100 rounded-xl" />)}
        </div>
      </div>
    </div>
  );
}
