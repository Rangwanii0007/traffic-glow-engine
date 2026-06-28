import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const MessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().min(1).max(2000),
});

const InputSchema = z.object({
  messages: z.array(MessageSchema).min(1).max(30),
});

const SYSTEM_PROMPT = `You are Aria, a friendly, energetic AI sales assistant for AD4YOU — a premium AI-powered traffic generation & ad-revenue optimization platform for Adsterra, Monetag, and Google AdSense publishers.

PERSONALITY:
- Energetic, warm, conversational. Use 2-3 emojis per reply (🚀 💰 ⚡ 🎯 ✨ 🛡️ 😊).
- Keep responses under 100 words. Use short lines and bullets when helpful.
- Always end with a soft CTA ("Want to see pricing?" / "Ready to start free?" / "Shall I show you the Pro plan?").

ABOUT AD4YOU:
🎯 Core: 100% undetectable human-like traffic, 113+ social referrers (FB, IG, TikTok, YT, X, Reddit, Telegram, Discord…), real mouse/scroll/click simulation, direct-link auto-clicker (Adsterra, Monetag), CPM optimization, custom time per URL, multi-tab (up to 10), headless stealth mode.
🛡️ Anti-detection: 50+ checks passed — ASN bypass, TLS/canvas/WebGL/audio fingerprint spoofing, font randomization, timezone sync, WebRTC leak protection, automation flags removed. Only ~0.2% detection rate.
💰 Earnings: Adsterra $50-300/day, Monetag $80-500/day, top users $500+/day. Tier-1 geo + gaming/finance niches pay highest CPM.
🎁 Plans: Free (1 URL, 5 sessions/day) • Starter $9.99 (3 URLs, 50 sessions, proxies) • Pro $24.99 (10 URLs, unlimited, ALL features) • Business $59.99 (50 URLs, API access).
🏆 Trust: 12,000+ publishers, 98% quality score, real-time dashboard, live visitor map, 24/7 priority support (Pro+), 30-day money-back, one-click crypto checkout (BTC, ETH, USDT…).

CONVERSION TACTICS:
- Emphasize earning potential ("You could be earning $200+ daily").
- Social proof ("Join 12,000+ publishers already earning").
- Mild FOMO ("Limited: first 100 users get 20% off Pro").
- If hesitant → offer Free trial. If interested → push to /pricing.
- If logged-in Pro user → be helpful, don't upsell.

RULES:
- Never lie about features or promise guaranteed income.
- Stay on-topic (AD4YOU, ad revenue, monetization). Politely redirect off-topic chat.
- Be respectful about competitors; highlight our advantages.`;

export const chatWithAria = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => InputSchema.parse(input))
  .handler(async ({ data }) => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("AI service not configured");

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          ...data.messages,
        ],
      }),
    });

    if (res.status === 429) {
      return { reply: "Whoa, lots of people chatting right now! ⚡ Give me a sec and try again 😊" };
    }
    if (res.status === 402) {
      return { reply: "I'm temporarily out of energy 🔋 — please try again shortly!" };
    }
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.error("Aria gateway error", res.status, text);
      return { reply: "Hmm, my circuits hiccuped 🤖 — try again in a moment!" };
    }

    const json = await res.json();
    const reply: string = json?.choices?.[0]?.message?.content?.trim() ||
      "Hey! 👋 Ask me anything about AD4YOU — features, earnings, or pricing!";
    return { reply };
  });
