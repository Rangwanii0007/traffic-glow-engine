import { useEffect, useState, type ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { TeamSidebar } from "./Sidebar";
import { useMember } from "@/hooks/use-member";
import { supabase } from "@/integrations/supabase/client";

export function TeamShell({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const { token, ready } = useMember();
  const navigate = useNavigate();
  const qc = useQueryClient();

  useEffect(() => {
    if (ready && !token) navigate({ to: "/team-login", replace: true });
  }, [ready, token, navigate]);

  // live updates when the owner or admin changes money-related rows
  useEffect(() => {
    if (!token) return;
    const channel = supabase
      .channel("member-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "member_withdrawals" }, () => {
        void qc.invalidateQueries({ queryKey: ["member"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "member_ledger" }, () => {
        void qc.invalidateQueries({ queryKey: ["member"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "earnings_config" }, () => {
        void qc.invalidateQueries({ queryKey: ["member"] });
      })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [token, qc]);

  if (!ready || !token) {
    return (
      <div className="min-h-screen grid place-content-center bg-background">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground flex">
      <div className="hidden lg:block sticky top-0 h-screen"><TeamSidebar /></div>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="left" className="p-0 w-64"><TeamSidebar onNavigate={() => setOpen(false)} /></SheetContent>
        <div className="flex-1 min-w-0">
          <header className="sticky top-0 z-30 flex items-center gap-3 px-4 py-3 border-b border-white/5 bg-background/80 backdrop-blur-xl">
            <SheetTrigger asChild className="lg:hidden">
              <Button variant="ghost" size="icon"><Menu className="w-5 h-5" /></Button>
            </SheetTrigger>
            <span className="font-bold text-sm lg:hidden">Team Area</span>
          </header>
          <main className="p-4 sm:p-8">{children}</main>
        </div>
      </Sheet>
    </div>
  );
}

export function StatCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-xl sm:text-2xl font-bold mt-1 tracking-tight">{value}</p>
      {hint ? <p className="text-[11px] text-muted-foreground mt-1">{hint}</p> : null}
    </div>
  );
}
