import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BadgeDollarSign, KeyRound, Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { NoTeamNotice, useBusiness } from "@/components/business/Shell";
import { createMemberLoginAccount, creditMember, listTeamMemberEarnings } from "@/lib/team-earnings.functions";
import { money, qty } from "@/lib/money";

export const Route = createFileRoute("/_authenticated/business/team-earnings")({
  head: () => ({
    meta: [
      { title: "Team Earnings — AD4YOU Business Panel" },
      { name: "description", content: "See what every team member earned, add manual bonuses and create their web login accounts." },
      { property: "og:title", content: "Team Earnings — AD4YOU Business Panel" },
      { property: "og:description", content: "Live earnings, balances and payout totals for every member of your team." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: TeamEarningsPage,
});

const ENTRY_TYPES = [
  { value: "bonus", label: "Bonus" },
  { value: "manual", label: "Manual credit" },
  { value: "task", label: "Task / point" },
  { value: "ad_view", label: "Ad view" },
  { value: "ad_click", label: "Ad click" },
  { value: "visit", label: "Website visit" },
  { value: "adjustment", label: "Adjustment (can be negative)" },
] as const;

function TeamEarningsPage() {
  const { teamId } = useBusiness();
  const qc = useQueryClient();
  const key = ["business", "member-earnings", teamId ?? ""];
  const query = useQuery({
    queryKey: key,
    queryFn: () => listTeamMemberEarnings({ data: { teamId: teamId! } }),
    enabled: !!teamId,
  });

  const [creditFor, setCreditFor] = useState<{ id: string; name: string } | null>(null);
  const [entryType, setEntryType] = useState<string>("bonus");
  const [amount, setAmount] = useState("");
  const [quantity, setQuantity] = useState("0");
  const [note, setNote] = useState("");

  const [accountFor, setAccountFor] = useState<{ id: string; name: string } | null>(null);
  const [password, setPassword] = useState("");

  const credit = useMutation({
    mutationFn: () =>
      creditMember({
        data: {
          teamId: teamId!, memberId: creditFor!.id,
          entryType: entryType as "bonus", quantity: Number(quantity) || 0,
          amount: Number(amount), note: note || undefined,
        },
      }),
    onSuccess: () => { toast.success("Balance updated"); setCreditFor(null); setAmount(""); setQuantity("0"); setNote(""); void qc.invalidateQueries({ queryKey: key }); },
    onError: (error: Error) => toast.error(error.message),
  });

  const makeAccount = useMutation({
    mutationFn: () => createMemberLoginAccount({ data: { teamId: teamId!, memberId: accountFor!.id, password } }),
    onSuccess: () => { toast.success("Login account created"); setAccountFor(null); setPassword(""); void qc.invalidateQueries({ queryKey: key }); },
    onError: (error: Error) => toast.error(error.message),
  });

  if (!teamId) return <NoTeamNotice />;
  const s = query.data?.rates.currency_symbol ?? "$";
  const t = query.data?.totals;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Team earnings</h1>
        <p className="text-sm text-muted-foreground">Balances update automatically from bot activity; you can also add bonuses by hand.</p>
      </div>

      {query.isLoading ? <Skeleton className="h-64 rounded-2xl" /> : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { label: "Members", value: qty(t?.members ?? 0) },
              { label: "Total earned", value: money(t?.earnings, s) },
              { label: "Unpaid balance", value: money(t?.balance, s) },
              { label: "Paid out", value: money(t?.paid, s) },
            ].map((c) => (
              <div key={c.label} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                <p className="text-xs text-muted-foreground">{c.label}</p>
                <p className="text-xl font-bold mt-1">{c.value}</p>
              </div>
            ))}
          </div>

          <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 sm:p-6">
            <div className="flex items-center gap-2 mb-3"><BadgeDollarSign className="w-4 h-4 text-primary" /><h2 className="font-semibold">Per member</h2></div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[860px]">
                <thead className="text-xs text-muted-foreground text-left">
                  <tr>
                    <th className="p-2">Member</th><th className="p-2">Role</th><th className="p-2">Actions</th><th className="p-2">This month</th>
                    <th className="p-2">Total earned</th><th className="p-2">Balance</th><th className="p-2">Pending</th><th className="p-2">Paid</th><th className="p-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {(query.data?.rows ?? []).length === 0 ? (
                    <tr><td colSpan={9} className="p-6 text-center text-xs text-muted-foreground">No members yet — add them in Team Members.</td></tr>
                  ) : (query.data?.rows ?? []).map((r) => (
                    <tr key={String(r['id'])} className="border-t border-white/5">
                      <td className="p-2">
                        <span className="flex items-center gap-2">
                          <span className={`w-2 h-2 rounded-full ${r['is_online'] ? "bg-emerald-400" : "bg-white/20"}`} />
                          <span>
                            {String(r['name'] ?? "Member")}
                            <span className="block text-[11px] text-muted-foreground">{String(r['email'] ?? "")}</span>
                          </span>
                        </span>
                      </td>
                      <td className="p-2 capitalize text-muted-foreground">{String(r['role'] ?? "").replace("_", " ")}</td>
                      <td className="p-2">{qty(r.tasks)}</td>
                      <td className="p-2">{money(r.monthEarnings, s)}</td>
                      <td className="p-2">{money(r.totalEarnings, s)}</td>
                      <td className="p-2 font-medium text-primary">{money(r.balance, s)}</td>
                      <td className="p-2">{money(r.pending, s)}</td>
                      <td className="p-2">{money(r.paid, s)}</td>
                      <td className="p-2">
                        <div className="flex gap-1 justify-end">
                          <Button size="sm" variant="outline" onClick={() => { setCreditFor({ id: String(r['id']), name: String(r['name'] ?? "Member") }); setEntryType("bonus"); }}>
                            <Plus className="w-3.5 h-3.5" />Credit
                          </Button>
                          {!r.hasAccount ? (
                            <Button size="sm" variant="ghost" onClick={() => setAccountFor({ id: String(r['id']), name: String(r['name'] ?? "Member") })}>
                              <KeyRound className="w-3.5 h-3.5" />Login
                            </Button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}

      <Dialog open={!!creditFor} onOpenChange={(o) => !o && setCreditFor(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add earnings for {creditFor?.name}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5"><Label className="text-xs">Type</Label>
              <Select value={entryType} onValueChange={setEntryType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{ENTRY_TYPES.map((e) => <SelectItem key={e.value} value={e.value}>{e.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5"><Label className="text-xs">Amount ({s})</Label>
                <Input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} /></div>
              <div className="space-y-1.5"><Label className="text-xs">Actions counted</Label>
                <Input type="number" min={0} value={quantity} onChange={(e) => setQuantity(e.target.value)} /></div>
            </div>
            <div className="space-y-1.5"><Label className="text-xs">Note for the member</Label>
              <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Weekly performance bonus" /></div>
            <Button
              className="w-full"
              disabled={credit.isPending}
              onClick={() => { if (!Number(amount)) return toast.error("Enter an amount"); credit.mutate(); }}
            >
              {credit.isPending ? <Loader2 className="animate-spin" /> : <Plus className="w-4 h-4" />}Add to balance
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!accountFor} onOpenChange={(o) => !o && setAccountFor(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Create web login for {accountFor?.name}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              This creates a real AD4YOU account with their email so they can sign in on the website as well as the software.
            </p>
            <div className="space-y-1.5"><Label className="text-xs">Password (at least 8 characters)</Label>
              <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} /></div>
            <Button
              className="w-full"
              disabled={makeAccount.isPending}
              onClick={() => { if (password.length < 8) return toast.error("Use at least 8 characters"); makeAccount.mutate(); }}
            >
              {makeAccount.isPending ? <Loader2 className="animate-spin" /> : <KeyRound className="w-4 h-4" />}Create account
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
