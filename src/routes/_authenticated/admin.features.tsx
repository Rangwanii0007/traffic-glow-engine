import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Save, Plus, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/_authenticated/admin/features")({
  head: () => ({ meta: [{ title: "Admin · Plan Features — AD4YOU" }] }),
  component: FeaturesAdmin,
});

type Row = {
  id: string; feature_key: string; feature_name: string; feature_description: string | null;
  feature_type: string | null; sort_order: number | null; is_visible: boolean | null;
  free_value: string | null; starter_value: string | null; pro_value: string | null; business_value: string | null;
};

const COLS: Array<{ key: keyof Row; label: string }> = [
  { key: "free_value", label: "Free" },
  { key: "starter_value", label: "Starter" },
  { key: "pro_value", label: "Pro" },
  { key: "business_value", label: "Business" },
];

function FeaturesAdmin() {
  const qc = useQueryClient();
  const [draft, setDraft] = useState<Record<string, Partial<Row>>>({});

  const q = useQuery({
    queryKey: ["admin-features"],
    queryFn: async () => {
      const { data } = await supabase.from("plan_features").select("*").order("sort_order");
      return (data ?? []) as Row[];
    },
  });

  const update = (id: string, patch: Partial<Row>) => setDraft((d) => ({ ...d, [id]: { ...d[id], ...patch } }));

  const save = async (r: Row) => {
    const patch = draft[r.id]; if (!patch) return;
    const { error } = await supabase.from("plan_features").update(patch as never).eq("id", r.id);
    if (error) return toast.error(error.message);
    setDraft((d) => { const n = { ...d }; delete n[r.id]; return n; });
    toast.success("Saved");
    qc.invalidateQueries({ queryKey: ["admin-features"] });
  };

  const remove = async (r: Row) => {
    if (!confirm(`Delete "${r.feature_name}"?`)) return;
    const { error } = await supabase.from("plan_features").delete().eq("id", r.id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["admin-features"] });
  };

  const add = async () => {
    const key = prompt("Feature key (snake_case)?")?.trim();
    const name = prompt("Display name?")?.trim();
    if (!key || !name) return;
    const { error } = await supabase.from("plan_features").insert({
      feature_key: key, feature_name: name, feature_type: "text", sort_order: 99, is_visible: true,
    } as never);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["admin-features"] });
  };

  return (
    <div className="space-y-6 max-w-[1400px]">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Plan Features Matrix</h1>
          <p className="text-muted-foreground mt-1">Per-plan feature values shown on the pricing page.</p>
        </div>
        <Button onClick={add} className="bg-gradient-to-r from-primary to-accent text-white"><Plus className="w-4 h-4 mr-2" />Add feature</Button>
      </div>

      <div className="glass-card rounded-3xl p-6 overflow-x-auto">
        {q.isLoading ? <div className="space-y-2">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-12" />)}</div> : (
          <table className="w-full text-sm">
            <thead className="text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="text-left p-2 font-medium min-w-[200px]">Feature</th>
                {COLS.map((c) => <th key={c.key as string} className="text-left p-2 font-medium min-w-[120px]">{c.label}</th>)}
                <th className="text-left p-2 font-medium">Order</th>
                <th className="text-left p-2 font-medium">Visible</th>
                <th className="text-right p-2 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {q.data?.map((r) => {
                const v = { ...r, ...draft[r.id] };
                const dirty = !!draft[r.id];
                return (
                  <tr key={r.id} className="border-t border-white/5 align-top">
                    <td className="p-2">
                      <Input className="h-8 mb-1" value={v.feature_name ?? ""} onChange={(e) => update(r.id, { feature_name: e.target.value })} />
                      <p className="text-[10px] text-muted-foreground font-mono">{v.feature_key}</p>
                    </td>
                    {COLS.map((c) => (
                      <td key={c.key as string} className="p-2">
                        <Input className="h-8" value={(v[c.key] as string) ?? ""} onChange={(e) => update(r.id, { [c.key]: e.target.value } as Partial<Row>)} />
                      </td>
                    ))}
                    <td className="p-2"><Input className="h-8 w-16" type="number" value={v.sort_order ?? 0} onChange={(e) => update(r.id, { sort_order: Number(e.target.value) })} /></td>
                    <td className="p-2"><input type="checkbox" checked={!!v.is_visible} onChange={(e) => update(r.id, { is_visible: e.target.checked })} /></td>
                    <td className="p-2 text-right space-x-1 whitespace-nowrap">
                      <Button size="sm" disabled={!dirty} onClick={() => save(r)} className="bg-gradient-to-r from-primary to-accent text-white"><Save className="w-3 h-3" /></Button>
                      <Button size="sm" variant="destructive" onClick={() => remove(r)}><Trash2 className="w-3 h-3" /></Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
