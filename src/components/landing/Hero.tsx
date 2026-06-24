import { motion } from "motion/react";
import { Link } from "@tanstack/react-router";
import { ArrowRight, Sparkles, TrendingUp } from "lucide-react";
import { PhoneDashboard, TodaysEarningsBubble } from "./PhoneDashboard";
import { ParticleField, AnimatedCounter } from "./AnimatedPrimitives";

export function Hero() {
  return (
    <section className="relative pt-32 pb-20 overflow-hidden">
      {/* Background layers */}
      <div className="absolute inset-0 bg-grid opacity-30" />
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 90% 60% at 50% 0%, oklch(0.35 0.22 295 / 35%), transparent 60%), radial-gradient(ellipse 60% 40% at 80% 40%, oklch(0.4 0.22 35 / 20%), transparent 70%)",
        }}
      />
      <ParticleField color="oklch(0.7 0.2 295 / 0.6)" count={32} />

      {/* Floating orbs */}
      <motion.div
        animate={{ x: [0, 30, 0], y: [0, -20, 0] }}
        transition={{ duration: 12, repeat: Infinity, ease: "easeInOut" }}
        className="absolute top-40 left-10 w-72 h-72 rounded-full blur-3xl"
        style={{ background: "oklch(0.5 0.25 295 / 30%)" }}
      />
      <motion.div
        animate={{ x: [0, -40, 0], y: [0, 30, 0] }}
        transition={{ duration: 14, repeat: Infinity, ease: "easeInOut" }}
        className="absolute top-20 right-10 w-96 h-96 rounded-full blur-3xl"
        style={{ background: "oklch(0.55 0.22 240 / 25%)" }}
      />

      <div className="relative mx-auto max-w-7xl px-4 sm:px-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7 }}
          className="text-center max-w-4xl mx-auto"
        >
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full glass-card text-xs font-medium text-white/80 mb-6">
            <Sparkles className="w-3.5 h-3.5 text-[oklch(0.78_0.2_295)]" />
            AI-Powered Revenue Optimization Engine
          </div>

          <h1 className="text-5xl sm:text-6xl md:text-7xl lg:text-8xl font-black tracking-tight text-white leading-[1.05]">
            Maximize Every Click.
            <br />
            <span className="gradient-text">Boost Every Dollar.</span>
          </h1>

          <p className="mt-6 text-lg sm:text-xl text-white/70 max-w-2xl mx-auto leading-relaxed">
            AI-powered optimization platform for{" "}
            <span className="text-[oklch(0.78_0.2_45)] font-semibold">Adsterra</span>,{" "}
            <span className="text-[oklch(0.78_0.2_295)] font-semibold">Monetag</span>, and{" "}
            <span className="text-[oklch(0.78_0.18_240)] font-semibold">AdSense</span> publisher monetization networks.
          </p>

          <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link
              to="/register"
              className="group inline-flex items-center gap-2 px-7 py-4 rounded-2xl bg-gradient-to-r from-[oklch(0.65_0.24_295)] to-[oklch(0.55_0.22_245)] text-white font-semibold shadow-[0_0_40px_oklch(0.6_0.24_280/50%)] hover:shadow-[0_0_60px_oklch(0.6_0.24_280/75%)] transition-all"
            >
              Start Free Trial
              <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </Link>
            <Link
              to="/dashboard"
              className="inline-flex items-center gap-2 px-7 py-4 rounded-2xl glass-card text-white font-semibold hover:bg-white/10 transition"
            >
              Explore Dashboard
              <TrendingUp className="w-4 h-4" />
            </Link>
          </div>

          {/* Live counters */}
          <div className="mt-14 grid grid-cols-3 max-w-2xl mx-auto gap-4">
            {[
              { label: "Active Publishers", to: 12800, suffix: "+" },
              { label: "Revenue Optimized", to: 8.4, suffix: "M+", prefix: "$", decimals: 1 },
              { label: "Ad Networks", to: 113, suffix: "+" },
            ].map((s) => (
              <div key={s.label} className="glass-card rounded-2xl p-4 sm:p-5">
                <div className="text-2xl sm:text-3xl font-black gradient-text">
                  <AnimatedCounter to={s.to} prefix={s.prefix} suffix={s.suffix} decimals={s.decimals ?? 0} />
                </div>
                <div className="text-xs text-white/60 mt-1">{s.label}</div>
              </div>
            ))}
          </div>
        </motion.div>

        {/* Hero phone */}
        <motion.div
          initial={{ opacity: 0, y: 60 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.9, delay: 0.3 }}
          className="relative mt-20 flex justify-center items-start gap-8"
        >
          <div className="hidden lg:block flex-1 max-w-xs space-y-4 mt-20">
            <TodaysEarningsBubble theme="adsterra" amount="$389.56" delta="18.6%" />
            <div className="glass-card rounded-2xl p-4">
              <div className="text-xs text-white/60 mb-1">CPM Increase</div>
              <div className="text-2xl font-black gradient-text-orange">+215%</div>
              <div className="text-[10px] text-white/40 mt-1">vs industry baseline</div>
            </div>
          </div>

          <PhoneDashboard
            theme="adsterra"
            mainLabel="Total Revenue"
            mainValue="$ 2,734.43"
            mainDelta="12.5%"
            mainCounter={{ to: 2734.43, prefix: "$", decimals: 2 }}
            stats={[
              { label: "Impressions", value: "1.24M", delta: "8.31%", counter: { to: 1.24, suffix: "M", decimals: 2 } },
              { label: "Clicks", value: "15.3K", delta: "7.15%", counter: { to: 15.3, suffix: "K", decimals: 1 } },
              { label: "CTR", value: "1.23%", delta: "1.12%", counter: { to: 1.23, suffix: "%", decimals: 2 } },
              { label: "CPM", value: "$ 2.21", delta: "9.21%", counter: { to: 2.21, prefix: "$", decimals: 2 } },
              { label: "Revenue", value: "$2,734", delta: "12.58%", counter: { to: 2734, prefix: "$" } },
              { label: "eCPM", value: "$ 2.21", delta: "3.25%", counter: { to: 2.21, prefix: "$", decimals: 2 } },
            ]}
            chartLabel="Revenue Statistics"
            chartPoints={[180, 220, 200, 280, 260, 340, 380, 420, 460, 510, 540, 580]}
          />

          <div className="hidden lg:block flex-1 max-w-xs space-y-4 mt-20">
            <TodaysEarningsBubble theme="monetag" amount="$256.78" delta="14.6%" />
            <div className="glass-card rounded-2xl p-4">
              <div className="text-xs text-white/60 mb-1">RPM Boost</div>
              <div className="text-2xl font-black gradient-text-purple">+178%</div>
              <div className="text-[10px] text-white/40 mt-1">avg publisher gain</div>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
