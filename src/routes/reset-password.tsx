import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Eye, EyeOff, Loader2, Lock } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";

import { AuthShell } from "@/components/auth/AuthShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { friendlyAuthError } from "@/lib/auth-errors";

export const Route = createFileRoute("/reset-password")({
  head: () => ({ meta: [{ title: "Set new password — AD4YOU" }] }),
  component: ResetPasswordPage,
});

const schema = z
  .object({
    password: z.string().min(8, "Password must be at least 8 characters").max(72),
    confirm: z.string(),
  })
  .refine((d) => d.password === d.confirm, {
    path: ["confirm"],
    message: "Passwords do not match",
  });

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = schema.safeParse({ password, confirm });
    if (!parsed.success) {
      const fe: Record<string, string> = {};
      parsed.error.issues.forEach((i) => (fe[i.path[0] as string] = i.message));
      setErrors(fe);
      return;
    }
    setErrors({});
    setSubmitting(true);
    const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
    setSubmitting(false);
    if (error) {
      toast.error(friendlyAuthError(error.message));
      return;
    }
    toast.success("Password updated. Please sign in.");
    await supabase.auth.signOut();
    navigate({ to: "/login", replace: true });
  };

  return (
    <AuthShell title="Set a new password" subtitle="Choose a strong password you don't reuse elsewhere">
      <form onSubmit={onSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="password">New password</Label>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              id="password"
              type={show ? "text" : "password"}
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="pl-9 pr-10 h-11 bg-white/5 border-white/10 focus-visible:ring-primary/50"
            />
            <button
              type="button"
              onClick={() => setShow((s) => !s)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              aria-label={show ? "Hide password" : "Show password"}
            >
              {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          {errors.password && <p className="text-xs text-destructive">{errors.password}</p>}
        </div>

        <div className="space-y-2">
          <Label htmlFor="confirm">Confirm password</Label>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              id="confirm"
              type={show ? "text" : "password"}
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="••••••••"
              className="pl-9 h-11 bg-white/5 border-white/10 focus-visible:ring-primary/50"
            />
          </div>
          {errors.confirm && <p className="text-xs text-destructive">{errors.confirm}</p>}
        </div>

        <Button
          type="submit"
          disabled={submitting}
          className="w-full h-11 bg-gradient-to-r from-[oklch(0.65_0.24_295)] to-[oklch(0.6_0.22_250)] hover:opacity-90 text-white font-semibold shadow-[var(--shadow-glow-primary)]"
        >
          {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : "Update Password"}
        </Button>
      </form>
    </AuthShell>
  );
}
