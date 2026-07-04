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

const REQUIRED_SETTINGS: Row[] = [
  {
    id: "missing:aria_enabled",
    key: "aria_enabled",
    value: "false",
    type: "boolean",
    label: "Aria AI Assistant",
    description: "Enable or disable the floating 3D assistant for users",
  },
  {
    id: "missing:download_url",
    key: "download_url",
    value: "",
    type: "string",
    label: "Bot Download URL",
    description: "Latest direct download URL used by the Download Bot button",
  },
];

function SettingsAdmin() {
  const qc = useQueryClient();
  const [draft, setDraft] = useState<Record<string, string>>({});

  const q = useQuery({
    queryKey: ["admin-settings"],
    queryFn: async () => {
      const { data, error } = await supabase.from("settings").select("*").order("key");
      if (error) throw error;
      const rows = (data ?? []) as Row[];
      const keys = new Set(rows.map((r) => r.key));
      return [...REQUIRED_SETTINGS.filter((r) => !keys.has(r.key)), ...rows];
    },
  });

  const save = async (r: Row, override?: string) => {
    const v = override ?? draft[r.id];
    if (v === undefined) return;
    const payload = { key: r.key, value: v, type: r.type ?? "string", label: r.label ?? r.key, description: r.description };
    const { error } = r.id.startsWith("missing:")
      ? await supabase.from("settings").upsert(payload as never, { onConflict: "key" })
      : await supabase.from("settings").update({ value: v } as never).eq("id", r.id);
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
          const isBool = r.type === "boolean";
          const boolOn = (r.value ?? "") === "true" || (r.value ?? "") === "1";
          return (
            <div key={r.id} className="space-y-2">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-medium">{r.label ?? r.key}</p>
                  <p className="text-[10px] text-muted-foreground font-mono">{r.key}{r.description ? ` · ${r.description}` : ""}</p>
                </div>
                {isBool && (
                  <Switch checked={boolOn} onCheckedChange={(v) => save(r, v ? "true" : "false")} />
                )}
              </div>
              {!isBool && (
                <div className="flex gap-2">
                  <Input value={current} onChange={(e) => setDraft((d) => ({ ...d, [r.id]: e.target.value }))} />
                  <Button disabled={!dirty} onClick={() => save(r)} className="bg-gradient-to-r from-primary to-accent text-white"><Save className="w-4 h-4 mr-1" />Save</Button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
