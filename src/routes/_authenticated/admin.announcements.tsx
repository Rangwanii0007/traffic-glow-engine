import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Trash2, Save } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/_authenticated/admin/announcements")({
  head: () => ({ meta: [{ title: "Admin · Announcements — AD4YOU" }] }),
  component: AnnouncementsAdmin,
});

type Row = {
  id: string; title: string; message: string; type: string | null;
  is_active: boolean | null; show_on_web: boolean | null; show_in_bot: boolean | null;
  expires_at: string | null;
};

function AnnouncementsAdmin() {
  const qc = useQueryClient();
  const [draft, setDraft] = useState<Record<string, Partial<Row>>>({});

  const q = useQuery({
    queryKey: ["admin-anns"],
    queryFn: async () => {
      const { data } = await supabase.from("announcements").select("*").order("created_at", { ascending: false });
      return (data ?? []) as Row[];
    },
  });

  const upd = (id: string, p: Partial<Row>) => setDraft((d) => ({ ...d, [id]: { ...d[id], ...p } }));
  const save = async (r: Row) => {
    const patch = draft[r.id]; if (!patch) return;
    const { error } = await supabase.from("announcements").update(patch as never).eq("id", r.id);
    if (error) return toast.error(error.message);
    setDraft((d) => { const n = { ...d }; delete n[r.id]; return n; });
    toast.success("Saved"); qc.invalidateQueries({ queryKey: ["admin-anns"] });
  };
  const remove = async (r: Row) => {
    if (!confirm("Delete announcement?")) return;
    await supabase.from("announcements").delete().eq("id", r.id);
    qc.invalidateQueries({ queryKey: ["admin-anns"] });
  };
  const add = async () => {
    const { error } = await supabase.from("announcements").insert({
      title: "New announcement", message: "Edit this message.", type: "info",
      is_active: false, show_on_web: true, show_in_bot: false,
    } as never);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["admin-anns"] });
  };

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Announcements</h1>
          <p className="text-muted-foreground mt-1">Broadcasts shown on the website and inside the bot.</p>
        </div>
        <Button onClick={add} className="bg-gradient-to-r from-primary to-accent text-white"><Plus className="w-4 h-4 mr-2" />New</Button>
      </div>

      {q.isLoading ? <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-32" />)}</div> : (
        <div className="space-y-4">
          {q.data?.map((r) => {
            const v = { ...r, ...draft[r.id] };
            const dirty = !!draft[r.id];
            return (
              <div key={r.id} className="glass-card rounded-2xl p-5 space-y-3">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <Input value={v.title ?? ""} onChange={(e) => upd(r.id, { title: e.target.value })} placeholder="Title" />
                  <select value={v.type ?? "info"} onChange={(e) => upd(r.id, { type: e.target.value })} className="h-10 rounded-md bg-background border border-input px-3 text-sm">
                    {["info","success","warning","error"].map((t) => <option key={t}>{t}</option>)}
                  </select>
                  <Input type="datetime-local" value={v.expires_at ? new Date(v.expires_at).toISOString().slice(0, 16) : ""} onChange={(e) => upd(r.id, { expires_at: e.target.value ? new Date(e.target.value).toISOString() : null })} />
                </div>
                <Textarea rows={3} value={v.message ?? ""} onChange={(e) => upd(r.id, { message: e.target.value })} placeholder="Message" />
                <div className="flex flex-wrap items-center gap-4 text-xs">
                  <label className="flex items-center gap-2"><input type="checkbox" checked={!!v.is_active} onChange={(e) => upd(r.id, { is_active: e.target.checked })} />Active</label>
                  <label className="flex items-center gap-2"><input type="checkbox" checked={!!v.show_on_web} onChange={(e) => upd(r.id, { show_on_web: e.target.checked })} />Show on web</label>
                  <label className="flex items-center gap-2"><input type="checkbox" checked={!!v.show_in_bot} onChange={(e) => upd(r.id, { show_in_bot: e.target.checked })} />Show in bot</label>
                  <div className="ml-auto flex gap-2">
                    <Button size="sm" disabled={!dirty} onClick={() => save(r)} className="bg-gradient-to-r from-primary to-accent text-white"><Save className="w-3 h-3 mr-1" />Save</Button>
                    <Button size="sm" variant="destructive" onClick={() => remove(r)}><Trash2 className="w-3 h-3" /></Button>
                  </div>
                </div>
              </div>
            );
          })}
          {q.data?.length === 0 && <p className="text-center text-muted-foreground py-8">No announcements.</p>}
        </div>
      )}
    </div>
  );
}
