import { Link, useNavigate } from "@tanstack/react-router";
import { AnimatePresence, motion, useMotionValue, useReducedMotion, useSpring } from "motion/react";
import {
  Activity,
  ArrowLeftRight,
  BarChart3,
  Gauge,
  Globe2,
  LockKeyhole,
  Network,
  ShieldCheck,
  Sparkles,
  UserRound,
  UsersRound,
  Zap,
} from "lucide-react";
import { useState, type PointerEvent, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type LoginMode = "personal" | "team";

type PremiumLoginExperienceProps = {
  mode: LoginMode;
  children: ReactNode;
  footer: ReactNode;
};

const modeContent = {
  personal: {
    eyebrow: "PERSONAL ACCESS MODE",
    description: "Sign in to manage your traffic workspace",
    features: [
      { icon: ShieldCheck, label: "Secure" },
      { icon: Zap, label: "Fast" },
      { icon: Gauge, label: "Reliable" },
    ],
  },
  team: {
    eyebrow: "TEAM WORKSPACE MODE",
    description: "Sign in to access your assigned team environment",
    features: [
      { icon: LockKeyhole, label: "Secure Access" },
      { icon: Network, label: "Team Connected" },
      { icon: UsersRound, label: "Managed Workspace" },
    ],
  },
} as const;

function FloatingMetric({
  className,
  icon,
  title,
  value,
  mode,
}: {
  className: string;
  icon: ReactNode;
  title: string;
  value: string;
  mode: LoginMode;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 18, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -12, scale: 0.96 }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      className={cn("login-metric", `login-metric--${mode}`, className)}
    >
      <span className="login-metric__icon">{icon}</span>
      <span>
        <span className="login-metric__title">{title}</span>
        <strong>{value}</strong>
      </span>
      <span className="login-metric__pulse" />
    </motion.div>
  );
}

