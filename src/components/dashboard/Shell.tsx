import { useState, type ReactNode } from "react";
import { Menu, X } from "lucide-react";
import { DashboardSidebar } from "./Sidebar";

export function DashboardShell({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="min-h-screen bg-background text-foreground flex">
      {/* desktop sidebar */}
      <div className="hidden lg:block">
        <DashboardSidebar />
      </div>

      {/* mobile drawer */}
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 left-0">
            <DashboardSidebar onNavigate={() => setOpen(false)} />
          </div>
        </div>
      )}

      <div className="flex-1 flex flex-col min-w-0">
        <header className="lg:hidden h-14 flex items-center justify-between px-4 border-b border-white/5 bg-background/80 backdrop-blur sticky top-0 z-30">
          <button
            onClick={() => setOpen((v) => !v)}
            className="w-10 h-10 grid place-content-center rounded-lg hover:bg-white/5"
            aria-label="Toggle menu"
          >
            {open ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
          <span className="font-bold">AD4YOU</span>
          <div className="w-10" />
        </header>

        <main className="flex-1 px-4 sm:px-6 lg:px-10 py-6 lg:py-10 overflow-x-hidden">
          {children}
        </main>
      </div>
    </div>
  );
}
