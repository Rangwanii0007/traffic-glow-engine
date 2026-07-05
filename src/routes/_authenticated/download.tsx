import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Download, CheckCircle2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Navbar } from "@/components/landing/Navbar";
import { Footer } from "@/components/landing/Footer";

export const Route = createFileRoute("/_authenticated/download")({
  head: () => ({ meta: [{ title: "Download Bot — AD4YOU" }] }),
  component: DownloadPage,
});

function DownloadPage() {

  const versionsQ = useQuery({
    queryKey: ["bot-versions"],
    queryFn: async () => {
      const { data } = await supabase
        .from("bot_versions")
        .select("id, version, platform, download_url, release_notes, is_latest, file_size, created_at")
        .order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Navbar />
      <main className="pt-28 pb-20 px-4 sm:px-6">
        <div className="max-w-5xl mx-auto space-y-6">
          <div>
            <h1 className="text-4xl font-black tracking-tight">Download Bot</h1>
            <p className="text-muted-foreground mt-2">Get the latest desktop application. Available on all plans.</p>
          </div>

          {versionsQ.isLoading ? (
            <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24" />)}</div>
          ) : (
            <div className="grid gap-4">
              {versionsQ.data?.map((v) => (
                <div key={v.id} className="glass-card rounded-2xl p-6 flex flex-col sm:flex-row sm:items-center gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-semibold">v{v.version}</h3>
                      <span className="text-xs px-2 py-0.5 rounded-md bg-white/5 capitalize">{v.platform}</span>
                      {v.is_latest && <span className="text-xs px-2 py-0.5 rounded-md bg-success/15 text-success flex items-center gap-1"><CheckCircle2 className="w-3 h-3" />Latest</span>}
                    </div>
                    {v.release_notes && <p className="text-sm text-muted-foreground">{v.release_notes}</p>}
                    <p className="text-xs text-muted-foreground mt-1">{v.file_size ? `${v.file_size} · ` : ""}{v.created_at ? new Date(v.created_at).toLocaleDateString() : ""}</p>
                  </div>
                  <Button
                    disabled={!v.download_url}
                    asChild={!!v.download_url}
                    className="bg-gradient-to-r from-primary to-accent text-white"
                  >
                    {v.download_url ? (
                      <a href={v.download_url} target="_blank" rel="noreferrer"><Download className="w-4 h-4 mr-2" />Download</a>
                    ) : (
                      <span>Unavailable</span>
                    )}
                  </Button>
                </div>
              ))}
              {versionsQ.data?.length === 0 && <p className="text-sm text-muted-foreground text-center py-8">No versions published yet.</p>}
            </div>
          )}
        </div>
      </main>
      <Footer />
    </div>
  );
}
