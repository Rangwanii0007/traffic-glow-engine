import { motion } from "motion/react";
import type { ReactNode } from "react";
import { AnimatedCounter, AnimatedLine } from "./AnimatedPrimitives";

type Theme = "adsterra" | "monetag" | "adsense";

const themes = {
  adsterra: {
    accent: "oklch(0.7 0.22 35)",
    chip: "bg-[oklch(0.7_0.22_35/15%)] text-[oklch(0.85_0.18_45)] border-[oklch(0.7_0.22_35/30%)]",
    statusDot: "bg-[oklch(0.7_0.22_35)]",
    headerBg: "from-[oklch(0.18_0.04_30)] to-[oklch(0.12_0.03_30)]",
    logoLetter: "A",
    logoBg: "bg-[oklch(0.7_0.22_35)]",
    appName: "ADSTERRA",
    appNameColor: "text-[oklch(0.85_0.18_45)]",
    cardBg: "from-[oklch(0.16_0.04_30)] to-[oklch(0.12_0.03_30)]",
  },
  monetag: {
    accent: "oklch(0.65 0.24 295)",
    chip: "bg-[oklch(0.65_0.24_295/18%)] text-[oklch(0.85_0.18_295)] border-[oklch(0.65_0.24_295/35%)]",
    statusDot: "bg-[oklch(0.65_0.24_295)]",
    headerBg: "from-[oklch(0.18_0.04_280)] to-[oklch(0.12_0.03_280)]",
    logoLetter: "m",
    logoBg: "bg-[oklch(0.65_0.24_295)]",
    appName: "monetag",
    appNameColor: "text-[oklch(0.88_0.15_295)]",
    cardBg: "from-[oklch(0.32_0.18_295)] to-[oklch(0.25_0.16_280)]",
  },
  adsense: {
    accent: "oklch(0.65 0.2 240)",
    chip: "bg-[oklch(0.65_0.2_240/18%)] text-[oklch(0.85_0.15_240)] border-[oklch(0.65_0.2_240/35%)]",
    statusDot: "bg-[oklch(0.65_0.2_240)]",
    headerBg: "from-[oklch(0.16_0.04_240)] to-[oklch(0.12_0.03_240)]",
    logoLetter: "G",
    logoBg: "bg-gradient-to-br from-blue-500 to-emerald-500",
    appName: "Google AdSense",
    appNameColor: "text-[oklch(0.92_0.05_240)]",
    cardBg: "from-[oklch(0.22_0.12_240)] to-[oklch(0.18_0.1_240)]",
  },
} as const;

interface Props {
  theme: Theme;
  mainLabel: string;
  mainValue: string;
  mainDelta: string;
  mainCounter: { to: number; prefix?: string; suffix?: string; decimals?: number };
  stats: { label: string; value: string; delta: string; counter?: { to: number; prefix?: string; suffix?: string; decimals?: number } }[];
  chartLabel: string;
  chartPoints: number[];
}

export function PhoneFrame({ children }: { children: ReactNode }) {
  return (
    <div className="relative mx-auto" style={{ width: 320, height: 650 }}>
      {/* Outer frame */}
      <div
        className="absolute inset-0 rounded-[48px] p-[3px]"
        style={{
          background: "linear-gradient(145deg, oklch(0.35 0.02 270), oklch(0.18 0.02 270) 40%, oklch(0.1 0.01 270))",
          boxShadow: "0 60px 120px -30px rgba(0,0,0,0.8), 0 0 0 1px rgba(255,255,255,0.04) inset",
        }}
      >
        <div className="relative w-full h-full rounded-[45px] bg-[#0a0a0f] overflow-hidden">
          {/* Notch */}
          <div className="absolute top-2 left-1/2 -translate-x-1/2 w-28 h-7 bg-black rounded-full z-30 flex items-center justify-end pr-3">
            <div className="w-2 h-2 rounded-full bg-[#1a1a22]" />
          </div>
          {/* Status bar */}
          <div className="absolute top-0 left-0 right-0 h-10 flex items-center justify-between px-7 z-20 text-[11px] text-white/90 font-semibold">
            <span>9:41</span>
            <span className="flex items-center gap-1 opacity-80">
              <span>•••</span><span>📶</span><span>🔋</span>
            </span>
          </div>
          {children}
        </div>
      </div>
      {/* Side buttons */}
      <div className="absolute left-[-3px] top-32 w-[3px] h-16 bg-[oklch(0.2_0.01_270)] rounded-l" />
      <div className="absolute right-[-3px] top-28 w-[3px] h-10 bg-[oklch(0.2_0.01_270)] rounded-r" />
    </div>
  );
}

