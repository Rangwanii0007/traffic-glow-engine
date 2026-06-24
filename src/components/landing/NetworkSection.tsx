import { motion } from "motion/react";
import { Check } from "lucide-react";
import { PhoneDashboard, TodaysEarningsBubble } from "./PhoneDashboard";
import { ParticleField } from "./AnimatedPrimitives";
import type { ReactNode } from "react";

type Theme = "adsterra" | "monetag" | "adsense";

interface Props {
  number: string;
  label: string;
  theme: Theme;
  brandName: string;
  brandColorClass: string;
  title: ReactNode;
  description: string;
  features: string[];
  metrics: { label: string; value: string }[];
  reverse?: boolean;
  bg: string;
  phoneProps: Parameters<typeof PhoneDashboard>[0];
  bubble: { amount: string; delta: string };
  particleColor: string;
}

export function NetworkSection({
  number, label, theme, brandName, brandColorClass, title, description, features, metrics, reverse, bg, phoneProps, bubble, particleColor,
}: Props) {
  return (
    <section className="relative py-28 overflow-hidden">
      <div className="absolute inset-0" style={{ background: bg }} />
      <ParticleField color={particleColor} count={28} />

      {/* Wave decoration */}
      <svg className="absolute bottom-0 right-0 w-2/3 h-2/3 opacity-20 pointer-events-none" viewBox="0 0 800 600">
        {Array.from({ length: 8 }).map((_, i) => (
          <motion.path
            key={i}
            d={`M ${100 + i * 30} 500 Q 400 ${300 - i * 20}, 700 ${450 - i * 10}`}
            fill="none"
            stroke={particleColor}
            strokeWidth="1"
            initial={{ pathLength: 0 }}
            whileInView={{ pathLength: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 2, delay: i * 0.1 }}
          />
        ))}
      </svg>

      <div className="relative mx-auto max-w-7xl px-4 sm:px-6">
        <div className={`grid lg:grid-cols-2 gap-12 lg:gap-16 items-center ${reverse ? "lg:[&>*:first-child]:order-2" : ""}`}>
          {/* Content */}
          <motion.div
            initial={{ opacity: 0, x: reverse ? 40 : -40 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, margin: "-100px" }}
            transition={{ duration: 0.7 }}
          >
            <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-lg ${brandColorClass} text-xs font-bold uppercase tracking-wider mb-6`}>
              <span className="opacity-60">{number}</span>
              {label}
            </div>

            <h2 className="text-4xl sm:text-5xl lg:text-6xl font-black tracking-tight text-white leading-tight">
              {title}
            </h2>

            <p className="mt-5 text-white/70 text-lg leading-relaxed max-w-xl">
              {description}
            </p>

            <ul className="mt-8 space-y-3">
              {features.map((f, i) => (
                <motion.li
                  key={f}
                  initial={{ opacity: 0, x: -10 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: 0.1 * i, duration: 0.4 }}
                  className="flex items-center gap-3 text-white/85"
                >
                  <span className={`flex items-center justify-center w-6 h-6 rounded-full ${brandColorClass}`}>
                    <Check className="w-3.5 h-3.5" strokeWidth={3} />
                  </span>
                  <span className="font-medium">{f}</span>
                </motion.li>
              ))}
            </ul>

            <div className="mt-10 glass-card rounded-2xl p-5 flex gap-6">
              {metrics.map((m, i) => (
                <div key={m.label} className={`flex-1 ${i > 0 ? "border-l border-white/10 pl-6" : ""}`}>
                  <div className="text-xs text-white/60 mb-1">{m.label}</div>
                  <div className={`text-3xl font-black ${
                    theme === "adsterra" ? "gradient-text-orange" :
                    theme === "monetag" ? "gradient-text-purple" : "gradient-text-blue"
                  }`}>{m.value}</div>
                </div>
              ))}
            </div>
          </motion.div>

          {/* Phone */}
          <motion.div
            initial={{ opacity: 0, x: reverse ? -40 : 40, scale: 0.9 }}
            whileInView={{ opacity: 1, x: 0, scale: 1 }}
            viewport={{ once: true, margin: "-100px" }}
            transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
            className="relative flex items-center justify-center gap-4"
          >
            <PhoneDashboard {...phoneProps} />
            <div className="absolute right-0 lg:right-[-30px] top-1/3">
              <TodaysEarningsBubble theme={theme} amount={bubble.amount} delta={bubble.delta} />
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
