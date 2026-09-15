import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Search, ShieldCheck, ShieldOff, Ban, CheckCircle2, Timer } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { DURATION_UNITS, type DurationUnit, computeExpiry, formatRemaining } from "@/lib/duration";

export const Route = createFileRoute("/_authenticated/admin/users")({
  head: () => ({ meta: [{ title: "Admin · Users — AD4YOU" }] }),
  component: UsersAdmin,
});

type Plan = {
  id: string; slug: string; name: string; title: string | null; duration_days: number;
  duration_value: number | null; duration_unit: DurationUnit | null; is_free: boolean | null; is_unlimited: boolean | null;
};

type CustomState = {
  userId: string; email: string; planId: string; title: string;
  value: number; unit: DurationUnit; unlimited: boolean; start: string; notes: string;
};

function toLocalInput(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function UsersAdmin() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [assigning, setAssigning] = useState<string | null>(null);
  const [custom, setCustom] = useState<CustomState | null>(null);
  const [tick, setTick] = useState(Date.now());

  useEffect(() => {
    const t = setInterval(() => setTick(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const plansQ = useQuery({
    queryKey: ["admin-users-plans"],
    queryFn: async () => {
      const full = await supabase
        .from("plans")
        .select("id, slug, name, title, duration_days, duration_value, duration_unit, is_free, is_unlimited")
        .eq("is_active", true)
        .order("sort_order");
      if (!full.error) return (full.data ?? []) as unknown as Plan[];
      const basic = await supabase
        .from("plans")
        .select("id, slug, name, duration_days, is_free")
        .eq("is_active", true)
        .order("sort_order");
      if (basic.error) throw new Error(basic.error.message);
      return (basic.data ?? []) as unknown as Plan[];
    },
  });

  const q = useQuery({
    queryKey: ["admin-users", search],
    queryFn: async () => {
      const run = (select: string) => {
        let query = supabase
          .from("users")
          .select(select)
          .order("created_at", { ascending: false })
          .limit(100);
        if (search.trim()) query = query.ilike("email", `%${search.trim()}%`);
        return query;
      };
      const full = await run(
        "id, email, full_name, role, is_banned, ban_reason, created_at, subscriptions(plan_id, status, start_date, end_date, package_title, duration_value, duration_unit, is_unlimited, plans(name, title, slug))",
      );
      if (!full.error) return (full.data ?? []) as unknown as any[];
      const mid = await run(
        "id, email, full_name, role, is_banned, ban_reason, created_at, subscriptions(plan_id, status, start_date, end_date, plans(name, slug))",
      );
      if (!mid.error) return (mid.data ?? []) as unknown as any[];
      const basic = await run("id, email, full_name, role, is_banned, ban_reason, created_at");
      if (basic.error) throw new Error(basic.error.message);
      return (basic.data ?? []) as unknown as any[];
    },
  });

  // realtime: reflect subscription/plan changes instantly
  useEffect(() => {
    const channel = supabase
      .channel("admin-users-subs")
      .on("postgres_changes", { event: "*", schema: "public", table: "subscriptions" }, () => {
        qc.invalidateQueries({ queryKey: ["admin-users"] });
      })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [qc]);

  const setRole = async (id: string, role: "user" | "admin") => {
    const { error } = await supabase.from("users").update({ role } as never).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success(`Role set to ${role}`);
    qc.invalidateQueries({ queryKey: ["admin-users"] });
  };

  const toggleBan = async (id: string, is_banned: boolean) => {
    const reason = !is_banned ? prompt("Ban reason (optional)") ?? null : null;
    const { error } = await supabase.from("users").update({ is_banned: !is_banned, ban_reason: reason } as never).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success(!is_banned ? "User banned" : "User unbanned");
    qc.invalidateQueries({ queryKey: ["admin-users"] });
  };

  const upsertSubscription = async (payload: Record<string, unknown>) => {
    const { error } = await supabase
      .from("subscriptions")
      .upsert(payload as never, { onConflict: "user_id" });
    return error;
  };

  const assignPlan = async (userId: string, planId: string) => {
    const plan = plansQ.data?.find((p) => p.id === planId);
    if (!plan) return;
    setAssigning(userId);
    const unlimited = !!plan.is_unlimited || (plan.duration_days ?? 0) === 0;
    const value = plan.duration_value ?? (plan.duration_days || 30);
    const unit = plan.duration_unit ?? "days";
    const start = new Date();
    const error = await upsertSubscription({
      user_id: userId,
      plan_id: planId,
      status: "active",
      start_date: start.toISOString(),
      end_date: unlimited ? "2099-12-31T23:59:59Z" : computeExpiry(start, value, unit).toISOString(),
      duration_value: unlimited ? null : value,
      duration_unit: unit,
      is_unlimited: unlimited,
      duration_days: unlimited ? 0 : plan.duration_days ?? 30,
      package_title: plan.title ?? plan.name,
      created_by: "admin",
    });
    setAssigning(null);
    if (error) return toast.error(error.message);
    toast.success(`Assigned ${plan.title ?? plan.name}`);
    qc.invalidateQueries({ queryKey: ["admin-users"] });
  };

  const saveCustom = async () => {
    if (!custom) return;
    if (!custom.planId) return toast.error("Pick a base plan");
    if (!custom.title.trim()) return toast.error("Package title is required");
    const plan = plansQ.data?.find((p) => p.id === custom.planId);
    const start = new Date(custom.start);
    if (Number.isNaN(start.getTime())) return toast.error("Invalid start date");
    const end = custom.unlimited ? new Date("2099-12-31T23:59:59Z") : computeExpiry(start, custom.value, custom.unit);
    const error = await upsertSubscription({
      user_id: custom.userId,
      plan_id: custom.planId,
      status: "active",
      start_date: start.toISOString(),
      end_date: end.toISOString(),
      duration_value: custom.unlimited ? null : custom.value,
      duration_unit: custom.unit,
      is_unlimited: custom.unlimited,
      duration_days: custom.unlimited ? 0 : Math.max(0, Math.ceil((end.getTime() - start.getTime()) / 86400000)),
      package_title: custom.title.trim(),
      admin_notes: custom.notes.trim() || null,
      created_by: "admin",
    });
    if (error) return toast.error(error.message);
    toast.success(`Custom package given to ${custom.email}${plan ? "" : ""}`);
    setCustom(null);
    qc.invalidateQueries({ queryKey: ["admin-users"] });
  };

  const openCustom = (u: { id: string; email: string }, sub: any) => {
    setCustom({
      userId: u.id,
      email: u.email,
      planId: sub?.plan_id ?? plansQ.data?.[0]?.id ?? "",
      title: sub?.package_title ?? "",
      value: sub?.duration_value ?? 30,
      unit: (sub?.duration_unit as DurationUnit) ?? "days",
      unlimited: !!sub?.is_unlimited,
      start: toLocalInput(new Date()),
      notes: "",
    });
  };

  return (
    <div className="space-y-6 max-w-7xl">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Users</h1>
          <p className="text-muted-foreground mt-1">Roles, plans, custom time packages and access.</p>
        </div>
        <div className="relative w-full sm:w-72">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Search by email…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
      </div>

      <div className="glass-card rounded-3xl p-6 overflow-x-auto">
        {q.isLoading ? <div className="space-y-2">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-12" />)}</div> : (
          <table className="w-full text-sm">
            <thead className="text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="text-left p-2 font-medium">Email</th>
                <th className="text-left p-2 font-medium">Role</th>
                <th className="text-left p-2 font-medium">Base plan</th>
                <th className="text-left p-2 font-medium">Package</th>
                <th className="text-left p-2 font-medium">Remaining</th>
                <th className="text-left p-2 font-medium">Status</th>
                <th className="text-right p-2 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {q.data?.map((u: any) => {
                const sub = Array.isArray(u.subscriptions) ? u.subscriptions[0] : u.subscriptions;
                const currentPlanId: string | undefined = sub?.plan_id;
                return (
                  <tr key={u.id} className="border-t border-white/5">
                    <td className="p-2 font-mono text-xs">{u.email}<div className="text-muted-foreground">{u.full_name ?? "—"}</div></td>
                    <td className="p-2">
                      <span className={cn("px-2 py-0.5 rounded-md text-xs font-medium border", u.role === "admin" ? "bg-primary/15 text-primary border-primary/30" : "bg-white/5 border-border")}>{u.role}</span>
                    </td>
                    <td className="p-2 min-w-[160px]">
                      <Select value={currentPlanId ?? ""} onValueChange={(v) => assignPlan(u.id, v)} disabled={assigning === u.id || !plansQ.data}>
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue placeholder="Assign plan…">{sub?.plans?.title ?? sub?.plans?.name ?? "No plan"}</SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          {plansQ.data?.map((p) => (
                            <SelectItem key={p.id} value={p.id}>{p.title ?? p.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="p-2 text-xs">
                      {sub?.package_title ?? "—"}
                      {sub?.end_date && <div className="text-muted-foreground">Ends {new Date(sub.end_date).toLocaleString()}</div>}
                    </td>
                    <td className="p-2 text-xs font-medium">
                      {sub?.is_unlimited ? "Unlimited" : formatRemaining(sub?.end_date, tick)}
                    </td>
                    <td className="p-2">
                      {u.is_banned ? <span className="text-xs text-destructive">Banned{u.ban_reason ? ` · ${u.ban_reason}` : ""}</span> : <span className="text-xs text-success">{sub?.status ?? "none"}</span>}
                    </td>
                    <td className="p-2 text-right space-x-1 whitespace-nowrap">
                      <Button size="sm" variant="outline" onClick={() => openCustom(u, sub)}><Timer className="w-3 h-3 mr-1" />Custom</Button>
                      {u.role === "admin" ? (
                        <Button size="sm" variant="outline" onClick={() => setRole(u.id, "user")}><ShieldOff className="w-3 h-3 mr-1" />Demote</Button>
                      ) : (
                        <Button size="sm" variant="outline" onClick={() => setRole(u.id, "admin")}><ShieldCheck className="w-3 h-3 mr-1" />Promote</Button>
                      )}
                      <Button size="sm" variant={u.is_banned ? "outline" : "destructive"} onClick={() => toggleBan(u.id, !!u.is_banned)}>
                        {u.is_banned ? <><CheckCircle2 className="w-3 h-3 mr-1" />Unban</> : <><Ban className="w-3 h-3 mr-1" />Ban</>}
                      </Button>
                    </td>
                  </tr>
                );
              })}
              {q.data?.length === 0 && <tr><td colSpan={7} className="p-8 text-center text-muted-foreground">No users found.</td></tr>}
            </tbody>
          </table>
        )}
      </div>

      <Dialog open={!!custom} onOpenChange={(o) => !o && setCustom(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Custom package</DialogTitle>
            <DialogDescription>{custom?.email} — set any title and any duration, from minutes to months.</DialogDescription>
          </DialogHeader>
          {custom && (
            <div className="space-y-3">
              <label className="block space-y-1">
                <span className="text-xs text-muted-foreground">Base plan</span>
                <Select value={custom.planId} onValueChange={(v) => setCustom({ ...custom, planId: v })}>
                  <SelectTrigger><SelectValue placeholder="Select plan" /></SelectTrigger>
                  <SelectContent>{plansQ.data?.map((p) => <SelectItem key={p.id} value={p.id}>{p.title ?? p.name}</SelectItem>)}</SelectContent>
                </Select>
              </label>
              <label className="block space-y-1">
                <span className="text-xs text-muted-foreground">Package title shown to the user</span>
                <Input value={custom.title} onChange={(e) => setCustom({ ...custom, title: e.target.value })} placeholder="Special Business Access — 15 Days" />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block space-y-1">
                  <span className="text-xs text-muted-foreground">Duration value</span>
                  <Input type="number" min={1} disabled={custom.unlimited} value={custom.value} onChange={(e) => setCustom({ ...custom, value: Number(e.target.value) })} />
                </label>
                <label className="block space-y-1">
                  <span className="text-xs text-muted-foreground">Duration unit</span>
                  <Select value={custom.unit} onValueChange={(v) => setCustom({ ...custom, unit: v as DurationUnit })} disabled={custom.unlimited}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{DURATION_UNITS.map((u) => <SelectItem key={u} value={u} className="capitalize">{u}</SelectItem>)}</SelectContent>
                  </Select>
                </label>
              </div>
              <label className="block space-y-1">
                <span className="text-xs text-muted-foreground">Starts at</span>
                <Input type="datetime-local" value={custom.start} onChange={(e) => setCustom({ ...custom, start: e.target.value })} />
              </label>
              <label className="flex items-center gap-2 text-xs cursor-pointer">
                <input type="checkbox" checked={custom.unlimited} onChange={(e) => setCustom({ ...custom, unlimited: e.target.checked })} />
                Never expires
              </label>
              <label className="block space-y-1">
                <span className="text-xs text-muted-foreground">Admin notes (internal)</span>
                <Input value={custom.notes} onChange={(e) => setCustom({ ...custom, notes: e.target.value })} />
              </label>
              <p className="text-xs text-muted-foreground">
                {custom.unlimited
                  ? "This package never expires."
                  : `Expires ${computeExpiry(new Date(custom.start || Date.now()), custom.value, custom.unit).toLocaleString()}`}
              </p>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setCustom(null)}>Cancel</Button>
            <Button onClick={saveCustom} className="bg-gradient-to-r from-primary to-accent text-white">Give package</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <p className="text-xs text-muted-foreground">Each subscription stores its own final duration and exact expiry, so editing a plan later never changes packages already given.</p>
    </div>
  );
}
