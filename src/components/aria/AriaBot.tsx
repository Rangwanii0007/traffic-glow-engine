import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Send, X, Sparkles } from "lucide-react";
import { chatWithAria } from "@/lib/aria.functions";
import { supabase } from "@/integrations/supabase/client";

import type { RobotState } from "./Robot3D";

const Robot3D = lazy(() => import("./Robot3D").then((m) => ({ default: m.Robot3D })));


type Msg = { role: "user" | "assistant"; content: string; ts: number };

const STORAGE_KEY = "aria_chat_v2";
const SEEN_KEY = "aria_seen_v2";
const MAX_MSGS = 50;

const QUICK_ACTIONS = [
  { emoji: "🚀", label: "What can AD4YOU do?", q: "What can AD4YOU do for me?" },
  { emoji: "💰", label: "How does it work?", q: "How does the platform optimize my traffic and earnings?" },
  { emoji: "🛡️", label: "Is it safe?", q: "Is the platform safe and undetectable?" },
  { emoji: "💎", label: "Pricing", q: "What are your pricing plans?" },
];

const GREETING: Msg = {
  role: "assistant",
  content: "👋 Hey! I'm Aria — your AD4YOU AI Traffic Intelligence Specialist. Ask me anything about features, plans, or how to maximize your earnings ✨",
  ts: Date.now(),
};


