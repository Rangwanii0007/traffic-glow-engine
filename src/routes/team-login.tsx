import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { KeyRound, Loader2, LogIn, Users } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { memberLogin, memberLoginWithAccount } from "@/lib/member.functions";
import { writeMemberToken } from "@/hooks/use-member";

export const Route = createFileRoute("/team-login")({
  head: () => ({
    meta: [
      { title: "Team Member Login — AD4YOU" },
      { name: "description", content: "Team members sign in with the email and password from their AD4YOU software to see earnings, leaderboard and withdrawals." },
      { property: "og:title", content: "Team Member Login — AD4YOU" },
      { property: "og:description", content: "Sign in to your AD4YOU team account to track earnings and request payouts." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: TeamLoginPage,
});

function TeamLoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const done = (token: string) => {
    writeMemberToken(token);
    toast.success("Welcome back");
    navigate({ to: "/team", replace: true });
  };

  const login = useMutation({
    mutationFn: () => memberLogin({ data: { email, password } }),
    onSuccess: (res) => done(res.token),
    onError: (error: Error) => toast.error(error.message),
  });

  const linked = useMutation({
    mutationFn: () => memberLoginWithAccount(),
    onSuccess: (res) => done(res.token),
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <div className="min-h-screen bg-background text-foreground grid place-content-center px-4 py-12">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center space-y-2">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-gradient-to-br from-[oklch(0.72_0.17_200)] to-[oklch(0.6_0.2_275)] grid place-content-center">
            <Users className="w-6 h-6 text-black" />
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Team member login</h1>
          <p className="text-sm text-muted-foreground">
            Use the same email and password your team owner set for you in the AD4YOU software.
          </p>
        </div>

        <form
          onSubmit={(e) => { e.preventDefault(); login.mutate(); }}
          className="rounded-3xl border border-white/10 bg-white/[0.03] p-6 space-y-4"
        >
          <div className="space-y-1.5">
            <Label htmlFor="member-email">Email</Label>
            <Input id="member-email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="member-password">Password</Label>
            <Input id="member-password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
          </div>
          <Button type="submit" className="w-full" disabled={login.isPending}>
            {login.isPending ? <Loader2 className="animate-spin" /> : <LogIn className="w-4 h-4" />}Sign in to team area
          </Button>

          <div className="relative py-1 text-center">
            <span className="text-[11px] uppercase tracking-wider text-muted-foreground bg-background px-2">or</span>
          </div>

          <Button type="button" variant="outline" className="w-full" disabled={linked.isPending} onClick={() => linked.mutate()}>
            {linked.isPending ? <Loader2 className="animate-spin" /> : <KeyRound className="w-4 h-4" />}Continue with my AD4YOU account
          </Button>
          <p className="text-[11px] text-muted-foreground text-center">
            Works when your team owner linked a personal AD4YOU account to your team profile and you are already signed in.
          </p>
        </form>

        <p className="text-center text-xs text-muted-foreground">
          Personal customer?{" "}
          <Link to="/login" className="text-primary hover:underline">Sign in here</Link>
        </p>
      </div>
    </div>
  );
}
