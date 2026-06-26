import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Trash2, Save } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/_authenticated/admin/plans")({
  head: () => ({ meta: [{ title: "Admin · Plans — AD4YOU" }] }),
  component: PlansAdmin,
});

type PlanRow = {
  id: string; name: string; slug: string; description: string | null;
  price: number; duration_days: number; is_free: boolean | null;
  is_active: boolean | null; is_popular: boolean | null; sort_order: number | null;
};

function PlansAdmin() {
  const qc = useQueryClient();
  const [draft, setDraft] = useState<Record<string, Partial<PlanRow>>>({});

  const q = useQuery({
    queryKey: ["admin-plans"],
    queryFn: async () => {
      const { data } = await supabase.from("plans").select("*").order("sort_order");
      return (data ?? []) as PlanRow[];
    },
  });

  const update = (id: string, patch: Partial<PlanRow>) => setDraft((d) => ({ ...d, [id]: { ...d[id], ...patch } }));

  const save = async (p: PlanRow) => {
    const patch = draft[p.id]; if (!patch) return;
    const { error } = await supabase.from("plans").update(patch as never).eq("id", p.id);
    if (error) return toast.error(error.message);
    setDraft((d) => { const n = { ...d }; delete n[p.id]; return n; });
    toast.success("Plan updated");
    qc.invalidateQueries({ queryKey: ["admin-plans"] });
  };

  const remove = async (p: PlanRow) => {
    if (!confirm(`Delete plan "${p.name}"?`)) return;
    const { error } = await supabase.from("plans").delete().eq("id", p.id);
    if (error) return toast.error(error.message);
    toast.success("Deleted");
    qc.invalidateQueries({ queryKey: ["admin-plans"] });
  };

  const add = async () => {
    const slug = prompt("Plan slug (e.g. enterprise)?")?.trim();
    if (!slug) return;
    const { error } = await supabase.from("plans").insert({
      slug, name: slug.charAt(0).toUpperCase() + slug.slice(1),
      price: 0, duration_days: 30, is_active: true, sort_order: 99,
    } as never);
    if (error) return toast.error(error.message);
    toast.success("Plan created");
    qc.invalidateQueries({ queryKey: ["admin-plans"] });
  };

  return (
    <div className="space-y-6 max-w-7xl">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Plans</h1>
          <p className="text-muted-foreground mt-1">Pricing tiers offered to customers.</p>
        </div>
        <Button onClick={add} className="bg-gradient-to-r from-primary to-accent text-white"><Plus className="w-4 h-4 mr-2" />New plan</Button>
      </div>

      {q.isLoading ? <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20" />)}</div> : (
        <div className="grid gap-4">
          {q.data?.map((p) => {
            const v = { ...p, ...draft[p.id] };
            const dirty = !!draft[p.id];
            return (
              <div key={p.id} className="glass-card rounded-2xl p-5 grid grid-cols-1 md:grid-cols-6 gap-3 items-end">
                <Field label="Name"><Input value={v.name ?? ""} onChange={(e) => update(p.id, { name: e.target.value })} /></Field>
                <Field label="Slug"><Input value={v.slug ?? ""} onChange={(e) => update(p.id, { slug: e.target.value })} /></Field>
                <Field label="Price (USD)"><Input type="number" step="0.01" value={v.price ?? 0} onChange={(e) => update(p.id, { price: Number(e.target.value) })} /></Field>
                <Field label="Duration (days)"><Input type="number" value={v.duration_days ?? 30} onChange={(e) => update(p.id, { duration_days: Number(e.target.value) })} /></Field>
                <Field label="Sort"><Input type="number" value={v.sort_order ?? 0} onChange={(e) => update(p.id, { sort_order: Number(e.target.value) })} /></Field>
                <div className="flex gap-2 justify-end">
                  <Button size="sm" disabled={!dirty} onClick={() => save(p)} className="bg-gradient-to-r from-primary to-accent text-white"><Save className="w-3 h-3 mr-1" />Save</Button>
                  <Button size="sm" variant="destructive" onClick={() => remove(p)}><Trash2 className="w-3 h-3" /></Button>
                </div>
                <div className="md:col-span-6 flex gap-4 text-xs">
                  <Toggle label="Active" checked={!!v.is_active} onChange={(c) => update(p.id, { is_active: c })} />
                  <Toggle label="Popular" checked={!!v.is_popular} onChange={(c) => update(p.id, { is_popular: c })} />
                  <Toggle label="Free" checked={!!v.is_free} onChange={(c) => update(p.id, { is_free: c })} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block space-y-1"><span className="text-xs text-muted-foreground">{label}</span>{children}</label>;
}
function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (c: boolean) => void }) {
  return <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />{label}</label>;
}
