import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Lock, Save, UserRound } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { StatCard } from "@/components/team/Shell";
import { useMember } from "@/hooks/use-member";
import { memberProfile, memberUpdateProfile } from "@/lib/member.functions";
import { money } from "@/lib/money";

export const Route = createFileRoute("/team/profile")({
  head: () => ({
    meta: [
      { title: "My Profile — AD4YOU Team" },
      { name: "description", content: "Update your AD4YOU team profile details and password, and review your lifetime earnings." },
      { property: "og:title", content: "My Profile — AD4YOU Team" },
      { property: "og:description", content: "Manage your team member details, contact info and password." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ProfilePage,
});

function ProfilePage() {
  const { token } = useMember();
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: ["member", "profile"],
    queryFn: () => memberProfile({ data: { token: token! } }),
    enabled: !!token,
  });

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");

  useEffect(() => {
    const m = query.data?.member;
    if (!m) return;
    setName(String(m['name'] ?? ""));
    setPhone(String(m['phone'] ?? ""));
    setWhatsapp(String(m['whatsapp'] ?? ""));
  }, [query.dataUpdatedAt]);

  const saveDetails = useMutation({
    mutationFn: () => memberUpdateProfile({ data: { token: token!, name, phone, whatsapp } }),
    onSuccess: () => { toast.success("Profile updated"); void qc.invalidateQueries({ queryKey: ["member"] }); },
    onError: (error: Error) => toast.error(error.message),
  });

  const savePassword = useMutation({
    mutationFn: () => memberUpdateProfile({ data: { token: token!, currentPassword, newPassword } }),
    onSuccess: () => { toast.success("Password changed — use it in the software too"); setCurrentPassword(""); setNewPassword(""); },
    onError: (error: Error) => toast.error(error.message),
  });

  if (query.isLoading) return <Skeleton className="h-64 rounded-2xl" />;
  if (query.error) return <p className="text-sm text-red-300">{(query.error as Error).message}</p>;
  const d = query.data!;
  const s = d.rates.currency_symbol;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">My profile</h1>
        <p className="text-sm text-muted-foreground">
          {d.team.company_name ?? d.team.name} · {String(d.member['email'] ?? "")}
        </p>
      </div>

      {d.member['must_set_password'] === true && (
        <div className="rounded-xl border border-amber-400/40 bg-amber-400/10 p-3 text-sm">
          <span className="font-semibold">For security, please change your temporary password.</span>{" "}
          Choose a new password below — it works for both the website and the AD4YOU software.
        </div>
      )}



      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Available balance" value={money(d.balance, s)} />
        <StatCard label="Total earned" value={money(d.totalEarnings, s)} />
        <StatCard label="Total paid out" value={money(d.totalPaid, s)} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 sm:p-6 space-y-4">
          <div className="flex items-center gap-2"><UserRound className="w-4 h-4 text-primary" /><h2 className="font-semibold">Your details</h2></div>
          <div className="space-y-1.5"><Label className="text-xs">Full name</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
          <div className="space-y-1.5"><Label className="text-xs">Phone</Label><Input value={phone} onChange={(e) => setPhone(e.target.value)} /></div>
          <div className="space-y-1.5"><Label className="text-xs">WhatsApp</Label><Input value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} /></div>
          <p className="text-[11px] text-muted-foreground">Your email and role are managed by your team owner.</p>
          <Button onClick={() => saveDetails.mutate()} disabled={saveDetails.isPending}>
            {saveDetails.isPending ? <Loader2 className="animate-spin" /> : <Save className="w-4 h-4" />}Save details
          </Button>
        </section>

        <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 sm:p-6 space-y-4">
          <div className="flex items-center gap-2"><Lock className="w-4 h-4 text-primary" /><h2 className="font-semibold">Change password</h2></div>
          <div className="space-y-1.5"><Label className="text-xs">Current password</Label>
            <Input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} /></div>
          <div className="space-y-1.5"><Label className="text-xs">New password</Label>
            <Input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} /></div>
          <Button
            variant="outline"
            onClick={() => {
              if (!currentPassword || newPassword.length < 6) return toast.error("Enter your current password and a new one of at least 6 characters");
              savePassword.mutate();
            }}
            disabled={savePassword.isPending}
          >
            {savePassword.isPending ? <Loader2 className="animate-spin" /> : <Lock className="w-4 h-4" />}Update password
          </Button>
          <p className="text-[11px] text-muted-foreground">The same password works for the AD4YOU desktop software.</p>
        </section>
      </div>
    </div>
  );
}
