import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Eye, EyeOff, KeyRound, Loader2, Lock, LogIn, Mail } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PremiumLoginExperience } from "@/components/auth/PremiumLoginExperience";
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
  const [show, setShow] = useState(false);

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
    <PremiumLoginExperience mode="team" footer={<>Personal customer? <Link to="/login" className="text-primary hover:underline font-medium">Use personal access</Link></>}>
        <form
          onSubmit={(e) => { e.preventDefault(); login.mutate(); }}
          className="login-form"
        >
          <div className="login-field">
            <Label htmlFor="member-email">Email</Label>
            <div className="login-field__control">
              <span className="login-field__icon"><Mail /></span>
              <Input className="login-field__input" id="member-email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" />
            </div>
          </div>
          <div className="login-field">
            <Label htmlFor="member-password">Password</Label>
            <div className="login-field__control">
              <span className="login-field__icon"><Lock /></span>
              <Input className="login-field__input pr-12" id="member-password" type={show ? "text" : "password"} autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
              <Button type="button" variant="ghost" size="icon" aria-label={show ? "Hide password" : "Show password"} onClick={() => setShow((value) => !value)} className="login-field__reveal">
                {show ? <EyeOff /> : <Eye />}
              </Button>
            </div>
          </div>
          <Button type="submit" className="login-submit" disabled={login.isPending}>
            {login.isPending ? <><Loader2 className="animate-spin" /> Authenticating</> : <><LogIn /> Sign in to team area</>}
          </Button>

          <div className="login-divider">
            <span>or use linked account</span>
          </div>

          <Button type="button" variant="outline" className="login-linked" disabled={linked.isPending} onClick={() => linked.mutate()}>
            {linked.isPending ? <Loader2 className="animate-spin" /> : <KeyRound className="w-4 h-4" />}Continue with my AD4YOU account
          </Button>
          <p className="login-form__note">
            Works when your team owner linked a personal AD4YOU account to your team profile and you are already signed in.
          </p>
        </form>
    </PremiumLoginExperience>
  );
}
