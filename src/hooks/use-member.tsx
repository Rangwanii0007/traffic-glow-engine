import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { memberLogout } from "@/lib/member.functions";

const KEY = "ad4you.member.token";

type MemberContextValue = {
  token: string | null;
  ready: boolean;
  setToken: (token: string) => void;
  signOut: () => Promise<void>;
};

const MemberContext = createContext<MemberContextValue | undefined>(undefined);

export function MemberProvider({ children }: { children: ReactNode }) {
  const [token, setTokenState] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const navigate = useNavigate();
  const qc = useQueryClient();

  useEffect(() => {
    setTokenState(window.localStorage.getItem(KEY));
    setReady(true);
  }, []);

  const value = useMemo<MemberContextValue>(
    () => ({
      token,
      ready,
      setToken: (next) => {
        window.localStorage.setItem(KEY, next);
        setTokenState(next);
      },
      signOut: async () => {
        const current = window.localStorage.getItem(KEY);
        window.localStorage.removeItem(KEY);
        setTokenState(null);
        await qc.cancelQueries();
        qc.clear();
        if (current) {
          try { await memberLogout({ data: { token: current } }); } catch { /* ignore */ }
        }
        navigate({ to: "/team-login", replace: true });
      },
    }),
    [token, ready, navigate, qc],
  );

  return <MemberContext.Provider value={value}>{children}</MemberContext.Provider>;
}

export function useMember() {
  const ctx = useContext(MemberContext);
  if (!ctx) throw new Error("useMember must be used inside MemberProvider");
  return ctx;
}

export function writeMemberToken(token: string) {
  window.localStorage.setItem(KEY, token);
}

export function readMemberToken() {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(KEY);
}
