import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Crown, Loader2, Menu, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BusinessSidebar } from "./Sidebar";
import { getBusinessAccess, listMyTeams } from "@/lib/team.functions";

export type TeamRow = Record<string, string | number | boolean | null | undefined | unknown>;

type BusinessContextValue = {
  teams: TeamRow[];
  teamId: string | null;
  team: TeamRow | null;
  setTeamId: (id: string) => void;
  refetchTeams: () => void;
};

const BusinessContext = createContext<BusinessContextValue | undefined>(undefined);

export function useBusiness() {
  const ctx = useContext(BusinessContext);
  if (!ctx) throw new Error("useBusiness must be used inside BusinessShell");
  return ctx;
}

const STORAGE_KEY = "ad4you.business.team";

export function BusinessShell({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [teamId, setTeamId] = useState<string | null>(null);

  const access = useQuery({ queryKey: ["business", "access"], queryFn: () => getBusinessAccess() });
  const teamsQuery = useQuery({
    queryKey: ["business", "teams"],
    queryFn: () => listMyTeams(),
    enabled: access.data?.allowed === true,
  });

  const teams = (teamsQuery.data ?? []) as TeamRow[];

  useEffect(() => {
    if (!teams.length) { setTeamId(null); return; }
    const stored = typeof window !== "undefined" ? window.localStorage.getItem(STORAGE_KEY) : null;
    const exists = teams.some((t) => t['id'] === stored);
    const next = exists ? stored : String(teams[0]?.['id'] ?? "");
    setTeamId(next || null);
  }, [teamsQuery.dataUpdatedAt, teams.length]);

  const selectTeam = (id: string) => {
    setTeamId(id);
    if (typeof window !== "undefined") window.localStorage.setItem(STORAGE_KEY, id);
  };

  if (access.isLoading) {
    return <div className="min-h-screen grid place-content-center bg-background"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>;
  }

  if (!access.data?.allowed) {
    return (
      <div className="min-h-screen grid place-content-center bg-background px-4">
        <div className="max-w-md w-full rounded-3xl border border-white/10 bg-white/[0.03] p-8 text-center space-y-4">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-gradient-to-br from-[oklch(0.78_0.16_85)] to-[oklch(0.62_0.2_35)] grid place-content-center">
            <Crown className="w-6 h-6 text-black" />
          </div>
          <h1 className="text-2xl font-bold">Business plan required</h1>
          <p className="text-sm text-muted-foreground">
            The team control panel — shared URLs, workers, earning rates, leaderboard and withdrawals — is part of the
            Business plan. Upgrade to unlock it for your whole team.
          </p>
          <div className="flex flex-col sm:flex-row gap-2 justify-center">
            <Button asChild><Link to="/pricing"><Sparkles className="w-4 h-4" />View Business plan</Link></Button>
            <Button asChild variant="outline"><Link to="/dashboard">Back to account</Link></Button>
          </div>
        </div>
      </div>
    );
  }

  const team = teams.find((t) => t['id'] === teamId) ?? null;

  return (
    <BusinessContext.Provider
      value={{ teams, teamId, team, setTeamId: selectTeam, refetchTeams: () => void teamsQuery.refetch() }}
    >
      <div className="min-h-screen bg-background text-foreground flex">
        <div className="hidden lg:block sticky top-0 h-screen"><BusinessSidebar /></div>
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetContent side="left" className="p-0 w-64"><BusinessSidebar onNavigate={() => setOpen(false)} /></SheetContent>
          <div className="flex-1 min-w-0">
            <header className="sticky top-0 z-30 flex items-center gap-3 px-4 py-3 border-b border-white/5 bg-background/80 backdrop-blur-xl">
              <SheetTrigger asChild className="lg:hidden">
                <Button variant="ghost" size="icon"><Menu className="w-5 h-5" /></Button>
              </SheetTrigger>
              <span className="font-bold text-sm lg:hidden">Business Panel</span>
              <div className="ml-auto flex items-center gap-2">
                {teams.length > 0 && teamId ? (
                  <Select value={teamId} onValueChange={selectTeam}>
                    <SelectTrigger className="w-44 sm:w-56"><SelectValue placeholder="Select team" /></SelectTrigger>
                    <SelectContent>
                      {teams.map((t) => (
                        <SelectItem key={String(t['id'])} value={String(t['id'])}>
                          {String(t['name'] ?? "Team")}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <span className="text-xs text-muted-foreground">No team yet</span>
                )}
              </div>
            </header>
            <main className="p-4 sm:p-8">{children}</main>
          </div>
        </Sheet>
      </div>
    </BusinessContext.Provider>
  );
}

export function NoTeamNotice() {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-8 text-center space-y-3">
      <h2 className="text-lg font-semibold">Create your first team</h2>
      <p className="text-sm text-muted-foreground">
        Set up a team to add workers, share URLs and track earnings across every PC.
      </p>
      <Button asChild><Link to="/business/teams">Go to Teams &amp; Company</Link></Button>
    </div>
  );
}
