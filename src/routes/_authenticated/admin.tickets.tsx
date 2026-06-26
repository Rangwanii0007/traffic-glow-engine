import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, Send, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/admin/tickets")({
  head: () => ({ meta: [{ title: "Admin · Tickets — AD4YOU" }] }),
  component: TicketsAdmin,
});

function TicketsAdmin() {
  const [open, setOpen] = useState<string | null>(null);
  if (open) return <Detail id={open} onBack={() => setOpen(null)} />;
  return <List onOpen={setOpen} />;
}

function List({ onOpen }: { onOpen: (id: string) => void }) {
  const q = useQuery({
    queryKey: ["admin-tickets"],
    queryFn: async () => {
      const { data } = await supabase
        .from("support_tickets")
        .select("id, subject, category, status, updated_at, user_id, users(email)")
        .order("updated_at", { ascending: false })
        .limit(200);
      return data ?? [];
    },
  });

  return (
    <div className="space-y-6 max-w-6xl">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Support Tickets</h1>
        <p className="text-muted-foreground mt-1">Manage all user conversations.</p>
      </div>
      <div className="glass-card rounded-3xl p-6">
        {q.isLoading ? <div className="space-y-2">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-12" />)}</div> : (
          <ul className="divide-y divide-white/5">
            {q.data?.map((t) => {
              const u = Array.isArray(t.users) ? t.users[0] : t.users;
              return (
                <li key={t.id}>
                  <button onClick={() => onOpen(t.id)} className="w-full text-left py-3 px-2 hover:bg-white/5 rounded-lg flex items-center gap-4">
                    <div className="flex-1">
                      <p className="font-medium">{t.subject}</p>
                      <p className="text-xs text-muted-foreground">{u?.email} · {t.category} · {new Date(t.updated_at ?? Date.now()).toLocaleDateString()}</p>
                    </div>
                    <span className={cn("px-2 py-0.5 rounded-md text-xs font-medium border capitalize",
                      t.status === "open" ? "bg-primary/15 text-primary border-primary/30"
                      : t.status === "closed" ? "bg-muted text-muted-foreground border-border"
                      : "bg-success/15 text-success border-success/30")}>{t.status}</span>
                  </button>
                </li>
              );
            })}
            {q.data?.length === 0 && <li className="p-8 text-center text-muted-foreground">No tickets.</li>}
          </ul>
        )}
      </div>
    </div>
  );
}

function Detail({ id, onBack }: { id: string; onBack: () => void }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState(false);

  const tQ = useQuery({
    queryKey: ["admin-ticket", id],
    queryFn: async () => {
      const { data } = await supabase.from("support_tickets").select("id, subject, status, category, users(email)").eq("id", id).maybeSingle();
      return data;
    },
  });
  const mQ = useQuery({
    queryKey: ["admin-ticket-msgs", id],
    queryFn: async () => {
      const { data } = await supabase.from("ticket_messages").select("id, message, sender_role, created_at").eq("ticket_id", id).order("created_at");
      return data ?? [];
    },
  });

  const send = async () => {
    if (!reply.trim() || !user) return;
    setBusy(true);
    const { error } = await supabase.from("ticket_messages").insert({
      ticket_id: id, sender_id: user.id, sender_role: "admin", message: reply.trim(),
    });
    if (!error) await supabase.from("support_tickets").update({ status: "answered" } as never).eq("id", id);
    setBusy(false);
    if (error) return toast.error(error.message);
    setReply("");
    qc.invalidateQueries({ queryKey: ["admin-ticket-msgs", id] });
    qc.invalidateQueries({ queryKey: ["admin-ticket", id] });
  };

  const setStatus = async (status: string) => {
    const { error } = await supabase.from("support_tickets").update({ status } as never).eq("id", id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["admin-ticket", id] });
    qc.invalidateQueries({ queryKey: ["admin-tickets"] });
  };

  const u = tQ.data?.users && (Array.isArray(tQ.data.users) ? tQ.data.users[0] : tQ.data.users);

  return (
    <div className="max-w-3xl space-y-6">
      <button onClick={onBack} className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1"><ArrowLeft className="w-4 h-4" />All tickets</button>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">{tQ.data?.subject ?? "…"}</h1>
          <p className="text-xs text-muted-foreground">{u?.email} · {tQ.data?.category}</p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => setStatus("open")}>Reopen</Button>
          <Button size="sm" variant="destructive" onClick={() => setStatus("closed")}>Close</Button>
        </div>
      </div>

      <div className="glass-card rounded-3xl p-6 space-y-4">
        {mQ.isLoading ? <Skeleton className="h-24" /> : mQ.data?.map((m) => (
          <div key={m.id} className={cn("flex", m.sender_role === "admin" ? "justify-end" : "justify-start")}>
            <div className={cn("max-w-[80%] rounded-2xl px-4 py-3", m.sender_role === "admin" ? "bg-primary/15 border border-primary/30" : "bg-white/5 border border-white/10")}>
              <p className="text-sm whitespace-pre-wrap">{m.message}</p>
              <p className="text-[10px] text-muted-foreground mt-1">{m.sender_role} · {new Date(m.created_at ?? Date.now()).toLocaleString()}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="glass-card rounded-3xl p-4 flex gap-2">
        <Textarea value={reply} onChange={(e) => setReply(e.target.value)} placeholder="Reply as admin…" rows={2} maxLength={4000} />
        <Button onClick={send} disabled={busy || !reply.trim()} className="bg-gradient-to-r from-primary to-accent text-white">
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
        </Button>
      </div>
    </div>
  );
}
