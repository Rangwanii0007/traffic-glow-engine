import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Filter, Loader2, Search, Trophy, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useBusiness } from "@/components/business/Shell";
import {
  acceptApplication, getApplication, getRecruitment, listApplications, rejectApplication, setApplicationStatus,
} from "@/lib/recruitment.functions";

export const Route = createFileRoute("/_authenticated/business/applications")({
  head: () => ({
    meta: [
      { title: "Team Applications — AD4YOU Business Panel" },
      { name: "description", content: "Review, filter, accept or reject people who applied to join your AD4YOU team." },
      { property: "og:title", content: "Team Applications — AD4YOU Business Panel" },
      { property: "og:description", content: "Review, filter, accept or reject people who applied to join your AD4YOU team." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ApplicationsPage,
});

const STATUS_LABEL: Record<string, string> = {
  pending: "Pending", under_review: "Under review", accepted: "Accepted",
  rejected: "Rejected", archived: "Archived", withdrawn: "Withdrawn", expired: "Expired",
};

function ApplicationsPage() {
  const { teamId } = useBusiness();
  const qc = useQueryClient();
  const [status, setStatus] = useState("pending");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("newest");
  const [filterKey, setFilterKey] = useState("");
  const [filterOp, setFilterOp] = useState("contains");
  const [filterValue, setFilterValue] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [sendReject, setSendReject] = useState(true);
  const [acceptOpen, setAcceptOpen] = useState(false);
  const [acceptRole, setAcceptRole] = useState("runner");
  const [sendAccept, setSendAccept] = useState(true);
  const [createMember, setCreateMember] = useState(true);

  const meta = useQuery({
    queryKey: ["business", "recruitment", teamId],
    queryFn: () => getRecruitment({ data: { teamId: teamId! } }),
    enabled: !!teamId,
  });

  const answerFilters = filterKey && filterValue ? [{ key: filterKey, op: filterOp as never, value: filterValue }] : [];
  const list = useQuery({
    queryKey: ["business", "applications", teamId, status, search, sort, filterKey, filterOp, filterValue],
    queryFn: () => listApplications({ data: { teamId: teamId!, status: status as never, search, sort: sort as never, answerFilters } }),
    enabled: !!teamId,
  });

  const detail = useQuery({
    queryKey: ["business", "application", openId],
    queryFn: () => getApplication({ data: { teamId: teamId!, id: openId! } }),
    enabled: !!openId && !!teamId,
  });

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["business", "applications"] });
    void qc.invalidateQueries({ queryKey: ["business", "recruitment"] });
    void qc.invalidateQueries({ queryKey: ["business", "application"] });
  };

  const accept = useMutation({
    mutationFn: (id: string) => acceptApplication({ data: { teamId: teamId!, id, role: acceptRole as never, sendEmail: sendAccept, createMember } }),
    onSuccess: () => { toast.success("Application accepted"); setAcceptOpen(false); setOpenId(null); setSelected([]); refresh(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const reject = useMutation({
    mutationFn: (ids: string[]) => rejectApplication({ data: { teamId: teamId!, ids, reason, sendEmail: sendReject } }),
    onSuccess: (res) => { toast.success(`${res.count} application(s) rejected`); setRejectOpen(false); setReason(""); setOpenId(null); setSelected([]); refresh(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const bulkStatus = useMutation({
    mutationFn: (next: string) => setApplicationStatus({ data: { teamId: teamId!, ids: selected, status: next as never } }),
    onSuccess: () => { toast.success("Applications updated"); setSelected([]); refresh(); },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!teamId) return <p className="text-sm text-muted-foreground">Create a team first in “Teams &amp; company”.</p>;

  const rows = list.data ?? [];
  const questions = meta.data?.questions ?? [];
  const capacity = meta.data?.capacity;
  const scoringOn = meta.data?.form?.['scoring_enabled'] === true;
  const app = detail.data?.application;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Team applications</h1>
        <p className="text-sm text-muted-foreground">
          {meta.data?.counts.all ?? 0} total · {meta.data?.counts.pending ?? 0} pending · {meta.data?.counts.accepted ?? 0} accepted · {meta.data?.counts.rejected ?? 0} rejected
        </p>
      </div>

      {capacity?.isFull && (
        <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-sm">
          Your team is full ({capacity.active}/{capacity.limit}). Free a slot or upgrade your plan before accepting more members.
        </div>
      )}

      <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 space-y-3">
        <div className="flex flex-wrap gap-2 items-center">
          <div className="relative flex-1 min-w-48">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input className="pl-9" placeholder="Search name, email, country, city" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="under_review">Under review</SelectItem>
              <SelectItem value="accepted">Accepted</SelectItem>
              <SelectItem value="rejected">Rejected</SelectItem>
              <SelectItem value="archived">Archived</SelectItem>
            </SelectContent>
          </Select>
          <Select value={sort} onValueChange={setSort}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="newest">Newest first</SelectItem>
              <SelectItem value="oldest">Oldest first</SelectItem>
              <SelectItem value="score">Highest score</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-wrap gap-2 items-center">
          <Filter className="w-4 h-4 text-muted-foreground" />
          <Select value={filterKey || "none"} onValueChange={(v) => setFilterKey(v === "none" ? "" : v)}>
            <SelectTrigger className="w-52"><SelectValue placeholder="Filter by answer" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">No answer filter</SelectItem>
              {questions.map((q) => <SelectItem key={String(q['id'])} value={String(q['field_key'])}>{String(q['label'])}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filterOp} onValueChange={setFilterOp}>
            <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="contains">contains</SelectItem>
              <SelectItem value="equals">is exactly</SelectItem>
              <SelectItem value="gte">is at least</SelectItem>
              <SelectItem value="lte">is at most</SelectItem>
            </SelectContent>
          </Select>
          <Input className="w-40" placeholder="Value" value={filterValue} onChange={(e) => setFilterValue(e.target.value)} />
        </div>

        {selected.length > 0 && (
          <div className="flex flex-wrap gap-2 items-center pt-2 border-t border-white/5">
            <span className="text-xs text-muted-foreground">{selected.length} selected</span>
            <Button size="sm" variant="secondary" onClick={() => bulkStatus.mutate("under_review")}>Mark under review</Button>
            <Button size="sm" variant="secondary" onClick={() => bulkStatus.mutate("archived")}>Archive</Button>
            <Button size="sm" variant="destructive" onClick={() => setRejectOpen(true)}>Reject selected</Button>
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-white/10 bg-white/[0.03] overflow-hidden">
        {list.isLoading ? (
          <div className="grid place-content-center py-16"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
        ) : rows.length === 0 ? (
          <p className="p-6 text-sm text-muted-foreground">No applications match this view yet.</p>
        ) : (
          <div className="divide-y divide-white/5">
            {rows.map((row) => {
              const id = String(row['id']);
              return (
                <div key={id} className="flex flex-wrap items-center gap-3 p-4 hover:bg-white/[0.02]">
                  <Checkbox checked={selected.includes(id)}
                    onCheckedChange={(v) => setSelected((s) => (v ? [...s, id] : s.filter((x) => x !== id)))} />
                  <button className="flex-1 min-w-48 text-left" onClick={() => setOpenId(id)}>
                    <p className="font-medium text-sm">{String(row['applicant_name'])}</p>
                    <p className="text-xs text-muted-foreground">{String(row['applicant_email'])}
                      {row['country'] ? ` · ${String(row['country'])}` : ""}{row['city'] ? `, ${String(row['city'])}` : ""}</p>
                  </button>
                  {scoringOn && (
                    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                      <Trophy className="w-3.5 h-3.5" />{Number(row['score'] ?? 0)}/{Number(row['score_max'] ?? 0)}
                    </span>
                  )}
                  <Badge variant={String(row['status']) === "accepted" ? "default" : String(row['status']) === "rejected" ? "destructive" : "secondary"}>
                    {STATUS_LABEL[String(row['status'])] ?? String(row['status'])}
                  </Badge>
                  <Button size="sm" variant="ghost" onClick={() => setOpenId(id)}>Review</Button>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* applicant detail */}
      <Dialog open={!!openId} onOpenChange={(v) => { if (!v) setOpenId(null); }}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{app ? String(app['applicant_name']) : "Application"}</DialogTitle></DialogHeader>
          {detail.isLoading || !app ? (
            <div className="grid place-content-center py-12"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div>
          ) : (
            <div className="space-y-5 text-sm">
              <div className="grid gap-2 sm:grid-cols-2">
                <p><span className="text-muted-foreground">Email:</span> {String(app['applicant_email'])}</p>
                <p><span className="text-muted-foreground">Phone:</span> {String(app['applicant_phone'] ?? "—")}</p>
                <p><span className="text-muted-foreground">Country:</span> {String(app['country'] ?? "—")}</p>
                <p><span className="text-muted-foreground">City:</span> {String(app['city'] ?? "—")}</p>
                <p><span className="text-muted-foreground">Status:</span> {STATUS_LABEL[String(app['status'])]}</p>
                <p><span className="text-muted-foreground">Submitted:</span> {new Date(String(app['submitted_at'])).toLocaleString()}</p>
                {scoringOn && <p><span className="text-muted-foreground">Score:</span> {Number(app['score'] ?? 0)}/{Number(app['score_max'] ?? 0)}</p>}
              </div>

              <div className="space-y-2">
                <p className="font-semibold">Answers</p>
                {(detail.data?.questions ?? []).map((q) => {
                  const answers = (app['answers'] ?? {}) as Record<string, unknown>;
                  const raw = answers[String(q['field_key'])];
                  const value = Array.isArray(raw) ? raw.map(String).join(", ") : raw === null || raw === undefined || raw === "" ? "—" : String(raw);
                  return (
                    <div key={String(q['id'])} className="rounded-lg bg-white/[0.03] px-3 py-2">
                      <p className="text-xs text-muted-foreground">{String(q['label'])}</p>
                      <p>{value}</p>
                    </div>
                  );
                })}
              </div>

              <div className="space-y-2">
                <p className="font-semibold">Activity</p>
                {(detail.data?.events ?? []).map((e) => (
                  <p key={String(e['id'])} className="text-xs text-muted-foreground">
                    {new Date(String(e['created_at'])).toLocaleString()} — {String(e['detail'] ?? e['event'])}
                  </p>
                ))}
              </div>

              {String(app['rejection_reason'] ?? "") && (
                <p className="text-xs text-destructive">Rejection reason: {String(app['rejection_reason'])}</p>
              )}
            </div>
          )}
          <DialogFooter className="flex-wrap gap-2">
            {app && String(app['status']) !== "accepted" && (
              <Button onClick={() => setAcceptOpen(true)}><CheckCircle2 className="w-4 h-4" />Accept application</Button>
            )}
            {app && String(app['status']) !== "rejected" && (
              <Button variant="destructive" onClick={() => { setSelected([String(app['id'])]); setRejectOpen(true); }}>
                <XCircle className="w-4 h-4" />Reject
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* accept confirmation */}
      <Dialog open={acceptOpen} onOpenChange={setAcceptOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Accept this application</DialogTitle></DialogHeader>
          <div className="space-y-4 text-sm">
            <div className="space-y-1.5">
              <Label className="text-xs">Team role</Label>
              <Select value={acceptRole} onValueChange={setAcceptRole}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="runner">Runner</SelectItem>
                  <SelectItem value="editor">Editor</SelectItem>
                  <SelectItem value="viewer">Viewer</SelectItem>
                  <SelectItem value="team_leader">Team leader</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2"><Switch checked={createMember} onCheckedChange={setCreateMember} />Create the team member account</div>
            <div className="flex items-center gap-2"><Switch checked={sendAccept} onCheckedChange={setSendAccept} />Send the acceptance email with setup instructions</div>
            <p className="text-xs text-muted-foreground">
              The new member gets a private one-time link to create their own password — no password is ever emailed or stored in plain text.
            </p>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAcceptOpen(false)}>Cancel</Button>
            <Button onClick={() => openId && accept.mutate(openId)} disabled={accept.isPending}>
              {accept.isPending ? <Loader2 className="animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}Accept
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* reject confirmation */}
      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Reject {selected.length > 1 ? `${selected.length} applications` : "application"}</DialogTitle></DialogHeader>
          <div className="space-y-4 text-sm">
            <div className="space-y-1.5">
              <Label className="text-xs">Reason (included in the email)</Label>
              <Textarea rows={4} value={reason} onChange={(e) => setReason(e.target.value)}
                placeholder="Unfortunately, your current internet speed does not meet our team requirements." />
            </div>
            <div className="flex items-center gap-2"><Switch checked={sendReject} onCheckedChange={setSendReject} />Send the rejection email</div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRejectOpen(false)}>Cancel</Button>
            <Button variant="destructive" disabled={reject.isPending}
              onClick={() => reject.mutate(selected.length ? selected : openId ? [openId] : [])}>
              {reject.isPending ? <Loader2 className="animate-spin" /> : <XCircle className="w-4 h-4" />}Reject application
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
