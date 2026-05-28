"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowRight, Loader2, Lock, Mail } from "lucide-react";
import { useAuth } from "../lib/auth";

type Step = "email" | "username" | "code";

export default function LoginGate({ feature, children }: { feature: string; children: React.ReactNode }) {
  const { user, loading, refresh } = useAuth();

  if (loading) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-zinc-500" />
      </div>
    );
  }

  if (!user) return <LoginForm feature={feature} onSuccess={refresh} />;
  return <>{children}</>;
}

function LoginForm({ feature, onSuccess }: { feature: string; onSuccess: () => Promise<void> }) {
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [resendIn, setResendIn] = useState(0);
  const codeRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (step === "code") codeRef.current?.focus();
  }, [step]);

  useEffect(() => {
    if (resendIn <= 0) return;
    const id = setInterval(() => setResendIn((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(id);
  }, [resendIn]);

  const sendCode = async (opts?: { withUsername?: string }) => {
    setError("");
    setBusy(true);
    try {
      const r = await fetch("/api/auth/send-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email, username: opts?.withUsername ?? (step === "username" ? username : undefined) }),
      });
      const j = await r.json();
      if (!r.ok) {
        if (j?.needsUsername) { setStep("username"); setError(""); return; }
        setError(j?.error || "Failed to send code");
        return;
      }
      setStep("code");
      setResendIn(30);
    } catch {
      setError("Network error");
    } finally {
      setBusy(false);
    }
  };

  const verify = async () => {
    setError("");
    setBusy(true);
    try {
      const r = await fetch("/api/auth/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email, code }),
      });
      const j = await r.json();
      if (!r.ok) { setError(j?.error || "Invalid code"); return; }
      await onSuccess();
    } catch {
      setError("Network error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex h-full w-full items-center justify-center p-6">
      <div className="w-full max-w-md rounded-2xl border border-white/[0.08] bg-zinc-950/60 p-8 shadow-[0_30px_80px_-30px_rgba(0,0,0,0.8)] backdrop-blur">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/[0.06]">
            <Lock className="h-4 w-4 text-zinc-300" />
          </div>
          <div>
            <h2 className="text-base font-medium text-zinc-100">Sign in to use {feature}</h2>
            <p className="text-xs text-zinc-500">We'll email a 6-digit code.</p>
          </div>
        </div>

        {step === "email" && (
          <form
            onSubmit={(e) => { e.preventDefault(); if (email) sendCode(); }}
            className="space-y-3"
          >
            <label className="block text-xs font-medium text-zinc-400">Email</label>
            <div className="flex items-center gap-2 rounded-lg border border-white/[0.08] bg-white/[0.02] px-3 py-2 focus-within:border-white/20">
              <Mail className="h-4 w-4 text-zinc-500" />
              <input
                type="email"
                autoFocus
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="flex-1 bg-transparent text-sm text-zinc-100 placeholder-zinc-600 outline-none"
              />
            </div>
            {error && <p className="text-xs text-red-400">{error}</p>}
            <button
              type="submit"
              disabled={busy || !email}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-white py-2 text-sm font-medium text-zinc-950 transition disabled:cursor-not-allowed disabled:opacity-50 hover:bg-zinc-200"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <>Continue <ArrowRight className="h-4 w-4" /></>}
            </button>
          </form>
        )}

        {step === "username" && (
          <form
            onSubmit={(e) => { e.preventDefault(); if (username) sendCode({ withUsername: username }); }}
            className="space-y-3"
          >
            <p className="text-xs text-zinc-500">New here. Pick a username — use your chat username if you have one.</p>
            <label className="block text-xs font-medium text-zinc-400">Username</label>
            <input
              autoFocus
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="kq7z"
              className="w-full rounded-lg border border-white/[0.08] bg-white/[0.02] px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 outline-none focus:border-white/20"
            />
            {error && <p className="text-xs text-red-400">{error}</p>}
            <button
              type="submit"
              disabled={busy || !username}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-white py-2 text-sm font-medium text-zinc-950 disabled:opacity-50 hover:bg-zinc-200"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <>Send code <ArrowRight className="h-4 w-4" /></>}
            </button>
            <button type="button" onClick={() => setStep("email")} className="w-full text-center text-xs text-zinc-500 hover:text-zinc-300">
              Back
            </button>
          </form>
        )}

        {step === "code" && (
          <form onSubmit={(e) => { e.preventDefault(); verify(); }} className="space-y-3">
            <p className="text-xs text-zinc-500">Code sent to <span className="text-zinc-300">{email}</span></p>
            <label className="block text-xs font-medium text-zinc-400">6-digit code</label>
            <input
              ref={codeRef}
              inputMode="numeric"
              pattern="\d{6}"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder="000000"
              className="w-full rounded-lg border border-white/[0.08] bg-white/[0.02] px-3 py-3 text-center font-mono text-lg tracking-[0.4em] text-zinc-100 outline-none focus:border-white/20"
            />
            {error && <p className="text-xs text-red-400">{error}</p>}
            <button
              type="submit"
              disabled={busy || code.length !== 6}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-white py-2 text-sm font-medium text-zinc-950 disabled:opacity-50 hover:bg-zinc-200"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Verify and sign in"}
            </button>
            <div className="flex items-center justify-between text-xs">
              <button type="button" onClick={() => setStep("email")} className="text-zinc-500 hover:text-zinc-300">
                Change email
              </button>
              <button
                type="button"
                disabled={resendIn > 0 || busy}
                onClick={() => sendCode()}
                className="text-zinc-500 hover:text-zinc-300 disabled:opacity-50"
              >
                {resendIn > 0 ? `Resend in ${resendIn}s` : "Resend code"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
