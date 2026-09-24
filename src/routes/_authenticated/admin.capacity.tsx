import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Trash2, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { capacitySummary, type CapacityAddonRow } from "@/lib/capacity";
import { usePlanCatalog } from "@/lib/plan-catalog";

export const Route = createFileRoute("/_authenticated/admin/capacity")({
  head: () => ({ meta: [{ title: "Admin · PC Capacity — AD4YOU" }] }),
  component: CapacityAdmin,
});

// Extra-PC presets come from the database (public.capacity_packages), never code.

type UserRow = { id: string; email: string; full_name: string | null };

function anyClient() {
  return supabase as never as typeof supabase;
}

function CapacityAdmin() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [form, setForm] = useState({ extra: 0, price: 0, expires_at: "", note: "" });
  const { packagesQ } = usePlanCatalog();
  const presets = (packagesQ.data ?? []).filter((p) => (p.is_active ?? true) && Number(p.extra_pcs) > 0);

  const usersQ = useQuery({
    queryKey: ["admin-capacity-users"],
    queryFn: async () => {
      const { data, error } = await supabase.from("users").select("id, email, full_name").order("created_at", { ascending: false });
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as UserRow[];
    },
  });

  const subsQ = useQuery({
    queryKey: ["admin-capacity-subs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("subscriptions")
        .select("user_id, status, end_date, package_title, plans(name, title, max_pcs, max_team_members)");
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as {
        user_id: string; status: string | null; end_date: string | null; package_title: string | null;
        plans: { name: string | null; title: string | null; max_pcs: number | null; max_team_members: number | null } | null;
      }[];
    },
  });

  const addonsQ = useQuery({
    queryKey: ["admin-capacity-addons"],
    queryFn: async () => {
      const { data, error } = await anyClient().from("capacity_addons" as never).select("*").order("created_at", { ascending: false });
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as CapacityAddonRow[];
    },
  });

  const usageQ = useQuery({
    queryKey: ["admin-capacity-usage"],
    queryFn: async () => {
      const client = anyClient();
      const [teamsRes, membersRes] = await Promise.all([
        client.from("teams" as never).select("id, owner_id"),
        client.from("team_members" as never).select("team_id").eq("is_active", true),
      ]);
      const teams = (teamsRes.data ?? []) as unknown as { id: string; owner_id: string | null }[];
      const members = (membersRes.data ?? []) as unknown as { team_id: string }[];
      const ownerOf = new Map(teams.map((t) => [t.id, t.owner_id ?? ""]));
      const used = new Map<string, number>();
      for (const m of members) {
        const owner = ownerOf.get(m.team_id);
        if (!owner) continue;
        used.set(owner, (used.get(owner) ?? 0) + 1);
      }
      return used;
    },
  });

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    const subByUser = new Map(subsQ.data?.map((s) => [s.user_id, s]) ?? []);
    return (usersQ.data ?? [])
      .filter((u) => !term || u.email.toLowerCase().includes(term) || (u.full_name ?? "").toLowerCase().includes(term))
      .map((u) => {
        const sub = subByUser.get(u.id) ?? null;
        const addons = addonsQ.data?.filter((a) => a.user_id === u.id) ?? [];
        const summary = capacitySummary({
          baseCapacity: Number(sub?.plans?.max_team_members ?? sub?.plans?.max_pcs ?? 0),
          addons,
          subscriptionEnd: sub?.end_date ?? null,
          usedPcs: usageQ.data?.get(u.id) ?? 0,
        });
        return { user: u, sub, addons, summary };
      })
      .slice(0, 100);
  }, [usersQ.data, subsQ.data, addonsQ.data, usageQ.data, search]);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["admin-capacity-addons"] });
    qc.invalidateQueries({ queryKey: ["admin-capacity-usage"] });
  };

  const addAddon = async (userId: string) => {
    if (!form.extra || form.extra <= 0) return toast.error("Enter how many extra PCs to add");
    const { error } = await anyClient().from("capacity_addons" as never).insert({
      user_id: userId,
      extra_pcs: Math.round(form.extra),
      price: Number(form.price) || 0,
      label: `+${Math.round(form.extra)} PCs`,
      note: form.note.trim() || null,
      expires_at: form.expires_at ? new Date(form.expires_at).toISOString() : null,
      is_active: true,
      created_by: "admin",
    } as never);
    if (error) return toast.error(error.message);
    toast.success("Extra capacity added");
    setOpen(null);
    setForm({ extra: 100, price: 30, expires_at: "", note: "" });
    refresh();
  };

  const toggleAddon = async (addon: CapacityAddonRow) => {
    const { error } = await anyClient()
      .from("capacity_addons" as never)
      .update({ is_active: !(addon.is_active ?? true) } as never)
      .eq("id", addon.id);
    if (error) return toast.error(error.message);
    refresh();
  };

  const removeAddon = async (addon: CapacityAddonRow) => {
    if (!confirm(`Remove +${addon.extra_pcs} PCs?`)) return;
    const { error } = await anyClient().from("capacity_addons" as never).delete().eq("id", addon.id);
    if (error) return toast.error(error.message);
    toast.success("Removed");
    refresh();
  };

  const loading = usersQ.isLoading || subsQ.isLoading || addonsQ.isLoading;
  const error = usersQ.error ?? subsQ.error ?? addonsQ.error;

  return (
    <div className="space-y-6 max-w-7xl">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">PC Capacity</h1>
        <p className="text-muted-foreground mt-1">Base plan capacity, extra PCs and live usage for every user.</p>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by email or name" className="pl-9" />
      </div>

      {error ? (
        <div className="glass-card rounded-2xl p-6 text-sm text-destructive">{(error as Error).message}</div>
      ) : loading ? (
        <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-24" />)}</div>
      ) : rows.length === 0 ? (
        <div className="glass-card rounded-2xl p-6 text-sm text-muted-foreground">No users found.</div>
      ) : (
        <div className="grid gap-4">
          {rows.map(({ user, sub, addons, summary }) => (
            <div key={user.id} className="glass-card rounded-2xl p-5 space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-semibold">{user.full_name ?? "—"}</p>
                  <p className="text-xs text-muted-foreground">{user.email}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {sub?.package_title ?? sub?.plans?.title ?? sub?.plans?.name ?? "No package"}
                    {sub?.end_date ? ` · expires ${new Date(sub.end_date).toLocaleString()}` : ""}
                  </p>
                </div>
                <Dialog open={open === user.id} onOpenChange={(o) => setOpen(o ? user.id : null)}>
                  <DialogTrigger asChild>
                    <Button size="sm" className="bg-gradient-to-r from-primary to-accent text-white">
                      <Plus className="w-4 h-4 mr-1" />Add extra PCs
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-md">
                    <DialogHeader><DialogTitle>Extra PCs for {user.email}</DialogTitle></DialogHeader>
                    <div className="space-y-3">
                      <div className="flex gap-2">
                        {PRESETS.map((p) => (
                          <Button key={p.extra} type="button" variant="outline" size="sm"
                            onClick={() => setForm((f) => ({ ...f, extra: p.extra, price: p.price }))}>
                            +{p.extra} · ${p.price}
                          </Button>
                        ))}
                      </div>
                      <label className="block space-y-1">
                        <span className="text-xs text-muted-foreground">Extra PCs</span>
                        <Input type="number" min={1} value={form.extra} onChange={(e) => setForm((f) => ({ ...f, extra: Number(e.target.value) }))} />
                      </label>
                      <label className="block space-y-1">
                        <span className="text-xs text-muted-foreground">Price paid (USD)</span>
                        <Input type="number" min={0} step="0.01" value={form.price} onChange={(e) => setForm((f) => ({ ...f, price: Number(e.target.value) }))} />
                      </label>
                      <label className="block space-y-1">
                        <span className="text-xs text-muted-foreground">Expiry (leave empty to follow the subscription)</span>
                        <Input type="datetime-local" value={form.expires_at} onChange={(e) => setForm((f) => ({ ...f, expires_at: e.target.value }))} />
                      </label>
                      <label className="block space-y-1">
                        <span className="text-xs text-muted-foreground">Note (optional)</span>
                        <Input value={form.note} onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))} />
                      </label>
                    </div>
                    <DialogFooter>
                      <Button onClick={() => addAddon(user.id)} className="bg-gradient-to-r from-primary to-accent text-white">Add capacity</Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-sm">
                <Cell label="Base" value={`${summary.base.toLocaleString()} PCs`} />
                <Cell label="Extra" value={`+${summary.extra.toLocaleString()} PCs`} />
                <Cell label="Total" value={`${summary.total.toLocaleString()} PCs`} strong />
                <Cell label="Used" value={`${summary.used.toLocaleString()} PCs`} />
                <Cell label="Available" value={`${summary.available.toLocaleString()} PCs`} />
              </div>

              {addons.length > 0 && (
                <div className="border-t border-white/10 pt-3 space-y-2">
                  {addons.map((a) => (
                    <div key={a.id} className="flex flex-wrap items-center justify-between gap-2 text-xs">
                      <span className="font-medium">+{a.extra_pcs} PCs</span>
                      <span className="text-muted-foreground">
                        {a.expires_at ? `until ${new Date(a.expires_at).toLocaleString()}` : "follows subscription"}
                        {a.note ? ` · ${a.note}` : ""}
                      </span>
                      <span className="flex items-center gap-2">
                        <Button size="sm" variant="outline" onClick={() => toggleAddon(a)}>
                          {a.is_active === false ? "Enable" : "Disable"}
                        </Button>
                        <Button size="sm" variant="destructive" onClick={() => removeAddon(a)}><Trash2 className="w-3 h-3" /></Button>
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Cell({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={strong ? "text-lg font-bold tabular-nums" : "font-medium tabular-nums"}>{value}</p>
    </div>
  );
}
