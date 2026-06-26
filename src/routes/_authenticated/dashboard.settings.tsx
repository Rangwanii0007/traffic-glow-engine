import { useState, useEffect } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/_authenticated/dashboard/settings")({
  head: () => ({ meta: [{ title: "Settings — AD4YOU" }] }),
  component: SettingsPage,
});

function SettingsPage() {
  const { profile, user, refreshProfile, signOut } = useAuth();
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [pwSaving, setPwSaving] = useState(false);

  useEffect(() => { if (profile) setName(profile.full_name ?? ""); }, [profile]);

  const saveProfile = async () => {
    if (!user) return;
    setSaving(true);
    const { error } = await supabase.from("users").update({ full_name: name.trim() || null } as never).eq("id", user.id);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    await refreshProfile();
    toast.success("Profile updated");
  };

  const changePassword = async () => {
    if (pw.length < 6) { toast.error("Password must be at least 6 characters"); return; }
    if (pw !== pw2) { toast.error("Passwords do not match"); return; }
    setPwSaving(true);
    const { error } = await supabase.auth.updateUser({ password: pw });
    setPwSaving(false);
    if (error) { toast.error(error.message); return; }
    setPw(""); setPw2("");
    toast.success("Password changed");
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground mt-1">Manage your profile and account security.</p>
      </div>

      <section className="glass-card rounded-3xl p-6 space-y-4">
        <h2 className="font-semibold">Profile</h2>
        <div className="space-y-2">
          <Label>Email</Label>
          <Input value={profile?.email ?? ""} disabled />
        </div>
        <div className="space-y-2">
          <Label htmlFor="name">Full name</Label>
          <Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" />
        </div>
        <Button onClick={saveProfile} disabled={saving} className="bg-gradient-to-r from-primary to-accent text-white">
          {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}Save changes
        </Button>
      </section>

      <section className="glass-card rounded-3xl p-6 space-y-4">
        <h2 className="font-semibold">Change password</h2>
        <div className="space-y-2">
          <Label htmlFor="pw">New password</Label>
          <Input id="pw" type="password" value={pw} onChange={(e) => setPw(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="pw2">Confirm new password</Label>
          <Input id="pw2" type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} />
        </div>
        <Button onClick={changePassword} disabled={pwSaving} variant="outline">
          {pwSaving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}Update password
        </Button>
      </section>

      <section className="glass-card rounded-3xl p-6 space-y-3">
        <h2 className="font-semibold">Account</h2>
        <Button variant="destructive" onClick={signOut}>Sign out</Button>
      </section>
    </div>
  );
}
