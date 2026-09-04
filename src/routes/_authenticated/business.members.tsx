import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { KeyRound, Loader2, Plus, Trash2, UserCog } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { NoTeamNotice, useBusiness } from "@/components/business/Shell";
import { addMember, listMembers, removeMember, updateMember } from "@/lib/team.functions";
import { useTeamRealtime } from "@/hooks/use-team-realtime";

export const Route = createFileRoute("/_authenticated/business/members")({
  head: () => ({
    meta: [
      { title: "Team Members — AD4YOU Business Panel" },
      { name: "description", content: "Add team leaders and workers, set their permissions and watch their live stats." },
      { property: "og:title", content: "Team Members — AD4YOU Business Panel" },
      { property: "og:description", content: "Add team leaders and workers, set their permissions and watch their live stats." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: MembersPage,
});

const ROLES = [
  { value: "team_leader", label: "Team Leader (one per team)" },
  { value: "editor", label: "Editor" },
  { value: "runner", label: "Runner" },
  { value: "viewer", label: "Viewer" },
] as const;

const PERMISSIONS: { key: string; label: string }[] = [
  { key: "start_stop_bot", label: "Start/Stop bot" },
  { key: "view_dashboard", label: "View dashboard" },
  { key: "view_sessions", label: "View sessions" },
  { key: "change_urls", label: "Change URLs" },
  { key: "change_proxy", label: "Change proxy" },
  { key: "change_device", label: "Change device" },
  { key: "change_traffic", label: "Change traffic mode" },
  { key: "change_engines", label: "Change engines" },
  { key: "view_earnings", label: "View earnings" },
  { key: "view_activity", label: "View activity logs" },
  { key: "export_reports", label: "Export reports" },
  { key: "manage_own_team", label: "Manage own team" },
  { key: "add_members", label: "Add members" },
  { key: "remove_members", label: "Remove members" },
  { key: "lock_urls", label: "Lock URLs for members" },
  { key: "lock_proxy", label: "Lock proxy for members" },
  { key: "custom_tabs", label: "Custom tab count" },
];

type NewMember = { name: string; email: string; password: string; role: "team_leader" | "editor" | "runner" | "viewer"; phone: string; whatsapp: string };
const emptyMember: NewMember = { name: "", email: "", password: "", role: "runner", phone: "", whatsapp: "" };

function MembersPage() {
  const { teamId } = useBusiness();
  const qc = useQueryClient();
  const [form, setForm] = useState<NewMember>(emptyMember);
  const [openId, setOpenId] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState("");

  const key = ["business", "members", teamId ?? ""];
  const members = useQuery({
    queryKey: key,
    queryFn: () => listMembers({ data: { teamId: teamId! } }),
    enabled: !!teamId,
  });
  useTeamRealtime(teamId, ["team_members"], [key]);

  const invalidate = () => { qc.invalidateQueries({ queryKey: key }); qc.invalidateQueries({ queryKey: ["business", "overview", teamId] }); };

  const create = useMutation({
    mutationFn: () => addMember({ data: { teamId: teamId!, ...form } }),
    onSuccess: () => { toast.success("Member added — they can log into the software now"); setForm(emptyMember); invalidate(); },
    onError: (error: Error) => toast.error(error.message),
  });

  const update = useMutation({
    mutationFn: (vars: { memberId: string; values: Record<string, unknown> }) =>
      updateMember({ data: { memberId: vars.memberId, teamId: teamId!, values: vars.values as never } }),
    onSuccess: () => { toast.success("Saved"); invalidate(); },
    onError: (error: Error) => toast.error(error.message),
  });

  const remove = useMutation({
    mutationFn: (memberId: string) => removeMember({ data: { memberId, teamId: teamId! } }),
    onSuccess: () => { toast.success("Member removed"); invalidate(); },
    onError: (error: Error) => toast.error(error.message),
  });

  if (!teamId) return <NoTeamNotice />;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Team members</h1>
        <p className="text-sm text-muted-foreground">Workers log into the desktop software with the email and password you set here.</p>
      </div>

      <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 sm:p-6 space-y-4">
        <h2 className="font-semibold flex items-center gap-2"><Plus className="w-4 h-4 text-primary" />Add member</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="space-y-1.5"><Label className="text-xs">Full name *</Label>
            <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} /></div>
          <div className="space-y-1.5"><Label className="text-xs">Login email *</Label>
            <Input type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} /></div>
          <div className="space-y-1.5"><Label className="text-xs">Password * (min 6)</Label>
            <Input value={form.password} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} /></div>
          <div className="space-y-1.5"><Label className="text-xs">Role</Label>
            <Select value={form.role} onValueChange={(v) => setForm((f) => ({ ...f, role: v as NewMember["role"] }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{ROLES.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}</SelectContent>
            </Select></div>
          <div className="space-y-1.5"><Label className="text-xs">Phone</Label>
            <Input value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} /></div>
          <div className="space-y-1.5"><Label className="text-xs">WhatsApp</Label>
            <Input value={form.whatsapp} onChange={(e) => setForm((f) => ({ ...f, whatsapp: e.target.value }))} /></div>
        </div>
        <Button onClick={() => create.mutate()} disabled={create.isPending || form.name.length < 2 || !form.email.includes("@") || form.password.length < 6}>
          {create.isPending ? <Loader2 className="animate-spin" /> : <Plus className="w-4 h-4" />}Add member
        </Button>
      </section>

      <section className="space-y-3">
        {members.isLoading && <Skeleton className="h-32 rounded-2xl" />}
        {members.data?.length === 0 && (
          <p className="text-sm text-muted-foreground rounded-2xl border border-white/10 bg-white/[0.03] p-6 text-center">
            No members yet. Add your Team Leader first, then the workers.
          </p>
        )}
        {(members.data ?? []).map((raw) => {
          const m = raw as Record<string, string | number | boolean | null>;
          const id = String(m['id']);
          const perms = (raw['allowed_tools'] ?? {}) as Record<string, boolean>;
          const open = openId === id;
          return (
            <div key={id} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 sm:p-5 space-y-3">
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex-1 min-w-40">
                  <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${m['is_online'] ? "bg-emerald-400" : "bg-white/20"}`} />
                    <p className="font-semibold">{String(m['name'])}</p>
                    <span className="text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full bg-primary/15 text-primary">
                      {String(m['role']).replaceAll("_", " ")}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">{String(m['email'])}</p>
                </div>
                <div className="grid grid-cols-3 gap-4 text-xs">
                  <div><p className="text-muted-foreground">Visits today</p><p className="font-semibold">{Number(m['visits_today'] ?? 0).toLocaleString()}</p></div>
                  <div><p className="text-muted-foreground">Hours today</p><p className="font-semibold">{Number(m['hours_today'] ?? 0).toFixed(1)}</p></div>
                  <div><p className="text-muted-foreground">Earned</p><p className="font-semibold">${Number(m['calculated_earnings_total'] ?? 0).toFixed(2)}</p></div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Switch checked={Boolean(m['is_active'])} onCheckedChange={(v) => update.mutate({ memberId: id, values: { is_active: v } })} />
                    Active
                  </div>
                  <Button size="sm" variant="outline" onClick={() => setOpenId(open ? null : id)}>
                    <UserCog className="w-4 h-4" />{open ? "Close" : "Manage"}
                  </Button>
                  <Button size="sm" variant="ghost" className="text-destructive"
                    onClick={() => { if (window.confirm(`Remove ${String(m['name'])}?`)) remove.mutate(id); }}>
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>

              {open && (
                <div className="pt-3 border-t border-white/5 space-y-4">
                  <div className="grid gap-4 sm:grid-cols-3">
                    <div className="space-y-1.5"><Label className="text-xs">Role</Label>
                      <Select value={String(m['role'])} onValueChange={(v) => update.mutate({ memberId: id, values: { role: v } })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>{ROLES.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}</SelectContent>
                      </Select></div>
                    <div className="space-y-1.5 sm:col-span-2"><Label className="text-xs">Reset password</Label>
                      <div className="flex gap-2">
                        <Input placeholder="New password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
                        <Button variant="outline" disabled={newPassword.length < 6}
                          onClick={() => { update.mutate({ memberId: id, values: { password: newPassword } }); setNewPassword(""); }}>
                          <KeyRound className="w-4 h-4" />Set
                        </Button>
                      </div></div>
                  </div>

                  <div>
                    <p className="text-sm font-medium mb-2">Allowed tools</p>
                    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                      {PERMISSIONS.map((p) => (
                        <label key={p.key} className="flex items-center justify-between gap-2 rounded-xl bg-white/5 px-3 py-2 text-xs">
                          <span>{p.label}</span>
                          <Switch
                            checked={Boolean(perms[p.key])}
                            onCheckedChange={(v) => update.mutate({ memberId: id, values: { allowed_tools: { ...perms, [p.key]: v } } })}
                          />
                        </label>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </section>
    </div>
  );
}
