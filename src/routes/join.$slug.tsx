import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { CheckCircle2, Loader2, Mail, MessageCircle, Phone, Globe } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getPublicJoinForm, submitApplication } from "@/lib/recruitment.functions";

export const Route = createFileRoute("/join/$slug")({
  head: () => ({
    meta: [
      { title: "Join the team — AD4YOU" },
      { name: "description", content: "Apply to join this AD4YOU team. Fill in the joining form and the team owner will review your application." },
      { property: "og:title", content: "Join the team — AD4YOU" },
      { property: "og:description", content: "Apply to join this AD4YOU team. Fill in the joining form and the team owner will review your application." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: JoinPage,
});

function JoinPage() {
  const { slug } = Route.useParams();
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState("");

  const form = useQuery({ queryKey: ["join", slug], queryFn: () => getPublicJoinForm({ data: { slug } }) });

  const submit = useMutation({
    mutationFn: () => submitApplication({ data: { slug, answers } }),
    onSuccess: (res) => { setError(""); setDone(res.message || "Thank you for applying. Your application is under review."); },
    onError: (e: Error) => setError(e.message),
  });

  if (form.isLoading) {
    return <main className="min-h-screen grid place-content-center bg-background"><Loader2 className="w-6 h-6 animate-spin text-primary" /></main>;
  }
  if (!form.data?.found) {
    return (
      <main className="min-h-screen grid place-content-center bg-background px-6 text-center">
        <h1 className="text-2xl font-bold">This joining link is not valid</h1>
        <p className="text-sm text-muted-foreground mt-2">Please ask your team owner for the correct link.</p>
      </main>
    );
  }

  const b = form.data.branding!;
  const primary = b.primary_color || "#22d3ee";
  const accent = b.accent_color || "#a855f7";

  const set = (key: string, value: unknown) => setAnswers((a) => ({ ...a, [key]: value }));

  return (
    <main className="min-h-screen bg-background text-foreground">
      <header className="relative overflow-hidden border-b border-white/5">
        {b.cover_url ? (
          <img src={b.cover_url} alt="" className="absolute inset-0 w-full h-full object-cover opacity-30" />
        ) : null}
        <div className="absolute inset-0" style={{ background: `radial-gradient(60% 120% at 20% 0%, ${primary}33, transparent), radial-gradient(60% 120% at 90% 20%, ${accent}33, transparent)` }} />
        <div className="relative max-w-3xl mx-auto px-5 py-14 sm:py-20">
          {b.logo_url ? <img src={b.logo_url} alt={b.team_name} className="h-12 w-auto mb-5" /> : null}
          <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">Welcome to</p>
          <h1 className="text-3xl sm:text-5xl font-bold tracking-tight mt-2">{b.headline || b.team_name}</h1>
          {b.subheadline ? <p className="mt-3 text-muted-foreground max-w-xl">{b.subheadline}</p> : null}
          <div className="flex flex-wrap gap-4 mt-6 text-xs text-muted-foreground">
            {b.contact_email ? <span className="inline-flex items-center gap-1.5"><Mail className="w-3.5 h-3.5" />{b.contact_email}</span> : null}
            {b.contact_phone ? <span className="inline-flex items-center gap-1.5"><Phone className="w-3.5 h-3.5" />{b.contact_phone}</span> : null}
            {b.whatsapp ? <span className="inline-flex items-center gap-1.5"><MessageCircle className="w-3.5 h-3.5" />{b.whatsapp}</span> : null}
            {b.website ? <span className="inline-flex items-center gap-1.5"><Globe className="w-3.5 h-3.5" />{b.website}</span> : null}
          </div>
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-5 py-10 space-y-8">
        {b.about_team ? (
          <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
            <h2 className="font-semibold mb-2">About the team</h2>
            <p className="text-sm text-muted-foreground whitespace-pre-line">{b.about_team}</p>
          </section>
        ) : null}

        {done ? (
          <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-8 text-center">
            <CheckCircle2 className="w-10 h-10 mx-auto mb-3" style={{ color: primary }} />
            <h2 className="text-xl font-bold">Application received</h2>
            <p className="text-sm text-muted-foreground mt-2 whitespace-pre-line">{done}</p>
          </section>
        ) : !form.data.open ? (
          <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-8 text-center">
            <h2 className="text-xl font-bold">Applications are closed</h2>
            <p className="text-sm text-muted-foreground mt-2">{b.closed_message || "We are not accepting new applications right now. Please check back later."}</p>
          </section>
        ) : (
          <form
            className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 sm:p-7 space-y-6"
            onSubmit={(e) => { e.preventDefault(); submit.mutate(); }}
          >
            <h2 className="text-lg font-semibold">Application form</h2>
            {(form.data.questions ?? []).map((q) => {
              const key = String(q['field_key']);
              const type = String(q['field_type']);
              const options = Array.isArray(q['options']) ? (q['options'] as unknown[]).map(String) : [];
              const required = q['is_required'] === true;
              return (
                <div key={String(q['id'])} className="space-y-2">
                  <Label className="text-sm">
                    {String(q['label'])}{required ? <span className="text-destructive"> *</span> : <span className="text-muted-foreground text-xs"> (optional)</span>}
                  </Label>
                  {q['description'] ? <p className="text-xs text-muted-foreground">{String(q['description'])}</p> : null}

                  {type === "long_text" ? (
                    <Textarea rows={4} required={required} placeholder={String(q['placeholder'] ?? "")}
                      value={String(answers[key] ?? "")} onChange={(e) => set(key, e.target.value)} />
                  ) : type === "dropdown" ? (
                    <Select value={String(answers[key] ?? "")} onValueChange={(v) => set(key, v)}>
                      <SelectTrigger><SelectValue placeholder="Select an option" /></SelectTrigger>
                      <SelectContent>{options.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
                    </Select>
                  ) : type === "multiple_choice" ? (
                    <RadioGroup value={String((answers[key] as string[] | undefined)?.[0] ?? "")} onValueChange={(v) => set(key, [v])} className="space-y-1.5">
                      {options.map((o) => (
                        <div key={o} className="flex items-center gap-2">
                          <RadioGroupItem value={o} id={`${key}-${o}`} />
                          <Label htmlFor={`${key}-${o}`} className="text-sm font-normal">{o}</Label>
                        </div>
                      ))}
                    </RadioGroup>
                  ) : type === "checkboxes" ? (
                    <div className="space-y-1.5">
                      {options.map((o) => {
                        const list = (answers[key] as string[] | undefined) ?? [];
                        return (
                          <div key={o} className="flex items-center gap-2">
                            <Checkbox id={`${key}-${o}`} checked={list.includes(o)}
                              onCheckedChange={(v) => set(key, v ? [...list, o] : list.filter((x) => x !== o))} />
                            <Label htmlFor={`${key}-${o}`} className="text-sm font-normal">{o}</Label>
                          </div>
                        );
                      })}
                    </div>
                  ) : type === "yes_no" ? (
                    <RadioGroup value={String(answers[key] ?? "")} onValueChange={(v) => set(key, v)} className="flex gap-5">
                      {["yes", "no"].map((v) => (
                        <div key={v} className="flex items-center gap-2">
                          <RadioGroupItem value={v} id={`${key}-${v}`} />
                          <Label htmlFor={`${key}-${v}`} className="text-sm font-normal">{v === "yes" ? "Yes" : "No"}</Label>
                        </div>
                      ))}
                    </RadioGroup>
                  ) : (
                    <Input
                      required={required}
                      type={type === "email" ? "email" : type === "number" ? "number" : type === "date" ? "date" : type === "url" ? "url" : type === "phone" ? "tel" : "text"}
                      placeholder={String(q['placeholder'] ?? "")}
                      value={String(answers[key] ?? "")}
                      onChange={(e) => set(key, e.target.value)}
                    />
                  )}
                  {q['help_text'] ? <p className="text-xs text-muted-foreground">{String(q['help_text'])}</p> : null}
                </div>
              );
            })}

            {error ? <p className="text-sm text-destructive">{error}</p> : null}

            <Button type="submit" className="w-full" disabled={submit.isPending}
              style={{ background: `linear-gradient(90deg, ${primary}, ${accent})`, color: "#0b1020" }}>
              {submit.isPending ? <Loader2 className="animate-spin" /> : null}Submit application
            </Button>
            <p className="text-[11px] text-muted-foreground text-center">
              Your answers are sent only to {b.team_name} for reviewing your application.
            </p>
          </form>
        )}
      </div>
    </main>
  );
}
