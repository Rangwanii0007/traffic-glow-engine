import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, Check, Copy, AlertCircle, Clock } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { createCryptoInvoice, getPaymentStatus, checkReferralCode } from "@/lib/nowpayments.functions";
import { Input } from "@/components/ui/input";
import { getStoredRef } from "@/lib/referral";
import { cn } from "@/lib/utils";

type Plan = { id: string; name: string; slug: string; price: number; duration_days: number };

const CRYPTOS = [
  { code: "btc", name: "Bitcoin", symbol: "BTC", color: "from-orange-500 to-amber-600" },
  { code: "eth", name: "Ethereum", symbol: "ETH", color: "from-blue-500 to-indigo-600" },
  { code: "usdttrc20", name: "USDT (TRC20)", symbol: "USDT", color: "from-emerald-500 to-teal-600" },
  { code: "usdterc20", name: "USDT (ERC20)", symbol: "USDT", color: "from-emerald-600 to-green-700" },
  { code: "ltc", name: "Litecoin", symbol: "LTC", color: "from-gray-400 to-slate-500" },
  { code: "bnbbsc", name: "BNB (BSC)", symbol: "BNB", color: "from-yellow-400 to-amber-500" },
];

type Invoice = Awaited<ReturnType<typeof createCryptoInvoice>>;

