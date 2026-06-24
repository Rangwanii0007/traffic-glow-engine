import { useEffect } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({ meta: [{ title: "Admin — AD4YOU" }] }),
  component: AdminPage,
});

function AdminPage() {
  const { isAdmin, loading, profile } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && profile && !isAdmin) {
      navigate({ to: "/dashboard", replace: true });
    }
  }, [loading, isAdmin, profile, navigate]);

  if (loading || !profile) {
    return (
      <div className="min-h-screen grid place-content-center bg-background">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!isAdmin) return null;

  return (
    <div className="min-h-screen bg-background text-foreground px-6 py-12">
      <div className="max-w-5xl mx-auto">
        <h1 className="text-2xl font-bold mb-2">Admin Panel</h1>
        <p className="text-muted-foreground mb-8">User & subscription management ships next.</p>
        <div className="glass-card rounded-3xl p-8">
          <p className="text-sm text-muted-foreground">
            Welcome, admin. Plans, users, payments, announcements, and settings will be available
            here in the next phase.
          </p>
        </div>
      </div>
    </div>
  );
}
