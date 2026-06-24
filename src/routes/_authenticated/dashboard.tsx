import { createFileRoute, Link } from "@tanstack/react-router";
import { Loader2, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard — AD4YOU" }] }),
  component: DashboardPage,
});

function DashboardPage() {
  const { profile, user, loading, signOut } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen grid place-content-center bg-background">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground px-6 py-12">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-10">
          <div>
            <p className="text-sm text-muted-foreground">Signed in as</p>
            <h1 className="text-2xl font-bold">{profile?.full_name ?? user?.email}</h1>
          </div>
          <Button variant="outline" onClick={signOut} className="gap-2">
            <LogOut className="w-4 h-4" /> Sign out
          </Button>
        </div>
        <div className="glass-card rounded-3xl p-8">
          <h2 className="text-lg font-semibold mb-2">Your dashboard is coming next</h2>
          <p className="text-muted-foreground text-sm">
            Authentication is live. The full publisher dashboard ships in the next phase along with
            pricing, network connections, and live revenue analytics.
          </p>
          <div className="mt-6">
            <Link to="/" className="text-primary hover:underline text-sm">← Back to home</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
