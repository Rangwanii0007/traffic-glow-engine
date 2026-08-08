import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { motion } from "motion/react";
import { Shield, Zap, Globe2, Sparkles, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Navbar } from "@/components/landing/Navbar";
import { Footer } from "@/components/landing/Footer";
import { SocialPlatforms } from "@/components/landing/SocialPlatforms";
import { PageGate } from "@/components/PageGate";

export const Route = createFileRoute("/about")({
  head: () => ({
    meta: [
      { title: "About AD4YOU — Premium Traffic Intelligence" },
      { name: "description", content: "AD4YOU delivers AI-powered, real-time global traffic for Adsterra, Monetag and AdSense publishers." },
    ],
  }),
  component: () => (
    <PageGate pageKey="page_about_enabled">
      <AboutPage />
    </PageGate>
  ),
});

function AboutPage() {
  const { data: about } = useQuery({
    queryKey: ["setting", "about_us"],
    queryFn: async () => {
      const { data } = await supabase.from("settings").select("value").eq("key", "about_us").maybeSingle();
      return (data as { value: string | null } | null)?.value ?? "";
    },
  });

  const stats = [
    { icon: Globe2, label: "Countries", value: "182" },
    { icon: Users, label: "Publishers", value: "12K+" },
    { icon: Zap, label: "Sessions / day", value: "4.2M" },
    { icon: Shield, label: "Uptime", value: "99.99%" },
  ];

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Navbar />
      <main className="pt-28 pb-20 px-4 sm:px-6">
        <div className="max-w-5xl mx-auto space-y-12">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }} className="text-center">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-primary/30 bg-primary/5 text-primary text-xs font-semibold mb-4">
              <Sparkles className="w-3.5 h-3.5" /> ABOUT AD4YOU
            </div>
            <h1 className="text-4xl sm:text-6xl font-black tracking-tight bg-gradient-to-r from-white via-primary/90 to-accent bg-clip-text text-transparent">
              Traffic, reimagined.
            </h1>
            <p className="mt-6 text-lg text-muted-foreground max-w-2xl mx-auto whitespace-pre-line">
              {about || "AD4YOU is an AI-powered ad-revenue optimization platform."}
            </p>
          </motion.div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {stats.map((s) => (
              <div key={s.label} className="glass-card rounded-2xl p-6 text-center">
                <s.icon className="w-6 h-6 mx-auto text-primary" />
                <p className="mt-3 text-2xl font-black">{s.value}</p>
                <p className="text-xs text-muted-foreground uppercase tracking-wider mt-1">{s.label}</p>
              </div>
            ))}
          </div>

          <div className="glass-card rounded-3xl p-8 md:p-12 space-y-6">
            <h2 className="text-2xl font-bold">Our mission</h2>
            <p className="text-muted-foreground leading-relaxed">
              Publishers deserve fair, predictable, and premium traffic. We built AD4YOU to give every creator — from
              indie site owners to enterprise networks — an edge that used to be reserved for a handful of insiders.
              Undetectable by design, engineered for scale, and priced honestly.
            </p>
            <div className="grid md:grid-cols-3 gap-4 pt-4">
              {[
                { t: "Enterprise-grade", d: "Multi-region infrastructure and 99.99% uptime SLA." },
                { t: "Compliance-first", d: "Rotating residential fingerprints and human-behavior modeling." },
                { t: "Transparent", d: "Realtime dashboards, exportable reports, honest pricing." },
              ].map((f) => (
                <div key={f.t} className="rounded-2xl bg-white/5 p-5">
                  <h3 className="font-semibold mb-1">{f.t}</h3>
                  <p className="text-sm text-muted-foreground">{f.d}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="text-center space-y-4">
            <p className="text-sm text-muted-foreground uppercase tracking-widest">Find us on</p>
            <SocialPlatforms className="justify-center" />
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
