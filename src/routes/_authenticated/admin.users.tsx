import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Search, ShieldCheck, ShieldOff, Ban, CheckCircle2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/admin/users")({
  head: () => ({ meta: [{ title: "Admin · Users — AD4YOU" }] }),
  component: UsersAdmin,
});

type Plan = { id: string; slug: string; name: string; duration_days: number; is_free: boolean | null };

function UsersAdmin() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [assigning, setAssigning] = useState<string | null>(null);

  const plansQ = useQuery({
    queryKey: ["admin-users-plans"],
    queryFn: async () => {
      const { data } = await supabase.from("plans").select("id, slug, name, duration_days, is_free").eq("is_active", true).order("sort_order");
      return (data ?? []) as Plan[];
    },
  });

  const q = useQuery({
    queryKey: ["admin-users", search],
    queryFn: async () => {
      let query = supabase
        .from("users")
        .select("id, email, full_name, role, is_banned, ban_reason, created_at, subscriptions(plan_id, status, end_date, plans(name, slug))")
        .order("created_at", { ascending: false })
        .limit(100);
      if (search.trim()) query = query.ilike("email", `%${search.trim()}%`);
      const { data } = await query;
      return data ?? [];
    },
  });

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

  const assignPlan = async (userId: string, planId: string) => {
    const plan = plansQ.data?.find((p) => p.id === planId);
    if (!plan) return;
    setAssigning(userId);
    const now = new Date();
    const end =
      plan.duration_days && plan.duration_days > 0
        ? new Date(now.getTime() + plan.duration_days * 86400 * 1000).toISOString()
        : "2099-12-31T23:59:59Z";
    const { error } = await supabase
      .from("subscriptions")
      .upsert(
        {
          user_id: userId,
          plan_id: planId,
          status: "active",
          start_date: now.toISOString(),
          end_date: end,
          duration_days: plan.duration_days ?? 0,
          created_by: "admin",
        } as never,
        { onConflict: "user_id" },
      );
    setAssigning(null);
    if (error) return toast.error(error.message);
    toast.success(`Assigned ${plan.name} plan`);
    qc.invalidateQueries({ queryKey: ["admin-users"] });
  };

  return (
    <div className="space-y-6 max-w-7xl">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Users</h1>
          <p className="text-muted-foreground mt-1">Manage roles, plans and access.</p>
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
                <th className="text-left p-2 font-medium">Name</th>
                <th className="text-left p-2 font-medium">Role</th>
                <th className="text-left p-2 font-medium">Plan</th>
                <th className="text-left p-2 font-medium">Status</th>
                <th className="text-left p-2 font-medium">Joined</th>
                <th className="text-right p-2 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {q.data?.map((u: any) => {
                const sub = Array.isArray(u.subscriptions) ? u.subscriptions[0] : u.subscriptions;
                const currentPlanId: string | undefined = sub?.plan_id;
                return (
                  <tr key={u.id} className="border-t border-white/5">
                    <td className="p-2 font-mono text-xs">{u.email}</td>
                    <td className="p-2">{u.full_name ?? "—"}</td>
                    <td className="p-2">
                      <span className={cn("px-2 py-0.5 rounded-md text-xs font-medium border", u.role === "admin" ? "bg-primary/15 text-primary border-primary/30" : "bg-white/5 border-border")}>{u.role}</span>
                    </td>
                    <td className="p-2 min-w-[160px]">
                      <Select value={currentPlanId ?? ""} onValueChange={(v) => assignPlan(u.id, v)} disabled={assigning === u.id || !plansQ.data}>
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue placeholder="Assign plan…">{sub?.plans?.name ?? "No plan"}</SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          {plansQ.data?.map((p) => (
                            <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="p-2">
                      {u.is_banned ? <span className="text-xs text-destructive">Banned{u.ban_reason ? ` · ${u.ban_reason}` : ""}</span> : <span className="text-xs text-success">Active</span>}
                    </td>
                    <td className="p-2 text-xs text-muted-foreground">{u.created_at ? new Date(u.created_at).toLocaleDateString() : "—"}</td>
                    <td className="p-2 text-right space-x-1 whitespace-nowrap">
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

      <p className="text-xs text-muted-foreground">Tip: changing the plan here instantly upgrades or downgrades the user. Free plan never expires; paid plans run for the plan's duration starting now.</p>
    </div>
  );
}
