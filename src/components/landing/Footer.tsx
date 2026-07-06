import { Zap } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { SocialPlatforms } from "@/components/landing/SocialPlatforms";

export function Footer() {
  const cols = [
    {
      title: "Product",
      links: [
        { to: "/pricing", label: "Pricing" },
        { to: "/#features", label: "Features" },
        { to: "/#networks", label: "Networks" },
        { to: "/download", label: "Download Bot" },
      ],
    },
    {
      title: "Company",
      links: [
        { to: "/about", label: "About" },
        { to: "/contact", label: "Contact" },
        { to: "/reviews", label: "Reviews" },
      ],
    },
    {
      title: "Account",
      links: [
        { to: "/login", label: "Log in" },
        { to: "/register", label: "Sign up" },
        { to: "/dashboard", label: "Dashboard" },
        { to: "/dashboard/support", label: "Support" },
      ],
    },
  ];

  return (
    <footer className="relative border-t border-white/5 bg-[oklch(0.06_0.015_270)]">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 py-16">
        <div className="grid md:grid-cols-2 lg:grid-cols-5 gap-10">
          <div className="lg:col-span-2">
            <Link to="/" className="flex items-center gap-2">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[oklch(0.7_0.22_35)] to-[oklch(0.55_0.24_15)] flex items-center justify-center">
                <Zap className="w-5 h-5 text-white" strokeWidth={2.5} fill="white" />
              </div>
              <span className="font-black text-xl tracking-tight text-white">AD4YOU</span>
            </Link>
            <p className="mt-4 text-sm text-white/60 max-w-xs">
              AI-powered ad-revenue optimization for Adsterra, Monetag and AdSense publishers worldwide.
            </p>
          </div>

          {cols.map((c) => (
            <div key={c.title}>
              <h4 className="font-bold text-white text-sm mb-4">{c.title}</h4>
              <ul className="space-y-2.5">
                {c.links.map((l) => (
                  <li key={l.label}>
                    <a href={l.to} className="text-sm text-white/60 hover:text-white transition">{l.label}</a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-12 pt-8 border-t border-white/5 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-xs text-white/40">© {new Date().getFullYear()} AD4YOU. All rights reserved.</p>
          <p className="text-xs text-white/40">Crypto payments by NOWPayments · Secured by enterprise-grade infrastructure</p>
        </div>
      </div>
    </footer>
  );
}
