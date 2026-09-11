import { Link, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard, Users, Package, Sliders, CreditCard, Activity,
  HelpCircle, Megaphone, Mail, Download, Settings, ShieldCheck, ArrowLeft, Tag, Share2,
  HandCoins, Crown, BookOpen, Wallet,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";

const links = [
  { to: "/admin", label: "Overview", icon: LayoutDashboard, exact: true },
  { to: "/admin/users", label: "Users", icon: Users },
  { to: "/admin/plans", label: "Plans", icon: Package },
  { to: "/admin/features", label: "Plan Features", icon: Sliders },
  { to: "/admin/plan-info", label: "Package Info", icon: BookOpen },
  { to: "/admin/offers", label: "Discount Offers", icon: Tag },
  { to: "/admin/payments", label: "Payments", icon: CreditCard },
  { to: "/admin/payouts", label: "Affiliate Payouts", icon: HandCoins },
  { to: "/admin/affiliate", label: "Affiliate Control", icon: Crown },
  { to: "/admin/payout-methods", label: "Payout Methods", icon: Wallet },
  { to: "/admin/sessions", label: "Bot Sessions", icon: Activity },
  { to: "/admin/tickets", label: "Support Tickets", icon: HelpCircle },
  { to: "/admin/announcements", label: "Announcements", icon: Megaphone },
  { to: "/admin/contact", label: "Contact Messages", icon: Mail },
  { to: "/admin/platforms", label: "Social Platforms", icon: Share2 },
  { to: "/admin/versions", label: "Software Downloads", icon: Download },
  { to: "/admin/settings", label: "Settings", icon: Settings },
];


export function AdminSidebar({ onNavigate }: { onNavigate?: () => void }) {
  const { signOut, profile } = useAuth();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <aside className="h-full w-64 shrink-0 flex flex-col border-r border-white/5 bg-gradient-to-b from-[oklch(0.1_0.025_270)] to-[oklch(0.07_0.02_270)] backdrop-blur-xl">
      <div className="px-6 py-5 border-b border-white/5">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-destructive to-primary grid place-content-center">
            <ShieldCheck className="w-4 h-4 text-white" />
          </div>
          <span className="font-bold tracking-tight">Admin Panel</span>
        </div>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {links.map(({ to, label, icon: Icon, exact }) => {
          const active = exact ? pathname === to : pathname === to || pathname.startsWith(`${to}/`);
          return (
            <Link key={to} to={to} onClick={onNavigate}
              className={cn(
                "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all",
                active
                  ? "bg-gradient-to-r from-primary/25 to-accent/15 text-white ring-1 ring-primary/30"
                  : "text-muted-foreground hover:bg-white/5 hover:text-foreground",
              )}>
              <Icon className="w-4 h-4" />
              <span>{label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="p-3 border-t border-white/5 space-y-2">
        <Link to="/dashboard" className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-muted-foreground hover:text-foreground hover:bg-white/5">
          <ArrowLeft className="w-3.5 h-3.5" />Back to Dashboard
        </Link>
        <div className="px-3 py-2 rounded-lg bg-white/5 text-xs">
          <p className="text-muted-foreground">Admin</p>
          <p className="font-medium truncate">{profile?.full_name ?? profile?.email}</p>
        </div>
        <button onClick={signOut} className="w-full px-3 py-2 rounded-lg text-xs text-muted-foreground hover:bg-destructive/10 hover:text-destructive text-left">
          Sign out
        </button>
      </div>
    </aside>
  );
}
