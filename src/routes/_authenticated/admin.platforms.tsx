import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Trash2, Save, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/_authenticated/admin/platforms")({
  head: () => ({ meta: [{ title: "Admin · Platforms — AD4YOU" }] }),
  component: PlatformsAdmin,
});

type Platform = {
  id: string;
  name: string;
  kind: string;
  logo_url: string | null;
  url: string | null;
  value: string | null;
  sort_order: number;
  is_active: boolean;
};

const KINDS = [
  { value: "link", label: "Website / URL" },
  { value: "whatsapp", label: "WhatsApp (number)" },
  { value: "email", label: "Email" },
  { value: "phone", label: "Phone" },
];

function PlatformsAdmin() {
  const qc = useQueryClient();
  const [creating, setCreating] = useState(false);

  const q = useQuery({
    queryKey: ["admin-platforms"],
    queryFn: async () => {
      const { data, error } = await supabase.from("platforms").select("*").order("sort_order");
      if (error) throw error;
      return (data ?? []) as Platform[];
    },
  });

  const addNew = async () => {
    setCreating(true);
    const { error } = await supabase.from("platforms").insert({
      name: "New Platform", kind: "link", is_active: true, sort_order: (q.data?.length ?? 0) + 1,
    } as never);
    setCreating(false);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["admin-platforms"] });
  };

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Social Platforms</h1>
          <p className="text-muted-foreground mt-1">Add social media, WhatsApp, email etc. Users see active platforms on Contact & About pages.</p>
        </div>
        <Button onClick={addNew} disabled={creating} className="bg-gradient-to-r from-primary to-accent text-white">
          {creating ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Plus className="w-4 h-4 mr-1" />}Add platform
        </Button>
      </div>

      {q.isLoading ? <Skeleton className="h-48" /> : (
        <div className="grid gap-4">
          {q.data?.length === 0 && <p className="text-muted-foreground text-center py-12 glass-card rounded-2xl">No platforms yet. Click "Add platform".</p>}
          {q.data?.map((p) => <PlatformRow key={p.id} row={p} onChanged={() => qc.invalidateQueries({ queryKey: ["admin-platforms"] })} />)}
        </div>
      )}
    </div>
  );
}

function PlatformRow({ row, onChanged }: { row: Platform; onChanged: () => void }) {
  const [draft, setDraft] = useState<Platform>(row);
  const [saving, setSaving] = useState(false);
  const dirty = JSON.stringify(draft) !== JSON.stringify(row);

  const save = async () => {
    setSaving(true);
    const { error } = await supabase.from("platforms").update({
      name: draft.name, kind: draft.kind, logo_url: draft.logo_url,
      url: draft.url, value: draft.value, sort_order: draft.sort_order, is_active: draft.is_active,
    } as never).eq("id", draft.id);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Saved"); onChanged();
  };

  const del = async () => {
    if (!confirm(`Delete "${row.name}"?`)) return;
    const { error } = await supabase.from("platforms").delete().eq("id", row.id);
    if (error) return toast.error(error.message);
    toast.success("Deleted"); onChanged();
  };

  const toggle = async (v: boolean) => {
    setDraft((d) => ({ ...d, is_active: v }));
    await supabase.from("platforms").update({ is_active: v } as never).eq("id", row.id);
    onChanged();
  };

  return (
    <div className="glass-card rounded-2xl p-5 space-y-4">
      <div className="flex items-start gap-4">
        <div className="w-16 h-16 rounded-xl bg-white/5 grid place-items-center overflow-hidden shrink-0">
          {draft.logo_url ? <img src={draft.logo_url} alt={draft.name} className="w-full h-full object-contain p-2" /> : <span className="text-xs text-muted-foreground">No logo</span>}
        </div>
        <div className="flex-1 grid sm:grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className="text-xs">Name</Label>
            <Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="Facebook" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Type</Label>
            <Select value={draft.kind} onValueChange={(v) => setDraft({ ...draft, kind: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {KINDS.map((k) => <SelectItem key={k.value} value={k.value}>{k.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1 sm:col-span-2">
            <Label className="text-xs">Logo image URL</Label>
            <Input value={draft.logo_url ?? ""} onChange={(e) => setDraft({ ...draft, logo_url: e.target.value || null })} placeholder="https://cdn.example.com/facebook.png" />
          </div>
          {draft.kind === "link" ? (
            <div className="space-y-1 sm:col-span-2">
              <Label className="text-xs">URL</Label>
              <Input value={draft.url ?? ""} onChange={(e) => setDraft({ ...draft, url: e.target.value || null })} placeholder="https://facebook.com/ad4you" />
            </div>
          ) : (
            <div className="space-y-1 sm:col-span-2">
              <Label className="text-xs">
                {draft.kind === "whatsapp" ? "WhatsApp number (with country code, digits only)" : draft.kind === "email" ? "Email address" : "Phone number"}
              </Label>
              <Input value={draft.value ?? ""} onChange={(e) => setDraft({ ...draft, value: e.target.value || null })}
                placeholder={draft.kind === "whatsapp" ? "12025550123" : draft.kind === "email" ? "hello@ad4you.click" : "+1 202 555 0123"} />
            </div>
          )}
          <div className="space-y-1">
            <Label className="text-xs">Sort order</Label>
            <Input type="number" value={draft.sort_order} onChange={(e) => setDraft({ ...draft, sort_order: Number(e.target.value) || 0 })} />
          </div>
          <div className="flex items-end gap-3">
            <div className="flex items-center gap-2">
              <Switch checked={draft.is_active} onCheckedChange={toggle} />
              <Label className="text-xs">Active</Label>
            </div>
          </div>
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={del} className="text-destructive hover:text-destructive"><Trash2 className="w-4 h-4 mr-1" />Delete</Button>
        <Button size="sm" onClick={save} disabled={!dirty || saving} className="bg-gradient-to-r from-primary to-accent text-white">
          {saving ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Save className="w-4 h-4 mr-1" />}Save
        </Button>
      </div>
    </div>
  );
}
