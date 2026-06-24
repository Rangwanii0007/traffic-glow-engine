import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Loader2, Mail } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";

import { AuthShell } from "@/components/auth/AuthShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { friendlyAuthError } from "@/lib/auth-errors";

export const Route = createFileRoute("/forgot-password")({
  head: () => ({ meta: [{ title: "Reset password — AD4YOU" }] }),
  component: ForgotPasswordPage,
});

const schema = z.object({ email: z.string().trim().email("Enter a valid email") });

function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = schema.safeParse({ email });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Invalid email");
      return;
    }
    setError(null);
    setSubmitting(true);
    const { error: err } = await supabase.auth.resetPasswordForEmail(parsed.data.email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setSubmitting(false);
    if (err) {
      toast.error(friendlyAuthError(err.message));
      return;
    }
    setSent(true);
    toast.success("Check your email for the reset link.");
  };

  return (
    <AuthShell
      title="Forgot password?"
      subtitle="We'll email you a secure reset link"
      footer={
        <Link to="/login" className="inline-flex items-center gap-1 text-primary hover:underline">
          <ArrowLeft className="w-3.5 h-3.5" /> Back to sign in
        </Link>
      }
    >
      {sent ? (
        <div className="text-center py-6 space-y-3">
          <div className="mx-auto w-12 h-12 rounded-full bg-success/15 flex items-center justify-center">
            <Mail className="w-5 h-5 text-success" />
          </div>
          <p className="text-foreground font-medium">Check your email</p>
          <p className="text-sm text-muted-foreground">
            We sent a password reset link to <span className="text-foreground">{email}</span>
          </p>
        </div>
      ) : (
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                id="email"
                type="email"
                autoComplete="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="pl-9 h-11 bg-white/5 border-white/10 focus-visible:ring-primary/50"
              />
            </div>
            {error && <p className="text-xs text-destructive">{error}</p>}
          </div>
          <Button
            type="submit"
            disabled={submitting}
            className="w-full h-11 bg-gradient-to-r from-[oklch(0.65_0.24_295)] to-[oklch(0.6_0.22_250)] hover:opacity-90 text-white font-semibold shadow-[var(--shadow-glow-primary)]"
          >
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : "Send Reset Link"}
          </Button>
        </form>
      )}
    </AuthShell>
  );
}
