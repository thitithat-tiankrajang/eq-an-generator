import { useState, useEffect } from "react";
import { api } from "@/api/apiClient";
import { Users, Search, Pencil, X } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

// ── Edit Profile Modal ────────────────────────────────────────────────────────

function EditUserModal({ user, onSave, onClose }) {
  const [form, setForm] = useState({
    firstName: user.firstName || "",
    lastName:  user.lastName  || "",
    school:    user.school    || "",
    notes:     user.notes     || "",
  });
  const [saving, setSaving] = useState(false);

  const set = (k, v) => setForm(prev => ({ ...prev, [k]: v }));

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.auth.admin.updateStudent(user.id, form);
      onSave({ ...user, ...form });
      toast.success("Profile updated");
    } catch (err) {
      toast.error(err.message || "Failed to update");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="font-bold text-stone-900">Edit Profile</h2>
          <button onClick={onClose} className="text-stone-400 hover:text-stone-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-4">
          {/* Username (read-only) */}
          <div className="space-y-1">
            <Label className="text-xs text-stone-500">Username</Label>
            <p className="text-sm font-mono text-stone-700 bg-stone-50 px-3 py-2 rounded-lg border border-stone-100">
              @{user.username}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>First name</Label>
              <Input value={form.firstName} onChange={e => set("firstName", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Last name</Label>
              <Input value={form.lastName} onChange={e => set("lastName", e.target.value)} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>School</Label>
            <Input value={form.school} onChange={e => set("school", e.target.value)} placeholder="School name" />
          </div>

          <div className="space-y-1.5">
            <Label>หมายเหตุ (Notes)</Label>
            <Textarea
              value={form.notes}
              onChange={e => set("notes", e.target.value)}
              rows={3}
              placeholder="Admin notes about this student…"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t flex justify-end gap-3">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving} className="bg-green-700 hover:bg-green-600">
            {saving ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function UserManagement() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [updatingId, setUpdatingId] = useState(null);
  const [editingUser, setEditingUser] = useState(null);

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
      toast.error(err.message || "Failed");
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
      toast.error(err.message || "Failed");
    } finally {
      setUpdatingId(null);
    }
  };

  const handleEditSave = (updated) => {
    setUsers(prev => prev.map(u => u.id === updated.id ? updated : u));
    setEditingUser(null);
  };

  const filtered = users.filter(u => {
    const name = `${u.firstName || ""} ${u.lastName || ""} ${u.username || ""} ${u.school || ""}`.toLowerCase();
    const matchSearch = !search || name.includes(search.toLowerCase());
    const matchStatus = filterStatus === "all" || u.status === filterStatus;
    return matchSearch && matchStatus;
  });

  const statusBadge = {
    pending:  "bg-amber-100 text-amber-700",
    approved: "bg-emerald-100 text-emerald-700",
    rejected: "bg-stone-100 text-stone-500",
  };

  return (
    <div className="min-h-screen bg-linear-to-br from-stone-50 to-amber-50/30 p-4 md:p-8">
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-amber-100 rounded-xl flex items-center justify-center">
            <Users className="w-5 h-5 text-amber-700" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-stone-900">User Management</h1>
            <p className="text-stone-500 text-sm">{filtered.length} of {users.length} users shown</p>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-3">
          <div className="relative flex-1 min-w-48">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
            <Input className="pl-9" placeholder="Search by name, username, or school..." value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="w-36"><SelectValue placeholder="All statuses" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="approved">Approved</SelectItem>
              <SelectItem value="rejected">Rejected</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* User table */}
        <Card className="border-0 shadow-sm overflow-hidden">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-amber-50/60 text-xs text-stone-500 uppercase">
                  <tr>
                    <th className="text-left px-5 py-3">Student</th>
                    <th className="text-left px-4 py-3">School</th>
                    <th className="text-left px-4 py-3">Notes</th>
                    <th className="text-left px-4 py-3">Status</th>
                    <th className="text-left px-4 py-3">Joined</th>
                    <th className="text-right px-4 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-50">
                  {loading && [1,2,3].map(i => (
                    <tr key={i}><td colSpan={6} className="px-5 py-3"><div className="h-4 bg-amber-50 rounded animate-pulse" /></td></tr>
                  ))}
                  {!loading && filtered.length === 0 && (
                    <tr><td colSpan={6} className="text-center text-stone-400 py-10">No students match your filters</td></tr>
                  )}
                  {!loading && filtered.map(u => (
                    <tr key={u.id} className="hover:bg-amber-50/50 active:bg-amber-50 transition-colors">
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 bg-linear-to-br from-amber-500 to-amber-700 rounded-full flex items-center justify-center text-white text-xs font-bold">
                            {(u.firstName || u.username || "S")[0].toUpperCase()}
                          </div>
                          <div>
                            <p className="font-medium text-stone-800">{u.firstName} {u.lastName}</p>
                            <p className="text-xs text-stone-400">@{u.username}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-stone-600 text-xs">{u.school || "—"}</td>
                      <td className="px-4 py-3 max-w-40">
                        {u.notes
                          ? <p className="text-xs text-stone-500 truncate" title={u.notes}>{u.notes}</p>
                          : <span className="text-xs text-stone-300">—</span>}
                      </td>
                      <td className="px-4 py-3">
                        <Badge className={`text-xs ${statusBadge[u.status] || ""}`}>{u.status}</Badge>
                      </td>
                      <td className="px-4 py-3 text-stone-500 text-xs">{new Date(u.createdAt).toLocaleDateString()}</td>
                      <td className="px-4 py-3">
                        <div className="flex gap-1 justify-end flex-wrap">
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-xs h-7 border-stone-200 text-stone-600 hover:bg-stone-50"
                            onClick={() => setEditingUser(u)}
                          >
                            <Pencil className="w-3 h-3 mr-1" />Edit
                          </Button>
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
      </div>

      {editingUser && (
        <EditUserModal
          user={editingUser}
          onSave={handleEditSave}
          onClose={() => setEditingUser(null)}
        />
      )}
    </div>
  );
}