function AnimatedBackground({ mode }: { mode: LoginMode }) {
  return (
    <div className="login-world" aria-hidden="true">
      <motion.div
        className="login-world__personal"
        animate={{ opacity: mode === "personal" ? 1 : 0, scale: mode === "personal" ? 1 : 1.04 }}
        transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
      />
      <motion.div
        className="login-world__team"
        animate={{ opacity: mode === "team" ? 1 : 0, scale: mode === "team" ? 1 : 1.04 }}
        transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
      />
      <div className="login-world__grid" />
      <div className="login-world__beam login-world__beam--left" />
      <div className="login-world__beam login-world__beam--right" />

      <AnimatePresence mode="wait">
        {mode === "personal" ? (
          <motion.div key="personal-scenery" className="login-scenery">
            <FloatingMetric className="login-metric--traffic" mode="personal" icon={<BarChart3 />} title="Live traffic" value="12,884 visits" />
            <FloatingMetric className="login-metric--network" mode="personal" icon={<Globe2 />} title="Network reach" value="Global delivery" />
            <div className="login-orbit login-orbit--personal"><span /><span /><span /></div>
            <svg className="login-chart" viewBox="0 0 400 160" fill="none">
              <motion.path d="M10 135 C60 130 74 90 120 103 C166 115 183 52 230 67 C278 82 308 20 390 28" pathLength="1" initial={{ pathLength: 0, opacity: 0 }} animate={{ pathLength: 1, opacity: 1 }} transition={{ duration: 1.5 }} />
            </svg>
          </motion.div>
        ) : (
          <motion.div key="team-scenery" className="login-scenery">
            <FloatingMetric className="login-metric--activity" mode="team" icon={<Activity />} title="Team activity" value="12 members online" />
            <FloatingMetric className="login-metric--workspace" mode="team" icon={<UsersRound />} title="Workspace" value="Synchronized" />
            <div className="login-orbit login-orbit--team"><span /><span /><span /><span /></div>
            <svg className="login-connections" viewBox="0 0 420 250" fill="none">
              <path d="M55 125L165 52L267 136L368 66M165 52L190 210L267 136M267 136L368 196" />
              <circle cx="55" cy="125" r="7" /><circle cx="165" cy="52" r="7" /><circle cx="190" cy="210" r="7" /><circle cx="267" cy="136" r="7" /><circle cx="368" cy="66" r="7" /><circle cx="368" cy="196" r="7" />
            </svg>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function BrandHeader({ mode }: { mode: LoginMode }) {
  return (
    <motion.header layout className="login-brand">
      <Link to="/" aria-label="AD4YOU home" className="login-brand__mark">
        <span className="login-brand__bolt"><Zap fill="currentColor" /></span>
        <span className="login-brand__name">AD<span>4</span>YOU</span>
      </Link>
      <div className="login-brand__product"><span /> TRAFFIC MACHINE</div>
      <p>Ultra-Advanced Traffic Platform</p>
      <div className="login-brand__badges">
        <span>v4.0.0</span>
        <span className="login-brand__live"><i /> Live</span>
        <motion.span key={mode} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          {mode === "personal" ? "Personal node" : "Team network"}
        </motion.span>
      </div>
    </motion.header>
  );
}

function LoginModeSwitcher({ mode }: { mode: LoginMode }) {
  const navigate = useNavigate();
  const reduceMotion = useReducedMotion();
  const go = (next: LoginMode) => {
    if (next === mode) return;
    navigate({ to: next === "personal" ? "/login" : "/team-login" });
  };

  return (
    <div className={cn("mode-switcher", `mode-switcher--${mode}`)} aria-label="Choose login mode">
      <Button type="button" variant="ghost" onClick={() => go("personal")} aria-pressed={mode === "personal"} className="mode-switcher__option">
        <span className="mode-switcher__icon"><UserRound /></span>
        <span><strong>Personal User</strong><small>My workspace</small></span>
      </Button>

      <Button type="button" variant="ghost" onClick={() => go(mode === "personal" ? "team" : "personal")} className="energy-core" aria-label={`Switch to ${mode === "personal" ? "team member" : "personal user"} login`}>
        <motion.span className="energy-core__outer" animate={{ rotate: mode === "team" && !reduceMotion ? 180 : 0 }} transition={{ type: "spring", stiffness: 95, damping: 18 }} />
        <motion.span className="energy-core__middle" animate={{ rotate: mode === "team" && !reduceMotion ? -180 : 0 }} transition={{ type: "spring", stiffness: 80, damping: 16 }} />
        <motion.span className="energy-core__center" animate={{ rotate: mode === "team" && !reduceMotion ? 180 : 0 }} transition={{ type: "spring", stiffness: 120, damping: 17 }}>
          <ArrowLeftRight />
        </motion.span>
      </Button>

      <Button type="button" variant="ghost" onClick={() => go("team")} aria-pressed={mode === "team"} className="mode-switcher__option">
        <span className="mode-switcher__icon"><UsersRound /></span>
        <span><strong>Team Member</strong><small>Shared workspace</small></span>
      </Button>
    </div>
  );
}

export function PremiumLoginExperience({ mode, children, footer }: PremiumLoginExperienceProps) {
  const content = modeContent[mode];
  const reduceMotion = useReducedMotion();
  const [hovering, setHovering] = useState(false);
  const rotateX = useSpring(useMotionValue(0), { stiffness: 130, damping: 22 });
  const rotateY = useSpring(useMotionValue(0), { stiffness: 130, damping: 22 });

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (reduceMotion || event.pointerType === "touch") return;
    const bounds = event.currentTarget.getBoundingClientRect();
    rotateY.set(((event.clientX - bounds.left) / bounds.width - 0.5) * 2.5);
    rotateX.set(((event.clientY - bounds.top) / bounds.height - 0.5) * -2.5);
  };

  const resetTilt = () => {
    setHovering(false);
    rotateX.set(0);
    rotateY.set(0);
  };

  return (
    <main className={cn("premium-login", `premium-login--${mode}`)}>
      <AnimatedBackground mode={mode} />
      <div className="premium-login__stage">
        <BrandHeader mode={mode} />
        <motion.div
          className="login-console"
          style={{ rotateX, rotateY, transformPerspective: 1200 }}
          onPointerMove={onPointerMove}
          onPointerEnter={() => setHovering(true)}
          onPointerLeave={resetTilt}
          data-hovering={hovering}
        >
          <span className="login-console__glow" />
          <span className="login-console__shine" />
          <div className="login-console__inner">
            <LoginModeSwitcher mode={mode} />
            <AnimatePresence mode="wait" initial={false}>
              <motion.div key={mode} initial={{ opacity: 0, y: 10, filter: "blur(5px)" }} animate={{ opacity: 1, y: 0, filter: "blur(0px)" }} exit={{ opacity: 0, y: -8, filter: "blur(5px)" }} transition={{ duration: 0.3 }}>
                {children}
              </motion.div>
            </AnimatePresence>

            <div className="login-trust" aria-label="Access benefits">
              {content.features.map(({ icon: Icon, label }) => (
                <div key={label}><span><Icon /></span><small>{label}</small></div>
              ))}
            </div>

            <AnimatePresence mode="wait" initial={false}>
              <motion.div key={mode} className="login-mode-status" initial={{ opacity: 0, y: 8, filter: "blur(4px)" }} animate={{ opacity: 1, y: 0, filter: "blur(0px)" }} exit={{ opacity: 0, y: -8, filter: "blur(4px)" }}>
                <span><Sparkles /></span>
                <div><strong>{content.eyebrow}</strong><small>{content.description}</small></div>
              </motion.div>
            </AnimatePresence>
          </div>
        </motion.div>
        <div className="login-footer">{footer}</div>
      </div>
    </main>
  );
}