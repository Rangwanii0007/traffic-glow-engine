import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Coins, History, Loader2, Save, ToggleRight } from "lucide-react";
import { Switch } from "@/components/ui/switch";

import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { NoTeamNotice, useBusiness } from "@/components/business/Shell";
import { getEarningsConfig, saveEarningsConfig } from "@/lib/team.functions";

export const Route = createFileRoute("/_authenticated/business/earnings")({
  head: () => ({
    meta: [
      { title: "Earning Rates — AD4YOU Business Panel" },
      { name: "description", content: "Set what your workers earn per visit, point, ad view and ad click, with full change history." },
      { property: "og:title", content: "Earning Rates — AD4YOU Business Panel" },
      { property: "og:description", content: "Set what your workers earn per visit, point, ad view and ad click, with full change history." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: EarningsPage,
});

type Values = {
  per_visit_rate: number; per_point_rate: number; per_ad_view_rate: number; per_ad_click_rate: number;
  bonus_multiplier: number; min_withdrawal: number; currency_symbol: string; currency_code: string; admin_notes: string;
  visit_enabled: boolean; point_enabled: boolean; ad_view_enabled: boolean; ad_click_enabled: boolean;
};

const defaults: Values = {
  per_visit_rate: 0.002, per_point_rate: 0.01, per_ad_view_rate: 0.005, per_ad_click_rate: 0.05,
  bonus_multiplier: 1, min_withdrawal: 50, currency_symbol: "$", currency_code: "USD", admin_notes: "",
  visit_enabled: true, point_enabled: true, ad_view_enabled: true, ad_click_enabled: true,
};


function EarningsPage() {
  const { teamId } = useBusiness();
  const qc = useQueryClient();
  const key = ["business", "earnings", teamId ?? ""];
  const query = useQuery({ queryKey: key, queryFn: () => getEarningsConfig({ data: { teamId: teamId! } }), enabled: !!teamId });

  const [values, setValues] = useState<Values>(defaults);
  const [reason, setReason] = useState("");

  useEffect(() => {
    const c = query.data?.config;
    if (!c) return;
    setValues({
      per_visit_rate: Number(c['per_visit_rate'] ?? defaults.per_visit_rate),
      per_point_rate: Number(c['per_point_rate'] ?? defaults.per_point_rate),
      per_ad_view_rate: Number(c['per_ad_view_rate'] ?? defaults.per_ad_view_rate),
      per_ad_click_rate: Number(c['per_ad_click_rate'] ?? defaults.per_ad_click_rate),
      bonus_multiplier: Number(c['bonus_multiplier'] ?? 1),
      min_withdrawal: Number(c['min_withdrawal'] ?? 50),
      currency_symbol: String(c['currency_symbol'] ?? "$"),
      currency_code: String(c['currency_code'] ?? "USD"),
      admin_notes: String(c['admin_notes'] ?? ""),
      visit_enabled: c['visit_enabled'] !== false,
      point_enabled: c['point_enabled'] !== false,
      ad_view_enabled: c['ad_view_enabled'] !== false,
      ad_click_enabled: c['ad_click_enabled'] !== false,
    });

  }, [query.dataUpdatedAt]);

  const save = useMutation({
    mutationFn: () => saveEarningsConfig({ data: { teamId: teamId!, values: { ...values, admin_notes: values.admin_notes || null }, reason: reason || undefined } }),
    onSuccess: () => { toast.success("Rates saved — members see them instantly"); setReason(""); qc.invalidateQueries({ queryKey: key }); },
    onError: (error: Error) => toast.error(error.message),
  });

  const num = (k: keyof Values, label: string, step = "0.001") => (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      <Input type="number" step={step} min={0} value={values[k] as number}
        onChange={(e) => setValues((v) => ({ ...v, [k]: Number(e.target.value) }))} />
    </div>
  );

  if (!teamId) return <NoTeamNotice />;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Earning rates</h1>
        <p className="text-sm text-muted-foreground">Every worker&apos;s balance is calculated from these rates in real time.</p>
      </div>

      {query.isLoading ? <Skeleton className="h-64 rounded-2xl" /> : (
        <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 sm:p-6 space-y-5">
          <div className="flex items-center gap-2"><ToggleRight className="w-4 h-4 text-primary" /><h2 className="font-semibold">Earning features</h2></div>
          <p className="text-xs text-muted-foreground -mt-3">Turn a feature off and your members stop earning from it straight away. Money already earned is never touched.</p>
          <div className="grid gap-3 sm:grid-cols-2">
            {toggle("visit_enabled", "Visits")}
            {toggle("point_enabled", "Self clicks / points")}
            {toggle("ad_view_enabled", "Ad views")}
            {toggle("ad_click_enabled", "Ad clicks")}
          </div>

          <div className="flex items-center gap-2 pt-2"><Coins className="w-4 h-4 text-primary" /><h2 className="font-semibold">Rates</h2></div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">

            {num("per_visit_rate", "Per visit")}
            {num("per_point_rate", "Per point")}
            {num("per_ad_view_rate", "Per ad view")}
            {num("per_ad_click_rate", "Per ad click")}
            {num("bonus_multiplier", "Bonus multiplier", "0.01")}
            {num("min_withdrawal", "Minimum withdrawal", "1")}
            <div className="space-y-1.5"><Label className="text-xs">Currency symbol</Label>
              <Input value={values.currency_symbol} onChange={(e) => setValues((v) => ({ ...v, currency_symbol: e.target.value }))} /></div>
            <div className="space-y-1.5"><Label className="text-xs">Currency code</Label>
              <Input value={values.currency_code} onChange={(e) => setValues((v) => ({ ...v, currency_code: e.target.value.toUpperCase() }))} /></div>
          </div>
          <div className="space-y-1.5"><Label className="text-xs">Notes for members</Label>
            <Textarea rows={2} value={values.admin_notes} onChange={(e) => setValues((v) => ({ ...v, admin_notes: e.target.value }))} /></div>
          <div className="space-y-1.5"><Label className="text-xs">Reason for this change (saved in history)</Label>
            <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Monthly rate review" /></div>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending ? <Loader2 className="animate-spin" /> : <Save className="w-4 h-4" />}Save rates
          </Button>
        </section>
      )}

      <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 sm:p-6">
        <div className="flex items-center gap-2 mb-3"><History className="w-4 h-4 text-primary" /><h2 className="font-semibold">Rate change history</h2></div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[560px]">
            <thead className="text-xs text-muted-foreground text-left">
              <tr><th className="p-2">When</th><th className="p-2">Per visit</th><th className="p-2">Per ad view</th><th className="p-2">Per ad click</th><th className="p-2">By</th><th className="p-2">Reason</th></tr>
            </thead>
            <tbody>
              {(query.data?.history ?? []).length === 0 ? (
                <tr><td colSpan={6} className="p-4 text-center text-xs text-muted-foreground">No changes recorded yet.</td></tr>
              ) : (query.data?.history ?? []).map((row, i) => (
                <tr key={i} className="border-t border-white/5">
                  <td className="p-2 whitespace-nowrap">{row['created_at'] ? new Date(String(row['created_at'])).toLocaleString() : "—"}</td>
                  <td className="p-2">{Number(row['new_per_visit_rate'] ?? 0)}</td>
                  <td className="p-2">{Number(row['new_per_ad_view_rate'] ?? 0)}</td>
                  <td className="p-2">{Number(row['new_per_ad_click_rate'] ?? 0)}</td>
                  <td className="p-2">{String(row['changed_by_name'] ?? "—")}</td>
                  <td className="p-2 text-muted-foreground">{String(row['change_reason'] ?? "—")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
