"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

export type SessionUser = {
  username: string;
  email?: string;
  emailVerifiedAt?: number;
};

type AuthState = {
  user: SessionUser | null;
  loading: boolean;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
  setUser: (u: SessionUser | null) => void;
};

const AuthCtx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const r = await fetch("/api/auth/me", { credentials: "include" });
      const j = await r.json();
      setUser(j?.user ?? null);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const logout = useCallback(async () => {
    try { await fetch("/api/auth/logout", { method: "POST", credentials: "include" }); } catch {}
    setUser(null);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const value = useMemo<AuthState>(() => ({ user, loading, refresh, logout, setUser }), [user, loading, refresh, logout]);
  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

export function useAuth(): AuthState {
  const v = useContext(AuthCtx);
  if (!v) throw new Error("useAuth must be inside AuthProvider");
  return v;
}
