import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { CheckCircle2, Loader2, Mail, MessageCircle, Phone, Globe, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getInstantJoin, instantJoin } from "@/lib/recruitment.functions";

export const Route = createFileRoute("/join-team/$slug")({
  head: () => ({
    meta: [
      { title: "Join the team instantly — AD4YOU" },
      { name: "description", content: "Create your AD4YOU Team Member account with this invite link and join the team instantly." },
      { property: "og:title", content: "Join the team instantly — AD4YOU" },
      { property: "og:description", content: "Create your AD4YOU Team Member account with this invite link and join the team instantly." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: InstantJoinPage,
});

function InstantJoinPage() {
  const { slug } = Route.useParams();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState<string | null>(null);

  const info = useQuery({ queryKey: ["instant-join", slug], queryFn: () => getInstantJoin({ data: { slug } }) });

  const join = useMutation({
    mutationFn: () => instantJoin({ data: { slug, name, email, password } }),
    onSuccess: (res) => { setError(""); setDone(`Welcome to ${res.teamName}. Your Team Member account is ready.`); },
    onError: (e: Error) => setError(e.message),
  });

  if (info.isLoading) {
    return <main className="min-h-screen grid place-content-center bg-background"><Loader2 className="w-6 h-6 animate-spin text-primary" /></main>;
  }
  if (!info.data?.found) {
    return (
      <main className="min-h-screen grid place-content-center bg-background px-6 text-center">
        <h1 className="text-2xl font-bold">This invite link is not valid</h1>
        <p className="text-sm text-muted-foreground mt-2">Please ask your team owner for the correct link.</p>
      </main>
    );
  }

  const b = info.data.branding;
  const primary = b.primary_color || "#22d3ee";
  const accent = b.accent_color || "#a855f7";

  function submit() {
    setError("");
    if (name.trim().length < 2) return setError("Please enter your full name");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return setError("Please enter a valid email address");
    if (password.length < 6) return setError("Password must be at least 6 characters");
    if (password !== confirm) return setError("Both passwords must match");
    join.mutate();
  }

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="h-40 sm:h-52 w-full relative overflow-hidden" style={{ background: `linear-gradient(135deg, ${primary}, ${accent})` }}>
        {b.cover_url ? <img src={b.cover_url} alt={`${b.team_name} cover`} className="absolute inset-0 w-full h-full object-cover opacity-60" loading="lazy" /> : null}
      </div>

      <div className="max-w-xl mx-auto px-4 -mt-16 pb-20">
        <div className="rounded-3xl border border-white/10 bg-card/80 backdrop-blur-xl p-6 sm:p-8 space-y-5">
          <div className="flex items-center gap-3">
            {b.logo_url ? (
              <img src={b.logo_url} alt={`${b.team_name} logo`} className="w-12 h-12 rounded-2xl object-cover" loading="lazy" />
            ) : (
              <div className="w-12 h-12 rounded-2xl grid place-content-center text-white font-bold" style={{ background: primary }}>
                {b.team_name.slice(0, 1).toUpperCase()}
              </div>
            )}
            <div className="min-w-0">
              <h1 className="text-xl sm:text-2xl font-bold truncate">{b.company_name || b.team_name}</h1>
              <p className="text-xs text-muted-foreground truncate">{b.headline || "Join the team"}</p>
            </div>
          </div>

          {b.instant_join_message ? <p className="text-sm text-muted-foreground">{b.instant_join_message}</p> : null}
          {!b.instant_join_message && b.subheadline ? <p className="text-sm text-muted-foreground">{b.subheadline}</p> : null}

          {done ? (
            <div className="space-y-4 text-center py-4">
              <CheckCircle2 className="w-10 h-10 mx-auto text-emerald-400" />
              <p className="font-semibold">{done}</p>
              <p className="text-sm text-muted-foreground">Sign in with the email and password you just chose.</p>
              <Button asChild className="w-full"><Link to="/team-login">Go to Team Member login</Link></Button>
            </div>
          ) : !info.data.open ? (
            <p className="text-sm text-muted-foreground py-4">{b.closed_message || "This team is not accepting new members right now."}</p>
          ) : (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="ij-name">Full name</Label>
                <Input id="ij-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" autoComplete="name" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ij-email">Email address</Label>
                <Input id="ij-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" autoComplete="email" />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="ij-pass">Password</Label>
                  <Input id="ij-pass" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="ij-pass2">Confirm password</Label>
                  <Input id="ij-pass2" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" />
                </div>
              </div>

              {error ? <p className="text-sm text-destructive">{error}</p> : null}

              <Button onClick={submit} disabled={join.isPending} className="w-full" style={{ background: `linear-gradient(90deg, ${primary}, ${accent})` }}>
                {join.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <><UserPlus className="w-4 h-4 mr-1" />Join the team</>}
              </Button>
              <p className="text-[11px] text-muted-foreground text-center">
                Your email must not already be used on AD4YOU. Already a member? <Link to="/team-login" className="underline">Sign in</Link>.
              </p>
            </div>
          )}

          {b.about_team ? <p className="text-sm text-muted-foreground border-t border-white/10 pt-4 whitespace-pre-line">{b.about_team}</p> : null}

          <div className="flex flex-wrap gap-4 text-xs text-muted-foreground border-t border-white/10 pt-4">
            {b.contact_email ? <span className="inline-flex items-center gap-1"><Mail className="w-3.5 h-3.5" />{b.contact_email}</span> : null}
            {b.contact_phone ? <span className="inline-flex items-center gap-1"><Phone className="w-3.5 h-3.5" />{b.contact_phone}</span> : null}
            {b.whatsapp ? <span className="inline-flex items-center gap-1"><MessageCircle className="w-3.5 h-3.5" />{b.whatsapp}</span> : null}
            {b.website ? <a href={b.website} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 underline"><Globe className="w-3.5 h-3.5" />Website</a> : null}
          </div>
        </div>
      </div>
    </main>
  );
}
