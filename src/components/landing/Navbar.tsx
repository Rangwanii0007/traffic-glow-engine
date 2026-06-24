import { Link } from "@tanstack/react-router";
import { motion } from "motion/react";
import { Zap, Menu, X } from "lucide-react";
import { useState } from "react";

export function Navbar() {
  const [open, setOpen] = useState(false);
  const links = [
    { to: "/", label: "Home" },
    { to: "/#features", label: "Features" },
    { to: "/#networks", label: "Networks" },
    { to: "/pricing", label: "Pricing" },
    { to: "/dashboard", label: "Dashboard" },
  ];
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
            <Link to="/login" className="px-4 py-2 text-sm text-white/80 hover:text-white transition">
              Log in
            </Link>
            <Link
              to="/register"
              className="px-4 py-2 rounded-xl bg-gradient-to-r from-[oklch(0.7_0.22_35)] to-[oklch(0.6_0.24_20)] text-white text-sm font-semibold shadow-[0_0_24px_oklch(0.7_0.22_35/40%)] hover:shadow-[0_0_32px_oklch(0.7_0.22_35/60%)] transition"
            >
              Get Started
            </Link>
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
            <Link to="/login" className="px-3 py-2 text-white/80">Log in</Link>
            <Link to="/register" className="px-3 py-2 rounded-xl bg-gradient-to-r from-[oklch(0.7_0.22_35)] to-[oklch(0.6_0.24_20)] text-white font-semibold text-center">
              Get Started
            </Link>
          </div>
        )}
      </div>
    </motion.header>
  );
}
