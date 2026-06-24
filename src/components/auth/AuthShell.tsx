import { Link } from "@tanstack/react-router";
import { motion } from "motion/react";
import { Zap } from "lucide-react";
import type { ReactNode } from "react";

export function AuthShell({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="relative min-h-screen flex items-center justify-center px-4 py-12 overflow-hidden bg-background">
      {/* Animated gradient particles */}
      <div className="absolute inset-0 -z-10">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_60%_50%_at_20%_10%,oklch(0.55_0.24_295/30%),transparent_60%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_60%_50%_at_80%_90%,oklch(0.55_0.2_240/30%),transparent_60%)]" />
        <motion.div
          className="absolute -top-32 -left-32 w-[28rem] h-[28rem] rounded-full bg-[oklch(0.55_0.26_295/25%)] blur-3xl"
          animate={{ x: [0, 40, 0], y: [0, 30, 0] }}
          transition={{ duration: 12, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.div
          className="absolute -bottom-32 -right-32 w-[32rem] h-[32rem] rounded-full bg-[oklch(0.55_0.22_240/25%)] blur-3xl"
          animate={{ x: [0, -50, 0], y: [0, -30, 0] }}
          transition={{ duration: 14, repeat: Infinity, ease: "easeInOut" }}
        />
        <div className="absolute inset-0 bg-[linear-gradient(to_bottom,transparent,oklch(0.08_0.015_270)_90%)]" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-md"
      >
        <Link to="/" className="flex items-center gap-2 justify-center mb-8 group">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[oklch(0.65_0.24_295)] to-[oklch(0.6_0.22_250)] flex items-center justify-center shadow-[var(--shadow-glow-primary)]">
            <Zap className="w-5 h-5 text-white" fill="white" strokeWidth={2.5} />
          </div>
          <span className="text-xl font-black tracking-tight text-foreground">AD4YOU</span>
        </Link>

        <div className="glass-card rounded-3xl p-8 shadow-[var(--shadow-card)]">
          <h1 className="text-2xl font-bold text-foreground mb-1.5 tracking-tight">{title}</h1>
          {subtitle && <p className="text-sm text-muted-foreground mb-6">{subtitle}</p>}
          {children}
        </div>

        {footer && <div className="mt-6 text-center text-sm text-muted-foreground">{footer}</div>}
      </motion.div>
    </div>
  );
}
