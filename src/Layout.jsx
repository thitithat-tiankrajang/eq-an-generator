import { useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/lib/AuthContext";
import { createPageUrl } from "@/utils";
import {
  LayoutDashboard, Play, BookOpen, Trophy, Users, Shield, Menu, X, LogOut, Settings
} from "lucide-react";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { label: "Dashboard", icon: LayoutDashboard, page: "Dashboard", roles: ["admin", "student"] },
  { label: "Free Play", icon: Play, page: "Play", roles: ["admin", "student"] },
  { label: "Assignments", icon: BookOpen, page: "Assignments", roles: ["student"] },
  { label: "Leaderboard", icon: Trophy, page: "Leaderboard", roles: ["admin", "student"] },
  { label: "Manage", icon: BookOpen, page: "TeacherDashboard", roles: ["admin"] },
  { label: "Users", icon: Users, page: "UserManagement", roles: ["admin"] },
  { label: "Admin", icon: Shield, page: "AdminPanel", roles: ["admin"] },
  { label: "Settings", icon: Settings, page: "Settings", roles: ["admin", "student"] },
];

export default function Layout({ children, currentPageName }) {
  const { user, logout } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);

  const role = user?.role || "student";
  const visibleNav = NAV_ITEMS.filter(n => n.roles.includes(role));

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <style>{`
        :root {
          --brand: #2563eb;
          --brand-dark: #1e40af;
        }
        * { box-sizing: border-box; }
        body { font-family: 'Inter', system-ui, sans-serif; }
      `}</style>

      {/* Top nav */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-40 h-14">
        <div className="max-w-7xl mx-auto px-4 h-full flex items-center justify-between">
          {/* Logo */}
          <Link to={createPageUrl("Dashboard")} className="flex items-center gap-2 font-black text-slate-900 text-lg">
            <div className="w-7 h-7 bg-gradient-to-br from-yellow-500 to-green-800 rounded-lg flex items-center justify-center text-white text-xs font-black">
              DS
            </div>
            <span className="text-xs font-medium text-green-600 bg-green-50 px-1.5 py-0.5 rounded hidden sm:inline">Pro</span>
          </Link>

          {/* Desktop nav */}
          <nav className="hidden md:flex items-center gap-1">
            {visibleNav.map(item => {
              const active = currentPageName === item.page;
              return (
                <Link
                  key={item.page}
                  to={createPageUrl(item.page)}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all",
                    active
                      ? "bg-green-50 text-green-700"
                      : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                  )}
                >
                  <item.icon className="w-3.5 h-3.5" />
                  {item.label}
                </Link>
              );
            })}
          </nav>

          {/* Right side */}
          <div className="flex items-center gap-2">
            {user ? (
              <div className="flex items-center gap-2">
                <div className="hidden sm:flex items-center gap-2">
                  <div className="w-7 h-7 bg-gradient-to-br from-yellow-500 to-green-800 rounded-full flex items-center justify-center text-white text-xs font-bold">
                    {(user.full_name || user.email || "U")[0].toUpperCase()}
                  </div>
                  <span className="text-sm font-medium text-slate-700 max-w-[120px] truncate">
                    {user.full_name || user.email}
                  </span>
                </div>
                <button
                  onClick={logout}
                  className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100"
                  title="Logout"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <Link
                to="/login"
                className="bg-blue-600 text-white text-sm font-medium px-4 py-1.5 rounded-lg hover:bg-blue-700 transition-colors"
              >
                Sign In
              </Link>
            )}

            {/* Mobile menu button */}
            <button
              onClick={() => setMobileOpen(!mobileOpen)}
              className="md:hidden p-1.5 rounded-lg text-slate-500 hover:bg-slate-100"
            >
              {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>
      </header>

      {/* Mobile menu */}
      {mobileOpen && (
        <div className="md:hidden bg-white border-b border-slate-200 z-30 px-4 py-3 space-y-1">
          {visibleNav.map(item => {
            const active = currentPageName === item.page;
            return (
              <Link
                key={item.page}
                to={createPageUrl(item.page)}
                onClick={() => setMobileOpen(false)}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium",
                  active ? "bg-blue-50 text-blue-700" : "text-slate-600 hover:bg-slate-50"
                )}
              >
                <item.icon className="w-4 h-4" />
                {item.label}
              </Link>
            );
          })}
        </div>
      )}

      {/* Page content */}
      <main className="flex-1">
        {children}
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-200 bg-white text-center py-3 text-xs text-slate-400">
        DAEQ Anagram Pro — Institutional Equation Anagram Training Platform © 2026
      </footer>
    </div>
  );
}