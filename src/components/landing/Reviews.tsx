import { motion } from "motion/react";
import { Star } from "lucide-react";
import { Link } from "@tanstack/react-router";

const REVIEWS = [
  { name: "Marcus T.", role: "Adsterra Publisher", stars: 5, text: "My CPM jumped from $1.40 to $4.30 in three weeks. AD4YOU's geo-targeting recommendations are next-level — the AI clearly knows what it's doing.", country: "🇺🇸" },
  { name: "Priya S.", role: "Monetag Network", stars: 5, text: "Tried every traffic and optimization tool out there. Nothing comes close to this. RPM doubled, support actually replies, dashboard is gorgeous.", country: "🇮🇳" },
  { name: "Lukas B.", role: "AdSense Publisher", stars: 5, text: "I run 6 content sites. Plugged AD4YOU in, let it analyze for a week, applied the suggestions — revenue up 187%. This is the real deal.", country: "🇩🇪" },
  { name: "Sofia R.", role: "Pop-under Publisher", stars: 5, text: "The traffic-quality scoring alone is worth the subscription. Finally know which sources actually pay vs. which ones burn impressions.", country: "🇧🇷" },
  { name: "Ahmed K.", role: "Direct Link Specialist", stars: 5, text: "Direct link clicker + human-behavior engine = chef's kiss. Tier-1 CPMs without the bot detection headaches. Highly recommended.", country: "🇦🇪" },
  { name: "Yuki H.", role: "Multi-Network Pub", stars: 5, text: "Running Adsterra + Monetag + AdSense from one dashboard. The unified analytics view saves me hours every day.", country: "🇯🇵" },
  { name: "Daniel O.", role: "Agency Owner", stars: 4, text: "Solid platform, great results for our publisher clients. Took a couple sessions to tune proxies but once dialed in — fantastic.", country: "🇳🇬" },
  { name: "Elena P.", role: "Solo Publisher", stars: 5, text: "Pro plan paid for itself in 48 hours. The CPM optimizer is essentially printing money on my Adsterra accounts.", country: "🇷🇴" },
  { name: "James C.", role: "Adsense Veteran", stars: 5, text: "Been doing AdSense for 11 years. AD4YOU's content-intelligence suggestions actually surfaced placement issues I'd never noticed.", country: "🇬🇧" },
  { name: "Carlos M.", role: "Pop Traffic", stars: 3, text: "Good tool overall, results varied by GEO. Tier-1 traffic was great, tier-3 was mixed. Support helped me dial it in eventually.", country: "🇪🇸" },
];

export function Reviews() {
  return (
    <section id="reviews" className="relative py-28 overflow-hidden">
      <div className="absolute inset-0" style={{ background: "radial-gradient(ellipse at center, oklch(0.18 0.08 280 / 50%), transparent 70%)" }} />
      <div className="relative mx-auto max-w-7xl px-4 sm:px-6">
        <div className="text-center max-w-2xl mx-auto mb-14">
          <div className="text-xs font-bold uppercase tracking-widest text-[oklch(0.78_0.2_45)] mb-3">
            Trusted by 12,800+ Publishers
          </div>
          <h2 className="text-4xl sm:text-5xl font-black text-white tracking-tight">
            Reviews that <span className="gradient-text-orange">speak louder than slogans.</span>
          </h2>
          <div className="mt-6 flex items-center justify-center gap-3">
            <div className="flex">
              {[1, 2, 3, 4, 5].map((i) => (
                <Star key={i} className="w-6 h-6 fill-[oklch(0.82_0.18_75)] text-[oklch(0.82_0.18_75)]" />
              ))}
            </div>
            <span className="text-white font-bold text-xl">4.9</span>
            <span className="text-white/60">/ 5 from 2,847 verified publishers</span>
          </div>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
          {REVIEWS.map((r, i) => (
            <motion.div
              key={r.name}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-50px" }}
              transition={{ duration: 0.5, delay: (i % 3) * 0.1 }}
              className="glass-card rounded-2xl p-6 flex flex-col gap-4"
            >
              <div className="flex items-center gap-1">
                {Array.from({ length: 5 }).map((_, idx) => (
                  <Star
                    key={idx}
                    className={`w-4 h-4 ${idx < r.stars ? "fill-[oklch(0.82_0.18_75)] text-[oklch(0.82_0.18_75)]" : "text-white/15"}`}
                  />
                ))}
              </div>
              <p className="text-white/85 text-sm leading-relaxed">"{r.text}"</p>
              <div className="mt-auto flex items-center gap-3 pt-4 border-t border-white/5">
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[oklch(0.65_0.24_295)] to-[oklch(0.55_0.22_245)] flex items-center justify-center text-white font-bold">
                  {r.name[0]}
                </div>
                <div>
                  <div className="text-white font-semibold text-sm flex items-center gap-1.5">
                    {r.name} <span className="text-base">{r.country}</span>
                  </div>
                  <div className="text-xs text-white/50">{r.role}</div>
                </div>
              </div>
            </motion.div>
          ))}
        </div>

        <div className="mt-12 text-center">
          <Link
            to="/login"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl glass-card text-white font-semibold hover:bg-white/10 transition"
          >
            Sign in to leave your review
          </Link>
          <p className="text-xs text-white/50 mt-3">Only verified publishers can post reviews. We never inflate ratings.</p>
        </div>
      </div>
    </section>
  );
}
