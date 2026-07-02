import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Trash2, Tag, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/admin/offers")({
  head: () => ({ meta: [{ title: "Admin · Discount Offers — AD4YOU" }] }),
  component: OffersAdmin,
});

function OffersAdmin() {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    plan_id: "", title: "", reason: "", coupon_code: "",
    original_price: "100", discount_percent: "70",
    initial_seats: "100", daily_decay_min: "2", daily_decay_max: "6",
  });

  const plans = useQuery({
    queryKey: ["admin-plans"],
    queryFn: async () => {
      const { data } = await supabase.from("plans").select("id, name, price").order("sort_order");
      return data ?? [];
    },
  });

  const offers = useQuery({
    queryKey: ["admin-offers"],
    queryFn: async () => {
      const { data } = await supabase.from("discount_offers").select("*, plans:plan_id(name)").order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      if (!form.plan_id) throw new Error("Pick a plan");
      const original = Number(form.original_price);
      const pct = Number(form.discount_percent);
      const seats = Number(form.initial_seats);
      if (!original || pct < 1 || pct > 99 || seats < 1) throw new Error("Check the numbers");
      const { error } = await supabase.from("discount_offers").insert({
        plan_id: form.plan_id, title: form.title, reason: form.reason || null,
        coupon_code: form.coupon_code || null,
        original_price: original, discount_percent: pct,
        initial_seats: seats, seats_remaining: seats,
        daily_decay_min: Number(form.daily_decay_min), daily_decay_max: Number(form.daily_decay_max),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Offer created");
      setForm({ ...form, title: "", reason: "", coupon_code: "" });
      qc.invalidateQueries({ queryKey: ["admin-offers"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggle = useMutation({
    mutationFn: async ({ id, on }: { id: string; on: boolean }) => {
      const { error } = await supabase.from("discount_offers").update({ is_active: on }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-offers"] }),
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("discount_offers").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Deleted"); qc.invalidateQueries({ queryKey: ["admin-offers"] }); },
  });

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Discount Offers</h1>
        <p className="text-muted-foreground mt-1">Create limited-seat promotional discounts. Seats decay by {form.daily_decay_min}–{form.daily_decay_max} per day.</p>
      </div>

      <div className="glass-card rounded-3xl p-6 space-y-4">
        <h2 className="font-semibold flex items-center gap-2"><Plus className="w-4 h-4" />New offer</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <Select value={form.plan_id} onValueChange={(v) => setForm({ ...form, plan_id: v })}>
            <SelectTrigger><SelectValue placeholder="Select plan" /></SelectTrigger>
            <SelectContent>
              {plans.data?.map((p) => <SelectItem key={p.id} value={p.id}>{p.name} (${p.price})</SelectItem>)}
            </SelectContent>
          </Select>
          <Input placeholder="Title (e.g. 1000 Users Achievement)" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
        </div>
        <Textarea placeholder="Reason / celebration (highlighted on pricing)" value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} rows={2} />
        <div className="grid gap-3 sm:grid-cols-3">
          <Input placeholder="Original price ($)" type="number" value={form.original_price} onChange={(e) => setForm({ ...form, original_price: e.target.value })} />
          <Input placeholder="Discount %" type="number" value={form.discount_percent} onChange={(e) => setForm({ ...form, discount_percent: e.target.value })} />
          <Input placeholder="Coupon code (optional)" value={form.coupon_code} onChange={(e) => setForm({ ...form, coupon_code: e.target.value.toUpperCase() })} />
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <Input placeholder="Initial seats" type="number" value={form.initial_seats} onChange={(e) => setForm({ ...form, initial_seats: e.target.value })} />
          <Input placeholder="Daily decay min" type="number" value={form.daily_decay_min} onChange={(e) => setForm({ ...form, daily_decay_min: e.target.value })} />
          <Input placeholder="Daily decay max" type="number" value={form.daily_decay_max} onChange={(e) => setForm({ ...form, daily_decay_max: e.target.value })} />
        </div>
        <Button onClick={() => create.mutate()} disabled={create.isPending} className="bg-gradient-to-r from-primary to-accent text-white">
          {create.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Plus className="w-4 h-4 mr-1" />Create offer</>}
        </Button>
      </div>

      <div className="glass-card rounded-3xl p-6 space-y-3">
        <h2 className="font-semibold flex items-center gap-2"><Tag className="w-4 h-4" />Active offers</h2>
        {offers.data?.length === 0 && <p className="text-sm text-muted-foreground py-6 text-center">No offers yet</p>}
        {offers.data?.map((o) => {
          const discounted = Number(o.original_price) * (1 - Number(o.discount_percent) / 100);
          const pct = (o.seats_remaining / o.initial_seats) * 100;
          return (
            <div key={o.id} className="rounded-2xl border border-white/10 p-4 bg-white/[0.02]">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="font-semibold">{o.title} <span className="text-xs text-muted-foreground">· {(o as { plans?: { name?: string } }).plans?.name}</span></p>
                  {o.reason && <p className="text-xs text-muted-foreground mt-0.5">{o.reason}</p>}
                  <div className="flex items-center gap-3 mt-2 text-sm">
                    <span className="line-through text-muted-foreground">${o.original_price}</span>
                    <span className="text-2xl font-bold text-emerald-400">${discounted.toFixed(2)}</span>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300">{o.discount_percent}% OFF</span>
                    {o.coupon_code && <span className="text-xs font-mono px-2 py-0.5 rounded-full bg-primary/20 text-primary">{o.coupon_code}</span>}
                  </div>
                  <div className="mt-3">
                    <div className="flex justify-between text-xs text-muted-foreground mb-1">
                      <span>{o.seats_remaining} / {o.initial_seats} seats left</span>
                      <span>decay {o.daily_decay_min}-{o.daily_decay_max}/day</span>
                    </div>
                    <div className="h-2 rounded-full bg-white/5 overflow-hidden">
                      <div className="h-full bg-gradient-to-r from-primary to-accent" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-2 shrink-0">
                  <Switch checked={o.is_active} onCheckedChange={(v) => toggle.mutate({ id: o.id, on: v })} />
                  <button onClick={() => del.mutate(o.id)} className="text-destructive hover:text-destructive/80"><Trash2 className="w-4 h-4" /></button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
