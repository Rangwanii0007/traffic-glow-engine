import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Trash2, Save } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { adminDeletePlan, adminSavePlan } from "@/lib/account.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DURATION_UNITS, type DurationUnit, computeExpiry, unitLabel } from "@/lib/duration";

export const Route = createFileRoute("/_authenticated/admin/plans")({
  head: () => ({ meta: [{ title: "Admin · Plans — AD4YOU" }] }),
  component: PlansAdmin,
});

type PlanRow = {
  id: string; name: string; title: string | null; slug: string; description: string | null;
  price: number; currency: string | null; duration_days: number;
  duration_value: number | null; duration_unit: DurationUnit | null; is_unlimited: boolean | null;
  is_free: boolean | null; is_active: boolean | null; is_popular: boolean | null; sort_order: number | null;
};

type OptionRow = {
  id: string; plan_id: string; label: string; price: number; currency: string;
  duration_value: number; duration_unit: DurationUnit; is_active: boolean; is_popular: boolean; sort_order: number;
};

function PlansAdmin() {
  const qc = useQueryClient();
  const [draft, setDraft] = useState<Record<string, Partial<PlanRow>>>({});
  const [expanded, setExpanded] = useState<string | null>(null);

  const q = useQuery({
    queryKey: ["admin-plans"],
    queryFn: async () => {
      const { data } = await supabase.from("plans").select("*").order("sort_order");
      return (data ?? []) as unknown as PlanRow[];
    },
  });

  const optionsQ = useQuery({
    queryKey: ["admin-plan-options"],
    queryFn: async () => {
      const { data } = await (supabase as never as typeof supabase)
        .from("plan_pricing_options" as never)
        .select("*")
        .order("sort_order");
      return (data ?? []) as unknown as OptionRow[];
    },
  });

  const update = (id: string, patch: Partial<PlanRow>) => setDraft((d) => ({ ...d, [id]: { ...d[id], ...patch } }));

  const save = async (p: PlanRow) => {
    const patch = draft[p.id]; if (!patch) return;
    try {
      await adminSavePlan({ data: { id: p.id, values: patch as Record<string, never> } });
    } catch (e) { return toast.error((e as Error).message); }
    setDraft((d) => { const n = { ...d }; delete n[p.id]; return n; });
    toast.success("Plan updated");
    qc.invalidateQueries({ queryKey: ["admin-plans"] });
  };

  const remove = async (p: PlanRow) => {
    if (!confirm(`Delete plan "${p.name}"?`)) return;
    try {
      await adminDeletePlan({ data: { id: p.id } });
    } catch (e) { return toast.error((e as Error).message); }
    toast.success("Deleted");
    qc.invalidateQueries({ queryKey: ["admin-plans"] });
  };

  const add = async () => {
    const slug = prompt("Plan slug (e.g. thirty-minute-demo)?")?.trim();
    if (!slug) return;
    const name = slug.charAt(0).toUpperCase() + slug.slice(1).replace(/-/g, " ");
    try {
      await adminSavePlan({
        data: { id: null, values: { slug: slug.toLowerCase(), name, title: name, duration_value: 30, duration_unit: "days" } },
      });
    } catch (e) { return toast.error((e as Error).message); }
    toast.success("Plan created");
    qc.invalidateQueries({ queryKey: ["admin-plans"] });
  };

  const addOption = async (planId: string) => {
    const { error } = await (supabase as never as typeof supabase)
      .from("plan_pricing_options" as never)
      .insert({ plan_id: planId, label: "New option", price: 0, duration_value: 30, duration_unit: "days" } as never);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["admin-plan-options"] });
  };

  const saveOption = async (o: OptionRow, patch: Partial<OptionRow>) => {
    const { error } = await (supabase as never as typeof supabase)
      .from("plan_pricing_options" as never)
      .update(patch as never)
      .eq("id", o.id);
    if (error) return toast.error(error.message);
    toast.success("Option saved");
    qc.invalidateQueries({ queryKey: ["admin-plan-options"] });
  };

  const removeOption = async (o: OptionRow) => {
    if (!confirm(`Delete option "${o.label}"?`)) return;
    const { error } = await (supabase as never as typeof supabase)
      .from("plan_pricing_options" as never)
      .delete()
      .eq("id", o.id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["admin-plan-options"] });
  };

  return (
    <div className="space-y-6 max-w-7xl">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Plans</h1>
          <p className="text-muted-foreground mt-1">Any title, price and duration — minutes to months.</p>
        </div>
        <Button onClick={add} className="bg-gradient-to-r from-primary to-accent text-white"><Plus className="w-4 h-4 mr-2" />New plan</Button>
      </div>

      {q.isLoading ? <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20" />)}</div> : (
        <div className="grid gap-4">
          {q.data?.map((p) => {
            const v = { ...p, ...draft[p.id] };
            const dirty = !!draft[p.id];
            const unit = (v.duration_unit ?? "days") as DurationUnit;
            const value = v.duration_value ?? 30;
            const preview = v.is_unlimited
              ? "Never expires"
              : `${unitLabel(unit, value)} → e.g. now ends ${computeExpiry(new Date(), value, unit).toLocaleString()}`;
            const opts = optionsQ.data?.filter((o) => o.plan_id === p.id) ?? [];
            return (
              <div key={p.id} className="glass-card rounded-2xl p-5 space-y-3">
                <div className="grid grid-cols-1 md:grid-cols-6 gap-3 items-end">
                  <Field label="Plan name"><Input value={v.name ?? ""} onChange={(e) => update(p.id, { name: e.target.value })} /></Field>
                  <Field label="Display title"><Input value={v.title ?? ""} onChange={(e) => update(p.id, { title: e.target.value })} /></Field>
                  <Field label="Slug"><Input value={v.slug ?? ""} onChange={(e) => update(p.id, { slug: e.target.value })} /></Field>
                  <Field label="Price"><Input type="number" step="0.01" value={v.price ?? 0} onChange={(e) => update(p.id, { price: Number(e.target.value) })} /></Field>
                  <Field label="Currency"><Input value={v.currency ?? "USD"} onChange={(e) => update(p.id, { currency: e.target.value.toUpperCase() })} /></Field>
                  <Field label="Sort"><Input type="number" value={v.sort_order ?? 0} onChange={(e) => update(p.id, { sort_order: Number(e.target.value) })} /></Field>

                  <Field label="Duration value">
                    <Input type="number" min={1} value={value} disabled={!!v.is_unlimited} onChange={(e) => update(p.id, { duration_value: Number(e.target.value) })} />
                  </Field>
                  <Field label="Duration unit">
                    <Select value={unit} onValueChange={(u) => update(p.id, { duration_unit: u as DurationUnit })} disabled={!!v.is_unlimited}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{DURATION_UNITS.map((u) => <SelectItem key={u} value={u} className="capitalize">{u}</SelectItem>)}</SelectContent>
                    </Select>
                  </Field>
                  <Field label="Description"><Input value={v.description ?? ""} onChange={(e) => update(p.id, { description: e.target.value })} /></Field>
                  <div className="md:col-span-3 flex gap-2 justify-end">
                    <Button size="sm" variant="outline" onClick={() => setExpanded(expanded === p.id ? null : p.id)}>
                      Price options ({opts.length})
                    </Button>
                    <Button size="sm" disabled={!dirty} onClick={() => save(p)} className="bg-gradient-to-r from-primary to-accent text-white"><Save className="w-3 h-3 mr-1" />Save</Button>
                    <Button size="sm" variant="destructive" onClick={() => remove(p)}><Trash2 className="w-3 h-3" /></Button>
                  </div>
                </div>

                <div className="flex flex-wrap gap-4 text-xs">
                  <Toggle label="Active" checked={!!v.is_active} onChange={(c) => update(p.id, { is_active: c })} />
                  <Toggle label="Popular" checked={!!v.is_popular} onChange={(c) => update(p.id, { is_popular: c })} />
                  <Toggle label="Free" checked={!!v.is_free} onChange={(c) => update(p.id, { is_free: c })} />
                  <Toggle label="Never expires" checked={!!v.is_unlimited} onChange={(c) => update(p.id, { is_unlimited: c })} />
                  <span className="text-muted-foreground">{preview}</span>
                </div>

                {expanded === p.id && (
                  <div className="border-t border-white/10 pt-3 space-y-3">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium">Extra price / duration options</p>
                      <Button size="sm" variant="outline" onClick={() => addOption(p.id)}><Plus className="w-3 h-3 mr-1" />Add option</Button>
                    </div>
                    {opts.length === 0 && <p className="text-xs text-muted-foreground">No extra options. The plan duration above is used.</p>}
                    {opts.map((o) => <OptionEditor key={o.id} option={o} onSave={saveOption} onDelete={removeOption} />)}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function OptionEditor({ option, onSave, onDelete }: {
  option: OptionRow;
  onSave: (o: OptionRow, patch: Partial<OptionRow>) => void;
  onDelete: (o: OptionRow) => void;
}) {
  const [v, setV] = useState<OptionRow>(option);
  return (
    <div className="grid grid-cols-1 md:grid-cols-6 gap-2 items-end">
      <Field label="Label"><Input value={v.label} onChange={(e) => setV({ ...v, label: e.target.value })} /></Field>
      <Field label="Price"><Input type="number" step="0.01" value={v.price} onChange={(e) => setV({ ...v, price: Number(e.target.value) })} /></Field>
      <Field label="Duration"><Input type="number" min={1} value={v.duration_value} onChange={(e) => setV({ ...v, duration_value: Number(e.target.value) })} /></Field>
      <Field label="Unit">
        <Select value={v.duration_unit} onValueChange={(u) => setV({ ...v, duration_unit: u as DurationUnit })}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>{DURATION_UNITS.map((u) => <SelectItem key={u} value={u} className="capitalize">{u}</SelectItem>)}</SelectContent>
        </Select>
      </Field>
      <div className="flex gap-3 text-xs pb-2">
        <Toggle label="Active" checked={v.is_active} onChange={(c) => setV({ ...v, is_active: c })} />
        <Toggle label="Popular" checked={v.is_popular} onChange={(c) => setV({ ...v, is_popular: c })} />
      </div>
      <div className="flex gap-2 justify-end">
        <Button size="sm" onClick={() => onSave(option, {
          label: v.label, price: v.price, duration_value: v.duration_value,
          duration_unit: v.duration_unit, is_active: v.is_active, is_popular: v.is_popular,
        })}><Save className="w-3 h-3" /></Button>
        <Button size="sm" variant="destructive" onClick={() => onDelete(option)}><Trash2 className="w-3 h-3" /></Button>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block space-y-1"><span className="text-xs text-muted-foreground">{label}</span>{children}</label>;
}
function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (c: boolean) => void }) {
  return <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />{label}</label>;
}
