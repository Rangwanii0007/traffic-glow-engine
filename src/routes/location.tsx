import { lazy, Suspense, useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { motion } from "motion/react";
import { Download, Globe2, Zap, Sparkles, Shield } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Navbar } from "@/components/landing/Navbar";
import { Footer } from "@/components/landing/Footer";

const GlobeScene = lazy(() => import("@/components/location/GlobeScene"));

export const Route = createFileRoute("/location")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Global Realtime Traffic — AD4YOU" },
      { name: "description", content: "AD4YOU delivers global, real-time premium traffic. Live worldwide activity, your local time, and instant download." },
    ],
  }),
  component: LocationPage,
});

function LocationPage() {
  return (
    <div className="min-h-screen relative overflow-hidden bg-[oklch(0.08_0.03_265)] text-white">
      {/* Space backdrop */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,oklch(0.20_0.10_260/0.6),transparent_60%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom,oklch(0.18_0.10_220/0.5),transparent_60%)]" />
        <Stars />
      </div>

      <Navbar />

      <main className="relative">
        <Hero />
        <RealtimeStrip />
        <DownloadSection />
      </main>

      <Footer />
    </div>
  );
}

function Stars() {
  const stars = Array.from({ length: 80 }, (_, i) => ({
    top: Math.random() * 100,
    left: Math.random() * 100,
    size: Math.random() * 2 + 0.5,
    delay: Math.random() * 4,
    key: i,
  }));
  return (
    <div className="absolute inset-0">
      {stars.map((s) => (
        <span
          key={s.key}
          className="absolute rounded-full bg-white/70 animate-pulse"
          style={{
            top: `${s.top}%`,
            left: `${s.left}%`,
            width: s.size,
            height: s.size,
            animationDelay: `${s.delay}s`,
            animationDuration: `${3 + s.delay}s`,
          }}
        />
      ))}
    </div>
  );
}

function Hero() {
  return (
    <section className="relative pt-32 pb-16 px-4">
      <div className="max-w-7xl mx-auto grid lg:grid-cols-2 gap-10 items-center">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7 }}
          className="relative z-10"
        >
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-cyan-400/30 bg-cyan-400/5 text-cyan-300 text-xs font-semibold mb-6 backdrop-blur">
            <Globe2 className="w-3.5 h-3.5" /> LIVE · GLOBAL NETWORK
          </div>
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-black tracking-tight leading-[1.05]">
            <span className="bg-gradient-to-r from-white via-cyan-100 to-blue-200 bg-clip-text text-transparent">
              OUR AD4YOU
            </span>
            <br />
            <span className="text-white/95">providing</span>{" "}
            <span className="bg-gradient-to-r from-cyan-300 to-blue-400 bg-clip-text text-transparent">
              Global Real-Time Traffic
            </span>
            <br />
            <span className="text-white/85 text-3xl sm:text-4xl lg:text-5xl">with our Premium Users</span>
          </h1>
          <p className="mt-6 text-white/70 text-base sm:text-lg max-w-xl">
            A worldwide constellation of premium traffic nodes — orchestrated in real time,
            engineered for enterprise, undetectable by design.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <a
              href="#download"
              className="group inline-flex items-center gap-2 px-6 py-3 rounded-2xl bg-gradient-to-r from-cyan-500 to-blue-600 text-white font-semibold shadow-[0_0_40px_oklch(0.7_0.2_230/0.45)] hover:shadow-[0_0_60px_oklch(0.7_0.2_230/0.75)] transition"
            >
              <Download className="w-4 h-4" /> Download AD4YOU.exe
            </a>
            <a
              href="#realtime"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-2xl border border-white/15 bg-white/5 hover:bg-white/10 text-white/90 backdrop-blur transition"
            >
              <Zap className="w-4 h-4" /> Live activity
            </a>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 1, delay: 0.1 }}
          className="relative aspect-square w-full max-w-[620px] mx-auto"
        >
          <div className="absolute inset-0 rounded-full bg-[radial-gradient(circle,oklch(0.55_0.22_230/0.35),transparent_60%)] blur-2xl" />
          <div className="absolute inset-0">
            <Suspense fallback={<GlobeFallback />}>
              <GlobeScene />
            </Suspense>
          </div>
        </motion.div>
      </div>
    </section>
  );
}

function GlobeFallback() {
  return (
    <div className="w-full h-full grid place-items-center">
      <div className="w-64 h-64 rounded-full border border-cyan-400/30 animate-pulse bg-[radial-gradient(circle,oklch(0.4_0.15_230/0.35),transparent_70%)]" />
    </div>
  );
}

