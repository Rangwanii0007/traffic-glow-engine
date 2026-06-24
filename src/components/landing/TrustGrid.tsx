import { motion } from "motion/react";
import { Shield, Globe, Zap, Brain, BarChart3, Lock } from "lucide-react";

const items = [
  { icon: Brain, title: "AI-Powered Analysis", desc: "Machine learning models that learn from millions of ad impressions." },
  { icon: BarChart3, title: "Real-Time Revenue Tracking", desc: "Live dashboards updating second-by-second across every network." },
  { icon: Zap, title: "Advanced Traffic Intelligence", desc: "Deep traffic-quality scoring across 113+ source platforms." },
  { icon: Lock, title: "Enterprise Security", desc: "Bank-grade encryption, RLS-protected data, audited access." },
  { icon: Globe, title: "Global Publisher Support", desc: "Optimized for high-CPM tier-1 countries and beyond." },
  { icon: Shield, title: "Premium Optimization Engine", desc: "Proprietary algorithms tuned for Adsterra, Monetag, AdSense." },
];

export function TrustGrid() {
  return (
    <section className="relative py-28 bg-[oklch(0.08_0.015_270)]">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center max-w-2xl mx-auto mb-16"
        >
          <div className="text-xs font-bold uppercase tracking-widest text-[oklch(0.78_0.2_295)] mb-3">
            Why Publishers Choose AD4YOU
          </div>
          <h2 className="text-4xl sm:text-5xl font-black text-white tracking-tight">
            Built like enterprise. <span className="gradient-text">Priced for everyone.</span>
          </h2>
        </motion.div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {items.map((it, i) => (
            <motion.div
              key={it.title}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-50px" }}
              transition={{ duration: 0.5, delay: i * 0.05 }}
              whileHover={{ y: -6 }}
              className="glass-card rounded-2xl p-6 group hover:border-white/10 transition"
            >
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-gradient-to-br from-[oklch(0.65_0.24_295/30%)] to-[oklch(0.55_0.22_245/20%)] mb-4 group-hover:scale-110 transition-transform">
                <it.icon className="w-6 h-6 text-[oklch(0.85_0.18_295)]" />
              </div>
              <h3 className="font-bold text-white text-lg">{it.title}</h3>
              <p className="text-sm text-white/60 mt-2 leading-relaxed">{it.desc}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
