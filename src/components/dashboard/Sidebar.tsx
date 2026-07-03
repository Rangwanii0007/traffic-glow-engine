import { Link, useRouterState } from "@tanstack/react-router";
import { User, CreditCard, Download, Activity, Settings, HelpCircle, LogOut, Sparkles, Star, Crown, LayoutDashboard } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";

type NavLink = { to: string; label: string; icon: typeof LayoutDashboard; exact?: boolean };
const links: NavLink[] = [
  { to: "/dashboard", label: "Profile", icon: User, exact: true },
  { to: "/dashboard/billing", label: "Billing & Plans", icon: CreditCard },
  { to: "/dashboard/sessions", label: "My Sessions", icon: Activity },
  { to: "/dashboard/settings", label: "Settings", icon: Settings },
  { to: "/dashboard/support", label: "Support", icon: HelpCircle },
];
void Download; void Crown; void Star;


export function DashboardSidebar({ onNavigate }: { onNavigate?: () => void }) {
  const { signOut, profile } = useAuth();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <aside className="h-full w-64 shrink-0 flex flex-col border-r border-white/5 bg-gradient-to-b from-[oklch(0.1_0.025_270)] to-[oklch(0.07_0.02_270)] backdrop-blur-xl">
      <div className="px-6 py-5 border-b border-white/5">
        <Link to="/" className="flex items-center gap-2" onClick={onNavigate}>
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary to-accent grid place-content-center shadow-[0_0_20px_rgba(139,92,246,0.5)]">
            <Sparkles className="w-4 h-4 text-white" />
          </div>
          <span className="font-bold tracking-tight">AD4YOU</span>
        </Link>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {links.map(({ to, label, icon: Icon, exact }) => {
          const active = exact ? pathname === to : pathname === to || pathname.startsWith(`${to}/`);
          return (
            <Link
              key={to}
              to={to}
              onClick={onNavigate}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all",
                active
                  ? "bg-gradient-to-r from-primary/25 to-accent/15 text-white shadow-[0_0_24px_rgba(139,92,246,0.25)] ring-1 ring-primary/30"
                  : "text-muted-foreground hover:bg-white/5 hover:text-foreground",
              )}
            >
              <Icon className="w-4 h-4" />
              <span>{label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="p-3 border-t border-white/5 space-y-2">
        <div className="px-3 py-2 rounded-xl bg-white/5">
          <p className="text-xs text-muted-foreground">Signed in</p>
          <p className="text-sm font-medium truncate">{profile?.full_name ?? profile?.email}</p>
        </div>
        <button
          onClick={signOut}
          className="flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-sm font-medium text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
        >
          <LogOut className="w-4 h-4" />
          Sign out
        </button>
      </div>
    </aside>
  );
}
