import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link2, Loader2, Plus, Save, Trash2, Youtube } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { NoTeamNotice, useBusiness } from "@/components/business/Shell";
import { getTeamConfig, saveTeamUrls } from "@/lib/team.functions";
import { useTeamRealtime } from "@/hooks/use-team-realtime";

export const Route = createFileRoute("/_authenticated/business/urls")({
  head: () => ({
    meta: [
      { title: "Shared URLs — AD4YOU Business Panel" },
      { name: "description", content: "Push one URL list to every team PC instantly. Websites, direct links and social videos." },
      { property: "og:title", content: "Shared URLs — AD4YOU Business Panel" },
      { property: "og:description", content: "Push one URL list to every team PC instantly. Websites, direct links and social videos." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: UrlsPage,
});

type UrlEntry = {
  url: string;
  url_type: "website" | "direct_link" | "social_video";
  count: number;
  time_per_page: number;
  video_strategy: "none" | "watch_time" | "shorts" | "high_rpm";
  is_active: boolean;
};

const blank: UrlEntry = { url: "", url_type: "website", count: 1, time_per_page: 60, video_strategy: "none", is_active: true };

function UrlsPage() {
  const { teamId } = useBusiness();
  const qc = useQueryClient();
  const key = ["business", "config", teamId ?? ""];
  const config = useQuery({ queryKey: key, queryFn: () => getTeamConfig({ data: { teamId: teamId! } }), enabled: !!teamId });
  useTeamRealtime(teamId, ["team_configurations", "teams"], [key]);

  const [rows, setRows] = useState<UrlEntry[]>([]);
  useEffect(() => {
    if (config.data) setRows((config.data.urls as UrlEntry[]).map((u) => ({ ...blank, ...u })));
  }, [config.dataUpdatedAt]);

  const save = useMutation({
    mutationFn: () => saveTeamUrls({ data: { teamId: teamId!, urls: rows.filter((r) => r.url.trim().length > 3) } }),
    onSuccess: () => { toast.success("URLs pushed to every member in real time"); qc.invalidateQueries({ queryKey: key }); },
    onError: (error: Error) => toast.error(error.message),
  });

  const patch = (i: number, values: Partial<UrlEntry>) =>
    setRows((list) => list.map((row, index) => (index === i ? { ...row, ...values } : row)));

  if (!teamId) return <NoTeamNotice />;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start gap-3">
        <div className="flex-1 min-w-48">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Shared URLs</h1>
          <p className="text-sm text-muted-foreground">
            One list for the whole team. When you save, every member&apos;s software swaps to these URLs automatically.
          </p>
        </div>
        <Button onClick={() => save.mutate()} disabled={save.isPending}>
          {save.isPending ? <Loader2 className="animate-spin" /> : <Save className="w-4 h-4" />}Save &amp; sync team
        </Button>
      </div>

      {config.isLoading ? (
        <Skeleton className="h-40 rounded-2xl" />
      ) : (
        <div className="space-y-3">
          {rows.length === 0 && (
            <p className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 text-center text-sm text-muted-foreground">
              No URLs yet. Add the first one below.
            </p>
          )}
          {rows.map((row, i) => (
            <div key={i} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 space-y-3">
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex-1 min-w-56 space-y-1.5">
                  <Label className="text-xs flex items-center gap-1.5">
                    {row.url_type === "social_video" ? <Youtube className="w-3.5 h-3.5" /> : <Link2 className="w-3.5 h-3.5" />}URL
                  </Label>
                  <Input value={row.url} placeholder="https://example.com/page" onChange={(e) => patch(i, { url: e.target.value })} />
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Switch checked={row.is_active} onCheckedChange={(v) => patch(i, { is_active: v })} />Active
                </div>
                <Button variant="ghost" size="icon" className="text-destructive"
                  onClick={() => setRows((list) => list.filter((_, index) => index !== i))} aria-label="Remove URL">
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
              <div className="grid gap-3 sm:grid-cols-4">
                <div className="space-y-1.5"><Label className="text-xs">Type</Label>
                  <Select value={row.url_type} onValueChange={(v) => patch(i, { url_type: v as UrlEntry["url_type"] })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="website">Website</SelectItem>
                      <SelectItem value="direct_link">Direct link</SelectItem>
                      <SelectItem value="social_video">Social video</SelectItem>
                    </SelectContent>
                  </Select></div>
                <div className="space-y-1.5"><Label className="text-xs">Visits per cycle</Label>
                  <Input type="number" min={1} value={row.count} onChange={(e) => patch(i, { count: Math.max(1, Number(e.target.value)) })} /></div>
                <div className="space-y-1.5"><Label className="text-xs">Seconds on page</Label>
                  <Input type="number" min={5} value={row.time_per_page} onChange={(e) => patch(i, { time_per_page: Math.max(5, Number(e.target.value)) })} /></div>
                <div className="space-y-1.5"><Label className="text-xs">Video strategy</Label>
                  <Select value={row.video_strategy} onValueChange={(v) => patch(i, { video_strategy: v as UrlEntry["video_strategy"] })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      <SelectItem value="watch_time">Watch time</SelectItem>
                      <SelectItem value="shorts">Shorts</SelectItem>
                      <SelectItem value="high_rpm">High RPM</SelectItem>
                    </SelectContent>
                  </Select></div>
              </div>
            </div>
          ))}
          <Button variant="outline" onClick={() => setRows((list) => [...list, { ...blank }])}>
            <Plus className="w-4 h-4" />Add URL
          </Button>
        </div>
      )}
    </div>
  );
}
