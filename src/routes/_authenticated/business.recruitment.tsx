import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ChevronDown, ChevronUp, Copy, ExternalLink, Loader2, Mail, Plus, Save, Trash2, UserPlus, Users,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useBusiness } from "@/components/business/Shell";
import { StatCard } from "@/components/team/Shell";
import {
  getRecruitment, listEmailOutbox, retryOutboxEmail, saveEmailSettings, saveEmailTemplate, saveJoinForm, saveQuestions,
} from "@/lib/recruitment.functions";


export const Route = createFileRoute("/_authenticated/business/recruitment")({
  head: () => ({
    meta: [
      { title: "Team Recruitment — AD4YOU Business Panel" },
      { name: "description", content: "Build your own team joining form, share a public link and review applications in one place." },
      { property: "og:title", content: "Team Recruitment — AD4YOU Business Panel" },
      { property: "og:description", content: "Build your own team joining form, share a public link and review applications in one place." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: RecruitmentPage,
});

const FIELD_LABELS: Record<string, string> = {
  short_text: "Short text", long_text: "Long answer", email: "Email", phone: "Phone number",
  number: "Number", country: "Country", city: "City", dropdown: "Dropdown", multiple_choice: "Multiple choice",
  checkboxes: "Checkboxes", yes_no: "Yes / No", url: "Website link", date: "Date",
};

type Q = {
  id: string | null; field_key: string; field_type: string; label: string; description: string;
  placeholder: string; help_text: string; is_required: boolean; is_active: boolean; options: string[];
  min_value: number | null; max_value: number | null; min_length: number | null; max_length: number | null;
  score_rules: { op: string; value: string; points: number }[]; sort_order: number;
};

const STARTER: Omit<Q, "sort_order">[] = [
  { id: null, field_key: "name", field_type: "short_text", label: "Full name", description: "", placeholder: "Ali Khan", help_text: "", is_required: true, is_active: true, options: [], min_value: null, max_value: null, min_length: null, max_length: null, score_rules: [] },
  { id: null, field_key: "email", field_type: "email", label: "Email address", description: "", placeholder: "you@example.com", help_text: "We send your application result here", is_required: true, is_active: true, options: [], min_value: null, max_value: null, min_length: null, max_length: null, score_rules: [] },
  { id: null, field_key: "country", field_type: "country", label: "Country", description: "", placeholder: "Pakistan", help_text: "", is_required: true, is_active: true, options: [], min_value: null, max_value: null, min_length: null, max_length: null, score_rules: [] },
  { id: null, field_key: "city", field_type: "city", label: "City", description: "", placeholder: "Quetta", help_text: "", is_required: false, is_active: true, options: [], min_value: null, max_value: null, min_length: null, max_length: null, score_rules: [] },
  { id: null, field_key: "has_computer", field_type: "yes_no", label: "Do you have a laptop or computer?", description: "", placeholder: "", help_text: "", is_required: true, is_active: true, options: [], min_value: null, max_value: null, min_length: null, max_length: null, score_rules: [{ op: "is_yes", value: "", points: 30 }] },
  { id: null, field_key: "daily_hours", field_type: "number", label: "How many hours can you work daily?", description: "", placeholder: "5", help_text: "", is_required: true, is_active: true, options: [], min_value: 1, max_value: 24, min_length: null, max_length: null, score_rules: [{ op: "gte", value: "5", points: 20 }] },
  { id: null, field_key: "internet_speed", field_type: "number", label: "Internet speed (Mbps)", description: "", placeholder: "20", help_text: "", is_required: true, is_active: true, options: [], min_value: 1, max_value: 5000, min_length: null, max_length: null, score_rules: [{ op: "gte", value: "20", points: 20 }] },
  { id: null, field_key: "languages", field_type: "checkboxes", label: "Which languages do you speak?", description: "", placeholder: "", help_text: "", is_required: false, is_active: true, options: ["English", "Urdu", "Arabic", "Other"], min_value: null, max_value: null, min_length: null, max_length: null, score_rules: [{ op: "contains", value: "English", points: 15 }] },
  { id: null, field_key: "payment_method", field_type: "dropdown", label: "Which payment method do you use?", description: "", placeholder: "", help_text: "", is_required: false, is_active: true, options: ["Easypaisa", "JazzCash", "Bank Transfer", "PayPal", "USDT"], min_value: null, max_value: null, min_length: null, max_length: null, score_rules: [] },
  { id: null, field_key: "why_join", field_type: "long_text", label: "Why do you want to join this team?", description: "", placeholder: "Tell us about yourself", help_text: "", is_required: false, is_active: true, options: [], min_value: null, max_value: null, min_length: null, max_length: 1200, score_rules: [] },
];

function RecruitmentPage() {
  const { teamId, team } = useBusiness();
  const qc = useQueryClient();
  const [openQuestion, setOpenQuestion] = useState<number | null>(null);

  const data = useQuery({
    queryKey: ["business", "recruitment", teamId],
    queryFn: () => getRecruitment({ data: { teamId: teamId! } }),
    enabled: !!teamId,
  });

  const outbox = useQuery({
    queryKey: ["business", "recruitment", "outbox", teamId],
    queryFn: () => listEmailOutbox({ data: { teamId: teamId! } }),
    enabled: !!teamId,
  });

  const retry = useMutation({
    mutationFn: (id: string) => retryOutboxEmail({ data: { teamId: teamId!, id } }),
    onSuccess: (r) => {
      if (r.ok) toast.success("Email sent");
      else toast.error(r.error ?? "Email could not be sent");
      qc.invalidateQueries({ queryKey: ["business", "recruitment", "outbox", teamId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });


  const [brand, setBrand] = useState({
    status: "draft", slug: "", headline: "", subheadline: "", about_team: "", closed_message: "",
    success_message: "", logo_url: "", cover_url: "", primary_color: "#22d3ee", accent_color: "#a855f7",
    contact_email: "", contact_phone: "", whatsapp: "", website: "",
    allow_duplicates: false, scoring_enabled: false, default_role: "runner",
  });
  const [questions, setQuestions] = useState<Q[]>([]);
  const [emailSettings, setEmailSettings] = useState({
    business_name: "", team_name: "", logo_url: "", primary_color: "#22d3ee", reply_to: "",
    contact_email: "", contact_phone: "", whatsapp: "", website: "", footer_text: "", signature: "",
  });
  const [templateKind, setTemplateKind] = useState("accepted");
  const [template, setTemplate] = useState({ subject: "", body: "", is_active: true });

  useEffect(() => {
    const f = data.data?.form;
    if (!f) return;
    setBrand({
      status: String(f['status'] ?? "draft"),
      slug: String(f['slug'] ?? ""),
      headline: String(f['headline'] ?? ""),
      subheadline: String(f['subheadline'] ?? ""),
      about_team: String(f['about_team'] ?? ""),
      closed_message: String(f['closed_message'] ?? ""),
      success_message: String(f['success_message'] ?? ""),
      logo_url: String(f['logo_url'] ?? ""),
      cover_url: String(f['cover_url'] ?? ""),
      primary_color: String(f['primary_color'] ?? "#22d3ee"),
      accent_color: String(f['accent_color'] ?? "#a855f7"),
      contact_email: String(f['contact_email'] ?? ""),
      contact_phone: String(f['contact_phone'] ?? ""),
      whatsapp: String(f['whatsapp'] ?? ""),
      website: String(f['website'] ?? ""),
      allow_duplicates: f['allow_duplicates'] === true,
      scoring_enabled: f['scoring_enabled'] === true,
      default_role: String(f['default_role'] ?? "runner"),
    });
    setQuestions((data.data?.questions ?? []).map((row, index) => ({
      id: String(row['id']),
      field_key: String(row['field_key']),
      field_type: String(row['field_type']),
      label: String(row['label']),
      description: String(row['description'] ?? ""),
      placeholder: String(row['placeholder'] ?? ""),
      help_text: String(row['help_text'] ?? ""),
      is_required: row['is_required'] === true,
      is_active: row['is_active'] !== false,
      options: Array.isArray(row['options']) ? (row['options'] as unknown[]).map(String) : [],
      min_value: row['min_value'] === null || row['min_value'] === undefined ? null : Number(row['min_value']),
      max_value: row['max_value'] === null || row['max_value'] === undefined ? null : Number(row['max_value']),
      min_length: row['min_length'] === null || row['min_length'] === undefined ? null : Number(row['min_length']),
      max_length: row['max_length'] === null || row['max_length'] === undefined ? null : Number(row['max_length']),
      score_rules: Array.isArray(row['score_rules'])
        ? (row['score_rules'] as Record<string, unknown>[]).map((r) => ({ op: String(r['op'] ?? "equals"), value: String(r['value'] ?? ""), points: Number(r['points'] ?? 0) }))
        : [],
      sort_order: index,
    })));
    const s = data.data?.settings;
    setEmailSettings({
      business_name: String(s?.['business_name'] ?? team?.['company_name'] ?? ""),
      team_name: String(s?.['team_name'] ?? team?.['name'] ?? ""),
      logo_url: String(s?.['logo_url'] ?? ""),
      primary_color: String(s?.['primary_color'] ?? "#22d3ee"),
      reply_to: String(s?.['reply_to'] ?? ""),
      contact_email: String(s?.['contact_email'] ?? ""),
      contact_phone: String(s?.['contact_phone'] ?? ""),
      whatsapp: String(s?.['whatsapp'] ?? ""),
      website: String(s?.['website'] ?? ""),
      footer_text: String(s?.['footer_text'] ?? ""),
      signature: String(s?.['signature'] ?? ""),
    });
  }, [data.dataUpdatedAt]);

  useEffect(() => {
    const row = (data.data?.templates ?? []).find((t) => String(t['kind']) === templateKind);
    if (row) setTemplate({ subject: String(row['subject']), body: String(row['body']), is_active: row['is_active'] !== false });
  }, [templateKind, data.dataUpdatedAt]);

  const invalidate = () => qc.invalidateQueries({ queryKey: ["business", "recruitment"] });

  const saveForm = useMutation({
    mutationFn: (patch?: Partial<typeof brand>) =>
      saveJoinForm({ data: { teamId: teamId!, values: { ...brand, ...patch } as never } }),
    onSuccess: () => { toast.success("Joining page saved"); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const saveQs = useMutation({
    mutationFn: () => saveQuestions({ data: { teamId: teamId!, questions: questions as never } }),
    onSuccess: () => { toast.success("Questions saved"); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const saveSettings = useMutation({
    mutationFn: () => saveEmailSettings({ data: { teamId: teamId!, values: emailSettings } }),
    onSuccess: () => { toast.success("Email branding saved"); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const saveTpl = useMutation({
    mutationFn: () => saveEmailTemplate({ data: { teamId: teamId!, kind: templateKind as never, ...template } }),
    onSuccess: () => { toast.success("Template saved"); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const publicUrl = data.data?.publicUrl ?? "";
  const counts = data.data?.counts;
  const capacity = data.data?.capacity;

  const statusBadge = useMemo(() => {
    const map: Record<string, string> = { draft: "Draft", published: "Live", paused: "Paused", closed: "Closed" };
    return map[brand.status] ?? brand.status;
  }, [brand.status]);

  const update = (index: number, patch: Partial<Q>) =>
    setQuestions((list) => list.map((q, i) => (i === index ? { ...q, ...patch } : q)));

  const move = (index: number, dir: -1 | 1) =>
    setQuestions((list) => {
      const next = [...list];
      const target = index + dir;
      if (target < 0 || target >= next.length) return list;
      [next[index]!, next[target]!] = [next[target]!, next[index]!];
      return next.map((q, i) => ({ ...q, sort_order: i }));
    });

  if (!teamId) {
    return <p className="text-sm text-muted-foreground">Create a team first in “Teams &amp; company”.</p>;
  }

  if (data.isLoading) {
    return <div className="grid place-content-center py-24"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>;
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start gap-3">
        <div className="flex-1 min-w-56">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Team recruitment</h1>
          <p className="text-sm text-muted-foreground">Build your own joining form, share one link and review who applies.</p>
        </div>
        <Badge variant={brand.status === "published" ? "default" : "secondary"}>{statusBadge}</Badge>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="All applications" value={String(counts?.all ?? 0)} />
        <StatCard label="Pending" value={String(counts?.pending ?? 0)} hint={`${counts?.under_review ?? 0} under review`} />
        <StatCard label="Accepted" value={String(counts?.accepted ?? 0)} />
        <StatCard
          label="Team capacity"
          value={capacity?.limit ? `${capacity.active}/${capacity.limit}` : String(capacity?.active ?? 0)}
          hint={capacity?.limit ? (capacity.isFull ? "Team is full" : "Slots available") : "No limit on your plan"}
        />
      </div>

      <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 sm:p-6 space-y-3">
        <p className="text-sm font-medium">Your public joining link</p>
        <div className="flex flex-wrap items-center gap-2">
          <Input readOnly value={publicUrl} className="max-w-md font-mono text-xs" />
          <Button size="sm" variant="secondary" onClick={() => { void navigator.clipboard.writeText(publicUrl); toast.success("Link copied"); }}>
            <Copy className="w-4 h-4" />Copy
          </Button>
          <Button size="sm" variant="ghost" asChild>
            <a href={publicUrl} target="_blank" rel="noreferrer"><ExternalLink className="w-4 h-4" />Open</a>
          </Button>
        </div>
        <div className="flex flex-wrap gap-2 pt-1">
          {(["published", "paused", "closed", "draft"] as const).map((s) => (
            <Button key={s} size="sm" variant={brand.status === s ? "default" : "outline"}
              onClick={() => { setBrand((b) => ({ ...b, status: s })); saveForm.mutate({ status: s }); }}>
              {s === "published" ? "Publish" : s === "paused" ? "Pause" : s === "closed" ? "Close" : "Unpublish"}
            </Button>
          ))}
        </div>
      </section>

      <Tabs defaultValue="builder">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="builder">Form builder</TabsTrigger>
          <TabsTrigger value="branding">Page branding</TabsTrigger>
          <TabsTrigger value="emails">Email settings</TabsTrigger>
          <TabsTrigger value="templates">Email templates</TabsTrigger>
        </TabsList>

        {/* ── builder ───────────────────────────────────────────── */}
        <TabsContent value="builder" className="space-y-4 pt-4">
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={() => setQuestions((l) => [...l, {
              id: null, field_key: `question_${l.length + 1}`, field_type: "short_text", label: "New question",
              description: "", placeholder: "", help_text: "", is_required: false, is_active: true, options: [],
              min_value: null, max_value: null, min_length: null, max_length: null, score_rules: [], sort_order: l.length,
            }])}>
              <Plus className="w-4 h-4" />Add question
            </Button>
            {questions.length === 0 && (
              <Button size="sm" variant="secondary" onClick={() => setQuestions(STARTER.map((q, i) => ({ ...q, sort_order: i })))}>
                <UserPlus className="w-4 h-4" />Use recommended questions
              </Button>
            )}
            <Button size="sm" variant="default" onClick={() => saveQs.mutate()} disabled={saveQs.isPending}>
              {saveQs.isPending ? <Loader2 className="animate-spin" /> : <Save className="w-4 h-4" />}Save questions
            </Button>
          </div>

          <div className="space-y-3">
            {questions.map((q, index) => (
              <div key={`${q.field_key}-${index}`} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs text-muted-foreground w-6">{index + 1}.</span>
                  <Input className="flex-1 min-w-40" value={q.label} onChange={(e) => update(index, { label: e.target.value })} />
                  <Select value={q.field_type} onValueChange={(v) => update(index, { field_type: v })}>
                    <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(FIELD_LABELS).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Switch checked={q.is_required} onCheckedChange={(v) => update(index, { is_required: v })} />Required
                  </div>
                  <Button size="icon" variant="ghost" onClick={() => move(index, -1)} aria-label="Move up"><ChevronUp className="w-4 h-4" /></Button>
                  <Button size="icon" variant="ghost" onClick={() => move(index, 1)} aria-label="Move down"><ChevronDown className="w-4 h-4" /></Button>
                  <Button size="icon" variant="ghost" onClick={() => setOpenQuestion(openQuestion === index ? null : index)} aria-label="Settings">⚙</Button>
                  <Button size="icon" variant="ghost" className="text-destructive" onClick={() => setQuestions((l) => l.filter((_, i) => i !== index))} aria-label="Delete">
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>

                {openQuestion === index && (
                  <div className="grid gap-3 sm:grid-cols-2 pt-2 border-t border-white/5">
                    <div className="space-y-1.5"><Label className="text-xs">Field name (saved with answers)</Label>
                      <Input value={q.field_key} onChange={(e) => update(index, { field_key: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_") })} /></div>
                    <div className="space-y-1.5"><Label className="text-xs">Placeholder</Label>
                      <Input value={q.placeholder} onChange={(e) => update(index, { placeholder: e.target.value })} /></div>
                    <div className="space-y-1.5 sm:col-span-2"><Label className="text-xs">Help text shown under the question</Label>
                      <Input value={q.help_text} onChange={(e) => update(index, { help_text: e.target.value })} /></div>
                    <div className="space-y-1.5 sm:col-span-2"><Label className="text-xs">Description</Label>
                      <Textarea rows={2} value={q.description} onChange={(e) => update(index, { description: e.target.value })} /></div>

                    {["dropdown", "multiple_choice", "checkboxes"].includes(q.field_type) && (
                      <div className="space-y-1.5 sm:col-span-2">
                        <Label className="text-xs">Answer options (one per line)</Label>
                        <Textarea rows={4} value={q.options.join("\n")}
                          onChange={(e) => update(index, { options: e.target.value.split("\n").map((v) => v.trim()).filter(Boolean) })} />
                      </div>
                    )}

                    {q.field_type === "number" && (
                      <>
                        <div className="space-y-1.5"><Label className="text-xs">Minimum value</Label>
                          <Input type="number" value={q.min_value ?? ""} onChange={(e) => update(index, { min_value: e.target.value === "" ? null : Number(e.target.value) })} /></div>
                        <div className="space-y-1.5"><Label className="text-xs">Maximum value</Label>
                          <Input type="number" value={q.max_value ?? ""} onChange={(e) => update(index, { max_value: e.target.value === "" ? null : Number(e.target.value) })} /></div>
                      </>
                    )}

                    {["short_text", "long_text"].includes(q.field_type) && (
                      <>
                        <div className="space-y-1.5"><Label className="text-xs">Minimum length</Label>
                          <Input type="number" value={q.min_length ?? ""} onChange={(e) => update(index, { min_length: e.target.value === "" ? null : Number(e.target.value) })} /></div>
                        <div className="space-y-1.5"><Label className="text-xs">Maximum length</Label>
                          <Input type="number" value={q.max_length ?? ""} onChange={(e) => update(index, { max_length: e.target.value === "" ? null : Number(e.target.value) })} /></div>
                      </>
                    )}

                    <div className="sm:col-span-2 space-y-2 pt-2 border-t border-white/5">
                      <div className="flex items-center justify-between">
                        <Label className="text-xs">Scoring rules (optional)</Label>
                        <Button size="sm" variant="ghost" onClick={() => update(index, { score_rules: [...q.score_rules, { op: "equals", value: "", points: 10 }] })}>
                          <Plus className="w-3.5 h-3.5" />Add rule
                        </Button>
                      </div>
                      {q.score_rules.map((rule, ri) => (
                        <div key={ri} className="flex flex-wrap items-center gap-2">
                          <Select value={rule.op} onValueChange={(v) => update(index, { score_rules: q.score_rules.map((r, i) => i === ri ? { ...r, op: v } : r) })}>
                            <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="equals">answer is</SelectItem>
                              <SelectItem value="contains">answer contains</SelectItem>
                              <SelectItem value="gte">is at least</SelectItem>
                              <SelectItem value="lte">is at most</SelectItem>
                              <SelectItem value="is_yes">answer is Yes</SelectItem>
                            </SelectContent>
                          </Select>
                          {rule.op !== "is_yes" && (
                            <Input className="w-32" value={rule.value}
                              onChange={(e) => update(index, { score_rules: q.score_rules.map((r, i) => i === ri ? { ...r, value: e.target.value } : r) })} />
                          )}
                          <Input className="w-24" type="number" value={rule.points}
                            onChange={(e) => update(index, { score_rules: q.score_rules.map((r, i) => i === ri ? { ...r, points: Number(e.target.value) } : r) })} />
                          <span className="text-xs text-muted-foreground">points</span>
                          <Button size="icon" variant="ghost" className="text-destructive"
                            onClick={() => update(index, { score_rules: q.score_rules.filter((_, i) => i !== ri) })} aria-label="Remove rule">
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
            {questions.length === 0 && <p className="text-sm text-muted-foreground">No questions yet — add your own or start from the recommended set.</p>}
          </div>
        </TabsContent>

        {/* ── branding ──────────────────────────────────────────── */}
        <TabsContent value="branding" className="space-y-4 pt-4">
          <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 sm:p-6 grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5"><Label className="text-xs">Link name (ad4you.click/join/…)</Label>
              <Input value={brand.slug} onChange={(e) => setBrand((b) => ({ ...b, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-") }))} /></div>
            <div className="space-y-1.5"><Label className="text-xs">Welcome title</Label>
              <Input value={brand.headline} onChange={(e) => setBrand((b) => ({ ...b, headline: e.target.value }))} /></div>
            <div className="space-y-1.5 sm:col-span-2"><Label className="text-xs">Welcome description</Label>
              <Textarea rows={2} value={brand.subheadline} onChange={(e) => setBrand((b) => ({ ...b, subheadline: e.target.value }))} /></div>
            <div className="space-y-1.5 sm:col-span-2"><Label className="text-xs">About the team</Label>
              <Textarea rows={4} value={brand.about_team} onChange={(e) => setBrand((b) => ({ ...b, about_team: e.target.value }))} /></div>
            <div className="space-y-1.5"><Label className="text-xs">Logo image URL</Label>
              <Input value={brand.logo_url} onChange={(e) => setBrand((b) => ({ ...b, logo_url: e.target.value }))} /></div>
            <div className="space-y-1.5"><Label className="text-xs">Cover image URL</Label>
              <Input value={brand.cover_url} onChange={(e) => setBrand((b) => ({ ...b, cover_url: e.target.value }))} /></div>
            <div className="space-y-1.5"><Label className="text-xs">Primary colour</Label>
              <Input value={brand.primary_color} onChange={(e) => setBrand((b) => ({ ...b, primary_color: e.target.value }))} /></div>
            <div className="space-y-1.5"><Label className="text-xs">Accent colour</Label>
              <Input value={brand.accent_color} onChange={(e) => setBrand((b) => ({ ...b, accent_color: e.target.value }))} /></div>
            <div className="space-y-1.5"><Label className="text-xs">Contact email</Label>
              <Input value={brand.contact_email} onChange={(e) => setBrand((b) => ({ ...b, contact_email: e.target.value }))} /></div>
            <div className="space-y-1.5"><Label className="text-xs">Contact phone</Label>
              <Input value={brand.contact_phone} onChange={(e) => setBrand((b) => ({ ...b, contact_phone: e.target.value }))} /></div>
            <div className="space-y-1.5"><Label className="text-xs">WhatsApp number or link</Label>
              <Input value={brand.whatsapp} onChange={(e) => setBrand((b) => ({ ...b, whatsapp: e.target.value }))} /></div>
            <div className="space-y-1.5"><Label className="text-xs">Website</Label>
              <Input value={brand.website} onChange={(e) => setBrand((b) => ({ ...b, website: e.target.value }))} /></div>
            <div className="space-y-1.5 sm:col-span-2"><Label className="text-xs">Thank-you message after submitting</Label>
              <Textarea rows={2} value={brand.success_message} onChange={(e) => setBrand((b) => ({ ...b, success_message: e.target.value }))} /></div>
            <div className="space-y-1.5 sm:col-span-2"><Label className="text-xs">Message shown when applications are closed</Label>
              <Textarea rows={2} value={brand.closed_message} onChange={(e) => setBrand((b) => ({ ...b, closed_message: e.target.value }))} /></div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Switch checked={brand.scoring_enabled} onCheckedChange={(v) => setBrand((b) => ({ ...b, scoring_enabled: v }))} />Enable application scoring
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Switch checked={brand.allow_duplicates} onCheckedChange={(v) => setBrand((b) => ({ ...b, allow_duplicates: v }))} />Allow repeat applications from the same email
            </div>
            <div className="space-y-1.5"><Label className="text-xs">Role given to accepted members</Label>
              <Select value={brand.default_role} onValueChange={(v) => setBrand((b) => ({ ...b, default_role: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="runner">Runner</SelectItem>
                  <SelectItem value="editor">Editor</SelectItem>
                  <SelectItem value="viewer">Viewer</SelectItem>
                  <SelectItem value="team_leader">Team leader</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="sm:col-span-2">
              <Button onClick={() => saveForm.mutate(undefined)} disabled={saveForm.isPending}>
                {saveForm.isPending ? <Loader2 className="animate-spin" /> : <Save className="w-4 h-4" />}Save joining page
              </Button>
            </div>
          </section>
        </TabsContent>

        {/* ── email settings ────────────────────────────────────── */}
        <TabsContent value="emails" className="space-y-4 pt-4">
          <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 sm:p-6 grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2 flex items-center gap-2 text-sm"><Mail className="w-4 h-4 text-primary" />Emails to applicants use your branding below.</div>
            {([
              ["business_name", "Business name"], ["team_name", "Team name"], ["logo_url", "Logo URL"],
              ["primary_color", "Email colour"], ["reply_to", "Reply-to email"], ["contact_email", "Contact email"],
              ["contact_phone", "Contact phone"], ["whatsapp", "WhatsApp"], ["website", "Website"], ["signature", "Signature"],
            ] as const).map(([key, label]) => (
              <div key={key} className="space-y-1.5"><Label className="text-xs">{label}</Label>
                <Input value={emailSettings[key]} onChange={(e) => setEmailSettings((s) => ({ ...s, [key]: e.target.value }))} /></div>
            ))}
            <div className="space-y-1.5 sm:col-span-2"><Label className="text-xs">Email footer</Label>
              <Textarea rows={2} value={emailSettings.footer_text} onChange={(e) => setEmailSettings((s) => ({ ...s, footer_text: e.target.value }))} /></div>
            <div className="sm:col-span-2">
              <Button onClick={() => saveSettings.mutate()} disabled={saveSettings.isPending}>
                {saveSettings.isPending ? <Loader2 className="animate-spin" /> : <Save className="w-4 h-4" />}Save email branding
              </Button>
            </div>
          </section>

          <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 sm:p-6 space-y-3">
            <p className="text-sm font-medium">Recent emails</p>
            {outbox.data && !outbox.data.emailConfigured && (
              <p className="text-xs text-amber-400">
                Real email delivery is not switched on yet. Add your Resend key and sender address and these will send instantly.
              </p>
            )}
            {(outbox.data?.rows ?? []).length === 0 && <p className="text-xs text-muted-foreground">No emails yet.</p>}
            <div className="space-y-2">
              {(outbox.data?.rows ?? []).map((row) => (
                <div key={String(row['id'])} className="flex flex-wrap items-center gap-2 text-xs border-b border-white/5 pb-2">
                  <Badge variant={String(row['status']) === "sent" ? "default" : "secondary"}>{String(row['status'])}</Badge>
                  <span className="font-medium">{String(row['to_email'])}</span>
                  <span className="text-muted-foreground truncate">{String(row['subject'])}</span>
                  {row['error'] ? <span className="text-amber-400/80 basis-full">{String(row['error'])}</span> : null}
                  {String(row['status']) !== "sent" && (
                    <Button
                      size="sm" variant="outline" className="h-7 px-2 text-[11px]"
                      disabled={retry.isPending}
                      onClick={() => retry.mutate(String(row['id']))}
                    >
                      {retry.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Mail className="w-3 h-3" />}Retry
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </section>

        </TabsContent>

        {/* ── templates ─────────────────────────────────────────── */}
        <TabsContent value="templates" className="space-y-4 pt-4">
          <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 sm:p-6 space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Select value={templateKind} onValueChange={setTemplateKind}>
                <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="received">Application received</SelectItem>
                  <SelectItem value="accepted">Application accepted</SelectItem>
                  <SelectItem value="rejected">Application rejected</SelectItem>
                  <SelectItem value="welcome">Team member welcome</SelectItem>
                </SelectContent>
              </Select>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Switch checked={template.is_active} onCheckedChange={(v) => setTemplate((t) => ({ ...t, is_active: v }))} />Send this email
              </div>
            </div>
            <div className="space-y-1.5"><Label className="text-xs">Subject</Label>
              <Input value={template.subject} onChange={(e) => setTemplate((t) => ({ ...t, subject: e.target.value }))} /></div>
            <div className="space-y-1.5"><Label className="text-xs">Message</Label>
              <Textarea rows={12} value={template.body} onChange={(e) => setTemplate((t) => ({ ...t, body: e.target.value }))} /></div>
            <p className="text-xs text-muted-foreground">
              You can use: {"{{applicant_name}} {{team_name}} {{team_owner_name}} {{application_id}} {{rejection_reason}} {{contact_email}} {{contact_phone}} {{whatsapp}} {{website}} {{login_link}} {{account_setup_link}}"}
            </p>
            <Button onClick={() => saveTpl.mutate()} disabled={saveTpl.isPending}>
              {saveTpl.isPending ? <Loader2 className="animate-spin" /> : <Save className="w-4 h-4" />}Save template
            </Button>
          </section>
        </TabsContent>
      </Tabs>

      <p className="text-xs text-muted-foreground flex items-center gap-2"><Users className="w-3.5 h-3.5" />Accepted applicants become real team members and can sign in on the website and in the desktop app.</p>
    </div>
  );
}
