import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Eye, EyeOff, Loader2, Lock, Mail } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";

import { PremiumLoginExperience } from "@/components/auth/PremiumLoginExperience";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { friendlyAuthError } from "@/lib/auth-errors";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/login")({
  head: () => ({ meta: [
    { title: "Sign In — AD4YOU Traffic Machine" },
    { name: "description", content: "Sign in securely to your AD4YOU personal traffic workspace." },
    { property: "og:title", content: "Sign In — AD4YOU Traffic Machine" },
    { property: "og:description", content: "Secure access to your AD4YOU traffic workspace." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
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
      navigate({ to: isAdmin ? "/admin" : "/", replace: true });
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
    navigate({ to: profile?.role === "admin" ? "/admin" : "/", replace: true });
  };

  return (
    <PremiumLoginExperience
      mode="personal"
      footer={
        <>
          New to AD4YOU?{" "}
          <Link to="/register" className="text-primary hover:underline font-medium">
            Create your account
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} className="login-form">
        <div className="login-field">
          <Label htmlFor="email">Email address</Label>
          <div className="login-field__control">
            <span className="login-field__icon"><Mail /></span>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="login-field__input"
            />
          </div>
          {errors.email && <p className="text-xs text-destructive">{errors.email}</p>}
        </div>

        <div className="login-field">
          <div className="login-field__label-row"><Label htmlFor="password">Password</Label><Link to="/forgot-password">Forgot password?</Link></div>
          <div className="login-field__control">
            <span className="login-field__icon"><Lock /></span>
            <Input
              id="password"
              type={show ? "text" : "password"}
              autoComplete="current-password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="login-field__input pr-12"
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={show ? "Hide password" : "Show password"}
              onClick={() => setShow((s) => !s)}
              className="login-field__reveal"
            >
              {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </Button>
          </div>
          {errors.password && <p className="text-xs text-destructive">{errors.password}</p>}
        </div>

        <div className="login-form__options">
          <label>
            <Checkbox
              checked={remember}
              onCheckedChange={(v) => setRemember(Boolean(v))}
            />
            Remember me
          </label>
        </div>

        <Button
          type="submit"
          disabled={submitting}
          className="login-submit"
        >
          {submitting ? <><Loader2 className="animate-spin" /> Authenticating</> : <>Sign In <span aria-hidden="true">→</span></>}
        </Button>
      </form>
    </PremiumLoginExperience>
  );
}