export function CryptoCheckoutModal({
  plan,
  open,
  onOpenChange,
}: {
  plan: Plan | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const createInvoice = useServerFn(createCryptoInvoice);
  const checkStatus = useServerFn(getPaymentStatus);
  const verifyRef = useServerFn(checkReferralCode);

  const [step, setStep] = useState<"select" | "pay" | "success">("select");
  const [selected, setSelected] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [status, setStatus] = useState<string>("waiting");
  const [secondsLeft, setSecondsLeft] = useState(20 * 60);
  const [refCode, setRefCode] = useState("");
  const [refState, setRefState] = useState<
    { status: "idle" | "checking" } | { status: "valid"; name: string | null; percent: number } | { status: "invalid"; reason: string }
  >({ status: "idle" });

  useEffect(() => {
    if (!open) {
      setStep("select");
      setSelected(null);
      setInvoice(null);
      setStatus("waiting");
      setSecondsLeft(20 * 60);
      setRefState({ status: "idle" });
    } else {
      const stored = getStoredRef();
      if (stored) setRefCode(stored);
    }
  }, [open]);

  async function applyRef() {
    const code = refCode.trim();
    if (!code) return;
    setRefState({ status: "checking" });
    try {
      const r = await verifyRef({ data: { code } });
      if (r.valid) setRefState({ status: "valid", name: r.referrerName, percent: r.discountPercent });
      else setRefState({ status: "invalid", reason: r.reason ?? "Invalid referral code" });
    } catch (e) {
      setRefState({ status: "invalid", reason: e instanceof Error ? e.message : "Could not verify code" });
    }
  }

  // countdown
  useEffect(() => {
    if (step !== "pay") return;
    const t = setInterval(() => setSecondsLeft((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, [step]);

  // poll status
  useEffect(() => {
    if (step !== "pay" || !invoice) return;
    const poll = async () => {
      try {
        const r = await checkStatus({ data: { paymentId: invoice.payment_id } });
        setStatus(r.status);
        if (r.status === "finished" || r.status === "confirmed") {
          setStep("success");
          toast.success("Payment confirmed! Premium activated.");
        } else if (r.status === "failed" || r.status === "expired") {
          toast.error(`Payment ${r.status}`);
        }
      } catch (e) {
        console.error(e);
      }
    };
    const t = setInterval(poll, 30000);
    return () => clearInterval(t);
  }, [step, invoice, checkStatus]);

  async function handleContinue() {
    if (!plan || !selected) return;
    setLoading(true);
    try {
      const inv = await createInvoice({
        data: {
          planId: plan.id,
          payCurrency: selected,
          referralCode: refState.status === "valid" ? refCode.trim() : null,
          successUrl: `${window.location.origin}/dashboard/billing?success=true`,
          cancelUrl: `${window.location.origin}/dashboard/billing?cancelled=true`,
        },
      });
      setInvoice(inv);
      setStep("pay");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to create invoice");
    } finally {
      setLoading(false);
    }
  }

  function copyAddress() {
    if (!invoice) return;
    navigator.clipboard.writeText(invoice.pay_address);
    toast.success("Address copied");
  }

  const mm = String(Math.floor(secondsLeft / 60)).padStart(2, "0");
  const ss = String(secondsLeft % 60).padStart(2, "0");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg bg-gradient-to-br from-[oklch(0.13_0.03_270)] to-[oklch(0.09_0.02_270)] border border-white/10 text-foreground">
        <DialogHeader>
          <DialogTitle className="text-xl">
            {step === "select" && `Pay with crypto — ${plan?.name}`}
            {step === "pay" && "Send payment"}
            {step === "success" && "Payment confirmed"}
          </DialogTitle>
          {plan && step === "select" && (
            <p className="text-sm text-muted-foreground">
              {refState.status === "valid" ? (
                <>
                  <span className="line-through opacity-60">${plan.price.toFixed(2)}</span>{" "}
                  <span className="text-success font-semibold">
                    ${(plan.price * (1 - refState.percent / 100)).toFixed(2)}
                  </span>{" "}
                  · {plan.duration_days} days · {refState.percent}% off
                </>
              ) : (
                <>
                  ${plan.price.toFixed(2)} · {plan.duration_days} days
                </>
              )}
            </p>
          )}
        </DialogHeader>

        {step === "select" && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              {CRYPTOS.map((c) => {
                const sel = selected === c.code;
                return (
                  <button
                    key={c.code}
                    onClick={() => setSelected(c.code)}
                    className={cn(
                      "relative p-4 rounded-xl border text-left transition-all",
                      sel
                        ? "border-primary bg-primary/10 ring-2 ring-primary/40"
                        : "border-white/10 hover:border-white/30 hover:bg-white/5",
                    )}
                  >
                    <div className={cn("w-9 h-9 rounded-lg bg-gradient-to-br grid place-content-center font-bold text-white text-xs mb-2", c.color)}>
                      {c.symbol}
                    </div>
                    <p className="text-sm font-medium">{c.name}</p>
                    {sel && (
                      <Check className="absolute top-2 right-2 w-4 h-4 text-primary" />
                    )}
                  </button>
                );
              })}
            </div>
            <div className="space-y-2 rounded-xl border border-white/10 bg-white/5 p-3">
              <p className="text-xs uppercase tracking-wider text-muted-foreground">
                Referral code (optional) — get 5% off
              </p>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Input
                  value={refCode}
                  onChange={(e) => {
                    setRefCode(e.target.value);
                    setRefState({ status: "idle" });
                  }}
                  placeholder="friend-code"
                  className="flex-1 bg-transparent"
                  autoCapitalize="none"
                  autoCorrect="off"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={applyRef}
                  disabled={!refCode.trim() || refState.status === "checking"}
                  className="sm:w-28"
                >
                  {refState.status === "checking" ? <Loader2 className="w-4 h-4 animate-spin" /> : "Apply"}
                </Button>
              </div>
              {refState.status === "valid" && (
                <p className="text-xs text-success flex items-center gap-1">
                  <Check className="w-3 h-3" />
                  {refState.percent}% discount applied
                  {refState.name ? ` — invited by ${refState.name}` : ""}
                </p>
              )}
              {refState.status === "invalid" && (
                <p className="text-xs text-destructive flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" /> {refState.reason}
                </p>
              )}
            </div>

            <Button
              onClick={handleContinue}
              disabled={!selected || loading}
              className="w-full bg-gradient-to-r from-primary to-accent text-white hover:opacity-90"
            >
              {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Continue
            </Button>
          </div>
        )}

        {step === "pay" && invoice && (
          <div className="space-y-4">
            <div className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-2 text-muted-foreground">
                <Clock className="w-4 h-4" /> Expires in
              </span>
              <span className="font-mono font-medium">{mm}:{ss}</span>
            </div>

            <div className="rounded-2xl bg-white p-4 grid place-content-center">
              <QRCodeSVG value={invoice.pay_address} size={180} />
            </div>

            <div className="space-y-1">
              <p className="text-xs text-muted-foreground uppercase tracking-wider">Amount</p>
              <p className="text-2xl font-bold">
                {invoice.pay_amount} <span className="text-base text-muted-foreground uppercase">{invoice.pay_currency}</span>
              </p>
            </div>

            <div className="space-y-1">
              <p className="text-xs text-muted-foreground uppercase tracking-wider">Wallet address</p>
              <div className="flex items-center gap-2 p-3 rounded-lg bg-white/5 border border-white/10">
                <code className="text-xs break-all flex-1">{invoice.pay_address}</code>
                <Button size="sm" variant="ghost" onClick={copyAddress}>
                  <Copy className="w-4 h-4" />
                </Button>
              </div>
            </div>

            <div className="flex items-start gap-2 p-3 rounded-lg bg-warning/10 border border-warning/30 text-xs">
              <AlertCircle className="w-4 h-4 text-warning shrink-0 mt-0.5" />
              <span>
                Send <strong>exactly</strong> {invoice.pay_amount} {invoice.pay_currency.toUpperCase()} via the{" "}
                {invoice.pay_currency.toUpperCase()} network only. Status: <strong>{status}</strong>.
              </span>
            </div>

            <Button
              variant="outline"
              className="w-full"
              onClick={async () => {
                const r = await checkStatus({ data: { paymentId: invoice.payment_id } });
                setStatus(r.status);
                toast.info(`Status: ${r.status}`);
              }}
            >
              Check payment status
            </Button>
          </div>
        )}

        {step === "success" && (
          <div className="text-center py-6 space-y-3">
            <div className="w-16 h-16 mx-auto rounded-full bg-success/20 grid place-content-center">
              <Check className="w-8 h-8 text-success" />
            </div>
            <p className="font-semibold">Premium activated</p>
            <p className="text-sm text-muted-foreground">Your subscription is now active.</p>
            <Button
              onClick={() => onOpenChange(false)}
              className="bg-gradient-to-r from-primary to-accent text-white"
            >
              Go to dashboard
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
