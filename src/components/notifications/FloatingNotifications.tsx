import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { DollarSign, Crown, TrendingUp, Sparkles } from "lucide-react";

const NAMES = [
  "Emma","James","Olivia","Noah","Ava","Liam","Sophia","Mason","Isabella","Lucas",
  "Mia","Ethan","Amelia","Logan","Harper","Jacob","Evelyn","Jackson","Abigail","Aiden",
  "Emily","Benjamin","Elizabeth","Michael","Sofia","Elijah","Avery","Daniel","Ella","Alexander",
  "Scarlett","William","Grace","Matthew","Chloe","Henry","Victoria","Sebastian","Riley","Jack",
  "Aria","Owen","Lily","Samuel","Aubrey","David","Zoey","Joseph","Penelope","Carter",
  "Layla","Wyatt","Nora","John","Camila","Julian","Aaliyah","Luke","Savannah","Grayson",
  "Anna","Levi","Brooklyn","Isaac","Leah","Gabriel","Zoe","Anthony","Hazel","Andrew",
  "Violet","Dylan","Aurora","Lincoln","Stella","Ryan","Natalie","Nathan","Ellie","Christopher",
  "Paisley","Adrian","Skylar","Jonathan","Claire","Nolan","Lucy","Christian","Bella","Landon",
  "Willow","Colton","Kennedy","Hunter","Maya","Cameron","Kinsley","Connor","Audrey","Eli",
  "Ahmed","Fatima","Wei","Priya","Chen","Aditi","Kenji","Yuki","Diego","Sofia",
  "Amara","Kwame","Zainab","Hiro","Ines","Rafael","Luana","Kirill","Nadia","Omar"
];

type Notif =
  | { kind: "withdraw"; name: string; amount: number }
  | { kind: "premium"; name: string; plan: string }
  | { kind: "earning"; name: string; amount: number }
  | { kind: "referral"; name: string; count: number };

const PLANS = ["Starter","Pro","Business"];

function pick<T>(arr: T[]) { return arr[Math.floor(Math.random() * arr.length)]; }

function makeNotif(): Notif {
  const roll = Math.random();
  const name = pick(NAMES);
  if (roll < 0.35) return { kind: "withdraw", name, amount: 50 + Math.floor(Math.random() * 950) };
  if (roll < 0.65) return { kind: "premium", name, plan: pick(PLANS) };
  if (roll < 0.85) return { kind: "earning", name, amount: 10 + Math.floor(Math.random() * 300) };
  return { kind: "referral", name, count: 1 + Math.floor(Math.random() * 8) };
}

export function FloatingNotifications() {
  const [current, setCurrent] = useState<(Notif & { id: number }) | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    let timer: ReturnType<typeof setTimeout>;
    let id = 0;

    const loop = () => {
      const delay = 2000 + Math.random() * 3000;
      timer = setTimeout(() => {
        id += 1;
        setCurrent({ ...makeNotif(), id });
        setTimeout(() => setCurrent(null), 4500);
        loop();
      }, delay);
    };
    loop();
    return () => clearTimeout(timer);
  }, []);

  if (!current) return (
    <div className="fixed bottom-4 left-4 z-[60] pointer-events-none" aria-live="polite" />
  );

  const styles = {
    withdraw: {
      grad: "from-emerald-500/20 via-emerald-500/10 to-transparent",
      ring: "ring-emerald-400/40",
      icon: <DollarSign className="w-4 h-4 text-emerald-300" />,
      text: <>
        <span className="font-bold text-white">{current.kind === "withdraw" && current.name.toUpperCase()}</span>{" "}
        <span className="text-white/70">withdrew</span>{" "}
        <span className="font-bold text-emerald-300">${current.kind === "withdraw" && current.amount}</span>
      </>,
    },
    premium: {
      grad: "from-amber-400/20 via-yellow-500/10 to-transparent",
      ring: "ring-amber-400/40",
      icon: <Crown className="w-4 h-4 text-amber-300" />,
      text: <>
        <span className="font-bold text-white">{current.kind === "premium" && current.name}</span>{" "}
        <span className="text-white/70">got</span>{" "}
        <span className="font-bold bg-gradient-to-r from-amber-200 to-yellow-400 bg-clip-text text-transparent">
          Premium {current.kind === "premium" && current.plan}
        </span>
      </>,
    },
    earning: {
      grad: "from-cyan-500/20 via-blue-500/10 to-transparent",
      ring: "ring-cyan-400/40",
      icon: <TrendingUp className="w-4 h-4 text-cyan-300" />,
      text: <>
        <span className="font-bold text-white">{current.kind === "earning" && current.name}</span>{" "}
        <span className="text-white/70">earned</span>{" "}
        <span className="font-bold text-cyan-300">${current.kind === "earning" && current.amount}</span>{" "}
        <span className="text-white/60">today</span>
      </>,
    },
    referral: {
      grad: "from-violet-500/20 via-fuchsia-500/10 to-transparent",
      ring: "ring-violet-400/40",
      icon: <Sparkles className="w-4 h-4 text-violet-300" />,
      text: <>
        <span className="font-bold text-white">{current.kind === "referral" && current.name}</span>{" "}
        <span className="text-white/70">invited</span>{" "}
        <span className="font-bold text-violet-300">{current.kind === "referral" && current.count} friends</span>
      </>,
    },
  } as const;
  const s = styles[current.kind];

  return (
    <div className="fixed bottom-4 left-4 z-[60] pointer-events-none max-w-[92vw]" aria-live="polite">
      <AnimatePresence mode="wait">
        <motion.div
          key={current.id}
          initial={{ opacity: 0, y: 24, scale: 0.9 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -12, scale: 0.95 }}
          transition={{ type: "spring", stiffness: 260, damping: 22 }}
          className={`pointer-events-auto flex items-center gap-3 rounded-2xl border border-white/10 bg-black/60 backdrop-blur-xl px-3.5 py-2.5 shadow-[0_10px_40px_-10px_rgba(0,0,0,0.8)] ring-1 ${s.ring}`}
        >
          <div className={`absolute inset-0 rounded-2xl bg-gradient-to-r ${s.grad} pointer-events-none`} />
          <div className="relative flex items-center justify-center w-8 h-8 rounded-full bg-white/5 border border-white/10">
            {s.icon}
          </div>
          <div className="relative text-[13px] leading-tight">{s.text}</div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
