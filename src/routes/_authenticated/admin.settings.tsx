import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Save } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";


export const Route = createFileRoute("/_authenticated/admin/settings")({
  head: () => ({ meta: [{ title: "Admin · Settings — AD4YOU" }] }),
  component: SettingsAdmin,
});

type Row = { id: string; key: string; value: string | null; type: string | null; label: string | null; description: string | null };

function SettingsAdmin() {
  const qc = useQueryClient();
  const [draft, setDraft] = useState<Record<string, string>>({});

  const q = useQuery({
    queryKey: ["admin-settings"],
    queryFn: async () => {
      const { data } = await supabase.from("settings").select("*").order("key");
      return (data ?? []) as Row[];
    },
  });

  const save = async (r: Row) => {
    const v = draft[r.id]; if (v === undefined) return;
    const { error } = await supabase.from("settings").update({ value: v } as never).eq("id", r.id);
    if (error) return toast.error(error.message);
    setDraft((d) => { const n = { ...d }; delete n[r.id]; return n; });
    toast.success("Saved"); qc.invalidateQueries({ queryKey: ["admin-settings"] });
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Platform Settings</h1>
        <p className="text-muted-foreground mt-1">Global key/value configuration.</p>
      </div>
      <div className="glass-card rounded-3xl p-6 space-y-4">
        {q.isLoading ? <Skeleton className="h-32" /> : q.data?.length === 0 ? (
          <p className="text-center text-muted-foreground py-8">No settings configured.</p>
        ) : q.data?.map((r) => {
          const current = draft[r.id] ?? r.value ?? "";
          const dirty = draft[r.id] !== undefined && draft[r.id] !== (r.value ?? "");
          return (
            <div key={r.id} className="space-y-2">
              <div>
                <p className="text-sm font-medium">{r.label ?? r.key}</p>
                <p className="text-[10px] text-muted-foreground font-mono">{r.key}{r.description ? ` · ${r.description}` : ""}</p>
              </div>
              <div className="flex gap-2">
                <Input value={current} onChange={(e) => setDraft((d) => ({ ...d, [r.id]: e.target.value }))} />
                <Button disabled={!dirty} onClick={() => save(r)} className="bg-gradient-to-r from-primary to-accent text-white"><Save className="w-4 h-4 mr-1" />Save</Button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
