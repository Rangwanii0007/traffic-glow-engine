import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Eye, EyeOff, Loader2, Lock, Mail } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";

import { AuthShell } from "@/components/auth/AuthShell";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { friendlyAuthError } from "@/lib/auth-errors";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/login")({
  head: () => ({ meta: [{ title: "Sign in — AD4YOU" }] }),
  component: LoginPage,
});

const schema = z.object({
  email: z.string().trim().email("Enter a valid email"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

function LoginPage() {
  const navigate = useNavigate();
  const { user, isAdmin, loading } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [show, setShow] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});

  useEffect(() => {
    if (!loading && user) {
      navigate({ to: isAdmin ? "/admin" : "/dashboard", replace: true });
    }
  }, [user, isAdmin, loading, navigate]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = schema.safeParse({ email, password });
    if (!parsed.success) {
      const fe: typeof errors = {};
      parsed.error.issues.forEach((i) => {
        fe[i.path[0] as "email" | "password"] = i.message;
      });
      setErrors(fe);
      return;
    }
    setErrors({});
    setSubmitting(true);
    const { data, error } = await supabase.auth.signInWithPassword({
      email: parsed.data.email,
      password: parsed.data.password,
    });
    setSubmitting(false);
    if (error) {
      toast.error(friendlyAuthError(error.message));
      return;
    }
    toast.success("Welcome back!");
    // Check admin role from public.users
    const { data: profile } = await supabase
      .from("users")
      .select("role")
      .eq("id", data.user!.id)
      .maybeSingle();
    navigate({ to: profile?.role === "admin" ? "/admin" : "/dashboard", replace: true });
  };

  return (
    <AuthShell
      title="Welcome back"
      subtitle="Sign in to your AD4YOU account"
      footer={
        <>
          Don't have an account?{" "}
          <Link to="/register" className="text-primary hover:underline font-medium">
            Sign up
          </Link>
        </>
      }
    >
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
              className="pl-9 h-11 bg-white/5 border-white/10 focus-visible:ring-primary/50 focus-visible:border-primary/50 transition"
            />
          </div>
          {errors.email && <p className="text-xs text-destructive">{errors.email}</p>}
        </div>

        <div className="space-y-2">
          <Label htmlFor="password">Password</Label>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              id="password"
              type={show ? "text" : "password"}
              autoComplete="current-password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="pl-9 pr-10 h-11 bg-white/5 border-white/10 focus-visible:ring-primary/50 focus-visible:border-primary/50 transition"
            />
            <button
              type="button"
              aria-label={show ? "Hide password" : "Show password"}
              onClick={() => setShow((s) => !s)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          {errors.password && <p className="text-xs text-destructive">{errors.password}</p>}
        </div>

        <div className="flex items-center justify-between">
          <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer">
            <Checkbox
              checked={remember}
              onCheckedChange={(v) => setRemember(Boolean(v))}
            />
            Remember me
          </label>
          <Link to="/forgot-password" className="text-sm text-primary hover:underline">
            Forgot password?
          </Link>
        </div>

        <Button
          type="submit"
          disabled={submitting}
          className="w-full h-11 bg-gradient-to-r from-[oklch(0.65_0.24_295)] to-[oklch(0.6_0.22_250)] hover:opacity-90 text-white font-semibold shadow-[var(--shadow-glow-primary)]"
        >
          {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : "Sign In"}
        </Button>
      </form>
    </AuthShell>
  );
}
