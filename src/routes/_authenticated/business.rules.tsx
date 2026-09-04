import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Save, ShieldHalf } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { NoTeamNotice, useBusiness } from "@/components/business/Shell";
import { getTeamConfig, saveTeamRules } from "@/lib/team.functions";

export const Route = createFileRoute("/_authenticated/business/rules")({
  head: () => ({
    meta: [
      { title: "Bot Rules — AD4YOU Business Panel" },
      { name: "description", content: "Lock proxies, devices, traffic mode, working hours and daily limits for the whole team." },
      { property: "og:title", content: "Bot Rules — AD4YOU Business Panel" },
      { property: "og:description", content: "Lock proxies, devices, traffic mode, working hours and daily limits for the whole team." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: RulesPage,
});

const DEVICES = ["desktop", "mobile", "tablet"];
const TRAFFIC_MODES = ["organic", "direct", "social", "referral", "mixed"];

function RulesPage() {
  const { teamId } = useBusiness();
  const qc = useQueryClient();
  const key = ["business", "config", teamId ?? ""];
  const config = useQuery({ queryKey: key, queryFn: () => getTeamConfig({ data: { teamId: teamId! } }), enabled: !!teamId });

  const [proxies, setProxies] = useState("");
  const [trafficMode, setTrafficMode] = useState("mixed");
  const [devices, setDevices] = useState<string[]>([]);
  const [dailyLimit, setDailyLimit] = useState(0);
  const [hoursOn, setHoursOn] = useState(false);
  const [start, setStart] = useState(0);
  const [end, setEnd] = useState(23);
  const [tabs, setTabs] = useState(3);

  useEffect(() => {
    const team = config.data?.team;
    if (!team) return;
    setProxies(Array.isArray(team['locked_proxies']) ? (team['locked_proxies'] as string[]).join("\n") : String(team['locked_proxies'] ?? ""));
    setTrafficMode(String(team['locked_traffic_mode'] ?? "mixed"));
    setDevices(Array.isArray(team['locked_devices']) ? (team['locked_devices'] as string[]) : []);
    setDailyLimit(Number(team['daily_limit_per_member'] ?? 0));
    const allowed = team['allowed_hours'] as { start?: number; end?: number } | null;
    setHoursOn(!!allowed);
    setStart(Number(allowed?.start ?? 0));
    setEnd(Number(allowed?.end ?? 23));
    const settings = (team['settings'] ?? {}) as { concurrent_tabs?: number };
    setTabs(Number(settings.concurrent_tabs ?? 3));
  }, [config.dataUpdatedAt]);

  const save = useMutation({
    mutationFn: () =>
      saveTeamRules({
        data: {
          teamId: teamId!,
          locked_proxies: proxies.trim() ? proxies.trim() : null,
          locked_traffic_mode: trafficMode,
          locked_devices: devices,
          daily_limit_per_member: dailyLimit > 0 ? dailyLimit : null,
          allowed_hours: hoursOn ? { start, end } : null,
          concurrent_tabs: tabs,
        },
      }),
    onSuccess: () => { toast.success("Rules applied to every member"); qc.invalidateQueries({ queryKey: key }); },
    onError: (error: Error) => toast.error(error.message),
  });

  if (!teamId) return <NoTeamNotice />;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Bot rules</h1>
        <p className="text-sm text-muted-foreground">These limits are enforced inside the desktop software for everyone in the team.</p>
      </div>

      {config.isLoading ? <Skeleton className="h-64 rounded-2xl" /> : (
        <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 sm:p-6 space-y-5">
          <div className="flex items-center gap-2"><ShieldHalf className="w-4 h-4 text-primary" /><h2 className="font-semibold">Locked settings</h2></div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5"><Label className="text-xs">Traffic mode</Label>
              <Select value={trafficMode} onValueChange={setTrafficMode}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{TRAFFIC_MODES.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
              </Select></div>
            <div className="space-y-1.5"><Label className="text-xs">Daily visit limit per member (0 = unlimited)</Label>
              <Input type="number" min={0} value={dailyLimit} onChange={(e) => setDailyLimit(Number(e.target.value))} /></div>
            <div className="space-y-1.5"><Label className="text-xs">Concurrent tabs</Label>
              <Input type="number" min={1} value={tabs} onChange={(e) => setTabs(Math.max(1, Number(e.target.value)))} /></div>
            <div className="space-y-1.5">
              <Label className="text-xs">Allowed devices</Label>
              <div className="flex flex-wrap gap-2">
                {DEVICES.map((d) => {
                  const on = devices.includes(d);
                  return (
                    <button key={d} type="button"
                      onClick={() => setDevices((list) => (on ? list.filter((x) => x !== d) : [...list, d]))}
                      className={`px-3 py-1.5 rounded-full text-xs capitalize ${on ? "bg-primary/20 text-primary ring-1 ring-primary/40" : "bg-white/5 text-muted-foreground"}`}>
                      {d}
                    </button>
                  );
                })}
              </div>
              <p className="text-[11px] text-muted-foreground">Leave all off to let members choose.</p>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <Switch checked={hoursOn} onCheckedChange={setHoursOn} />
              <Label className="text-xs">Restrict working hours</Label>
            </div>
            {hoursOn && (
              <div className="grid gap-3 sm:grid-cols-2 max-w-md">
                <div className="space-y-1.5"><Label className="text-xs">Start hour (0-23)</Label>
                  <Input type="number" min={0} max={23} value={start} onChange={(e) => setStart(Number(e.target.value))} /></div>
                <div className="space-y-1.5"><Label className="text-xs">End hour (0-23)</Label>
                  <Input type="number" min={0} max={23} value={end} onChange={(e) => setEnd(Number(e.target.value))} /></div>
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Locked proxies (one per line)</Label>
            <Textarea rows={5} value={proxies} placeholder="host:port:user:pass" onChange={(e) => setProxies(e.target.value)} />
          </div>

          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending ? <Loader2 className="animate-spin" /> : <Save className="w-4 h-4" />}Save rules
          </Button>
        </section>
      )}
    </div>
  );
}
