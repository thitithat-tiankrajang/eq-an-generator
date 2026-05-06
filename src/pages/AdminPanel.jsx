import { useState, useEffect } from "react";
import { api } from "@/api/apiClient";
import { Users, Shield, CheckCircle2, XCircle, Clock, FileText, FlaskConical, TestTube2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { PuzzlePdfGenerator } from "@/components/bingo/PuzzlePdfGenerator";
import { GeneratorAnalysis } from "@/components/bingo/GeneratorAnalysis";
import { ConfigTestDashboard } from "@/components/bingo/ConfigTestDashboard";

export default function AdminPanel() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState(null);

  useEffect(() => {
    const init = async () => {
      const data = await api.auth.admin.getStudents({ limit: 100 });
      setUsers(data.students || []);
      setLoading(false);
    };
    init();
  }, []);

  const approveUser = async (userId) => {
    setUpdatingId(userId);
    try {
      await api.auth.admin.approveStudent(userId);
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, status: "approved" } : u));
      toast.success("Student approved");
    } catch (err) {
      toast.error(err.message || "Failed to approve");
    } finally {
      setUpdatingId(null);
    }
  };

  const rejectUser = async (userId) => {
    setUpdatingId(userId);
    try {
      await api.auth.admin.rejectStudent(userId);
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, status: "rejected" } : u));
      toast.success("Student rejected");
    } catch (err) {
      toast.error(err.message || "Failed to reject");
    } finally {
      setUpdatingId(null);
    }
  };

  const pending  = users.filter(u => u.status === "pending");
  const approved = users.filter(u => u.status === "approved");
  const rejected = users.filter(u => u.status === "rejected");

  const statusBadge = {
    pending:  "bg-amber-100 text-amber-700",
    approved: "bg-emerald-100 text-emerald-700",
    rejected: "bg-stone-100 text-stone-500",
  };

  return (
    <div className="min-h-screen bg-linear-to-br from-stone-50 to-amber-50/30 p-4 md:p-8">
      <div className="max-w-6xl mx-auto space-y-6">

        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-amber-100 rounded-xl flex items-center justify-center">
            <Shield className="w-5 h-5 text-amber-700" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-stone-900">Admin Panel</h1>
            <p className="text-stone-500 text-sm">Student Management</p>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {[
            { label: "Pending Approval", value: pending.length,  color: "text-amber-700",   bg: "bg-amber-50",   icon: Clock        },
            { label: "Approved",         value: approved.length, color: "text-emerald-700", bg: "bg-emerald-50", icon: CheckCircle2 },
            { label: "Total Students",   value: users.length,    color: "text-stone-600",   bg: "bg-stone-100",  icon: Users        },
          ].map(stat => (
            <Card key={stat.label} className="border-0 shadow-sm">
              <CardContent className="p-4 flex items-center gap-3">
                <div className={`w-9 h-9 ${stat.bg} rounded-lg flex items-center justify-center`}>
                  <stat.icon className={`w-4 h-4 ${stat.color}`} />
                </div>
                <div>
                  <p className={`text-xl font-bold ${stat.color}`}>{stat.value}</p>
                  <p className="text-xs text-stone-500">{stat.label}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <Tabs defaultValue="pending">
          <TabsList className="bg-stone-100">
            <TabsTrigger value="pending">
              Pending
              {pending.length > 0 && (
                <span className="ml-1.5 bg-amber-500 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center">
                  {pending.length}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="users">All Students</TabsTrigger>
            <TabsTrigger value="pdf" className="flex items-center gap-1.5">
              <FileText className="w-3.5 h-3.5" /> Generate File
            </TabsTrigger>
            <TabsTrigger value="analysis" className="flex items-center gap-1.5">
              <FlaskConical className="w-3.5 h-3.5" /> Generator Test
            </TabsTrigger>
            <TabsTrigger value="configtest" className="flex items-center gap-1.5">
              <TestTube2 className="w-3.5 h-3.5" /> Config Test
            </TabsTrigger>
          </TabsList>

          {/* Pending Approvals */}
          <TabsContent value="pending" className="space-y-3 mt-4">
            {pending.length === 0 && <p className="text-stone-400 text-center py-8">No pending approvals</p>}
            {pending.map(u => (
              <Card key={u.id} className="border-amber-200 shadow-sm">
                <CardContent className="p-4 flex items-center justify-between flex-wrap gap-3">
                  <div>
                    <p className="font-medium text-stone-800">{u.firstName} {u.lastName}</p>
                    <p className="text-xs text-stone-500">
                      @{u.username} · {u.school} · Registered {new Date(u.createdAt).toLocaleDateString()}
                    </p>
                    {u.purpose && <p className="text-xs text-stone-400 mt-0.5">Purpose: {u.purpose}</p>}
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" className="bg-emerald-700 hover:bg-emerald-600 active:bg-emerald-800"
                      disabled={updatingId === u.id}
                      onClick={() => approveUser(u.id)}>
                      <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> Approve
                    </Button>
                    <Button size="sm" variant="outline" className="text-rose-600 border-rose-200 hover:bg-rose-50 hover:border-rose-300"
                      disabled={updatingId === u.id}
                      onClick={() => rejectUser(u.id)}>
                      <XCircle className="w-3.5 h-3.5 mr-1" /> Reject
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </TabsContent>

          {/* All Students */}
          <TabsContent value="users" className="mt-4">
            <Card className="border-0 shadow-sm">
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-amber-50/60 text-xs text-stone-500 uppercase">
                      <tr>
                        <th className="text-left px-4 py-3">Student</th>
                        <th className="text-left px-4 py-3">School</th>
                        <th className="text-left px-4 py-3">Status</th>
                        <th className="text-left px-4 py-3">Joined</th>
                        <th className="text-right px-4 py-3">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-50">
                      {loading && [1,2,3].map(i => (
                        <tr key={i}><td colSpan={5} className="px-4 py-3"><div className="h-4 bg-amber-50 rounded animate-pulse" /></td></tr>
                      ))}
                      {!loading && users.map(u => (
                        <tr key={u.id} className="hover:bg-amber-50/50 active:bg-amber-50 transition-colors">
                          <td className="px-4 py-3">
                            <p className="font-medium text-stone-800">{u.firstName} {u.lastName}</p>
                            <p className="text-xs text-stone-400">@{u.username}</p>
                          </td>
                          <td className="px-4 py-3 text-stone-600 text-xs">{u.school || "—"}</td>
                          <td className="px-4 py-3">
                            <Badge className={`text-xs ${statusBadge[u.status] || ""}`}>{u.status}</Badge>
                          </td>
                          <td className="px-4 py-3 text-stone-500 text-xs">
                            {new Date(u.createdAt).toLocaleDateString()}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <div className="flex gap-1 justify-end">
                              {u.status === "pending" && (
                                <Button size="sm" className="text-xs bg-emerald-700 hover:bg-emerald-600 h-7"
                                  disabled={updatingId === u.id}
                                  onClick={() => approveUser(u.id)}>Approve</Button>
                              )}
                              {u.status === "pending" && (
                                <Button size="sm" variant="outline" className="text-xs text-rose-600 border-rose-200 hover:bg-rose-50 h-7"
                                  disabled={updatingId === u.id}
                                  onClick={() => rejectUser(u.id)}>Reject</Button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
          {/* Puzzle PDF Generator */}
          <TabsContent value="pdf" className="mt-4">
            <div className="mb-3 px-1">
              <p className="text-xs text-stone-500 font-mono">
                Generate printable Bingo puzzle sheets (admin only)
              </p>
            </div>
            <PuzzlePdfGenerator />
          </TabsContent>

          {/* Generator Analysis */}
          <TabsContent value="analysis" className="mt-4">
            <GeneratorAnalysis />
          </TabsContent>

          {/* Config Test Suite */}
          <TabsContent value="configtest" className="mt-4">
            <div className="mb-3 px-1">
              <p className="text-xs text-stone-500 font-mono">
                Test all generator configs — each run tries {/* ATTEMPTS_PER_CONFIG */}10 times and reports pass/fail + example equations
              </p>
            </div>
            <ConfigTestDashboard />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
