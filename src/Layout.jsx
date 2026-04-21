import { useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/lib/AuthContext";
import { createPageUrl } from "@/utils";
import {
  LayoutDashboard, Play, BookOpen, Trophy, Users, Shield,
  X, LogOut, Settings, ChevronRight, Menu,
} from "lucide-react";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { label: "Dashboard",   icon: LayoutDashboard, page: "Dashboard",       roles: ["admin", "student"] },
  { label: "Free Play",   icon: Play,            page: "Play",             roles: ["admin", "student"] },
  { label: "Assignments", icon: BookOpen,        page: "Assignments",      roles: ["student"] },
  { label: "Leaderboard", icon: Trophy,          page: "Leaderboard",      roles: ["admin", "student"] },
  { label: "Manage",      icon: BookOpen,        page: "TeacherDashboard", roles: ["admin"] },
  { label: "Users",       icon: Users,           page: "UserManagement",   roles: ["admin"] },
  { label: "Admin",       icon: Shield,          page: "AdminPanel",       roles: ["admin"] },
  { label: "Settings",    icon: Settings,        page: "Settings",         roles: ["admin", "student"] },
];

const BOTTOM_TAB_PAGES = ["Dashboard", "Play", "Assignments", "Leaderboard"];

export default function Layout({ children, currentPageName }) {
  const { user, logout } = useAuth();

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [logoutConfirm, setLogoutConfirm] = useState(false);

  const role = user?.role || "student";

  const visibleNav = NAV_ITEMS.filter(n => n.roles.includes(role));
  const bottomTabs = visibleNav.filter(n => BOTTOM_TAB_PAGES.includes(n.page));
  const drawerItems = visibleNav.filter(n => !BOTTOM_TAB_PAGES.includes(n.page));

  const closeDrawer = () => setDrawerOpen(false);

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col antialiased">

      {/* ── Top Bar ───────────────────────── */}
      <header className="bg-white/90 backdrop-blur border-b border-slate-200 sticky top-0 z-40 h-14 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 h-full flex items-center justify-between">

          {/* Logo */}
          <Link to={createPageUrl("Dashboard")} className="flex items-center gap-2">
            <div className="w-8 h-8 bg-gradient-to-br from-yellow-400 to-green-600 rounded-xl flex items-center justify-center text-white text-xs font-black shadow-md">
              DS
            </div>
            <span className="font-black text-slate-900 text-base hidden sm:block">DAEQ</span>
          </Link>

          {/* Desktop Nav */}
          <nav className="hidden md:flex items-center gap-1">
            {visibleNav.map(item => {
              const active = currentPageName === item.page;
              return (
                <Link
                  key={item.page}
                  to={createPageUrl(item.page)}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-150",
                    active
                      ? "bg-green-50 text-green-700"
                      : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                  )}
                >
                  <item.icon className="w-4 h-4" />
                  {item.label}
                </Link>
              );
            })}
          </nav>

          {/* Right */}
          <div className="flex items-center gap-2">

            {user ? (
              <>
                <div className="hidden sm:flex items-center gap-2">
                  <div className="w-8 h-8 bg-gradient-to-br from-yellow-400 to-green-600 rounded-full flex items-center justify-center text-white text-xs font-bold">
                    {(user.full_name || user.email || "U")[0].toUpperCase()}
                  </div>
                  <span className="text-sm font-medium text-slate-700 max-w-[120px] truncate">
                    {user.full_name || user.email}
                  </span>
                </div>

                <button
                  onClick={() => setLogoutConfirm(true)}
                  className="p-2 rounded-xl text-slate-400 hover:text-red-500 hover:bg-red-50 active:scale-95 transition-all"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </>
            ) : (
              <Link
                to="/login"
                className="bg-green-600 text-white text-sm font-semibold px-4 py-2 rounded-xl hover:bg-green-700 active:scale-95 transition-all"
              >
                Sign In
              </Link>
            )}

            {drawerItems.length > 0 && (
              <button
                onClick={() => setDrawerOpen(true)}
                className="md:hidden p-2 rounded-xl text-slate-500 hover:bg-slate-100 active:scale-95 transition-all"
              >
                <Menu className="w-5 h-5" />
              </button>
            )}
          </div>
        </div>
      </header>

      {/* ── Content ───────────────────────── */}
      <main className="flex-1 md:pb-0 pb-20">
        {children}
      </main>

      {/* ── Bottom Tab ───────────────────── */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur border-t border-slate-200 pb-safe shadow-[0_-2px_10px_rgba(0,0,0,0.05)]">
        <div className="flex">
          {bottomTabs.map(item => {
            const active = currentPageName === item.page;

            return (
              <Link
                key={item.page}
                to={createPageUrl(item.page)}
                className={cn(
                  "relative flex-1 flex flex-col items-center justify-center gap-1 py-2.5 min-h-[60px]",
                  "transition-all duration-150 ease-out active:scale-95",
                  active ? "text-green-600" : "text-slate-400"
                )}
              >
                <item.icon className={cn("w-5 h-5", active && "scale-110 stroke-[2.5px]")} />

                <span className={cn("text-[10px] leading-none", active && "font-semibold")}>
                  {item.label}
                </span>

                <div
                  className={cn(
                    "absolute bottom-0 left-1/2 -translate-x-1/2 w-8 h-0.5 rounded-full transition-all",
                    active ? "bg-green-600 opacity-100" : "opacity-0"
                  )}
                />
              </Link>
            );
          })}
        </div>
      </nav>

      {/* ── Drawer ───────────────────────── */}
      {drawerOpen && (
        <>
          <div
            className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm"
            onClick={closeDrawer}
          />

          <div className="fixed top-0 right-0 bottom-0 z-50 w-72 bg-white shadow-2xl flex flex-col animate-[slideInRight_0.28s_cubic-bezier(0.22,1,0.36,1)]">

            <style>{`
              @keyframes slideInRight {
                from { transform: translateX(100%); opacity: 0; }
                to   { transform: translateX(0); opacity: 1; }
              }
            `}</style>

            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 bg-gradient-to-br from-yellow-400 to-green-600 rounded-full flex items-center justify-center text-white font-bold">
                  {(user?.full_name || user?.email || "U")[0].toUpperCase()}
                </div>
                <div>
                  <div className="text-sm font-semibold text-slate-800">{user?.full_name || "User"}</div>
                  <div className="text-xs text-slate-400">{user?.email}</div>
                </div>
              </div>

              <button onClick={closeDrawer} className="p-2 rounded-xl hover:bg-slate-100">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto py-2">
              {drawerItems.map(item => {
                const active = currentPageName === item.page;

                return (
                  <Link
                    key={item.page}
                    to={createPageUrl(item.page)}
                    onClick={closeDrawer}
                    className={cn(
                      "flex items-center gap-4 px-5 py-3.5 rounded-xl mx-2 my-1 transition-all active:scale-[0.98]",
                      active ? "bg-green-50 text-green-700" : "hover:bg-slate-50"
                    )}
                  >
                    <item.icon className="w-5 h-5" />
                    <span className="flex-1 text-sm font-medium">{item.label}</span>
                    <ChevronRight className="w-4 h-4 text-slate-300" />
                  </Link>
                );
              })}
            </div>

            <div className="p-4">
              <button
                onClick={() => { closeDrawer(); setLogoutConfirm(true); }}
                className="flex items-center gap-3 w-full px-4 py-3 rounded-xl text-red-500 bg-red-50 hover:bg-red-100 active:scale-95 transition-all"
              >
                <LogOut className="w-5 h-5" />
                ออกจากระบบ
              </button>
            </div>

          </div>
        </>
      )}

      {/* ── Logout Modal ─────────────────── */}
      {logoutConfirm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
          onClick={() => setLogoutConfirm(false)}
        >
          <div
            className="bg-white rounded-2xl shadow-xl w-full max-w-xs p-6"
            onClick={e => e.stopPropagation()}
          >
            <h2 className="text-center font-bold mb-2">ออกจากระบบ?</h2>
            <div className="flex gap-3 mt-4">
              <button
                onClick={() => setLogoutConfirm(false)}
                className="flex-1 py-2 rounded-xl border"
              >
                ยกเลิก
              </button>
              <button
                onClick={() => { logout(); }}
                className="flex-1 py-2 rounded-xl bg-red-500 text-white"
              >
                ออก
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}