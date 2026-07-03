import { Link, useNavigate } from "@tanstack/react-router";
import { motion } from "motion/react";
import { Zap, Menu, X, LayoutDashboard, Settings, LogOut, Shield, User as UserIcon } from "lucide-react";
import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

export function Navbar() {
  const [open, setOpen] = useState(false);
  const { user, profile, isAdmin, signOut } = useAuth();
  const navigate = useNavigate();

  const links = [
    { to: "/", label: "Home" },
    { to: "/location", label: "Location" },
    { to: "/#features", label: "Features" },
    { to: "/#networks", label: "Networks" },
    { to: "/pricing", label: "Pricing" },
    { to: "/dashboard/download", label: "Download Bot" },
    { to: "/dashboard/affiliate", label: "Affiliate Program" },
    { to: "/dashboard/reviews", label: "Reviews" },
  ];

  const initials = (profile?.full_name || user?.email || "?")
    .split(" ")
    .map((s) => s[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const handleSignOut = async () => {
    await signOut();
    navigate({ to: "/", replace: true });
  };

  return (
    <motion.header
      initial={{ y: -30, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.6 }}
      className="fixed top-0 inset-x-0 z-50"
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 mt-3">
        <div className="glass-card rounded-2xl flex items-center justify-between px-4 sm:px-6 py-3">
          <Link to="/" className="flex items-center gap-2 group">
            <div className="relative w-9 h-9 rounded-xl bg-gradient-to-br from-[oklch(0.7_0.22_35)] to-[oklch(0.55_0.24_15)] flex items-center justify-center shadow-[0_0_24px_oklch(0.7_0.22_35/50%)]">
              <Zap className="w-5 h-5 text-white" strokeWidth={2.5} fill="white" />
            </div>
            <span className="font-black text-xl tracking-tight text-white">AD4YOU</span>
          </Link>

          <nav className="hidden md:flex items-center gap-1">
            {links.map((l) => (
              <a key={l.to} href={l.to} className="px-3 py-2 text-sm text-white/70 hover:text-white transition-colors rounded-lg hover:bg-white/5">
                {l.label}
              </a>
            ))}
          </nav>

          <div className="hidden md:flex items-center gap-2">
            {user ? (
              <DropdownMenu>
                <DropdownMenuTrigger className="flex items-center gap-2 rounded-xl pl-2 pr-3 py-1.5 hover:bg-white/5 transition cursor-pointer outline-none">
                  <Avatar className="w-8 h-8 ring-1 ring-white/10">
                    <AvatarImage src={profile?.avatar_url ?? undefined} />
                    <AvatarFallback className="bg-gradient-to-br from-primary to-accent text-white text-xs font-semibold">
                      {initials}
                    </AvatarFallback>
                  </Avatar>
                  <span className="text-sm text-white/90 max-w-[140px] truncate">
                    {profile?.full_name ?? user.email}
                  </span>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuLabel className="text-xs text-muted-foreground font-normal truncate">
                    {user.email}
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => navigate({ to: "/dashboard" })}>
                    <LayoutDashboard className="w-4 h-4" /> Dashboard
                  </DropdownMenuItem>
                  {isAdmin && (
                    <DropdownMenuItem onClick={() => navigate({ to: "/admin" })}>
                      <Shield className="w-4 h-4" /> Admin Panel
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem onClick={() => navigate({ to: "/dashboard" })}>
                    <UserIcon className="w-4 h-4" /> Profile
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => navigate({ to: "/dashboard" })}>
                    <Settings className="w-4 h-4" /> Settings
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={handleSignOut} className="text-destructive focus:text-destructive">
                    <LogOut className="w-4 h-4" /> Sign out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <>
                <Link to="/login" className="px-4 py-2 text-sm text-white/80 hover:text-white transition">
                  Log in
                </Link>
                <Link
                  to="/register"
                  className="px-4 py-2 rounded-xl bg-gradient-to-r from-[oklch(0.7_0.22_35)] to-[oklch(0.6_0.24_20)] text-white text-sm font-semibold shadow-[0_0_24px_oklch(0.7_0.22_35/40%)] hover:shadow-[0_0_32px_oklch(0.7_0.22_35/60%)] transition"
                >
                  Get Started
                </Link>
              </>
            )}
          </div>

          <button className="md:hidden text-white" onClick={() => setOpen(!open)} aria-label="Menu">
            {open ? <X /> : <Menu />}
          </button>
        </div>

        {open && (
          <div className="md:hidden glass-card mt-2 rounded-2xl p-4 flex flex-col gap-2">
            {links.map((l) => (
              <a key={l.to} href={l.to} className="px-3 py-2 text-white/80 hover:text-white rounded-lg hover:bg-white/5">
                {l.label}
              </a>
            ))}
            {user ? (
              <>
                <Link to="/dashboard" className="px-3 py-2 text-white/80">Dashboard</Link>
                {isAdmin && <Link to="/admin" className="px-3 py-2 text-white/80">Admin Panel</Link>}
                <button onClick={handleSignOut} className="px-3 py-2 text-left text-destructive">
                  Sign out
                </button>
              </>
            ) : (
              <>
                <Link to="/login" className="px-3 py-2 text-white/80">Log in</Link>
                <Link to="/register" className="px-3 py-2 rounded-xl bg-gradient-to-r from-[oklch(0.7_0.22_35)] to-[oklch(0.6_0.24_20)] text-white font-semibold text-center">
                  Get Started
                </Link>
              </>
            )}
          </div>
        )}
      </div>
    </motion.header>
  );
}
