import { useEffect, useState, type ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Loader2, Menu } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { AdminSidebar } from "./Sidebar";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";

export function AdminShell({ children }: { children: ReactNode }) {
  const { isAdmin, loading, profile } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!loading && profile && !isAdmin) navigate({ to: "/dashboard", replace: true });
  }, [loading, isAdmin, profile, navigate]);

  if (loading || !profile) {
    return <div className="min-h-screen grid place-content-center bg-background"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>;
  }
  if (!isAdmin) return null;

  return (
    <div className="min-h-screen bg-background text-foreground flex">
      <div className="hidden lg:block sticky top-0 h-screen"><AdminSidebar /></div>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="left" className="p-0 w-64"><AdminSidebar onNavigate={() => setOpen(false)} /></SheetContent>
        <div className="flex-1 min-w-0">
          <header className="lg:hidden sticky top-0 z-30 flex items-center gap-3 px-4 py-3 border-b border-white/5 bg-background/80 backdrop-blur-xl">
            <SheetTrigger asChild><Button variant="ghost" size="icon"><Menu className="w-5 h-5" /></Button></SheetTrigger>
            <span className="font-bold text-sm">Admin Panel</span>
          </header>
          <main className="p-4 sm:p-8">{children}</main>
        </div>
      </Sheet>
    </div>
  );
}
