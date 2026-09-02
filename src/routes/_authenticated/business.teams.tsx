import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, Loader2, Plus, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { useBusiness } from "@/components/business/Shell";
import {
  deleteCompanyPaymentMethod, deleteTeam, getCompany, saveCompany, saveCompanyPaymentMethod, saveTeam,
} from "@/lib/team.functions";

export const Route = createFileRoute("/_authenticated/business/teams")({
  head: () => ({
    meta: [
      { title: "Teams & Company — AD4YOU Business Panel" },
      { name: "description", content: "Create AD4YOU teams, set company details, contacts and payout methods." },
      { property: "og:title", content: "Teams & Company — AD4YOU Business Panel" },
      { property: "og:description", content: "Create AD4YOU teams, set company details, contacts and payout methods." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: TeamsPage,
});

type TeamForm = {
  name: string; company_name: string; description: string; admin_name: string;
  admin_contact_email: string; admin_phone: string; admin_whatsapp: string; admin_telegram: string;
};

const emptyTeam: TeamForm = {
  name: "", company_name: "", description: "", admin_name: "",
  admin_contact_email: "", admin_phone: "", admin_whatsapp: "", admin_telegram: "",
};

function TeamsPage() {
  const { teams, teamId, team, setTeamId, refetchTeams } = useBusiness();
  const qc = useQueryClient();
  const [form, setForm] = useState<TeamForm>(emptyTeam);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (creating || !team) { setForm(emptyTeam); return; }
    setForm({
      name: String(team['name'] ?? ""),
      company_name: String(team['company_name'] ?? ""),
      description: String(team['description'] ?? ""),
      admin_name: String(team['admin_name'] ?? ""),
      admin_contact_email: String(team['admin_contact_email'] ?? ""),
      admin_phone: String(team['admin_phone'] ?? ""),
      admin_whatsapp: String(team['admin_whatsapp'] ?? ""),
      admin_telegram: String(team['admin_telegram'] ?? ""),
    });
  }, [teamId, creating, teams.length]);

  const save = useMutation({
    mutationFn: () => saveTeam({ data: { id: creating ? null : teamId, values: form } }),
    onSuccess: (res) => {
      toast.success(creating ? "Team created" : "Team saved");
      setCreating(false);
      refetchTeams();
      if (res.id) setTeamId(res.id);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const remove = useMutation({
    mutationFn: () => deleteTeam({ data: { id: teamId! } }),
    onSuccess: () => { toast.success("Team deleted"); refetchTeams(); },
    onError: (error: Error) => toast.error(error.message),
  });

  const companyQuery = useQuery({ queryKey: ["business", "company"], queryFn: () => getCompany() });
  const [company, setCompany] = useState({ name: "", boss_name: "", email: "", phone: "", logo_url: "", min_withdrawal_amount: 50 });
  useEffect(() => {
    const c = companyQuery.data?.company;
    if (!c) return;
    setCompany({
      name: String(c['name'] ?? ""), boss_name: String(c['boss_name'] ?? ""), email: String(c['email'] ?? ""),
      phone: String(c['phone'] ?? ""), logo_url: String(c['logo_url'] ?? ""),
      min_withdrawal_amount: Number(c['min_withdrawal_amount'] ?? 50),
    });
  }, [companyQuery.dataUpdatedAt]);

  const saveCompanyMutation = useMutation({
    mutationFn: () => saveCompany({ data: company }),
    onSuccess: () => { toast.success("Company saved"); qc.invalidateQueries({ queryKey: ["business", "company"] }); },
    onError: (error: Error) => toast.error(error.message),
  });

  const [methodName, setMethodName] = useState("");
  const [methodActive, setMethodActive] = useState(true);
  const addMethod = useMutation({
    mutationFn: () => saveCompanyPaymentMethod({ data: { name: methodName, isActive: methodActive } }),
    onSuccess: () => { setMethodName(""); toast.success("Payment method added"); qc.invalidateQueries({ queryKey: ["business", "company"] }); },
    onError: (error: Error) => toast.error(error.message),
  });
  const removeMethod = useMutation({
    mutationFn: (id: string) => deleteCompanyPaymentMethod({ data: { id } }),
    onSuccess: () => { toast.success("Removed"); qc.invalidateQueries({ queryKey: ["business", "company"] }); },
    onError: (error: Error) => toast.error(error.message),
  });

  const field = (key: keyof TeamForm, label: string, placeholder?: string) => (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      <Input value={form[key]} placeholder={placeholder} onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))} />
    </div>
  );

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex-1 min-w-48">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Teams &amp; company</h1>
          <p className="text-sm text-muted-foreground">Every team shares one URL list, rule set and earning config.</p>
        </div>
        <Button variant={creating ? "secondary" : "default"} onClick={() => { setCreating(true); setForm(emptyTeam); }}>
          <Plus className="w-4 h-4" />New team
        </Button>
      </div>

      <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 sm:p-6 space-y-4">
        <h2 className="font-semibold">{creating ? "Create team" : `Edit “${String(team?.['name'] ?? "team")}”`}</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          {field("name", "Team name *", "Night Shift Team")}
          {field("company_name", "Company name", "AD4YOU Media")}
          {field("admin_name", "Boss / admin name")}
          {field("admin_contact_email", "Contact email")}
          {field("admin_phone", "Phone")}
          {field("admin_whatsapp", "WhatsApp")}
          {field("admin_telegram", "Telegram")}
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Description</Label>
          <Textarea rows={3} value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => save.mutate()} disabled={save.isPending || form.name.trim().length < 2}>
            {save.isPending ? <Loader2 className="animate-spin" /> : <Save className="w-4 h-4" />}
            {creating ? "Create team" : "Save changes"}
          </Button>
          {creating && <Button variant="ghost" onClick={() => setCreating(false)}>Cancel</Button>}
          {!creating && teamId && (
            <Button
              variant="destructive"
              onClick={() => { if (window.confirm("Delete this team and all of its members?")) remove.mutate(); }}
              disabled={remove.isPending}
            >
              {remove.isPending ? <Loader2 className="animate-spin" /> : <Trash2 className="w-4 h-4" />}Delete team
            </Button>
          )}
        </div>
      </section>

      <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 sm:p-6 space-y-4">
        <div className="flex items-center gap-2">
          <Building2 className="w-4 h-4 text-primary" />
          <h2 className="font-semibold">Company profile &amp; payout methods</h2>
        </div>
        <p className="text-xs text-muted-foreground">Shown to workers inside the software when they request a withdrawal.</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5"><Label className="text-xs">Company name *</Label>
            <Input value={company.name} onChange={(e) => setCompany((c) => ({ ...c, name: e.target.value }))} /></div>
          <div className="space-y-1.5"><Label className="text-xs">Boss name</Label>
            <Input value={company.boss_name} onChange={(e) => setCompany((c) => ({ ...c, boss_name: e.target.value }))} /></div>
          <div className="space-y-1.5"><Label className="text-xs">Email</Label>
            <Input value={company.email} onChange={(e) => setCompany((c) => ({ ...c, email: e.target.value }))} /></div>
          <div className="space-y-1.5"><Label className="text-xs">Phone</Label>
            <Input value={company.phone} onChange={(e) => setCompany((c) => ({ ...c, phone: e.target.value }))} /></div>
          <div className="space-y-1.5"><Label className="text-xs">Logo URL</Label>
            <Input value={company.logo_url} onChange={(e) => setCompany((c) => ({ ...c, logo_url: e.target.value }))} /></div>
          <div className="space-y-1.5"><Label className="text-xs">Minimum withdrawal ($)</Label>
            <Input type="number" min={0} step="0.01" value={company.min_withdrawal_amount}
              onChange={(e) => setCompany((c) => ({ ...c, min_withdrawal_amount: Number(e.target.value) }))} /></div>
        </div>
        <Button onClick={() => saveCompanyMutation.mutate()} disabled={saveCompanyMutation.isPending || company.name.trim().length < 2}>
          {saveCompanyMutation.isPending ? <Loader2 className="animate-spin" /> : <Save className="w-4 h-4" />}Save company
        </Button>

        <div className="pt-4 border-t border-white/5 space-y-3">
          <p className="text-sm font-medium">Payout methods</p>
          <div className="flex flex-wrap gap-2 items-center">
            <Input className="w-52" placeholder="PayPal / Payoneer / USDT TRC20" value={methodName} onChange={(e) => setMethodName(e.target.value)} />
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Switch checked={methodActive} onCheckedChange={setMethodActive} />Active
            </div>
            <Button size="sm" onClick={() => addMethod.mutate()} disabled={addMethod.isPending || methodName.trim().length < 2}>
              <Plus className="w-4 h-4" />Add
            </Button>
          </div>
          <div className="flex flex-wrap gap-2">
            {(companyQuery.data?.methods ?? []).length === 0 && <p className="text-xs text-muted-foreground">No payout methods yet.</p>}
            {(companyQuery.data?.methods ?? []).map((m) => (
              <span key={String(m['id'])} className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/5 text-xs">
                {String(m['name'])}
                {m['is_active'] ? "" : " (off)"}
                <button className="text-destructive" onClick={() => removeMethod.mutate(String(m['id']))} aria-label="Remove">
                  <Trash2 className="w-3 h-3" />
                </button>
              </span>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
