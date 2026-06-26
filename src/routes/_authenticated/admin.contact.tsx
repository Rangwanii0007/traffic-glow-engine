import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Trash2, Mail, MailOpen } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/admin/contact")({
  head: () => ({ meta: [{ title: "Admin · Contact — AD4YOU" }] }),
  component: ContactAdmin,
});

function ContactAdmin() {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["admin-contact"],
    queryFn: async () => {
      const { data } = await supabase.from("contact_messages").select("*").order("created_at", { ascending: false }).limit(200);
      return data ?? [];
    },
  });

  const toggleRead = async (id: string, is_read: boolean) => {
    const { error } = await supabase.from("contact_messages").update({ is_read: !is_read } as never).eq("id", id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["admin-contact"] });
  };
  const remove = async (id: string) => {
    if (!confirm("Delete message?")) return;
    await supabase.from("contact_messages").delete().eq("id", id);
    qc.invalidateQueries({ queryKey: ["admin-contact"] });
  };

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Contact Messages</h1>
        <p className="text-muted-foreground mt-1">Inbound messages from the public site.</p>
      </div>
      <div className="glass-card rounded-3xl p-6 space-y-3">
        {q.isLoading ? <Skeleton className="h-32" /> : q.data?.length === 0 ? (
          <p className="text-center text-muted-foreground py-8">No messages.</p>
        ) : q.data?.map((m) => (
          <div key={m.id} className={cn("rounded-2xl p-4 border", m.is_read ? "border-white/5 bg-white/[0.02]" : "border-primary/30 bg-primary/5")}>
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <p className="font-medium">{m.subject ?? "(no subject)"}</p>
                <p className="text-xs text-muted-foreground">{m.name} · {m.email} · {m.created_at ? new Date(m.created_at).toLocaleString() : ""}</p>
                <p className="text-sm mt-2 whitespace-pre-wrap">{m.message}</p>
              </div>
              <div className="flex gap-1">
                <Button size="sm" variant="outline" onClick={() => toggleRead(m.id, !!m.is_read)}>
                  {m.is_read ? <Mail className="w-3 h-3" /> : <MailOpen className="w-3 h-3" />}
                </Button>
                <Button size="sm" variant="destructive" onClick={() => remove(m.id)}><Trash2 className="w-3 h-3" /></Button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
