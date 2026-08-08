import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { Lock } from "lucide-react";
import { usePageEnabled, type PageKey } from "@/hooks/use-page-toggles";
import { Navbar } from "@/components/landing/Navbar";
import { Footer } from "@/components/landing/Footer";
import { useAuth } from "@/hooks/use-auth";

export function PageGate({ pageKey, children }: { pageKey: PageKey; children: ReactNode }) {
  const { enabled, loading } = usePageEnabled(pageKey);
  const { isAdmin } = useAuth();

  if (loading || enabled || isAdmin) return <>{children}</>;

  return (
    <div className="min-h-screen bg-[oklch(0.08_0.03_265)] text-white flex flex-col">
      <Navbar />
      <main className="flex-1 grid place-content-center px-6 pt-32 pb-20 text-center">
        <div className="glass-card rounded-3xl p-10 max-w-md mx-auto space-y-4">
          <div className="w-14 h-14 rounded-2xl mx-auto bg-gradient-to-br from-primary to-accent grid place-content-center">
            <Lock className="w-6 h-6 text-white" />
          </div>
          <h1 className="text-2xl font-bold">This page is temporarily unavailable</h1>
          <p className="text-sm text-white/60">
            Our team has disabled this section for maintenance. Please check back shortly.
          </p>
          <Link
            to="/"
            className="inline-block px-5 py-2.5 rounded-xl bg-gradient-to-r from-[oklch(0.7_0.22_35)] to-[oklch(0.6_0.24_20)] text-white text-sm font-semibold"
          >
            Back to Home
          </Link>
        </div>
      </main>
      <Footer />
    </div>
  );
}
