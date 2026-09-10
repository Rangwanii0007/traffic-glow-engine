import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Trash2, Save } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/_authenticated/admin/versions")({
  head: () => ({ meta: [{ title: "Admin · Versions — AD4YOU" }] }),
  component: VersionsAdmin,
});

type Row = {
  id: string; version: string; platform: string | null; download_url: string | null;
  release_notes: string | null; file_size: string | null; is_latest: boolean | null; is_mandatory: boolean | null;
  title: string | null; is_active: boolean; sort_order: number;
};

function VersionsAdmin() {
  const qc = useQueryClient();
  const [draft, setDraft] = useState<Record<string, Partial<Row>>>({});

  const q = useQuery({
    queryKey: ["admin-versions"],
    queryFn: async () => {
      const { data } = await supabase.from("bot_versions").select("*").order("created_at", { ascending: false });
      return (data ?? []) as Row[];
    },
  });
  useEffect(() => {
    const channel = supabase.channel("admin-bot-versions-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "bot_versions" }, () => {
        qc.invalidateQueries({ queryKey: ["admin-versions"] });
      }).subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [qc]);
  const upd = (id: string, p: Partial<Row>) => setDraft((d) => ({ ...d, [id]: { ...d[id], ...p } }));
  const save = async (r: Row) => {
    const patch = draft[r.id]; if (!patch) return;
    if (patch.is_latest) await supabase.from("bot_versions").update({ is_latest: false } as never).neq("id", r.id);
    let { error } = await supabase.from("bot_versions").update(patch as never).eq("id", r.id);
    if (error && /title|is_active|sort_order/i.test(error.message)) {
      // Older database without the newer columns: save what it supports.
      const { title: _t, is_active: _a, sort_order: _s, ...base } = patch;
      ({ error } = await supabase.from("bot_versions").update(base as never).eq("id", r.id));
      if (!error) toast.warning("Saved, but titles/order need the database update.");
    }
    if (error) return toast.error(error.message);
    setDraft((d) => { const n = { ...d }; delete n[r.id]; return n; });
    toast.success("Saved"); qc.invalidateQueries({ queryKey: ["admin-versions"] });
  };
  const remove = async (r: Row) => {
    if (!confirm(`Delete v${r.version}?`)) return;
    await supabase.from("bot_versions").delete().eq("id", r.id);
    qc.invalidateQueries({ queryKey: ["admin-versions"] });
  };
  const add = async () => {
    const version = prompt("Version (e.g. 1.0.0)?")?.trim(); if (!version) return;
    let { error } = await supabase.from("bot_versions").insert({
      version, title: `AD4YOU for Windows — v${version}`, platform: "windows", is_latest: false, is_mandatory: false, is_active: true, sort_order: 0,
    } as never);
    if (error && /title|is_active|sort_order/i.test(error.message)) {
      ({ error } = await supabase.from("bot_versions").insert({ version, platform: "windows", is_latest: false, is_mandatory: false } as never));
      if (!error) toast.warning("Added, but titles/order need the database update.");
    }
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["admin-versions"] });
  };

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Bot Versions</h1>
          <p className="text-muted-foreground mt-1">Manage every public platform and version download.</p>
        </div>
        <Button onClick={add} className="bg-gradient-to-r from-primary to-accent text-white"><Plus className="w-4 h-4 mr-2" />New version</Button>
      </div>

      {q.isLoading ? <Skeleton className="h-32" /> : (
        <div className="space-y-4">
          {q.data?.map((r) => {
            const v = { ...r, ...draft[r.id] };
            const dirty = !!draft[r.id];
            return (
              <div key={r.id} className="glass-card rounded-2xl p-5 space-y-3">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <Input value={v.title ?? ""} onChange={(e) => upd(r.id, { title: e.target.value })} placeholder="Download title" />
                  <Input value={v.version ?? ""} onChange={(e) => upd(r.id, { version: e.target.value })} placeholder="Version" />
                  <select value={v.platform ?? "windows"} onChange={(e) => upd(r.id, { platform: e.target.value })} className="h-10 rounded-md bg-background border border-input px-3 text-sm">
                    {["windows","ios","macos","linux","android","other"].map((p) => <option key={p}>{p}</option>)}
                  </select>
                  <Input value={v.file_size ?? ""} onChange={(e) => upd(r.id, { file_size: e.target.value })} placeholder="File size (e.g. 45 MB)" />
                  <Input value={v.download_url ?? ""} onChange={(e) => upd(r.id, { download_url: e.target.value })} placeholder="Download URL" />
                  <Input type="number" value={v.sort_order ?? 0} onChange={(e) => upd(r.id, { sort_order: Number(e.target.value) })} placeholder="Display order" />
                </div>
                <Textarea rows={3} value={v.release_notes ?? ""} onChange={(e) => upd(r.id, { release_notes: e.target.value })} placeholder="Release notes" />
                <div className="flex items-center gap-4 text-xs flex-wrap">
                  <label className="flex items-center gap-2"><input type="checkbox" checked={!!v.is_latest} onChange={(e) => upd(r.id, { is_latest: e.target.checked })} />Latest</label>
                  <label className="flex items-center gap-2"><input type="checkbox" checked={!!v.is_mandatory} onChange={(e) => upd(r.id, { is_mandatory: e.target.checked })} />Mandatory update</label>
                  <label className="flex items-center gap-2"><input type="checkbox" checked={v.is_active !== false} onChange={(e) => upd(r.id, { is_active: e.target.checked })} />Visible to users</label>
                  <div className="ml-auto flex gap-2">
                    <Button size="sm" disabled={!dirty} onClick={() => save(r)} className="bg-gradient-to-r from-primary to-accent text-white"><Save className="w-3 h-3 mr-1" />Save</Button>
                    <Button size="sm" variant="destructive" onClick={() => remove(r)}><Trash2 className="w-3 h-3" /></Button>
                  </div>
                </div>
              </div>
            );
          })}
          {q.data?.length === 0 && <p className="text-center text-muted-foreground py-8">No versions yet.</p>}
        </div>
      )}
    </div>
  );
}
