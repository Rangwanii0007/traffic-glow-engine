import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Save, Trash2, Plus, Eye } from "lucide-react";
import { toast } from "sonner";
import { AdminShell } from "@/components/admin/Shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { Markdown } from "@/components/Markdown";
import {
  adminDeletePlanArticle, adminListPlanArticles, adminSavePlanArticle, type PlanArticle,
} from "@/lib/plan-articles.functions";

export const Route = createFileRoute("/_authenticated/admin/plan-info")({
  head: () => ({
    meta: [
      { title: "Package Info Articles — AD4YOU Admin" },
      { name: "description", content: "Write and publish the earning guide article shown for each AD4YOU package." },
      { property: "og:title", content: "AD4YOU Admin — Package Info" },
      { property: "og:description", content: "Edit the package detail articles displayed on the pricing page." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdminPlanInfoPage,
});

type Draft = {
  plan_slug: string;
  emoji: string;
  title: string;
  subtitle: string;
  hero_image_url: string;
  content: string;
  is_published: boolean;
  sort_order: number;
};

const EMPTY: Draft = {
  plan_slug: "", emoji: "📦", title: "", subtitle: "", hero_image_url: "",
  content: "## What you get\n\n- Feature one\n- Feature two\n", is_published: true, sort_order: 0,
};

function toDraft(a: PlanArticle): Draft {
  return {
    plan_slug: a.plan_slug,
    emoji: a.emoji ?? "📦",
    title: a.title,
    subtitle: a.subtitle ?? "",
    hero_image_url: a.hero_image_url ?? "",
    content: a.content,
    is_published: a.is_published !== false,
    sort_order: a.sort_order ?? 0,
  };
}

function AdminPlanInfoPage() {
  const qc = useQueryClient();
  const listQ = useQuery({ queryKey: ["admin-plan-articles"], queryFn: () => adminListPlanArticles() });
  const plansQ = useQuery({
    queryKey: ["admin-plan-options"],
    queryFn: async () => {
      const { data } = await supabase.from("plans").select("id,name,slug,price,sort_order").order("sort_order");
      return (data ?? []) as { id: string; name: string; slug: string; price: number | null }[];
    },
  });
  const [activeSlug, setActiveSlug] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [preview, setPreview] = useState(false);
  const planName = (slug: string) => plansQ.data?.find((p) => p.slug === slug)?.name ?? slug;


  useEffect(() => {
    if (activeSlug === null && listQ.data && listQ.data.length > 0) {
      setActiveSlug(listQ.data[0].plan_slug);
      setDraft(toDraft(listQ.data[0]));
    }
  }, [listQ.data, activeSlug]);

  const save = useMutation({
    mutationFn: async () => {
      if (!draft.plan_slug.trim()) throw new Error("Plan slug is required (free, starter, pro, business…)");
      await adminSavePlanArticle({
        data: {
          plan_slug: draft.plan_slug.trim(),
          emoji: draft.emoji || null,
          title: draft.title,
          subtitle: draft.subtitle || null,
          hero_image_url: draft.hero_image_url || "",
          content: draft.content,
          is_published: draft.is_published,
          sort_order: draft.sort_order,
        },
      });
    },
    onSuccess: () => {
      toast.success("Package article saved");
      qc.invalidateQueries({ queryKey: ["admin-plan-articles"] });
      qc.invalidateQueries({ queryKey: ["plan-articles"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: (id: string) => adminDeletePlanArticle({ data: { id } }).then(() => undefined),
    onSuccess: () => {
      toast.success("Deleted");
      setActiveSlug(null);
      setDraft(EMPTY);
      qc.invalidateQueries({ queryKey: ["admin-plan-articles"] });
      qc.invalidateQueries({ queryKey: ["plan-articles"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const current = listQ.data?.find((a) => a.plan_slug === activeSlug) ?? null;

  return (
    <AdminShell>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Package Info Articles</h1>
        <p className="text-sm text-muted-foreground">These articles open when a visitor clicks “Package info” on the pricing page.</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[260px_1fr]">
        <div className="glass-card rounded-2xl p-3 space-y-1 h-fit">
          {listQ.isLoading && <p className="p-3 text-sm text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" /></p>}
          {listQ.data?.map((a) => (
            <button
              key={a.id}
              onClick={() => { setActiveSlug(a.plan_slug); setDraft(toDraft(a)); setPreview(false); }}
              className={`w-full rounded-xl px-3 py-2 text-left text-sm ${a.plan_slug === activeSlug ? "bg-primary/20 text-white ring-1 ring-primary/30" : "text-muted-foreground hover:bg-white/5"}`}
            >
              <span className="mr-1.5">{a.emoji ?? "📦"}</span>{planName(a.plan_slug)}
              {a.is_published === false && <span className="ml-2 text-[10px] uppercase text-warning">draft</span>}
            </button>
          ))}
          <button
            onClick={() => { setActiveSlug("__new"); setDraft(EMPTY); setPreview(false); }}
            className="w-full flex items-center gap-2 rounded-xl px-3 py-2 text-left text-sm text-primary hover:bg-primary/10"
          >
            <Plus className="w-3.5 h-3.5" /> New article
          </button>
        </div>

        <div className="glass-card rounded-2xl p-5 space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label>Select plan</Label>
              <Select value={draft.plan_slug || undefined} onValueChange={(v) => setDraft({ ...draft, plan_slug: v })}>
                <SelectTrigger className="bg-white/5 border-white/10">
                  <SelectValue placeholder={plansQ.isLoading ? "Loading plans…" : "Choose a plan"} />
                </SelectTrigger>
                <SelectContent>
                  {plansQ.data?.map((p) => (
                    <SelectItem key={p.id} value={p.slug}>
                      {p.name} {p.price != null && `— $${Number(p.price).toFixed(2)}`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Emoji / icon</Label>
              <Input value={draft.emoji} onChange={(e) => setDraft({ ...draft, emoji: e.target.value })} className="bg-white/5 border-white/10" />
            </div>
            <div className="space-y-1.5">
              <Label>Sort order</Label>
              <Input type="number" value={draft.sort_order} onChange={(e) => setDraft({ ...draft, sort_order: Number(e.target.value) || 0 })} className="bg-white/5 border-white/10" />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Title</Label>
            <Input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} className="bg-white/5 border-white/10" />
          </div>
          <div className="space-y-1.5">
            <Label>Subtitle</Label>
            <Input value={draft.subtitle} onChange={(e) => setDraft({ ...draft, subtitle: e.target.value })} className="bg-white/5 border-white/10" />
          </div>
          <div className="space-y-1.5">
            <Label>Hero image URL (optional)</Label>
            <Input value={draft.hero_image_url} onChange={(e) => setDraft({ ...draft, hero_image_url: e.target.value })} placeholder="https://…" className="bg-white/5 border-white/10" />
          </div>

          <div className="flex items-center justify-between">
            <Label className="flex items-center gap-3">
              Published
              <Switch checked={draft.is_published} onCheckedChange={(v) => setDraft({ ...draft, is_published: v })} />
            </Label>
            <Button variant="ghost" size="sm" onClick={() => setPreview((p) => !p)}>
              <Eye className="w-4 h-4 mr-1.5" />{preview ? "Edit markdown" : "Preview"}
            </Button>
          </div>

          {preview ? (
            <div className="rounded-2xl border border-white/10 bg-black/20 p-5">
              <Markdown content={draft.content} />
            </div>
          ) : (
            <div className="space-y-1.5">
              <Label>Article content (markdown: #, **bold**, tables, ``` blocks, lists)</Label>
              <Textarea
                value={draft.content}
                onChange={(e) => setDraft({ ...draft, content: e.target.value })}
                className="min-h-[420px] font-mono text-xs bg-white/5 border-white/10"
              />
            </div>
          )}

          <div className="flex gap-2">
            <Button onClick={() => save.mutate()} disabled={save.isPending} className="bg-gradient-to-r from-primary to-accent text-white">
              {save.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Save className="w-4 h-4 mr-1.5" />Save article</>}
            </Button>
            {current && (
              <Button variant="ghost" className="text-destructive hover:bg-destructive/10" onClick={() => remove.mutate(current.id)} disabled={remove.isPending}>
                <Trash2 className="w-4 h-4 mr-1.5" />Delete
              </Button>
            )}
          </div>
        </div>
      </div>
    </AdminShell>
  );
}
