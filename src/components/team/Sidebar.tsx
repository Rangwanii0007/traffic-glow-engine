import { Link, useRouterState } from "@tanstack/react-router";
import { BadgeDollarSign, Calculator, LayoutDashboard, LogOut, Receipt, Trophy, UserRound, Wallet, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { useMember } from "@/hooks/use-member";

const links = [
  { to: "/team", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { to: "/team/earnings", label: "My Earnings", icon: BadgeDollarSign },
  { to: "/team/earning-info", label: "Earning Information", icon: Calculator },
  { to: "/team/leaderboard", label: "Leaderboard", icon: Trophy },
  { to: "/team/withdraw", label: "Withdraw", icon: Wallet },
  { to: "/team/payments", label: "Payment History", icon: Receipt },
  { to: "/team/profile", label: "Profile", icon: UserRound },
];

export function TeamSidebar({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { signOut } = useMember();

  return (
    <aside className="h-full w-64 shrink-0 flex flex-col border-r border-white/5 bg-gradient-to-b from-[oklch(0.11_0.03_250)] to-[oklch(0.07_0.02_270)] backdrop-blur-xl">
      <div className="px-6 py-5 border-b border-white/5">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[oklch(0.72_0.17_200)] to-[oklch(0.6_0.2_275)] grid place-content-center">
            <Users className="w-4 h-4 text-black" />
          </div>
          <span className="font-bold tracking-tight">Team Area</span>
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
        <button
          onClick={() => void signOut()}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-muted-foreground hover:text-foreground hover:bg-white/5"
        >
          <LogOut className="w-3.5 h-3.5" />
          Sign out
        </button>
      </div>
    </aside>
  );
}
