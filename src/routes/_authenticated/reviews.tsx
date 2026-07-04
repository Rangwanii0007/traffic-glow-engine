import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Star, Send, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";
import { Navbar } from "@/components/landing/Navbar";
import { Footer } from "@/components/landing/Footer";
import { Reviews as MarketingReviews } from "@/components/landing/Reviews";

export const Route = createFileRoute("/_authenticated/reviews")({
  head: () => ({ meta: [{ title: "Reviews — AD4YOU" }] }),
  component: ReviewsPage,
});

type Review = {
  id: string; user_id: string; rating: number; message: string; created_at: string;
  users?: { full_name: string | null; email: string; avatar_url: string | null } | null;
};

const REVIEW_NAMES = [
  "Marcus T.", "Priya S.", "Lukas B.", "Sofia R.", "Ahmed K.", "Yuki H.", "Daniel O.", "Elena P.", "James C.", "Carlos M.",
  "Maya R.", "Noah P.", "Aditi K.", "Kenji W.", "Fatima A.", "Rafael S.", "Nadia B.", "Wei L.", "Omar H.", "Emma V.",
  "Ivan D.", "Grace N.", "Chen Z.", "Luana F.", "Ava M.", "Hiro T.", "Diego C.", "Amara J.", "Khalid R.", "Nora E.",
];

const REVIEW_TEMPLATES: Record<number, string[]> = {
  1: [
    "Bad experience for my setup. I could not get stable earnings and support took longer than expected.",
    "Not good for my traffic source. I had issues with setup and did not see profit.",
    "I expected more. My GEO mix was poor and the first week results were disappointing.",
  ],
  2: [
    "Some useful ideas, but I had proxy and session issues. Earnings improved only a little.",
    "The dashboard is good, but my low-tier traffic did not perform well. Needs careful setup.",
    "A little better than manual testing, but not enough for my sites yet.",
  ],
  3: [
    "Decent tool. I started around $38 daily and reached about $96 after tuning, but it took time.",
    "Good for learning traffic quality. My earnings are still small, around $55 to $120 daily.",
    "Average result on my small blog network. Some days are good, some days are slow.",
  ],
  4: [
    "Strong platform after tuning. My daily revenue moved from $130 to $280 with cleaner traffic routing.",
    "Very good results for Adsterra and Monetag. Monthly income now stays around $2,500 to $3,400.",
    "The traffic machine helped me scale without guessing. I now earn between $170 and $360 most days.",
  ],
  5: [
    "Excellent. I earned $130 to $500 daily after applying the AI recommendations to my ad placements.",
    "Premium plan paid back fast. My monthly earnings increased to around $2,800 to $4,000.",
    "Best ad revenue tool I have used. Tier-1 traffic optimization pushed my daily profit above $420.",
    "AD4YOU changed my publisher business. I now see consistent $250 to $500 days with better quality traffic.",
  ],
};

function amountText(message: string, index: number) {
  const dailyLow = 130 + ((index * 17) % 90);
  const dailyHigh = 300 + ((index * 29) % 201);
  const monthlyLow = 2500 + ((index * 137) % 700);
  const monthlyHigh = 3400 + ((index * 173) % 601);
  return message
    .replace("$130 to $500", `$${dailyLow} to $${dailyHigh}`)
    .replace("$2,800 to $4,000", `$${monthlyLow} to $${monthlyHigh}`)
    .replace("$2,500 to $3,400", `$${monthlyLow} to $${monthlyHigh}`)
    .replace("$250 to $500", `$${dailyLow + 80} to $${dailyHigh}`)
    .replace("$420", `$${dailyHigh}`);
}

const DEMO_REVIEWS: Review[] = Array.from({ length: 124 }, (_, index) => {
  const rating = index < 3 ? 1 : index < 10 ? 2 : index < 27 ? 3 : index < 65 ? 4 : 5;
  const name = REVIEW_NAMES[index % REVIEW_NAMES.length];
  const template = REVIEW_TEMPLATES[rating][index % REVIEW_TEMPLATES[rating].length];
  return {
    id: `demo-review-${index}`,
    user_id: `demo-user-${index}`,
    rating,
    message: amountText(template, index),
    created_at: new Date(Date.now() - index * 36 * 60 * 60 * 1000).toISOString(),
    users: { full_name: name, email: `${name.toLowerCase().replace(/[^a-z]/g, "")}@publisher.example`, avatar_url: null },
  };
});

function StarRow({ value, onChange, size = "md" }: { value: number; onChange?: (n: number) => void; size?: "sm" | "md" | "lg" }) {
  const [hover, setHover] = useState(0);
  const cls = size === "lg" ? "w-8 h-8" : size === "sm" ? "w-3.5 h-3.5" : "w-5 h-5";
  return (
    <div className="flex items-center gap-1">
      {[1,2,3,4,5].map((n) => (
        <button
          key={n} type="button" disabled={!onChange}
          onMouseEnter={() => onChange && setHover(n)}
          onMouseLeave={() => setHover(0)}
          onClick={() => onChange?.(n)}
          className={cn("transition-transform", onChange && "hover:scale-125 cursor-pointer", !onChange && "cursor-default")}
        >
          <Star className={cn(cls, "transition-colors", (hover || value) >= n ? "fill-amber-400 text-amber-400" : "text-white/20")} />
        </button>
      ))}
    </div>
  );
}

function ReviewsPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [rating, setRating] = useState(0);
  const [message, setMessage] = useState("");

  const { data: reviews = [], isLoading } = useQuery({
    queryKey: ["reviews", "all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("reviews")
        .select("id, user_id, rating, message, created_at, users:user_id(full_name, email, avatar_url)")
        .order("rating", { ascending: false })
        .order("created_at", { ascending: false });
      if (error) {
        toast.error(error.message.includes("schema cache") ? "Backend reviews table is missing. Run the repair SQL, then refresh." : error.message);
        return [];
      }
      return (data ?? []) as unknown as Review[];
    },
  });

  const myReview = useMemo(() => reviews.find((r) => r.user_id === user?.id), [reviews, user]);

  const submit = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Not signed in");
      if (rating < 1) throw new Error("Please pick a star rating");
      if (message.trim().length < 5) throw new Error("Tell the community a bit more");
      const payload = { user_id: user.id, rating, message: message.trim() };
      const { error } = await supabase.from("reviews").upsert(payload, { onConflict: "user_id" });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(myReview ? "Review updated!" : "Thanks for your review!");
      setMessage("");
      qc.invalidateQueries({ queryKey: ["reviews"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const displayReviews = useMemo(() => {
    const existing = new Set(reviews.map((r) => r.id));
    return [...reviews, ...DEMO_REVIEWS.filter((r) => !existing.has(r.id))];
  }, [reviews]);

  const sorted = [...displayReviews].sort((a, b) => {
    if (b.rating !== a.rating) return b.rating - a.rating;
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });

  const avg = displayReviews.length ? displayReviews.reduce((s, r) => s + r.rating, 0) / displayReviews.length : 0;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Navbar />
      <main className="pt-24">
        {/* Marketing hero (same as homepage) */}
        <MarketingReviews />

        {/* Community section */}
        <section className="relative pb-24 px-4 sm:px-6">
          <div className="max-w-6xl mx-auto">
            <div className="text-center mb-10">
              <h2 className="text-3xl sm:text-4xl font-black tracking-tight">Community Reviews</h2>
              <p className="text-sm text-muted-foreground mt-2">Rate your experience and read what others say about the AD4YOU traffic machine.</p>
            </div>

            <div className="grid gap-6 lg:grid-cols-[1fr_1.4fr]">
              <div className="rounded-2xl border border-white/10 bg-gradient-to-b from-white/5 to-transparent p-6 backdrop-blur-xl">
                <div className="flex items-center gap-2 mb-1">
                  <Sparkles className="w-4 h-4 text-primary" />
                  <h3 className="font-semibold">{myReview ? "Update your review" : "Tell the community"}</h3>
                </div>
                <p className="text-sm text-muted-foreground mb-5">About the AD4YOU Traffic Machine</p>

                <div className="space-y-4">
                  <div>
                    <p className="text-xs text-muted-foreground mb-2">Your rating</p>
                    <StarRow value={rating || myReview?.rating || 0} onChange={setRating} size="lg" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-2">Your review</p>
                    <Textarea
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      placeholder={myReview?.message || "How has AD4YOU changed your ad revenue?"}
                      rows={5}
                      className="bg-white/5 border-white/10 focus-visible:ring-primary/40 resize-none"
                    />
                  </div>
                  <Button
                    onClick={() => submit.mutate()}
                    disabled={submit.isPending}
                    className="w-full h-11 bg-gradient-to-r from-primary to-accent text-white font-semibold"
                  >
                    {submit.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Send className="w-4 h-4 mr-2" />{myReview ? "Update review" : "Submit review"}</>}
                  </Button>
                </div>
              </div>

              <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-6 backdrop-blur-xl">
                <div className="flex items-center justify-between mb-5">
                  <div>
                    <h3 className="font-semibold">Latest reviews</h3>
                    <p className="text-xs text-muted-foreground">Highest-rated shown first</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <StarRow value={Math.round(avg)} />
                    <span className="text-sm font-bold">{avg.toFixed(1)}</span>
                    <span className="text-xs text-muted-foreground">({displayReviews.length})</span>
                  </div>
                </div>

                {isLoading ? (
                  <div className="flex justify-center py-12"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
                ) : sorted.length === 0 ? (
                  <p className="text-center py-12 text-sm text-muted-foreground">No reviews yet — be the first!</p>
                ) : (
                  <div className="space-y-3 max-h-[560px] overflow-y-auto pr-2">
                    {sorted.map((r) => {
                      const isMine = r.user_id === user?.id;
                      const name = r.users?.full_name || r.users?.email?.split("@")[0] || "Anonymous";
                      const initial = (name || "?").charAt(0).toUpperCase();
                      return (
                        <div key={r.id} className={cn(
                          "rounded-xl border p-4 transition-colors",
                          isMine ? "border-primary/40 bg-primary/5" : "border-white/10 bg-white/[0.02] hover:bg-white/[0.04]",
                        )}>
                          <div className="flex items-start gap-3">
                            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary to-accent grid place-content-center text-sm font-bold shrink-0">
                              {initial}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <p className="font-medium text-sm">{name}</p>
                                {isMine && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary/20 text-primary">You</span>}
                                <StarRow value={r.rating} size="sm" />
                              </div>
                              <p className="text-sm text-muted-foreground mt-1.5 whitespace-pre-wrap break-words">{r.message}</p>
                              <p className="text-[11px] text-muted-foreground/70 mt-2">{new Date(r.created_at).toLocaleDateString()}</p>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
