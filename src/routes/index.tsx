import { createFileRoute } from "@tanstack/react-router";
import { Navbar } from "@/components/landing/Navbar";
import { Hero } from "@/components/landing/Hero";
import { NetworkSection } from "@/components/landing/NetworkSection";
import { TrustGrid } from "@/components/landing/TrustGrid";
import { Reviews } from "@/components/landing/Reviews";
import { Footer } from "@/components/landing/Footer";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "AD4YOU — Maximize Every Click. Boost Every Dollar." },
      { name: "description", content: "AI-powered optimization for Adsterra, Monetag and AdSense. Increase CPM, RPM and ad revenue with the most advanced publisher platform." },
      { property: "og:title", content: "AD4YOU — AI Ad Revenue Optimization" },
      { property: "og:description", content: "AI-powered optimization for Adsterra, Monetag & AdSense publishers." },
    ],
  }),
  component: LandingPage,
});

function LandingPage() {
  return (
    <div className="min-h-screen bg-background text-foreground overflow-hidden">
      <Navbar />
      <main id="features">
        <Hero />

        <div id="networks">
          <NetworkSection
            number="01"
            label="Adsterra Optimization"
            theme="adsterra"
            brandName="Adsterra"
            brandColorClass="bg-[oklch(0.7_0.22_35/18%)] text-[oklch(0.85_0.18_45)] border border-[oklch(0.7_0.22_35/35%)]"
            title={<>Increase <span className="gradient-text-orange">Adsterra</span> Revenue & CPM</>}
            description="Our AI continuously analyzes traffic quality, GEO performance, ad placements, click behavior and audience engagement to identify opportunities for higher CPM and stronger earnings."
            features={[
              "High CPM Country Detection",
              "Smart Ad Placement Analysis",
              "Traffic Quality Intelligence",
              "Revenue Growth Suggestions",
            ]}
            metrics={[
              { label: "Avg CPM Increase", value: "+215%" },
              { label: "Revenue Growth", value: "+189%" },
            ]}
            bg="linear-gradient(180deg, oklch(0.08 0.015 270) 0%, oklch(0.1 0.04 30) 50%, oklch(0.08 0.015 270) 100%)"
            phoneProps={{
              theme: "adsterra",
              mainLabel: "Total Revenue",
              mainValue: "$ 2,734.43",
              mainDelta: "12.5%",
              mainCounter: { to: 2734.43, prefix: "$", decimals: 2 },
              stats: [
                { label: "Impressions", value: "1.24M", delta: "8.31%", counter: { to: 1.24, suffix: "M", decimals: 2 } },
                { label: "Clicks", value: "15.3K", delta: "7.15%", counter: { to: 15.3, suffix: "K", decimals: 1 } },
                { label: "CTR", value: "1.23%", delta: "1.12%", counter: { to: 1.23, suffix: "%", decimals: 2 } },
                { label: "CPM", value: "$ 2.21", delta: "9.21%", counter: { to: 2.21, prefix: "$", decimals: 2 } },
                { label: "Revenue", value: "$2,734", delta: "12.58%", counter: { to: 2734, prefix: "$" } },
                { label: "eCPM", value: "$ 2.21", delta: "3.25%", counter: { to: 2.21, prefix: "$", decimals: 2 } },
              ],
              chartLabel: "Revenue Statistics",
              chartPoints: [180, 220, 200, 280, 260, 340, 380, 420, 460, 510, 540, 580],
            }}
            bubble={{ amount: "$389.56", delta: "18.6%" }}
            particleColor="oklch(0.7 0.22 35 / 0.5)"
          />

          <NetworkSection
            number="02"
            label="Monetag Optimization"
            theme="monetag"
            brandName="Monetag"
            brandColorClass="bg-[oklch(0.65_0.24_295/18%)] text-[oklch(0.85_0.18_295)] border border-[oklch(0.65_0.24_295/35%)]"
            title={<>Boost <span className="gradient-text-purple">Monetag</span> Earnings Effortlessly</>}
            description="AI-driven Monetag optimization that analyzes RPM, ad formats, traffic sources, visitor quality and monetization opportunities to maximize earnings with minimal effort."
            features={[
              "RPM Optimization",
              "Best Traffic Source Discovery",
              "Ad Format Recommendations",
              "Performance Tracking",
            ]}
            metrics={[
              { label: "Avg RPM Increase", value: "+178%" },
              { label: "Earnings Growth", value: "+156%" },
            ]}
            reverse
            bg="linear-gradient(180deg, oklch(0.08 0.015 270) 0%, oklch(0.12 0.08 285) 50%, oklch(0.08 0.015 270) 100%)"
            phoneProps={{
              theme: "monetag",
              mainLabel: "Estimated Earnings",
              mainValue: "$ 1,793.93",
              mainDelta: "15.7%",
              mainCounter: { to: 1793.93, prefix: "$", decimals: 2 },
              stats: [
                { label: "Pageviews", value: "82,775", delta: "10.3%", counter: { to: 82775 } },
                { label: "Clicks", value: "7,682", delta: "8.6%", counter: { to: 7682 } },
                { label: "CTR", value: "9.28%", delta: "1.1%", counter: { to: 9.28, suffix: "%", decimals: 2 } },
                { label: "RPM", value: "$4.28", delta: "12.4%", counter: { to: 4.28, prefix: "$", decimals: 2 } },
                { label: "Earnings", value: "$1,793", delta: "15.7%", counter: { to: 1793, prefix: "$" } },
                { label: "eCPM", value: "$3.92", delta: "9.8%", counter: { to: 3.92, prefix: "$", decimals: 2 } },
              ],
              chartLabel: "Earnings",
              chartPoints: [400, 380, 460, 520, 580, 720, 760, 820, 900, 980, 1050, 1180],
            }}
            bubble={{ amount: "$256.78", delta: "14.6%" }}
            particleColor="oklch(0.65 0.24 295 / 0.5)"
          />

          <NetworkSection
            number="03"
            label="AdSense Optimization"
            theme="adsense"
            brandName="AdSense"
            brandColorClass="bg-[oklch(0.65_0.2_240/18%)] text-[oklch(0.85_0.15_240)] border border-[oklch(0.65_0.2_240/35%)]"
            title={<>Maximize <span className="gradient-text-blue">AdSense</span> Earnings Potential</>}
            description="AI-powered tools that analyze CTR, RPM, content quality and audience behavior to uncover new opportunities for sustainable, long-term revenue growth."
            features={[
              "CTR Optimization",
              "RPM Analysis",
              "Content Intelligence",
              "Revenue Forecasting",
            ]}
            metrics={[
              { label: "Avg RPM Increase", value: "+203%" },
              { label: "Revenue Growth", value: "+233%" },
            ]}
            bg="linear-gradient(180deg, oklch(0.08 0.015 270) 0%, oklch(0.1 0.08 240) 50%, oklch(0.08 0.015 270) 100%)"
            phoneProps={{
              theme: "adsense",
              mainLabel: "Estimated Earnings",
              mainValue: "$4,699.83",
              mainDelta: "13.6%",
              mainCounter: { to: 4699.83, prefix: "$", decimals: 2 },
              stats: [
                { label: "Page views", value: "21.8K", delta: "9.4%", counter: { to: 21.8, suffix: "K", decimals: 1 } },
                { label: "Page RPM", value: "$7.05", delta: "11.2%", counter: { to: 7.05, prefix: "$", decimals: 2 } },
                { label: "Impressions", value: "32.6K", delta: "10.1%", counter: { to: 32.6, suffix: "K", decimals: 1 } },
                { label: "Clicks", value: "1.21K", delta: "7.8%", counter: { to: 1.21, suffix: "K", decimals: 2 } },
                { label: "CPC", value: "$1.18", delta: "3.6%", counter: { to: 1.18, prefix: "$", decimals: 2 } },
                { label: "Page CTR", value: "5.56%", delta: "2.1%", counter: { to: 5.56, suffix: "%", decimals: 2 } },
              ],
              chartLabel: "Performance",
              chartPoints: [800, 920, 1100, 1280, 1450, 1620, 1800, 2050, 2280, 2510, 2780, 3050],
            }}
            bubble={{ amount: "$658.32", delta: "19.6%" }}
            particleColor="oklch(0.65 0.2 240 / 0.5)"
          />
        </div>

        <TrustGrid />
        <Reviews />

        {/* Final CTA */}
        <section className="relative py-28 overflow-hidden">
          <div className="absolute inset-0" style={{
            background: "radial-gradient(ellipse at center, oklch(0.3 0.2 295 / 40%), transparent 70%)",
          }} />
          <div className="relative mx-auto max-w-4xl px-4 sm:px-6 text-center">
            <h2 className="text-4xl sm:text-6xl font-black text-white tracking-tight">
              Ready to <span className="gradient-text">multiply your revenue?</span>
            </h2>
            <p className="mt-5 text-white/70 text-lg max-w-xl mx-auto">
              Join 12,800+ publishers boosting Adsterra, Monetag and AdSense earnings every day.
            </p>
            <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-3">
              <a href="/register" className="inline-flex items-center gap-2 px-7 py-4 rounded-2xl bg-gradient-to-r from-[oklch(0.65_0.24_295)] to-[oklch(0.55_0.22_245)] text-white font-semibold shadow-[0_0_40px_oklch(0.6_0.24_280/50%)] hover:shadow-[0_0_60px_oklch(0.6_0.24_280/75%)] transition-all">
                Start Free Trial
              </a>
              <a href="/pricing" className="inline-flex items-center gap-2 px-7 py-4 rounded-2xl glass-card text-white font-semibold hover:bg-white/10 transition">
                View Pricing
              </a>
            </div>
            <p className="mt-6 text-xs text-white/50">No credit card required · Cancel anytime · Crypto payments accepted</p>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
