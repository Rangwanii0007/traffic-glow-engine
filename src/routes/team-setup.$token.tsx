import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { CheckCircle2, Loader2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { checkSetupToken, completeMemberSetup } from "@/lib/recruitment.functions";

export const Route = createFileRoute("/team-setup/$token")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Set up your team account — AD4YOU" },
      { name: "description", content: "Create your password to activate your AD4YOU team member account and start working with your team." },
      { property: "og:title", content: "Set up your team account — AD4YOU" },
      { property: "og:description", content: "Create your password to activate your AD4YOU team member account." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SetupPage,
});

function SetupPage() {
  const { token } = Route.useParams();
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [done, setDone] = useState(false);

  const check = useQuery({ queryKey: ["team-setup", token], queryFn: () => checkSetupToken({ data: { token } }) });

  const save = useMutation({
    mutationFn: () => completeMemberSetup({ data: { token, password } }),
    onSuccess: () => { setDone(true); toast.success("Your account is ready"); setTimeout(() => void navigate({ to: "/team-login" }), 2500); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <main className="min-h-screen grid place-content-center bg-background px-5 py-16">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-white/[0.03] p-6 sm:p-8 space-y-5">
        {check.isLoading ? (
          <div className="grid place-content-center py-8"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
        ) : !check.data?.valid ? (
          <div className="text-center space-y-3">
            <h1 className="text-xl font-bold">This setup link is no longer valid</h1>
            <p className="text-sm text-muted-foreground">Ask your team owner to send you a new invitation link.</p>
            <Button asChild variant="secondary"><Link to="/team-login">Go to team sign in</Link></Button>
          </div>
        ) : done ? (
          <div className="text-center space-y-3">
            <CheckCircle2 className="w-10 h-10 mx-auto text-primary" />
            <h1 className="text-xl font-bold">Your account is ready</h1>
            <p className="text-sm text-muted-foreground">You can now sign in on the website and in the AD4YOU desktop app.</p>
            <Button asChild><Link to="/team-login">Sign in now</Link></Button>
          </div>
        ) : (
          <>
            <div className="space-y-1">
              <p className="inline-flex items-center gap-2 text-xs text-primary"><ShieldCheck className="w-3.5 h-3.5" />Secure account setup</p>
              <h1 className="text-xl font-bold">Welcome, {check.data.name}</h1>
              <p className="text-sm text-muted-foreground">
                You have been accepted into {check.data.teamName}. Create your password to activate <strong>{check.data.email}</strong>.
              </p>
            </div>
            <form className="space-y-4" onSubmit={(e) => {
              e.preventDefault();
              if (password.length < 8) return toast.error("Use at least 8 characters");
              if (password !== confirm) return toast.error("The two passwords do not match");
              save.mutate();
            }}>
              <div className="space-y-1.5">
                <Label className="text-xs">New password</Label>
                <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Confirm password</Label>
                <Input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" />
              </div>
              <Button type="submit" className="w-full" disabled={save.isPending}>
                {save.isPending ? <Loader2 className="animate-spin" /> : null}Activate my account
              </Button>
            </form>
          </>
        )}
      </div>
    </main>
  );
}
