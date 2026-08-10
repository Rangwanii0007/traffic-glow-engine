import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { attachReferral } from "@/lib/affiliate.functions";
import { captureRefFromUrl, clearStoredRef, getStoredRef } from "@/lib/referral";

/** Credits a pending invite code once the invited user actually has a session. */
async function flushPendingReferral(authUser: User) {
  const code = getStoredRef() ?? ((authUser.user_metadata?.referred_by as string | undefined) ?? null);
  if (!code || !authUser.email) return;
  try {
    const res = await attachReferral({
      data: { refCode: code, referredId: authUser.id, referredEmail: authUser.email },
    });
    if (res.ok || res.reason === "self_referral") clearStoredRef();
  } catch { /* retried on the next session load */ }
}


type Profile = {
  id: string;
  email: string;
  full_name: string | null;
  role: string;
  avatar_url: string | null;
  referral_code: string | null;
};

function toFallbackProfile(authUser: User): Profile {
  return {
    id: authUser.id,
    email: authUser.email ?? "",
    full_name: (authUser.user_metadata?.full_name as string | undefined) ?? authUser.email?.split("@")[0] ?? null,
    role: "user",
    avatar_url: null,
    referral_code: null,
  };
}

type AuthContextValue = {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  isAdmin: boolean;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  const loadProfile = async (authUser: User) => {
    const { data, error } = await supabase
      .from("users")
      .select("id, email, full_name, role, avatar_url, referral_code")
      .eq("id", authUser.id)
      .maybeSingle();

    if (!error && data) {
      setProfile({ ...(data as Profile), referral_code: (data as Profile).referral_code ?? null });
      return;
    }

    const { data: fallbackData } = await supabase
      .from("users")
      .select("id, email, full_name, role, avatar_url")
      .eq("id", authUser.id)
      .maybeSingle();

    setProfile(fallbackData ? { ...(fallbackData as Omit<Profile, "referral_code">), referral_code: null } : toFallbackProfile(authUser));
  };

  useEffect(() => {
    // Synchronous listener — never call other supabase methods inside it directly
    const { data: sub } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      setUser(newSession?.user ?? null);
      if (newSession?.user) {
        setTimeout(() => loadProfile(newSession.user), 0);
      } else {
        setProfile(null);
      }
    });

    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      setUser(s?.user ?? null);
      if (s?.user) loadProfile(s.user);
      setLoading(false);
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
    setProfile(null);
  };

  const refreshProfile = async () => {
    if (user) await loadProfile(user);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        profile,
        loading,
        isAdmin: profile?.role === "admin",
        signOut,
        refreshProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
