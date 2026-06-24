import { motion, useInView, useMotionValue, useTransform, animate } from "motion/react";
import { useEffect, useRef, useState } from "react";

export function AnimatedCounter({
  to,
  duration = 2,
  prefix = "",
  suffix = "",
  decimals = 0,
}: { to: number; duration?: number; prefix?: string; suffix?: string; decimals?: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "-50px" });
  const count = useMotionValue(0);
  const display = useTransform(count, (v) =>
    `${prefix}${v.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}${suffix}`,
  );
  const [text, setText] = useState(`${prefix}0${suffix}`);

  useEffect(() => {
    if (!inView) return;
    const controls = animate(count, to, { duration, ease: [0.16, 1, 0.3, 1] });
    const unsub = display.on("change", (v) => setText(v));
    return () => { controls.stop(); unsub(); };
  }, [inView, to, duration, count, display]);

  return <span ref={ref}>{text}</span>;
}

export function AnimatedLine({ color = "currentColor", points }: { color?: string; points: number[] }) {
  const ref = useRef<SVGPathElement>(null);
  const inView = useInView(ref, { once: true, margin: "-50px" });
  const max = Math.max(...points);
  const min = Math.min(...points);
  const range = Math.max(max - min, 1);
  const w = 280, h = 80;
  const step = w / (points.length - 1);
  const path = points
    .map((p, i) => {
      const x = i * step;
      const y = h - ((p - min) / range) * (h - 10) - 5;
      return `${i === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-20">
      <defs>
        <linearGradient id={`grad-${color.replace(/[^a-z0-9]/gi, "")}`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.5" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <motion.path
        ref={ref}
        d={`${path} L ${w} ${h} L 0 ${h} Z`}
        fill={`url(#grad-${color.replace(/[^a-z0-9]/gi, "")})`}
        initial={{ opacity: 0 }}
        animate={inView ? { opacity: 1 } : {}}
        transition={{ duration: 1.2, delay: 0.5 }}
      />
      <motion.path
        d={path}
        fill="none"
        stroke={color}
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={{ pathLength: 0 }}
        animate={inView ? { pathLength: 1 } : {}}
        transition={{ duration: 1.8, ease: "easeOut" }}
      />
    </svg>
  );
}

export function ParticleField({ color = "rgba(139,92,246,0.6)", count = 24 }: { color?: string; count?: number }) {
  const particles = Array.from({ length: count }, (_, i) => ({
    id: i,
    x: Math.random() * 100,
    y: Math.random() * 100,
    size: 1 + Math.random() * 3,
    delay: Math.random() * 5,
    duration: 8 + Math.random() * 12,
  }));
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {particles.map((p) => (
        <motion.span
          key={p.id}
          className="absolute rounded-full"
          style={{
            left: `${p.x}%`,
            top: `${p.y}%`,
            width: p.size,
            height: p.size,
            background: color,
            boxShadow: `0 0 ${p.size * 4}px ${color}`,
          }}
          animate={{ y: [0, -40, 0], opacity: [0.2, 0.9, 0.2] }}
          transition={{ duration: p.duration, repeat: Infinity, delay: p.delay, ease: "easeInOut" }}
        />
      ))}
    </div>
  );
}
