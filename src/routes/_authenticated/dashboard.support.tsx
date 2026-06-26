import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, Plus, ArrowLeft, Send } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/dashboard/support")({
  head: () => ({ meta: [{ title: "Support — AD4YOU" }] }),
  component: SupportPage,
});

const CATEGORIES = ["general", "billing", "technical", "account"];

function SupportPage() {
  const { user } = useAuth();
  const uid = user?.id;
  const qc = useQueryClient();
  const [view, setView] = useState<"list" | "new" | { ticketId: string }>("list");

  const ticketsQ = useQuery({
    queryKey: ["my-tickets", uid],
    enabled: !!uid,
    queryFn: async () => {
      const { data } = await supabase
        .from("support_tickets")
        .select("id, subject, category, status, created_at, updated_at")
        .eq("user_id", uid!)
        .order("updated_at", { ascending: false });
      return data ?? [];
    },
  });

  if (typeof view === "object") {
    return <TicketDetail ticketId={view.ticketId} onBack={() => { setView("list"); qc.invalidateQueries({ queryKey: ["my-tickets"] }); }} />;
  }

  if (view === "new") {
    return <NewTicket onDone={(id) => { qc.invalidateQueries({ queryKey: ["my-tickets"] }); setView(id ? { ticketId: id } : "list"); }} onCancel={() => setView("list")} />;
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Support</h1>
          <p className="text-muted-foreground mt-1">Tickets you've opened with our team.</p>
        </div>
        <Button onClick={() => setView("new")} className="bg-gradient-to-r from-primary to-accent text-white"><Plus className="w-4 h-4 mr-2" />New ticket</Button>
      </div>

      <div className="glass-card rounded-3xl p-6">
        {ticketsQ.isLoading ? (
          <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-14" />)}</div>
        ) : ticketsQ.data?.length === 0 ? (
          <p className="text-center text-muted-foreground py-8">No tickets yet.</p>
        ) : (
          <ul className="divide-y divide-white/5">
            {ticketsQ.data?.map((t) => (
              <li key={t.id}>
                <button onClick={() => setView({ ticketId: t.id })} className="w-full text-left py-3 px-2 hover:bg-white/5 rounded-lg transition-colors flex items-center gap-4">
                  <div className="flex-1">
                    <p className="font-medium">{t.subject}</p>
                    <p className="text-xs text-muted-foreground capitalize">{t.category} · Updated {new Date(t.updated_at ?? t.created_at ?? Date.now()).toLocaleDateString()}</p>
                  </div>
                  <StatusBadge status={t.status ?? "open"} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    open: "bg-primary/15 text-primary border-primary/30",
    closed: "bg-muted text-muted-foreground border-border",
    answered: "bg-success/15 text-success border-success/30",
    pending: "bg-warning/15 text-warning border-warning/30",
  };
  return <span className={cn("px-2 py-0.5 rounded-md text-xs font-medium border capitalize", map[status] ?? map.open)}>{status}</span>;
}

function NewTicket({ onDone, onCancel }: { onDone: (id: string | null) => void; onCancel: () => void }) {
  const { user } = useAuth();
  const [subject, setSubject] = useState("");
  const [category, setCategory] = useState("general");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!user || !subject.trim() || !message.trim()) { toast.error("Subject and message are required"); return; }
    setSaving(true);
    const { data: ticket, error } = await supabase
      .from("support_tickets")
      .insert({ user_id: user.id, subject: subject.trim(), category, status: "open" })
      .select("id")
      .single();
    if (error || !ticket) { setSaving(false); toast.error(error?.message ?? "Failed"); return; }
    const { error: mErr } = await supabase
      .from("ticket_messages")
      .insert({ ticket_id: ticket.id, sender_id: user.id, sender_role: "user", message: message.trim() });
    setSaving(false);
    if (mErr) { toast.error(mErr.message); return; }
    toast.success("Ticket created");
    onDone(ticket.id);
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <button onClick={onCancel} className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1"><ArrowLeft className="w-4 h-4" />Back</button>
      <h1 className="text-3xl font-bold tracking-tight">New ticket</h1>
      <div className="glass-card rounded-3xl p-6 space-y-4">
        <div className="space-y-2">
          <Label htmlFor="sub">Subject</Label>
          <Input id="sub" value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={200} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="cat">Category</Label>
          <select id="cat" value={category} onChange={(e) => setCategory(e.target.value)} className="w-full h-10 rounded-md bg-background border border-input px-3 text-sm">
            {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="msg">Message</Label>
          <Textarea id="msg" rows={6} value={message} onChange={(e) => setMessage(e.target.value)} maxLength={4000} />
        </div>
        <Button onClick={submit} disabled={saving} className="bg-gradient-to-r from-primary to-accent text-white">
          {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}Submit ticket
        </Button>
      </div>
    </div>
  );
}

function TicketDetail({ ticketId, onBack }: { ticketId: string; onBack: () => void }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);

  const ticketQ = useQuery({
    queryKey: ["ticket", ticketId],
    queryFn: async () => {
      const { data } = await supabase.from("support_tickets").select("id, subject, category, status").eq("id", ticketId).maybeSingle();
      return data;
    },
  });
  const msgsQ = useQuery({
    queryKey: ["ticket-messages", ticketId],
    queryFn: async () => {
      const { data } = await supabase.from("ticket_messages").select("id, message, sender_role, created_at").eq("ticket_id", ticketId).order("created_at");
      return data ?? [];
    },
  });

  const send = async () => {
    if (!reply.trim() || !user) return;
    setSending(true);
    const { error } = await supabase.from("ticket_messages").insert({
      ticket_id: ticketId, sender_id: user.id, sender_role: "user", message: reply.trim(),
    });
    setSending(false);
    if (error) { toast.error(error.message); return; }
    setReply("");
    qc.invalidateQueries({ queryKey: ["ticket-messages", ticketId] });
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <button onClick={onBack} className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1"><ArrowLeft className="w-4 h-4" />Back to tickets</button>
      <div>
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold">{ticketQ.data?.subject ?? "Ticket"}</h1>
          {ticketQ.data && <StatusBadge status={ticketQ.data.status ?? "open"} />}
        </div>
        <p className="text-xs text-muted-foreground capitalize mt-1">{ticketQ.data?.category}</p>
      </div>

      <div className="glass-card rounded-3xl p-6 space-y-4">
        {msgsQ.isLoading ? <Skeleton className="h-24" /> : msgsQ.data?.map((m) => (
          <div key={m.id} className={cn("flex", m.sender_role === "user" ? "justify-end" : "justify-start")}>
            <div className={cn("max-w-[80%] rounded-2xl px-4 py-3", m.sender_role === "user" ? "bg-primary/15 border border-primary/30" : "bg-white/5 border border-white/10")}>
              <p className="text-sm whitespace-pre-wrap">{m.message}</p>
              <p className="text-[10px] text-muted-foreground mt-1">{m.sender_role} · {new Date(m.created_at ?? Date.now()).toLocaleString()}</p>
            </div>
          </div>
        ))}
      </div>

      {ticketQ.data?.status !== "closed" && (
        <div className="glass-card rounded-3xl p-4 flex gap-2">
          <Textarea value={reply} onChange={(e) => setReply(e.target.value)} placeholder="Type a reply…" rows={2} maxLength={4000} />
          <Button onClick={send} disabled={sending || !reply.trim()} className="bg-gradient-to-r from-primary to-accent text-white">
            {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </Button>
        </div>
      )}
    </div>
  );
}