function RealtimeStrip() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const dateStr = now.toLocaleDateString(undefined, {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
  });
  const parts = new Intl.DateTimeFormat(undefined, {
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";

  return (
    <section id="realtime" className="relative px-4 py-16">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-2 text-cyan-300 text-xs font-bold tracking-[0.3em] uppercase">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" /> Real-time · Your region
          </div>
          <h2 className="mt-3 text-3xl sm:text-4xl font-black tracking-tight bg-gradient-to-r from-white to-cyan-200 bg-clip-text text-transparent">
            Synchronized. Global. Alive.
          </h2>
        </div>

        <div className="relative rounded-3xl border border-white/10 bg-white/[0.04] backdrop-blur-2xl p-8 sm:p-10 overflow-hidden">
          <div className="absolute -inset-px rounded-3xl pointer-events-none"
            style={{ background: "linear-gradient(135deg, oklch(0.75 0.18 210 / 0.35), transparent 50%, oklch(0.65 0.22 280 / 0.3))", WebkitMask: "linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)", padding: 1, WebkitMaskComposite: "xor", maskComposite: "exclude" }}
          />

          <div className="grid md:grid-cols-3 gap-6 items-center">
            <div className="md:col-span-2">
              <p className="text-xs uppercase tracking-[0.25em] text-white/50 mb-3">Local Time · {tz}</p>
              <div className="flex items-end gap-2 sm:gap-3 font-mono tabular-nums">
                <TimeBlock value={get("hour")} label="Hours" />
                <Colon />
                <TimeBlock value={get("minute")} label="Min" />
                <Colon />
                <TimeBlock value={get("second")} label="Sec" accent />
              </div>
              <p className="mt-5 text-white/80 text-lg">{dateStr}</p>
            </div>

            <div className="space-y-3">
              <Stat icon={<Globe2 className="w-4 h-4" />} label="Active Regions" value="182" />
              <Stat icon={<Zap className="w-4 h-4" />} label="Live Sessions" value={liveNumber(now, 42000, 68000)} />
              <Stat icon={<Sparkles className="w-4 h-4" />} label="Impressions / min" value={liveNumber(now, 12000, 21000)} />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function liveNumber(now: Date, min: number, max: number) {
  const t = now.getSeconds() + now.getMinutes() * 60;
  const v = min + ((Math.sin(t / 7) + 1) / 2) * (max - min);
  return Math.round(v).toLocaleString();
}

function TimeBlock({ value, label, accent = false }: { value: string; label: string; accent?: boolean }) {
  return (
    <div className="flex flex-col items-center">
      <div
        className={`px-4 sm:px-6 py-4 sm:py-5 rounded-2xl border border-white/10 bg-black/40 backdrop-blur text-4xl sm:text-6xl font-black leading-none min-w-[86px] sm:min-w-[120px] text-center ${accent ? "text-cyan-300" : "text-white"}`}
        style={{ boxShadow: accent ? "inset 0 0 40px oklch(0.7 0.22 220 / 0.25), 0 10px 40px -10px oklch(0.6 0.22 230 / 0.5)" : "inset 0 0 30px oklch(0 0 0 / 0.5)" }}
      >
        {value}
      </div>
      <span className="mt-2 text-[10px] uppercase tracking-[0.25em] text-white/40">{label}</span>
    </div>
  );
}
function Colon() {
  return <span className="text-4xl sm:text-6xl font-black text-cyan-400/70 animate-pulse pb-6">:</span>;
}
function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center justify-between px-4 py-3 rounded-xl border border-white/10 bg-white/[0.03]">
      <div className="flex items-center gap-2 text-white/70 text-sm">
        <span className="text-cyan-300">{icon}</span>{label}
      </div>
      <div className="font-mono font-bold text-white">{value}</div>
    </div>
  );
}

function DownloadSection() {
  const [url, setUrl] = useState<string>("");
  useEffect(() => {
    supabase.from("settings").select("value").eq("key", "download_url").maybeSingle().then(({ data }) => {
      setUrl((data as { value: string | null } | null)?.value ?? "");
    });
    const ch = supabase.channel("dl-url")
      .on("postgres_changes", { event: "*", schema: "public", table: "settings", filter: "key=eq.download_url" }, (p: any) => {
        setUrl(p.new?.value ?? "");
      }).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  const onDownload = () => {
    if (!url) { toast.error("Download link is being prepared. Please try again shortly."); return; }
    const a = document.createElement("a");
    a.href = url; a.download = "AD4YOU.exe"; a.rel = "noopener";
    document.body.appendChild(a); a.click(); a.remove();
    toast.success("Your download is starting…");
  };

  return (
    <section id="download" className="relative px-4 py-24">
      <div className="max-w-4xl mx-auto text-center">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="relative rounded-[32px] p-10 sm:p-14 border border-white/10 bg-gradient-to-br from-white/[0.06] to-white/[0.02] backdrop-blur-2xl overflow-hidden"
        >
          <div className="absolute -top-24 -right-24 w-72 h-72 rounded-full bg-cyan-500/20 blur-3xl" />
          <div className="absolute -bottom-24 -left-24 w-72 h-72 rounded-full bg-blue-600/20 blur-3xl" />
          <Shield className="w-10 h-10 text-cyan-300 mx-auto" />
          <h3 className="mt-4 text-3xl sm:text-4xl font-black tracking-tight">
            Get <span className="bg-gradient-to-r from-cyan-300 to-blue-400 bg-clip-text text-transparent">AD4YOU</span> for Windows
          </h3>
          <p className="mt-3 text-white/70 max-w-xl mx-auto">
            One-click install. Signed & verified. Auto-updates. Built for enterprise workloads.
          </p>
          <button
            onClick={onDownload}
            className="mt-8 inline-flex items-center gap-3 px-8 py-4 rounded-2xl bg-gradient-to-r from-cyan-500 to-blue-600 text-white font-bold text-lg shadow-[0_0_60px_oklch(0.65_0.22_230/0.55)] hover:scale-[1.02] transition"
          >
            <Download className="w-5 h-5" /> Download AD4YOU.exe
          </button>
          <p className="mt-4 text-xs text-white/40">Windows 10/11 · 64-bit</p>
        </motion.div>
      </div>
    </section>
  );
}