export function AriaBot() {
  const [mounted, setMounted] = useState(false);
  const { data: enabled, isLoading: enabledLoading } = useQuery({
    queryKey: ["setting", "aria_enabled"],
    queryFn: async () => {
      const { data } = await supabase.from("settings").select("value").eq("key", "aria_enabled").maybeSingle();
      const v = (data as { value: string | null } | null)?.value;
      return v === null || v === undefined ? true : v === "true" || v === "1";
    },
    staleTime: 60_000,
  });
  const [open, setOpen] = useState(false);
  const [bubble, setBubble] = useState<string | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [typing, setTyping] = useState(false);
  const [robotState, setRobotState] = useState<RobotState>("entering");
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

    // Entrance choreography: enter -> wave -> idle
    setRobotState("entering");
    const t1 = setTimeout(() => {
      setRobotState("waving");
      setBubble(seen ? "Need help? 😊" : "👋 Hey! How are you today?");
    }, 1500);
    const t2 = setTimeout(() => {
      setRobotState("idle");
    }, 4500);
    const t3 = setTimeout(() => setBubble(null), 7000);

    localStorage.setItem(SEEN_KEY, "1");
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };
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
      setTimeout(() => inputRef.current?.focus(), 250);
    }
  }, [open]);

  useEffect(() => {
    if (typing) setRobotState("thinking");
    else if (open && input.length > 0) setRobotState("listening");
    else if (open) setRobotState("happy");
    else setRobotState("idle");
  }, [typing, open, input]);


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
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Oops, connection glitch 🤖 — try again!", ts: Date.now() },
      ]);
    } finally {
      setTyping(false);
    }
  };

  if (!mounted) return null;
  if (enabledLoading) return null;
  if (enabled === false) return null;

  return (
    <div
      className="fixed z-[9999] pointer-events-none"
      style={{ bottom: "16px", right: "16px" }}
    >
      {/* Chat panel */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 24, scale: 0.94 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 24, scale: 0.94 }}
            transition={{ type: "spring", stiffness: 280, damping: 26 }}
            className="pointer-events-auto absolute bottom-[235px] right-2 w-[min(390px,calc(100vw-24px))] h-[min(580px,calc(100vh-260px))] rounded-[22px] overflow-hidden flex flex-col"
            style={{
              background:
                "linear-gradient(180deg, oklch(0.17 0.04 270 / 0.92), oklch(0.10 0.03 265 / 0.94))",
              backdropFilter: "blur(28px) saturate(160%)",
              boxShadow:
                "0 30px 80px -20px oklch(0 0 0 / 0.7), 0 0 0 1px oklch(0.7 0.22 220 / 0.35), 0 0 70px oklch(0.65 0.22 220 / 0.25)",
            }}
          >
            {/* Gradient border */}
            <div
              className="pointer-events-none absolute inset-0 rounded-[22px]"
              style={{
                padding: "1.5px",
                background:
                  "linear-gradient(135deg, oklch(0.78 0.2 220), oklch(0.7 0.22 295), oklch(0.75 0.18 200))",
                WebkitMask: "linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)",
                WebkitMaskComposite: "xor",
                maskComposite: "exclude",
              }}
            />
            {/* Connector tail to robot */}
            <div
              aria-hidden
              className="absolute -bottom-4 right-14 w-5 h-5 rotate-45 rounded-sm"
              style={{
                background: "linear-gradient(135deg, transparent 50%, oklch(0.10 0.03 265 / 0.94) 50%)",
                boxShadow: "1px 1px 0 0 oklch(0.7 0.22 220 / 0.4)",
              }}
            />

            {/* Header */}
            <div className="relative flex items-center gap-3 px-4 py-3 border-b border-white/10">
              <div className="relative w-10 h-10 rounded-full bg-gradient-to-br from-[oklch(0.7_0.22_220)] to-[oklch(0.55_0.22_280)] grid place-items-center text-white text-base font-bold shadow-[0_0_24px_oklch(0.7_0.22_220/0.5)]">
                A
                <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-emerald-400 ring-2 ring-[oklch(0.12_0.03_265)] animate-pulse" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-white font-semibold text-sm flex items-center gap-1.5 tracking-tight">
                  Aria <Sparkles className="w-3.5 h-3.5 text-[oklch(0.78_0.2_220)]" />
                </div>
                <div className="text-[11px] text-emerald-400 flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  Online · AI Assistant
                </div>
              </div>
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
                  className="text-[11px] px-2.5 py-1.5 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 text-white/85 hover:text-white transition disabled:opacity-50"
                >
                  <span className="mr-1">{qa.emoji}</span>
                  {qa.label}
                </button>
              ))}
            </div>

            {/* Messages */}
            <div ref={scrollRef} className="relative flex-1 overflow-y-auto px-3 py-3 space-y-3">
              {messages.map((m, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={`flex gap-2 ${m.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  {m.role === "assistant" && (
                    <div className="w-7 h-7 rounded-full bg-gradient-to-br from-[oklch(0.7_0.22_220)] to-[oklch(0.55_0.22_280)] grid place-items-center text-white text-[11px] font-bold flex-shrink-0">
                      A
                    </div>
                  )}
                  <div
                    className={`max-w-[78%] px-3.5 py-2.5 rounded-2xl text-[13.5px] leading-relaxed whitespace-pre-wrap ${
                      m.role === "user"
                        ? "bg-gradient-to-br from-[oklch(0.65_0.22_220)] to-[oklch(0.55_0.22_280)] text-white rounded-br-md shadow-[0_6px_20px_-6px_oklch(0.6_0.22_240/0.6)]"
                        : "bg-white/[0.06] border border-white/10 text-white/90 rounded-bl-md"
                    }`}
                  >
                    {m.content}
                  </div>
                </motion.div>
              ))}
              {typing && (
                <div className="flex gap-2 justify-start">
                  <div className="w-7 h-7 rounded-full bg-gradient-to-br from-[oklch(0.7_0.22_220)] to-[oklch(0.55_0.22_280)] grid place-items-center text-white text-[11px] font-bold">
                    A
                  </div>
                  <div className="bg-white/[0.06] border border-white/10 rounded-2xl rounded-bl-md px-4 py-3 flex items-center gap-1">
                    {[0, 1, 2].map((i) => (
                      <motion.span
                        key={i}
                        className="w-1.5 h-1.5 rounded-full bg-[oklch(0.78_0.2_220)]"
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
              className="relative mx-3 mb-2 text-center text-[11.5px] py-1.5 rounded-lg bg-gradient-to-r from-[oklch(0.65_0.22_220)]/20 to-[oklch(0.55_0.22_280)]/20 border border-[oklch(0.7_0.22_220)]/35 text-white/90 hover:text-white transition"
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
                placeholder="Ask Aria anything..."
                className="flex-1 bg-white/5 border border-white/10 rounded-full px-4 py-2.5 text-sm text-white placeholder:text-white/40 focus:outline-none focus:border-[oklch(0.7_0.22_220)]/60 transition"
              />
              <button
                type="submit"
                disabled={!input.trim() || typing}
                aria-label="Send"
                className="w-10 h-10 grid place-items-center rounded-full bg-gradient-to-br from-[oklch(0.7_0.22_220)] to-[oklch(0.55_0.22_280)] text-white shadow-[0_0_20px_oklch(0.65_0.22_240/0.55)] hover:shadow-[0_0_30px_oklch(0.65_0.22_240/0.85)] transition disabled:opacity-40 disabled:shadow-none"
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
            className="pointer-events-auto absolute bottom-[225px] right-4 max-w-[240px] px-4 py-2.5 rounded-2xl rounded-br-sm text-sm font-medium text-white"
            style={{
              background:
                "linear-gradient(135deg, oklch(0.22 0.05 270 / 0.95), oklch(0.14 0.04 265 / 0.95))",
              backdropFilter: "blur(16px)",
              border: "1px solid oklch(0.7 0.22 220 / 0.4)",
              boxShadow: "0 12px 40px -10px oklch(0.6 0.22 240 / 0.55)",
            }}
          >
            <TypingText text={bubble} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* 3D Robot */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.4, delay: 0.2 }}
        whileHover={{ scale: 1.04 }}
        className="pointer-events-auto relative w-[180px] h-[220px] sm:w-[220px] sm:h-[260px]"
      >
        <Suspense fallback={null}>
          <Robot3D state={robotState} onClick={() => setOpen((v) => !v)} />
        </Suspense>

        {!open && messages.length <= 1 && (
          <motion.span
            animate={{ scale: [1, 1.2, 1] }}
            transition={{ duration: 1.2, repeat: Infinity }}
            className="absolute top-4 right-4 w-4 h-4 rounded-full bg-gradient-to-br from-rose-400 to-rose-600 ring-2 ring-[oklch(0.1_0.03_265)] grid place-items-center text-[9px] font-bold text-white pointer-events-none"
          >
            1
          </motion.span>
        )}
      </motion.div>
    </div>
  );
}

function TypingText({ text }: { text: string }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    setN(0);
    const id = setInterval(() => {
      setN((p) => {
        if (p >= text.length) {
          clearInterval(id);
          return p;
        }
        return p + 1;
      });
    }, 28);
    return () => clearInterval(id);
  }, [text]);
  return (
    <span>
      {text.slice(0, n)}
      {n < text.length && <span className="opacity-60 animate-pulse">▍</span>}
    </span>
  );
}