export function PhoneDashboard({ theme, mainLabel, mainValue, mainDelta, mainCounter, stats, chartLabel, chartPoints }: Props) {
  const t = themes[theme];
  return (
    <PhoneFrame>
      <div className="pt-12 px-4 h-full overflow-hidden">
        {/* Header */}
        <div className={`flex items-center justify-between mb-4 bg-gradient-to-b ${t.headerBg} rounded-2xl px-3 py-2.5`}>
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 flex flex-col justify-center gap-0.5">
              <span className="block h-0.5 bg-white/70 rounded" />
              <span className="block h-0.5 bg-white/70 rounded" />
              <span className="block h-0.5 bg-white/70 rounded" />
            </div>
            <div className="flex items-center gap-1.5">
              <div className={`w-6 h-6 rounded-md ${t.logoBg} flex items-center justify-center text-white font-black text-sm`}>
                {t.logoLetter}
              </div>
              <span className={`font-bold text-sm ${t.appNameColor}`}>{t.appName}</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-white/60">🔔</span>
            <div className={`w-6 h-6 rounded-full ${t.logoBg} flex items-center justify-center text-[10px] text-white font-bold`}>
              U
            </div>
          </div>
        </div>

        {/* Dashboard chip */}
        <div className="flex items-center justify-between mb-3">
          <span className="text-white/90 text-sm font-semibold">Dashboard</span>
          <span className="text-[10px] text-white/60 px-2 py-1 rounded-md bg-white/5 border border-white/10">
            Last 7 days ▾
          </span>
        </div>

        {/* Main metric card */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className={`bg-gradient-to-br ${t.cardBg} rounded-2xl p-3 mb-2.5 border border-white/5`}
        >
          <div className="text-[10px] text-white/60 uppercase tracking-wider mb-1">{mainLabel}</div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-black text-white">
              <AnimatedCounter to={mainCounter.to} prefix={mainCounter.prefix} suffix={mainCounter.suffix} decimals={mainCounter.decimals} duration={2.5} />
            </span>
            <span className="text-[10px] text-emerald-400 font-bold">▲ {mainDelta}</span>
          </div>
          <div className="text-[9px] text-white/40 mt-0.5">vs previous 7 days</div>
        </motion.div>

        {/* Mini stats grid */}
        <div className="grid grid-cols-3 gap-1.5 mb-2.5">
          {stats.slice(0, 3).map((s, i) => (
            <motion.div
              key={s.label}
              initial={{ opacity: 0, y: 8 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.1 * i, duration: 0.4 }}
              className="bg-white/5 rounded-xl p-2 border border-white/5"
            >
              <div className="text-[8px] text-white/50 uppercase">{s.label}</div>
              <div className="text-[13px] font-bold text-white mt-0.5">
                {s.counter ? (
                  <AnimatedCounter to={s.counter.to} prefix={s.counter.prefix} suffix={s.counter.suffix} decimals={s.counter.decimals} />
                ) : s.value}
              </div>
              <div className="text-[8px] text-emerald-400 font-semibold">▲ {s.delta}</div>
            </motion.div>
          ))}
        </div>
        <div className="grid grid-cols-3 gap-1.5 mb-3">
          {stats.slice(3, 6).map((s, i) => (
            <motion.div
              key={s.label}
              initial={{ opacity: 0, y: 8 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.1 * i + 0.3, duration: 0.4 }}
              className="bg-white/5 rounded-xl p-2 border border-white/5"
            >
              <div className="text-[8px] text-white/50 uppercase">{s.label}</div>
              <div className="text-[13px] font-bold text-white mt-0.5">
                {s.counter ? (
                  <AnimatedCounter to={s.counter.to} prefix={s.counter.prefix} suffix={s.counter.suffix} decimals={s.counter.decimals} />
                ) : s.value}
              </div>
              <div className="text-[8px] text-emerald-400 font-semibold">▲ {s.delta}</div>
            </motion.div>
          ))}
        </div>

        {/* Chart */}
        <div className="bg-white/5 rounded-2xl p-3 border border-white/5">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[11px] text-white/90 font-semibold">{chartLabel}</span>
            <span className="text-[9px] text-white/50">Last 7 days ▾</span>
          </div>
          <AnimatedLine color={t.accent} points={chartPoints} />
          <div className="flex justify-between text-[8px] text-white/40 mt-1">
            <span>May 01</span><span>May 03</span><span>May 05</span><span>May 07</span>
          </div>
        </div>

        {/* Live indicator */}
        <div className="absolute bottom-4 left-4 flex items-center gap-1.5">
          <motion.span
            className={`w-1.5 h-1.5 rounded-full ${t.statusDot}`}
            animate={{ opacity: [0.4, 1, 0.4] }}
            transition={{ duration: 1.5, repeat: Infinity }}
          />
          <span className="text-[9px] text-white/40 font-medium">LIVE</span>
        </div>
      </div>
    </PhoneFrame>
  );
}

export function TodaysEarningsBubble({ theme, amount, delta }: { theme: Theme; amount: string; delta: string }) {
  const t = themes[theme];
  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      whileInView={{ opacity: 1, x: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.6, delay: 0.4 }}
      className="glass-card rounded-2xl px-4 py-3"
      style={{ boxShadow: `0 0 30px ${t.accent.replace(")", " / 25%)")}, var(--shadow-card)` }}
    >
      <div className="text-[10px] text-white/60 mb-1">Today's Earnings</div>
      <div className="text-xl font-black text-white">{amount}</div>
      <div className="text-[10px] text-emerald-400 font-semibold mt-0.5">▲ {delta} vs yesterday</div>
    </motion.div>
  );
}
