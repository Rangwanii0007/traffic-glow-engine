import { useEffect } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Download, CheckCircle2, Shield } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Navbar } from "@/components/landing/Navbar";
import { Footer } from "@/components/landing/Footer";
import { PageGate } from "@/components/PageGate";
import { loadDownloadOptions, downloadLabel } from "@/lib/downloads";

export const Route = createFileRoute("/download")({
  head: () => ({ meta: [{ title: "Download Bot — AD4YOU" }] }),
  component: () => (
    <PageGate pageKey="page_download_enabled">
      <DownloadPage />
    </PageGate>
  ),
});

function DownloadPage() {
  const versionsQ = useQuery({
    queryKey: ["bot-versions"],
    queryFn: loadDownloadOptions,
  });
  const refetch = versionsQ.refetch;
  useEffect(() => {
    const channel = supabase.channel("public-bot-versions-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "bot_versions" }, () => { void refetch(); })
      .on("postgres_changes", { event: "*", schema: "public", table: "settings" }, () => { void refetch(); })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [refetch]);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Navbar />
      <main className="pt-28 pb-20 px-4 sm:px-6">
        <div className="max-w-5xl mx-auto space-y-8">
          <div className="text-center">
            <h1 className="text-4xl sm:text-5xl font-black tracking-tight">Download AD4YOU</h1>
            <p className="text-muted-foreground mt-2">Available on all plans — free and premium.</p>
          </div>

          <div className="glass-card rounded-3xl p-8 sm:p-12 text-center relative overflow-hidden">
            <div className="absolute -top-24 -right-24 w-72 h-72 rounded-full bg-primary/20 blur-3xl" />
            <div className="absolute -bottom-24 -left-24 w-72 h-72 rounded-full bg-accent/20 blur-3xl" />
            <Shield className="w-10 h-10 mx-auto text-primary" />
            <h2 className="mt-4 text-2xl sm:text-3xl font-bold">Choose your download</h2>
            <p className="mt-2 text-muted-foreground">Official builds published directly by AD4YOU.</p>
            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              {versionsQ.data?.filter((v) => v.download_url).map((v) => (
                <Button key={v.id} asChild size="lg" className="h-auto min-h-14 py-3 bg-gradient-to-r from-primary to-accent text-white">
                  <a href={v.download_url ?? "#"} rel="noopener noreferrer"><Download className="w-5 h-5 mr-2" /><span>{downloadLabel(v)}</span></a>
                </Button>
              ))}
            </div>
          </div>

          <div>
            <h3 className="font-bold text-lg mb-3">Release notes</h3>
            {versionsQ.isLoading ? (
              <div className="space-y-3">{Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-20" />)}</div>
            ) : (
              <div className="grid gap-3">
                {versionsQ.data?.filter((v) => v.id !== "legacy-download").map((v) => (
                  <div key={v.id} className="glass-card rounded-2xl p-5">
                    <div className="flex items-center gap-2 mb-1">
                      <h4 className="font-semibold">v{v.version}</h4>
                      <span className="text-xs px-2 py-0.5 rounded-md bg-white/5 capitalize">{v.platform}</span>
                      {v.is_latest && <span className="text-xs px-2 py-0.5 rounded-md bg-success/15 text-success flex items-center gap-1"><CheckCircle2 className="w-3 h-3" />Latest</span>}
                    </div>
                    {v.release_notes && <p className="text-sm text-muted-foreground">{v.release_notes}</p>}
                    <p className="text-xs text-muted-foreground mt-1">{v.file_size ? `${v.file_size} · ` : ""}{v.created_at ? new Date(v.created_at).toLocaleDateString() : ""}</p>
                  </div>
                ))}
                {versionsQ.data?.length === 0 && <p className="text-sm text-muted-foreground text-center py-6">No release notes yet.</p>}
              </div>
            )}
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
