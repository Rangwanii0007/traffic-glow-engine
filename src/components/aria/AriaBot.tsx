import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { Send, X, Minus, Sparkles } from "lucide-react";
import { chatWithAria } from "@/lib/aria.functions";
import ariaAsset from "@/assets/aria-robot.png.asset.json";

type Msg = { role: "user" | "assistant"; content: string; ts: number };

const STORAGE_KEY = "aria_chat_v1";
const SEEN_KEY = "aria_seen_v1";
const MAX_MSGS = 50;

const QUICK_ACTIONS = [
  { emoji: "🚀", label: "What can AD4YOU do?", q: "What can AD4YOU do for me?" },
  { emoji: "💰", label: "How much can I earn?", q: "How much money can I realistically earn?" },
  { emoji: "🛡️", label: "Is it safe & undetectable?", q: "Is the bot safe and truly undetectable?" },
  { emoji: "💎", label: "Show me pricing", q: "What are your pricing plans?" },
];

const GREETING: Msg = {
  role: "assistant",
  content: "Hey there! 👋 I'm Aria, your AD4YOU AI assistant 🤖 Ask me anything — features, earnings, or pricing. Ready to start earning? ✨",
  ts: Date.now(),
};

export function AriaBot() {
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const [bubble, setBubble] = useState<string | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [typing, setTyping] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const chat = useServerFn(chatWithAria);

  useEffect(() => {
    setMounted(true);
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setMessages(JSON.parse(raw));
      else setMessages([GREETING]);
    } catch {
      setMessages([GREETING]);
    }

    const seen = localStorage.getItem(SEEN_KEY);
    const bubbles = seen
      ? ["Need help? 😊"]
      : ["Hey! 👋 Welcome to AD4YOU!", "I'm Aria, your AI assistant 🤖", "Ask me anything to start earning! ✨"];

    let i = 0;
    const showNext = () => {
      if (i >= bubbles.length) {
        setTimeout(() => setBubble(null), 4000);
        return;
      }
      setBubble(bubbles[i]);
      i++;
      setTimeout(showNext, 3200);
    };
    const t = setTimeout(showNext, seen ? 8000 : 3000);
    localStorage.setItem(SEEN_KEY, "1");
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (messages.length > 0) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(messages.slice(-MAX_MSGS)));
      } catch {}
    }
  }, [messages]);

  useEffect(() => {
    if (open && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, typing, open]);

  useEffect(() => {
    if (open) {
      setBubble(null);
      setTimeout(() => inputRef.current?.focus(), 200);
    }
  }, [open]);

  const send = async (text: string) => {
    const trimmed = text.trim().slice(0, 500);
    if (!trimmed || typing) return;
    const userMsg: Msg = { role: "user", content: trimmed, ts: Date.now() };
    const next = [...messages, userMsg];
    setMessages(next);
    setInput("");
    setTyping(true);
    try {
      const history = next
        .filter((m) => m !== GREETING)
        .slice(-12)
        .map((m) => ({ role: m.role, content: m.content }));
      const res = await chat({ data: { messages: history } });
      setMessages((prev) => [...prev, { role: "assistant", content: res.reply, ts: Date.now() }]);
    } catch (e) {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Oops, connection glitch 🤖 — try again!", ts: Date.now() },
      ]);
    } finally {
      setTyping(false);
    }
  };

  if (!mounted) return null;

  return (
    <div
      className="fixed z-[9999] pointer-events-none"
      style={{ bottom: "24px", right: "24px" }}
    >
      {/* Chat panel */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.92 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.92 }}
            transition={{ type: "spring", stiffness: 260, damping: 24 }}
            className="pointer-events-auto absolute bottom-[150px] right-0 w-[min(380px,calc(100vw-32px))] h-[min(560px,calc(100vh-200px))] rounded-[20px] overflow-hidden flex flex-col"
            style={{
              background: "linear-gradient(180deg, oklch(0.18 0.04 280 / 0.95), oklch(0.12 0.03 270 / 0.95))",
              backdropFilter: "blur(24px)",
              border: "1px solid transparent",
              backgroundClip: "padding-box",
              boxShadow:
                "0 30px 80px -20px oklch(0 0 0 / 0.6), 0 0 0 1px oklch(0.7 0.2 295 / 0.3), 0 0 60px oklch(0.6 0.24 280 / 0.25)",
            }}
          >
            {/* Gradient border overlay */}
            <div
              className="pointer-events-none absolute inset-0 rounded-[20px]"
              style={{
                padding: "1.5px",
                background: "linear-gradient(135deg, oklch(0.7 0.2 295), oklch(0.7 0.18 200), oklch(0.7 0.22 245))",
                WebkitMask: "linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)",
                WebkitMaskComposite: "xor",
                maskComposite: "exclude",
              }}
            />

            {/* Header */}
            <div className="relative flex items-center gap-3 px-4 py-3 border-b border-white/10">
              <div className="relative w-11 h-11 rounded-full overflow-hidden bg-gradient-to-br from-[oklch(0.6_0.24_280)] to-[oklch(0.55_0.2_220)] flex items-center justify-center">
                <img src={ariaAsset.url} alt="Aria" className="w-12 h-12 object-contain -mb-1" />
                <span className="absolute bottom-0 right-0 w-3 h-3 rounded-full bg-emerald-400 ring-2 ring-[oklch(0.15_0.04_280)] animate-pulse" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-white font-semibold text-sm flex items-center gap-1.5">
                  Aria <Sparkles className="w-3.5 h-3.5 text-[oklch(0.78_0.2_295)]" />
                </div>
                <div className="text-[11px] text-emerald-400 flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" /> Online · AI Assistant
                </div>
              </div>
              <button
                onClick={() => setOpen(false)}
                aria-label="Minimize"
                className="w-8 h-8 grid place-items-center rounded-lg text-white/60 hover:text-white hover:bg-white/10 transition"
              >
                <Minus className="w-4 h-4" />
              </button>
              <button
                onClick={() => setOpen(false)}
                aria-label="Close"
                className="w-8 h-8 grid place-items-center rounded-lg text-white/60 hover:text-white hover:bg-white/10 transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Quick actions */}
            <div className="relative px-3 pt-3 pb-1 flex flex-wrap gap-1.5">
              {QUICK_ACTIONS.map((qa) => (
                <button
                  key={qa.label}
                  onClick={() => send(qa.q)}
                  disabled={typing}
                  className="text-[11px] px-2.5 py-1.5 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 text-white/80 hover:text-white transition disabled:opacity-50"
                >
                  <span className="mr-1">{qa.emoji}</span>
                  {qa.label}
                </button>
              ))}
            </div>

            {/* Messages */}
            <div ref={scrollRef} className="relative flex-1 overflow-y-auto px-3 py-3 space-y-3 scrollbar-thin">
              {messages.map((m, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={`flex gap-2 ${m.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  {m.role === "assistant" && (
                    <div className="w-7 h-7 rounded-full overflow-hidden bg-gradient-to-br from-[oklch(0.6_0.24_280)] to-[oklch(0.55_0.2_220)] flex-shrink-0 flex items-center justify-center">
                      <img src={ariaAsset.url} alt="" className="w-8 h-8 object-contain -mb-0.5" />
                    </div>
                  )}
                  <div
                    className={`max-w-[78%] px-3.5 py-2.5 rounded-2xl text-[13.5px] leading-relaxed whitespace-pre-wrap ${
                      m.role === "user"
                        ? "bg-gradient-to-br from-[oklch(0.6_0.24_295)] to-[oklch(0.5_0.22_245)] text-white rounded-br-md"
                        : "bg-white/[0.06] border border-white/10 text-white/90 rounded-bl-md"
                    }`}
                  >
                    {m.content}
                  </div>
                </motion.div>
              ))}
              {typing && (
                <div className="flex gap-2 justify-start">
                  <div className="w-7 h-7 rounded-full overflow-hidden bg-gradient-to-br from-[oklch(0.6_0.24_280)] to-[oklch(0.55_0.2_220)] flex items-center justify-center">
                    <img src={ariaAsset.url} alt="" className="w-8 h-8 object-contain -mb-0.5" />
                  </div>
                  <div className="bg-white/[0.06] border border-white/10 rounded-2xl rounded-bl-md px-4 py-3 flex items-center gap-1">
                    {[0, 1, 2].map((i) => (
                      <motion.span
                        key={i}
                        className="w-1.5 h-1.5 rounded-full bg-white/60"
                        animate={{ y: [0, -4, 0], opacity: [0.4, 1, 0.4] }}
                        transition={{ duration: 0.9, repeat: Infinity, delay: i * 0.15 }}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Pricing CTA */}
            <Link
              to="/pricing"
              className="relative mx-3 mb-2 text-center text-[11.5px] py-1.5 rounded-lg bg-gradient-to-r from-[oklch(0.6_0.24_295)]/20 to-[oklch(0.5_0.22_245)]/20 border border-[oklch(0.7_0.2_295)]/30 text-white/90 hover:text-white hover:from-[oklch(0.6_0.24_295)]/30 transition"
            >
              💎 See plans & start earning →
            </Link>

            {/* Input */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                send(input);
              }}
              className="relative p-3 border-t border-white/10 flex items-center gap-2"
            >
              <input
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                maxLength={500}
                placeholder="Ask me anything..."
                className="flex-1 bg-white/5 border border-white/10 rounded-full px-4 py-2.5 text-sm text-white placeholder:text-white/40 focus:outline-none focus:border-[oklch(0.7_0.2_295)]/50 transition"
              />
              <button
                type="submit"
                disabled={!input.trim() || typing}
                aria-label="Send"
                className="w-10 h-10 grid place-items-center rounded-full bg-gradient-to-br from-[oklch(0.65_0.24_295)] to-[oklch(0.55_0.22_245)] text-white shadow-[0_0_20px_oklch(0.6_0.24_280/50%)] hover:shadow-[0_0_30px_oklch(0.6_0.24_280/80%)] transition disabled:opacity-40 disabled:shadow-none"
              >
                <Send className="w-4 h-4" />
              </button>
            </form>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Speech bubble */}
      <AnimatePresence>
        {bubble && !open && (
          <motion.div
            key={bubble}
            initial={{ opacity: 0, y: 10, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, scale: 0.95 }}
            className="pointer-events-auto absolute bottom-[150px] right-2 max-w-[240px] px-4 py-2.5 rounded-2xl rounded-br-sm text-sm font-medium text-white"
            style={{
              background: "linear-gradient(135deg, oklch(0.22 0.05 280 / 0.95), oklch(0.16 0.04 270 / 0.95))",
              backdropFilter: "blur(16px)",
              border: "1px solid oklch(0.7 0.2 295 / 0.35)",
              boxShadow: "0 10px 40px -10px oklch(0.6 0.24 280 / 0.5)",
            }}
          >
            {bubble}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Robot launcher */}
      <motion.button
        onClick={() => setOpen((v) => !v)}
        initial={{ x: 200, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        transition={{ type: "spring", stiffness: 180, damping: 18, delay: 0.4 }}
        whileHover={{ scale: 1.06 }}
        whileTap={{ scale: 0.95 }}
        className="pointer-events-auto relative block group"
        aria-label="Open Aria AI assistant"
        style={{ width: 130, height: 150 }}
      >
        {/* Glow */}
        <motion.span
          className="absolute inset-0 rounded-full blur-2xl -z-10"
          style={{ background: "radial-gradient(circle, oklch(0.65 0.24 280 / 0.55), transparent 70%)" }}
          animate={{ opacity: [0.45, 0.85, 0.45], scale: [1, 1.1, 1] }}
          transition={{ duration: 2.6, repeat: Infinity, ease: "easeInOut" }}
        />
        {/* Pulse ring */}
        <motion.span
          className="absolute inset-2 rounded-full border-2 border-[oklch(0.75_0.18_220)]/40 -z-10"
          animate={{ scale: [1, 1.25, 1], opacity: [0.6, 0, 0.6] }}
          transition={{ duration: 2.2, repeat: Infinity }}
        />
        {/* Float / breathing */}
        <motion.div
          animate={{ y: [0, -8, 0], rotate: [-1.5, 1.5, -1.5] }}
          transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
          className="relative w-full h-full"
        >
          <img
            src={ariaAsset.url}
            alt="Aria — AI assistant"
            className="w-full h-full object-contain drop-shadow-[0_10px_25px_oklch(0.6_0.24_280/0.5)]"
            draggable={false}
          />
          {/* Notification dot */}
          {!open && messages.length <= 1 && (
            <motion.span
              animate={{ scale: [1, 1.2, 1] }}
              transition={{ duration: 1.2, repeat: Infinity }}
              className="absolute top-3 right-3 w-4 h-4 rounded-full bg-gradient-to-br from-rose-400 to-rose-600 ring-2 ring-[oklch(0.1_0.03_270)] grid place-items-center text-[9px] font-bold text-white"
            >
              1
            </motion.span>
          )}
        </motion.div>
      </motion.button>
    </div>
  );
}
