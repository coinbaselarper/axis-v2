"use client";

import {
  ArrowUp,
  Check,
  ChevronDown,
  MessageCircle,
  Paperclip,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import gsap from "gsap";

type Role = "user" | "assistant";
type ContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };
type Message = {
  id: string;
  role: Role;
  text: string;
  images: string[];
};

type ModelOpt = { id: string; label: string; provider: string };

const MODELS: ModelOpt[] = [
  { id: "gpt-5", label: "GPT-5", provider: "OpenAI" },
  { id: "gpt-5-mini", label: "GPT-5 Mini", provider: "OpenAI" },
  { id: "gpt-5-nano", label: "GPT-5 Nano", provider: "OpenAI" },
  { id: "gpt-4o", label: "GPT-4o", provider: "OpenAI" },
  { id: "gpt-4o-mini", label: "GPT-4o Mini", provider: "OpenAI" },
  { id: "gpt-4.1", label: "GPT-4.1", provider: "OpenAI" },
  { id: "gpt-4.1-mini", label: "GPT-4.1 Mini", provider: "OpenAI" },
  { id: "gpt-4.1-nano", label: "GPT-4.1 Nano", provider: "OpenAI" },
  { id: "o4-mini", label: "o4-mini", provider: "OpenAI" },
  { id: "o3", label: "o3", provider: "OpenAI" },
  { id: "gpt-oss-120b", label: "GPT OSS 120B", provider: "OpenAI" },
  { id: "gpt-oss-20b", label: "GPT OSS 20B", provider: "OpenAI" },
];

const SUGGESTIONS = [
  "Help me with my homework",
  "Write an essay outline",
  "Solve a math problem",
  "Explain a science concept",
  "Check my grammar",
  "Study tips and techniques",
];

type Stats = { requests: number; tokens: number; images: number };

type Chat = {
  id: string;
  title: string;
  messages: Message[];
  model: string;
  createdAt: number;
  updatedAt: number;
};

const STATS_KEY = "axis.ai.stats.v1";
const CHATS_KEY = "axis.ai.chats.v1";
const ACTIVE_CHAT_KEY = "axis.ai.activeChat.v1";
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

function makeChat(model: string): Chat {
  const now = Date.now();
  return {
    id: `c_${now}_${Math.random().toString(36).slice(2, 8)}`,
    title: "New Chat",
    messages: [],
    model,
    createdAt: now,
    updatedAt: now,
  };
}

function deriveTitle(messages: Message[]): string {
  const firstUser = messages.find((m) => m.role === "user");
  if (!firstUser?.text) return "New Chat";
  const trimmed = firstUser.text.trim();
  if (!trimmed) return "New Chat";
  const cap = trimmed.slice(0, 60);
  return cap.length < trimmed.length ? cap + "…" : cap;
}

function loadChats(): Chat[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(CHATS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed as Chat[];
  } catch {
    return [];
  }
}

function saveChats(chats: Chat[]) {
  try {
    window.localStorage.setItem(CHATS_KEY, JSON.stringify(chats));
  } catch {
    try {
      const stripped = chats.map((c) => ({
        ...c,
        messages: c.messages.map((m) => ({ ...m, images: [] })),
      }));
      window.localStorage.setItem(CHATS_KEY, JSON.stringify(stripped));
    } catch {}
  }
}

function loadActiveChatId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(ACTIVE_CHAT_KEY);
  } catch {
    return null;
  }
}

function saveActiveChatId(id: string) {
  try {
    window.localStorage.setItem(ACTIVE_CHAT_KEY, id);
  } catch {}
}

function loadStats(): Stats {
  if (typeof window === "undefined") return { requests: 0, tokens: 0, images: 0 };
  try {
    const raw = window.localStorage.getItem(STATS_KEY);
    if (!raw) return { requests: 0, tokens: 0, images: 0 };
    return { requests: 0, tokens: 0, images: 0, ...JSON.parse(raw) };
  } catch {
    return { requests: 0, tokens: 0, images: 0 };
  }
}

