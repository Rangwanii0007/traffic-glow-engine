import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Download, Eye, EyeOff, Pencil, Plus, Save, Trash2, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export const Route = createFileRoute("/_authenticated/admin/versions")({
  head: () => ({ meta: [
    { title: "Software Downloads Admin — AD4YOU" },
    { name: "description", content: "Manage AD4YOU software download options, platforms, versions, links, and visibility." },
    { property: "og:title", content: "Software Downloads Admin — AD4YOU" },
    { property: "og:description", content: "Manage AD4YOU software download options, platforms, versions, links, and visibility." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: VersionsAdmin,
});

type Row = {
  id: string; version: string; platform: string | null; download_url: string | null;
  release_notes: string | null; file_size: string | null; is_latest: boolean | null; is_mandatory: boolean | null;
  title: string | null; is_active: boolean; sort_order: number;
};

type FormValues = {
  title: string; platform: string; version: string; download_url: string;
  release_notes: string; file_size: string; is_active: boolean; sort_order: number;
};

const emptyForm: FormValues = {
  title: "", platform: "windows", version: "", download_url: "",
  release_notes: "", file_size: "", is_active: true, sort_order: 0,
};

const platforms = ["windows", "linux", "macos", "android", "ios", "chromeos", "other"];

function VersionsAdmin() {
  const qc = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Row | null>(null);
  const [deleting, setDeleting] = useState<Row | null>(null);
  const [form, setForm] = useState<FormValues>(emptyForm);
  const [saving, setSaving] = useState(false);

  const q = useQuery({
    queryKey: ["admin-versions"],
    queryFn: async () => {
      const { data, error } = await supabase.from("bot_versions").select("*").order("sort_order", { ascending: true }).order("created_at", { ascending: false });
      if (error) throw error;
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
  const openCreate = () => {
    setEditing(null);
    setForm({ ...emptyForm, sort_order: q.data?.length ?? 0 });
    setDialogOpen(true);
  };
  const openEdit = (row: Row) => {
    setEditing(row);
    setForm({
      title: row.title ?? "", platform: row.platform ?? "other", version: row.version,
      download_url: row.download_url ?? "", release_notes: row.release_notes ?? "",
      file_size: row.file_size ?? "", is_active: row.is_active !== false, sort_order: row.sort_order ?? 0,
    });
    setDialogOpen(true);
  };
  const save = async () => {
    const title = form.title.trim();
    const version = form.version.trim();
    const downloadUrl = form.download_url.trim();
    if (!title || !version || !downloadUrl) return toast.error("Title, version, and download URL are required.");
    try { new URL(downloadUrl); } catch { return toast.error("Enter a valid full download URL."); }
    setSaving(true);
    const payload = {
      title, platform: form.platform, version, download_url: downloadUrl,
      release_notes: form.release_notes.trim() || null, file_size: form.file_size.trim() || null,
      is_active: form.is_active, sort_order: form.sort_order,
    };
    const result = editing
      ? await supabase.from("bot_versions").update(payload).eq("id", editing.id)
      : await supabase.from("bot_versions").insert({ ...payload, is_latest: false, is_mandatory: false });
    setSaving(false);
    if (result.error) return toast.error(result.error.message);
    setDialogOpen(false);
    toast.success(editing ? "Download option updated" : "Download option added");
    await qc.invalidateQueries({ queryKey: ["admin-versions"] });
    await qc.invalidateQueries({ queryKey: ["bot-versions"] });
  };
  const remove = async () => {
    if (!deleting) return;
    const { error } = await supabase.from("bot_versions").delete().eq("id", deleting.id);
    if (error) return toast.error(error.message);
    setDeleting(null);
    toast.success("Download option deleted");
    await qc.invalidateQueries({ queryKey: ["admin-versions"] });
    await qc.invalidateQueries({ queryKey: ["bot-versions"] });
  };

  return (
    <div className="space-y-6 max-w-6xl">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold">Software Downloads</h1>
          <p className="text-muted-foreground mt-1">Create and manage every software and platform download.</p>
        </div>
        <Button onClick={openCreate}><Plus className="w-4 h-4 mr-2" />Add New Download Option</Button>
      </div>

      {q.isLoading ? <div className="space-y-3"><Skeleton className="h-32" /><Skeleton className="h-32" /></div> : q.isError ? (
        <div className="rounded-lg border border-destructive/30 p-5 text-sm text-destructive">Could not load download options. Run the provided SQL, then refresh this page.</div>
      ) : q.data?.length ? (
        <div className="grid gap-4">
          {q.data.map((row) => (
            <article key={row.id} className="glass-card rounded-lg border border-border/60 p-5">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
                <div className="grid h-11 w-11 shrink-0 place-content-center rounded-lg bg-primary/10 text-primary"><Download className="h-5 w-5" /></div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="font-semibold break-words">{row.title || `AD4YOU for ${row.platform ?? "Other"}`}</h2>
                    <span className="rounded-md bg-muted px-2 py-1 text-xs capitalize">{row.platform ?? "other"}</span>
                    <span className="rounded-md bg-muted px-2 py-1 text-xs">v{row.version}</span>
                    <span className={row.is_active ? "flex items-center gap-1 text-xs text-success" : "flex items-center gap-1 text-xs text-muted-foreground"}>
                      {row.is_active ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}{row.is_active ? "Visible" : "Hidden"}
                    </span>
                  </div>
                  {row.release_notes && <p className="mt-2 text-sm text-muted-foreground">{row.release_notes}</p>}
                  <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    {row.file_size && <span>Size: {row.file_size}</span>}<span>Order: {row.sort_order}</span>
                  </div>
                  <p className="mt-2 truncate text-xs text-muted-foreground" title={row.download_url ?? ""}>{row.download_url || "No download URL"}</p>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => openEdit(row)}><Pencil className="mr-2 h-4 w-4" />Edit</Button>
                  <Button size="sm" variant="destructive" onClick={() => setDeleting(row)} aria-label={`Delete ${row.title ?? row.version}`}><Trash2 className="h-4 w-4" /></Button>
                </div>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="rounded-lg border border-dashed border-border p-10 text-center">
          <Download className="mx-auto h-8 w-8 text-muted-foreground" /><h2 className="mt-3 font-semibold">No download options yet</h2>
          <p className="mt-1 text-sm text-muted-foreground">Add your first software or platform download.</p>
          <Button onClick={openCreate} className="mt-5"><Plus className="mr-2 h-4 w-4" />Add New Download Option</Button>
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader><DialogTitle>{editing ? "Edit Download Option" : "Add New Download Option"}</DialogTitle><DialogDescription>Set the software details users will see on the Download page.</DialogDescription></DialogHeader>
          <div className="grid gap-4 py-2 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2"><Label htmlFor="download-title">Custom Title / Software Name</Label><Input id="download-title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="AD4YOU for Windows — v10.0" /></div>
            <div className="space-y-2"><Label>Platform</Label><Select value={form.platform} onValueChange={(platform) => setForm({ ...form, platform })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{platforms.map((platform) => <SelectItem key={platform} value={platform}><span className="capitalize">{platform}</span></SelectItem>)}</SelectContent></Select></div>
            <div className="space-y-2"><Label htmlFor="download-version">Version</Label><Input id="download-version" value={form.version} onChange={(e) => setForm({ ...form, version: e.target.value })} placeholder="10.0" /></div>
            <div className="space-y-2 sm:col-span-2"><Label htmlFor="download-url">Download URL</Label><Input id="download-url" type="url" value={form.download_url} onChange={(e) => setForm({ ...form, download_url: e.target.value })} placeholder="https://example.com/software.exe" /></div>
            <div className="space-y-2 sm:col-span-2"><Label htmlFor="download-description">Optional Description</Label><Textarea id="download-description" rows={3} value={form.release_notes} onChange={(e) => setForm({ ...form, release_notes: e.target.value })} placeholder="What is included in this release?" /></div>
            <div className="space-y-2"><Label htmlFor="download-size">File Size</Label><Input id="download-size" value={form.file_size} onChange={(e) => setForm({ ...form, file_size: e.target.value })} placeholder="45 MB" /></div>
            <div className="space-y-2"><Label htmlFor="download-order">Display Order</Label><Input id="download-order" type="number" min={0} value={form.sort_order} onChange={(e) => setForm({ ...form, sort_order: Number(e.target.value) || 0 })} /></div>
            <div className="flex items-center justify-between rounded-lg border border-border p-3 sm:col-span-2"><div><Label htmlFor="download-visible">Visible to users</Label><p className="mt-1 text-xs text-muted-foreground">Visible options appear on the public Download page.</p></div><Switch id="download-visible" checked={form.is_active} onCheckedChange={(is_active) => setForm({ ...form, is_active })} /></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setDialogOpen(false)}><X className="mr-2 h-4 w-4" />Cancel</Button><Button onClick={save} disabled={saving}><Save className="mr-2 h-4 w-4" />{saving ? "Saving…" : editing ? "Save Changes" : "Add Download Option"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleting} onOpenChange={(open) => { if (!open) setDeleting(null); }}>
        <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Delete this download option?</AlertDialogTitle><AlertDialogDescription>This permanently removes “{deleting?.title || deleting?.version}”. Other download options will not be affected.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={remove} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction></AlertDialogFooter></AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
