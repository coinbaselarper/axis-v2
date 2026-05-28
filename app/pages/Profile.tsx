"use client";

import { LogOut, User as UserIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { useFadeSwap, usePopIn } from "../lib/anim";

const USERS_KEY = "axis.users.v1";
const SESSION_KEY = "axis.user.v1";

type StoredUser = { username: string; password: string; createdAt: number };
type Session = { username: string };

function loadUsers(): Record<string, StoredUser> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(USERS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveUsers(map: Record<string, StoredUser>) {
  try {
    window.localStorage.setItem(USERS_KEY, JSON.stringify(map));
  } catch {}
}

function loadSession(): Session | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveSession(s: Session | null) {
  try {
    if (s) window.localStorage.setItem(SESSION_KEY, JSON.stringify(s));
    else window.localStorage.removeItem(SESSION_KEY);
  } catch {}
}

export default function Profile() {
  const [session, setSession] = useState<Session | null>(null);
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [hydrated, setHydrated] = useState(false);

  const cardRef = useFadeSwap<HTMLDivElement>(`${!!session}-${mode}`);
  const rootRef = usePopIn<HTMLDivElement>([]);

  useEffect(() => {
    import("../api/ads/ads");
  }, []);

  useEffect(() => {
    setSession(loadSession());
    setHydrated(true);
  }, []);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    const u = username.trim().toLowerCase();
    const p = password;
    if (!u || !p) {
      setError("Username and password required.");
      return;
    }
    const users = loadUsers();
    if (mode === "signup") {
      if (users[u]) {
        setError("Username already taken.");
        return;
      }
      users[u] = { username: u, password: p, createdAt: Date.now() };
      saveUsers(users);
      const sess = { username: u };
      saveSession(sess);
      setSession(sess);
      setUsername("");
      setPassword("");
      return;
    }
    const existing = users[u];
    if (!existing || existing.password !== p) {
      setError("Invalid username or password.");
      return;
    }
    const sess = { username: u };
    saveSession(sess);
    setSession(sess);
    setUsername("");
    setPassword("");
  };

  const logout = () => {
    saveSession(null);
    setSession(null);
  };

  if (!hydrated) {
    return <div className="h-full w-full" style={{ background: "var(--axis-bg)" }} />;
  }

  if (session) {
    return (
      <div
        ref={rootRef}
        className="relative h-full w-full overflow-hidden"
        style={{ background: "var(--axis-bg)" }}
      >
        <div
          ref={cardRef}
          className="relative z-10 flex h-full w-full flex-col items-center justify-center rounded-xl border p-10 text-center backdrop-blur"
          style={{
            background: "var(--axis-glass)",
            borderColor: "var(--axis-border)",
          }}
        >
          <div
            className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border"
            style={{
              borderColor: "var(--axis-border-strong)",
              background: "var(--axis-glass-2)",
              color: "var(--axis-accent)",
            }}
          >
            <UserIcon className="h-7 w-7" />
          </div>
          <h1
            className="mt-5 text-3xl font-extrabold"
            style={{ color: "var(--axis-accent)" }}
          >
            {session.username}
          </h1>
          <p className="mt-1 text-sm" style={{ color: "var(--axis-text-muted)" }}>
            Signed in to Axis
          </p>
          <button
            type="button"
            onClick={logout}
            className="mt-7 flex w-[440px] max-w-[90%] items-center justify-center gap-2 rounded-full border px-6 py-3 text-sm font-bold transition"
            style={{
              borderColor: "var(--axis-border-strong)",
              color: "var(--axis-accent)",
            }}
          >
            <LogOut className="h-4 w-4" />
            Log out
          </button>
        </div>
      </div>
    );
  }

  const isLogin = mode === "login";

  return (
    <div
      ref={rootRef}
      className="relative h-full w-full overflow-hidden"
      style={{ background: "var(--axis-bg)" }}
    >
      <div
        ref={cardRef}
        className="relative z-10 flex h-full w-full flex-col items-center justify-center rounded-xl border p-10 backdrop-blur"
        style={{
          background: "var(--axis-glass)",
          borderColor: "var(--axis-border)",
        }}
      >
        <h1
          className="text-center text-5xl font-extrabold tracking-tight"
          style={{ color: "var(--axis-accent)" }}
        >
          {isLogin ? "Log in" : "Sign up"}
        </h1>
        <p
          className="mt-2 text-center text-sm"
          style={{ color: "var(--axis-text-muted)" }}
        >
          {isLogin ? "Welcome back to Axis" : "Create your Axis account"}
        </p>

        <form onSubmit={submit} className="mt-8 flex w-[440px] max-w-[92%] flex-col gap-4">
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="username"
            autoComplete="username"
            className="rounded-full border px-6 py-4 text-base font-medium outline-none transition"
            style={{
              borderColor: "var(--axis-border)",
              background: "var(--axis-glass-2)",
              color: "var(--axis-text)",
            }}
          />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="password"
            autoComplete={isLogin ? "current-password" : "new-password"}
            className="rounded-full border px-6 py-4 text-base font-medium outline-none transition"
            style={{
              borderColor: "var(--axis-border)",
              background: "var(--axis-glass-2)",
              color: "var(--axis-text)",
            }}
          />

          {error ? (
            <div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-center text-xs text-red-300">
              {error}
            </div>
          ) : null}

          <button
            type="submit"
            className="mt-2 rounded-full px-6 py-4 text-base font-bold transition hover:brightness-110"
            style={{
              background: "var(--axis-accent)",
              color: "var(--axis-bg)",
            }}
          >
            {isLogin ? "Sign In" : "Create account"}
          </button>
        </form>

        <div
          className="my-6 flex w-[440px] max-w-[92%] items-center gap-3 text-xs font-bold"
          style={{ color: "var(--axis-text-subtle)" }}
        >
          <div className="h-px flex-1" style={{ background: "var(--axis-border)" }} />
          OR
          <div className="h-px flex-1" style={{ background: "var(--axis-border)" }} />
        </div>

        <button
          type="button"
          onClick={() => {
            setMode(isLogin ? "signup" : "login");
            setError("");
          }}
          className="w-[440px] max-w-[92%] rounded-full border px-6 py-3.5 text-base font-bold transition hover:brightness-125"
          style={{
            borderColor: "var(--axis-border-strong)",
            color: "var(--axis-accent)",
          }}
        >
          {isLogin ? "Create an account" : "Sign in"}
        </button>
      </div>
    </div>
  );
}