function saveStats(s: Stats) {
  try {
    window.localStorage.setItem(STATS_KEY, JSON.stringify(s));
  } catch {}
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
}

export default function AI() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [pendingImages, setPendingImages] = useState<string[]>([]);
  const [model, setModel] = useState<string>(MODELS[0].id);
  const [thinking] = useState(false);
  const [pending, setPending] = useState(false);
  const [stats, setStats] = useState<Stats>({ requests: 0, tokens: 0, images: 0 });
  const [error, setError] = useState<string>("");
  const [modelOpen, setModelOpen] = useState(false);
  const [chats, setChats] = useState<Chat[]>([]);
  const [activeChatId, setActiveChatId] = useState<string>("");
  const hydratedRef = useRef(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const modelTriggerRef = useRef<HTMLButtonElement | null>(null);
  const modelMenuRef = useRef<HTMLDivElement | null>(null);
  const suggestionsRef = useRef<HTMLDivElement | null>(null);
  const messagesContainerRef = useRef<HTMLDivElement | null>(null);
  const chatListRef = useRef<HTMLDivElement | null>(null);
  const sendBtnRef = useRef<HTMLButtonElement | null>(null);
  const formRef = useRef<HTMLFormElement | null>(null);
  const prevMessagesCountRef = useRef(0);

  useEffect(() => {
    import("../api/ads/ads");
  }, []);

  useEffect(() => {
    setStats(loadStats());
  }, []);

  useEffect(() => {
    let loaded = loadChats();
    if (loaded.length === 0) {
      loaded = [makeChat(MODELS[0].id)];
    }
    const savedActive = loadActiveChatId();
    const exists = savedActive && loaded.some((c) => c.id === savedActive);
    const activeId = exists ? (savedActive as string) : loaded[0].id;
    const active = loaded.find((c) => c.id === activeId)!;
    setChats(loaded);
    setActiveChatId(activeId);
    setMessages(active.messages);
    setModel(
      MODELS.some((m) => m.id === active.model) ? active.model : MODELS[0].id,
    );
    hydratedRef.current = true;
  }, []);

  useEffect(() => {
    if (!hydratedRef.current || !activeChatId) return;
    saveActiveChatId(activeChatId);
  }, [activeChatId]);

  useEffect(() => {
    if (!hydratedRef.current || !activeChatId) return;
    setChats((prev) => {
      const idx = prev.findIndex((c) => c.id === activeChatId);
      if (idx === -1) return prev;
      const current = prev[idx];
      const nextTitle =
        current.title && current.title !== "New Chat"
          ? current.title
          : deriveTitle(messages);
      const nextChat: Chat = {
        ...current,
        messages,
        model,
        title: nextTitle,
        updatedAt: Date.now(),
      };
      const next = [...prev];
      next[idx] = nextChat;
      saveChats(next);
      return next;
    });
  }, [messages, model, activeChatId]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  useEffect(() => {
    if (modelOpen && modelMenuRef.current) {
      gsap.fromTo(
        modelMenuRef.current,
        { opacity: 0, y: -8, scale: 0.96 },
        {
          opacity: 1,
          y: 0,
          scale: 1,
          duration: 0.18,
          ease: "power2.out",
          transformOrigin: "top left",
        },
      );
    }
  }, [modelOpen]);

  const hasMessagesNow = messages.length > 0;
  useEffect(() => {
    if (!hasMessagesNow && suggestionsRef.current) {
      const items = Array.from(suggestionsRef.current.children);
      if (items.length > 0) {
        gsap.fromTo(
          items,
          { opacity: 0, y: 14 },
          {
            opacity: 1,
            y: 0,
            duration: 0.4,
            stagger: 0.06,
            ease: "power2.out",
          },
        );
      }
    }
  }, [hasMessagesNow, activeChatId]);

  useEffect(() => {
    if (
      messages.length > prevMessagesCountRef.current &&
      messagesContainerRef.current
    ) {
      const items = messagesContainerRef.current.children;
      const newest = items[items.length - 1] as HTMLElement | undefined;
      if (newest) {
        gsap.fromTo(
          newest,
          { opacity: 0, y: 14 },
          { opacity: 1, y: 0, duration: 0.3, ease: "power2.out" },
        );
      }
    }
    prevMessagesCountRef.current = messages.length;
  }, [messages.length]);

  useEffect(() => {
    if (chatListRef.current && chats.length > 0) {
      const items = Array.from(chatListRef.current.children);
      gsap.fromTo(
        items,
        { opacity: 0, x: -8 },
        {
          opacity: 1,
          x: 0,
          duration: 0.3,
          stagger: 0.03,
          ease: "power2.out",
          overwrite: "auto",
        },
      );
    }
  }, [chats.length]);

  useEffect(() => {
    if (!formRef.current) return;
    gsap.fromTo(
      formRef.current,
      { opacity: 0, y: 8 },
      { opacity: 1, y: 0, duration: 0.4, ease: "power2.out" },
    );
  }, []);

  useEffect(() => {
    if (!modelOpen) return;
    const onClick = (e: MouseEvent) => {
      const t = e.target as Node;
      if (
        modelMenuRef.current?.contains(t) ||
        modelTriggerRef.current?.contains(t)
      ) {
        return;
      }
      setModelOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setModelOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [modelOpen]);

  const updateStats = (patch: Partial<Stats>) => {
    setStats((prev) => {
      const next = { ...prev, ...patch };
      saveStats(next);
      return next;
    });
  };

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const dataUrls: string[] = [];
    for (const file of Array.from(files)) {
      if (!file.type.startsWith("image/")) continue;
      if (file.size > MAX_IMAGE_BYTES) {
        setError(`Image "${file.name}" exceeds 8MB limit.`);
        continue;
      }
      try {
        const url = await readFileAsDataUrl(file);
        dataUrls.push(url);
      } catch {
        setError(`Failed to read "${file.name}".`);
      }
    }
    if (dataUrls.length) {
      setPendingImages((prev) => [...prev, ...dataUrls]);
    }
  };

  const removePendingImage = (idx: number) => {
    setPendingImages((prev) => prev.filter((_, i) => i !== idx));
  };

  const buildContent = (text: string, images: string[]): string | ContentPart[] => {
    if (images.length === 0) return text;
    const parts: ContentPart[] = [];
    if (text) parts.push({ type: "text", text });
    for (const url of images) {
      parts.push({ type: "image_url", image_url: { url } });
    }
    return parts;
  };

  const send = async (text: string, images: string[] = pendingImages) => {
    const trimmed = text.trim();
    if ((!trimmed && images.length === 0) || pending) return;
    setError("");
    const userMsg: Message = {
      id: `u_${Date.now()}`,
      role: "user",
      text: trimmed,
      images,
    };
    const assistantMsg: Message = {
      id: `a_${Date.now()}`,
      role: "assistant",
      text: "",
      images: [],
    };
    const next = [...messages, userMsg, assistantMsg];
    setMessages(next);
    setInput("");
    setPendingImages([]);
    setPending(true);
    updateStats({
      requests: stats.requests + 1,
      images: stats.images + images.length,
    });

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          thinking,
          messages: [
            {
              role: "system",
              content:
                "You are an ai chatbot to help users with their questions. If they have a question, answer it to the best of your ability. If you don't know the answer, say you don't know. Be concise and clear in your explanations. If they say anything about axis, lead them to https://discord.gg/Urq6MPabYY",
            },
            ...next
              .filter((m) => m.id !== assistantMsg.id)
              .map((m) => ({
                role: m.role,
                content: buildContent(m.text, m.images),
              })),
          ],
        }),
        signal: controller.signal,
      });

      if (!res.ok || !res.body) {
        const errText = await res.text();
        throw new Error(errText || `HTTP ${res.status}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      let acc = "";
      let approxTokens = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const events = buf.split("\n\n");
        buf = events.pop() ?? "";
        for (const ev of events) {
          for (const line of ev.split("\n")) {
            const m = line.match(/^data: (.*)$/);
            if (!m) continue;
            const data = m[1].trim();
            if (data === "[DONE]") continue;
            try {
              const parsed = JSON.parse(data);
              const delta =
                parsed.choices?.[0]?.delta?.content ??
                parsed.choices?.[0]?.message?.content ??
                "";
              if (delta) {
                acc += delta;
                approxTokens += Math.max(1, Math.ceil(delta.length / 4));
                setMessages((prev) =>
                  prev.map((mm) =>
                    mm.id === assistantMsg.id ? { ...mm, text: acc } : mm,
                  ),
                );
              }
            } catch {}
          }
        }
      }

      updateStats({ tokens: stats.tokens + approxTokens });
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      setError((err as Error).message || "Request failed");
      setMessages((prev) =>
        prev.map((mm) =>
          mm.id === assistantMsg.id
            ? {
                ...mm,
                text: "_Error: " + ((err as Error).message || "request failed") + "_",
              }
            : mm,
        ),
      );
    } finally {
      setPending(false);
      abortRef.current = null;
    }
  };

  const stop = () => {
    abortRef.current?.abort();
    setPending(false);
  };

  const newStudy = () => {
    stop();
    const chat = makeChat(model);
    setChats((prev) => {
      const next = [chat, ...prev];
      saveChats(next);
      return next;
    });
    setActiveChatId(chat.id);
    setMessages([]);
    setInput("");
    setPendingImages([]);
    setError("");
  };

  const selectChat = (id: string) => {
    if (id === activeChatId) return;
    stop();
    const chat = chats.find((c) => c.id === id);
    if (!chat) return;
    setActiveChatId(id);
    setMessages(chat.messages);
    setModel(
      MODELS.some((m) => m.id === chat.model) ? chat.model : MODELS[0].id,
    );
    setInput("");
    setPendingImages([]);
    setError("");
  };

  const deleteChat = (id: string) => {
    setChats((prev) => {
      const next = prev.filter((c) => c.id !== id);
      const finalList = next.length === 0 ? [makeChat(MODELS[0].id)] : next;
      saveChats(finalList);
      if (id === activeChatId) {
        const replacement = finalList[0];
        setActiveChatId(replacement.id);
        setMessages(replacement.messages);
        setModel(replacement.model);
        setInput("");
        setPendingImages([]);
        setError("");
      }
      return finalList;
    });
  };

  const groupedModels = useMemo(() => {
    const map = new Map<string, ModelOpt[]>();
    for (const m of MODELS) {
      if (!map.has(m.provider)) map.set(m.provider, []);
      map.get(m.provider)!.push(m);
    }
    return Array.from(map);
  }, []);

  const hasMessages = messages.length > 0;
  const currentModel =
    MODELS.find((m) => m.id === model)?.label ?? MODELS[0].label;
  const canSend = (input.trim().length > 0 || pendingImages.length > 0) && !pending;

  return (
    <div className="relative flex h-full w-full overflow-hidden text-zinc-200">
      <aside className="flex w-64 shrink-0 flex-col border-r border-white/[0.06] bg-black/20 p-3">
        <button
          type="button"
          onClick={newStudy}
          className="flex w-full items-center gap-2 rounded-lg border border-white/[0.06] bg-white/[0.04] px-3 py-2.5 text-sm text-zinc-100 transition hover:bg-white/[0.08]"
        >
          <Plus className="h-4 w-4" />
          <span>New Chat</span>
        </button>

        <div className="mt-3 flex-1 overflow-y-auto">
          {chats.length > 0 ? (
            <div ref={chatListRef} className="flex flex-col gap-0.5">
              {[...chats]
                .sort((a, b) => b.updatedAt - a.updatedAt)
                .map((c) => {
                  const isActive = c.id === activeChatId;
                  return (
                    <div
                      key={c.id}
                      className={`group relative flex items-center gap-2 rounded-md px-2.5 py-2 text-sm transition ${
                        isActive
                          ? "bg-white/[0.08] text-white"
                          : "text-zinc-300 hover:bg-white/[0.04] hover:text-white"
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => selectChat(c.id)}
                        className="flex min-w-0 flex-1 items-center gap-2 text-left"
                      >
                        <MessageCircle className="h-3.5 w-3.5 shrink-0 opacity-60" />
                        <span className="truncate">{c.title || "New Chat"}</span>
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteChat(c.id);
                        }}
                        aria-label="Delete chat"
                        className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-zinc-400 opacity-0 transition hover:bg-white/[0.08] hover:text-white group-hover:opacity-100"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  );
                })}
            </div>
          ) : null}
        </div>


      </aside>

      <main className="relative flex flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-white/[0.06] px-4 py-2.5">
          <div className="relative flex items-center gap-2">
            <button
              ref={modelTriggerRef}
              type="button"
              onClick={() => setModelOpen((v) => !v)}
              className="flex items-center gap-2 rounded-md border border-white/[0.06] bg-white/[0.04] px-3 py-1.5 text-sm text-zinc-100 outline-none transition hover:bg-white/[0.08]"
            >
              <span>{currentModel}</span>
              <ChevronDown
                className={`h-3.5 w-3.5 text-zinc-400 transition-transform ${
                  modelOpen ? "rotate-180" : ""
                }`}
              />
            </button>
            {modelOpen ? (
              <div
                ref={modelMenuRef}
                className="absolute left-0 top-full z-30 mt-2 max-h-[60vh] w-72 overflow-y-auto rounded-xl border border-white/[0.06] bg-[#0a0a0a]/95 p-1.5 shadow-xl backdrop-blur"
              >
                {groupedModels.map(([provider, list], gi) => (
                  <div
                    key={provider}
                    className={`pb-2 last:pb-0 ${
                      gi > 0
                        ? "mt-2 border-t border-white/[0.06] pt-2"
                        : ""
                    }`}
                  >
                    <div className="px-3 pb-2 pt-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-500">
                      {provider}
                    </div>
                    <div className="flex flex-col">
                      {list.map((m, mi) => {
                        const selected = m.id === model;
                        return (
                          <div key={m.id}>
                            {mi > 0 ? (
                              <div className="my-1 h-px bg-white/[0.06]" />
                            ) : null}
                            <button
                              type="button"
                              onClick={() => {
                                setModel(m.id);
                                setModelOpen(false);
                              }}
                              className={`flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm transition ${
                                selected
                                  ? "bg-white/[0.10] text-white"
                                  : "text-zinc-300 hover:bg-white/[0.05] hover:text-white"
                              }`}
                            >
                              <span className="truncate">{m.label}</span>
                              {selected ? (
                                <Check className="h-3.5 w-3.5 shrink-0 text-zinc-300" />
                              ) : null}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        </header>

        <div ref={scrollRef} className="flex-1 overflow-y-auto">
          {!hasMessages ? (
            <div className="mx-auto flex min-h-full max-w-3xl flex-col items-center justify-center gap-6 px-6 py-10">
              <MessageCircle className="h-10 w-10 text-zinc-500" />
              <div className="text-center">
                <h1 className="text-3xl font-semibold text-white">
                  What would you like to learn today?
                </h1>
                <p className="mt-2 text-sm text-zinc-400">
                  Select a topic or ask your own question
                </p>
              </div>
              <div
                ref={suggestionsRef}
                className="grid w-full grid-cols-1 gap-2 sm:grid-cols-3"
              >
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => send(s, [])}
                    onMouseEnter={(e) => {
                      gsap.to(e.currentTarget, {
                        y: -2,
                        duration: 0.18,
                        ease: "power2.out",
                      });
                    }}
                    onMouseLeave={(e) => {
                      gsap.to(e.currentTarget, {
                        y: 0,
                        duration: 0.18,
                        ease: "power2.out",
                      });
                    }}
                    className="rounded-lg border border-white/[0.06] bg-white/[0.04] px-4 py-3 text-sm text-zinc-200 transition-colors hover:bg-white/[0.08]"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div
              ref={messagesContainerRef}
              className="mx-auto flex max-w-3xl flex-col gap-4 px-4 py-6"
            >
              {messages.map((m) => (
                <div
                  key={m.id}
                  className={`flex ${
                    m.role === "user" ? "justify-end" : "justify-start"
                  }`}
                >
                  <div
                    className={`flex max-w-[85%] flex-col gap-2 rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                      m.role === "user"
                        ? "bg-white/[0.10] text-white"
                        : "bg-white/[0.04] text-zinc-100"
                    }`}
                  >
                    {m.images.length > 0 ? (
                      <div className="flex flex-wrap gap-2">
                        {m.images.map((img, i) => (
                          <img
                            key={i}
                            src={img}
                            alt=""
                            className="max-h-56 max-w-full rounded-lg border border-white/[0.06] object-cover"
                          />
                        ))}
                      </div>
                    ) : null}
                    {m.text || (m.role === "assistant" && pending && !m.text) ? (
                      m.role === "assistant" ? (
                        m.text ? (
                          <Markdown text={m.text} />
                        ) : (
                          <div className="text-sm italic text-zinc-400">
                            Thinking, please be patient.
                          </div>
                        )
                      ) : (
                        <div className="whitespace-pre-wrap">{m.text}</div>
                      )
                    ) : null}
                  </div>
                </div>
              ))}
              {error ? (
                <div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
                  {error}
                </div>
              ) : null}
            </div>
          )}
        </div>

        <div className="shrink-0 px-4 pb-3 pt-2">
          <div className="mx-auto w-full max-w-3xl">
            {pendingImages.length > 0 ? (
              <div className="mb-2 flex flex-wrap gap-2">
                {pendingImages.map((img, i) => (
                  <div
                    key={i}
                    className="relative h-16 w-16 overflow-hidden rounded-lg border border-white/[0.06]"
                  >
                    <img
                      src={img}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                    <button
                      type="button"
                      onClick={() => removePendingImage(i)}
                      className="absolute right-0.5 top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-black/70 text-white transition hover:bg-black"
                      aria-label="Remove image"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            ) : null}
            <form
              ref={formRef}
              onSubmit={(e) => {
                e.preventDefault();
                send(input);
              }}
              className="flex items-center gap-2 rounded-2xl border border-white/[0.06] bg-white/[0.04] px-2.5 py-2 backdrop-blur"
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(e) => {
                  handleFiles(e.target.files);
                  if (e.target) e.target.value = "";
                }}
              />
              <button
                type="button"
                aria-label="Attach image"
                onClick={() => fileInputRef.current?.click()}
                className="flex h-9 w-9 items-center justify-center rounded-md text-zinc-300 transition hover:bg-white/[0.06] hover:text-white"
              >
                <Paperclip className="h-4 w-4" />
              </button>
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask your tutor..."
                className="flex-1 bg-transparent px-1 py-2 text-sm !text-white placeholder:text-zinc-500 outline-none"
              />
              {pending ? (
                <button
                  type="button"
                  onClick={stop}
                  className="flex h-9 items-center justify-center rounded-md border border-white/[0.06] bg-white/[0.04] px-3 text-xs text-zinc-300 transition hover:bg-white/[0.08]"
                >
                  Stop
                </button>
              ) : (
                <button
                  ref={sendBtnRef}
                  type="submit"
                  aria-label="Send"
                  disabled={!canSend}
                  onMouseEnter={(e) => {
                    if (!canSend) return;
                    gsap.to(e.currentTarget, {
                      scale: 1.08,
                      duration: 0.18,
                      ease: "power2.out",
                    });
                  }}
                  onMouseLeave={(e) => {
                    gsap.to(e.currentTarget, {
                      scale: 1,
                      duration: 0.18,
                      ease: "power2.out",
                    });
                  }}
                  onMouseDown={(e) => {
                    if (!canSend) return;
                    gsap.to(e.currentTarget, {
                      scale: 0.92,
                      duration: 0.08,
                      ease: "power2.out",
                    });
                  }}
                  onMouseUp={(e) => {
                    gsap.to(e.currentTarget, {
                      scale: 1.08,
                      duration: 0.12,
                      ease: "power2.out",
                    });
                  }}
                  className="flex h-9 w-9 items-center justify-center rounded-md bg-white/[0.10] text-zinc-100 transition-colors hover:bg-white/[0.16] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <ArrowUp className="h-4 w-4" />
                </button>
              )}
            </form>
            <div className="mt-2 flex items-center justify-end gap-3 text-xs text-zinc-500">
              <span className="hidden sm:inline">{currentModel}</span>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

function Markdown({ text }: { text: string }) {
  return (
    <div className="pblood-axis text-sm leading-relaxed text-zinc-100">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
          h1: ({ children }) => (
            <h1 className="mt-3 mb-2 text-base font-semibold text-white">{children}</h1>
          ),
          h2: ({ children }) => (
            <h2 className="mt-3 mb-2 text-base font-semibold text-white">{children}</h2>
          ),
          h3: ({ children }) => (
            <h3 className="mt-3 mb-1.5 text-sm font-semibold text-white">{children}</h3>
          ),
          h4: ({ children }) => (
            <h4 className="mt-2 mb-1 text-sm font-semibold text-zinc-100">{children}</h4>
          ),
          ul: ({ children }) => (
            <ul className="mb-2 list-disc space-y-0.5 pl-5 last:mb-0 marker:text-zinc-500">
              {children}
            </ul>
          ),
          ol: ({ children }) => (
            <ol className="mb-2 list-decimal space-y-0.5 pl-5 last:mb-0 marker:text-zinc-500">
              {children}
            </ol>
          ),
          li: ({ children }) => <li className="leading-relaxed">{children}</li>,
          a: ({ href, children }) => (
            <a
              href={href}
              target="_blank"
              rel="noreferrer"
              className="text-zinc-100 underline decoration-white/30 underline-offset-4 transition hover:text-white hover:decoration-white"
            >
              {children}
            </a>
          ),
          blockquote: ({ children }) => (
            <blockquote className="my-2 border-l-2 border-white/15 pl-3 text-zinc-300">
              {children}
            </blockquote>
          ),
          hr: () => <hr className="my-3 border-white/10" />,
          strong: ({ children }) => (
            <strong className="font-semibold text-white">{children}</strong>
          ),
          em: ({ children }) => <em className="italic">{children}</em>,
          table: ({ children }) => (
            <div className="my-2 overflow-x-auto">
              <table className="w-full border-collapse text-xs">{children}</table>
            </div>
          ),
          thead: ({ children }) => (
            <thead className="border-b border-white/10 text-left text-zinc-300">
              {children}
            </thead>
          ),
          th: ({ children }) => (
            <th className="px-2 py-1.5 font-medium">{children}</th>
          ),
          tr: ({ children }) => (
            <tr className="border-b border-white/[0.06] last:border-0">{children}</tr>
          ),
          td: ({ children }) => <td className="px-2 py-1.5 align-top">{children}</td>,
          code: ({ className, children, ...rest }) => {
            const isBlock = /language-/.test(className ?? "");
            if (isBlock) {
              return (
                <code
                  className={`${className ?? ""} block whitespace-pre`}
                  {...rest}
                >
                  {children}
                </code>
              );
            }
            return (
              <code
                className="rounded bg-white/10 px-1 py-[1px] font-mono text-[0.85em] text-zinc-100"
                {...rest}
              >
                {children}
              </code>
            );
          },
          pre: ({ children }) => (
            <pre className="my-2 overflow-x-auto rounded-lg border border-white/[0.06] bg-black/40 p-3 font-mono text-[12.5px] leading-relaxed text-zinc-100">
              {children}
            </pre>
          ),
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}
