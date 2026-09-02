import { Link, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard, Users, Link2, ShieldHalf, Coins, Trophy, Wallet, ScrollText,
  Building2, ArrowLeft, Crown,
} from "lucide-react";
import { cn } from "@/lib/utils";

const links = [
  { to: "/business", label: "Overview", icon: LayoutDashboard, exact: true },
  { to: "/business/teams", label: "Teams & Company", icon: Building2 },
  { to: "/business/members", label: "Team Members", icon: Users },
  { to: "/business/urls", label: "Shared URLs", icon: Link2 },
  { to: "/business/rules", label: "Bot Rules", icon: ShieldHalf },
  { to: "/business/earnings", label: "Earning Rates", icon: Coins },
  { to: "/business/leaderboard", label: "Leaderboard", icon: Trophy },
  { to: "/business/withdrawals", label: "Withdrawals", icon: Wallet },
  { to: "/business/activity", label: "Activity & PCs", icon: ScrollText },
];

export function BusinessSidebar({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <aside className="h-full w-64 shrink-0 flex flex-col border-r border-white/5 bg-gradient-to-b from-[oklch(0.11_0.03_285)] to-[oklch(0.07_0.02_270)] backdrop-blur-xl">
      <div className="px-6 py-5 border-b border-white/5">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[oklch(0.78_0.16_85)] to-[oklch(0.62_0.2_35)] grid place-content-center">
            <Crown className="w-4 h-4 text-black" />
          </div>
          <span className="font-bold tracking-tight">Business Panel</span>
        </div>
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
                "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all",
                active
                  ? "bg-gradient-to-r from-primary/25 to-accent/15 text-white ring-1 ring-primary/30"
                  : "text-muted-foreground hover:bg-white/5 hover:text-foreground",
              )}
            >
              <Icon className="w-4 h-4" />
              <span>{label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="p-3 border-t border-white/5">
        <Link to="/dashboard" onClick={onNavigate} className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-muted-foreground hover:text-foreground hover:bg-white/5">
          <ArrowLeft className="w-3.5 h-3.5" />
          Back to my account
        </Link>
      </div>
    </aside>
  );
}
