"use client";

import { useEffect, useRef, useState } from "react";
import { Bot, Eraser, Info, Lock, SendHorizontal, Sparkles, User } from "lucide-react";
import { Badge, Button, Card, Notice } from "@/components/ui";
import { api } from "@/lib/api/client";
import { cn } from "@/lib/utils";

type ProviderId = "claude" | "openai" | "gemini" | "quick";

interface Turn {
  role: "user" | "assistant";
  content: string;
  provider?: ProviderId;
  toolsUsed?: string[];
}

const LABEL: Record<ProviderId, string> = {
  claude: "Claude",
  openai: "OpenAI",
  gemini: "Gemini",
  quick: "Quick answers",
};

export const SUGGESTIONS = [
  "Show my family members",
  "Show members currently sharing location",
  "Show the last known location",
  "Show recent SOS alerts",
  "Summarize family safety activity",
];

const TOOL_LABEL: Record<string, string> = {
  list_family_members: "family members",
  get_shared_locations: "shared locations",
  get_recent_sos_alerts: "SOS alerts",
  get_safe_zones: "safe zones",
  get_recent_activity: "recent activity",
  get_my_sharing_status: "your sharing status",
};

export function AssistantChat({
  configured,
  preferred,
}: {
  configured: { id: "claude" | "openai" | "gemini"; label: string; model: string }[];
  preferred: "claude" | "openai" | "gemini";
}) {
  const initial: ProviderId = configured.some((p) => p.id === preferred) ? preferred : (configured[0]?.id ?? "quick");
  const [provider, setProvider] = useState<ProviderId>(initial);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  // Block body on purpose: in current Chromium, scrollIntoView() returns a Promise, and an
  // expression-bodied effect would hand that to React as a "cleanup" and crash the page.
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [turns, busy]);

  async function choose(p: ProviderId) {
    setProvider(p);
    setError(null);
    // Remember a real provider as the user's preference (profile field).
    if (p !== "quick") void api("/api/profile", { method: "PATCH", body: { aiProvider: p } });
  }

  async function ask(question: string) {
    const q = question.trim();
    if (!q || busy) return;
    setError(null);
    setInput("");
    const next: Turn[] = [...turns, { role: "user", content: q }];
    setTurns(next);
    setBusy(true);
    const res = await api<{ text: string; provider: ProviderId; toolsUsed: string[] }>("/api/assistant", {
      method: "POST",
      body: { provider, messages: next.slice(-20).map(({ role, content }) => ({ role, content })) },
    });
    setBusy(false);
    if (!res.ok) {
      setError(res.message);
      setTurns(turns); // drop the unanswered question so history stays consistent
      setInput(q);
      return;
    }
    setTurns([...next, { role: "assistant", content: res.data.text, provider: res.data.provider, toolsUsed: res.data.toolsUsed }]);
  }

  const options: { id: ProviderId; label: string; model?: string; enabled: boolean }[] = [
    ...(["claude", "openai", "gemini"] as const).map((id) => {
      const c = configured.find((p) => p.id === id);
      return { id, label: LABEL[id], model: c?.model, enabled: Boolean(c) };
    }),
    { id: "quick", label: LABEL.quick, enabled: true },
  ];

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
      <Card className="flex min-h-[60vh] flex-col p-0">
        <div className="flex-1 space-y-4 overflow-y-auto p-5" aria-live="polite" aria-label="Conversation" role="log">
          {turns.length === 0 && (
            <div className="py-6 text-center">
              <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-neon-blue/30 to-neon-purple/30 text-neon-cyan ring-1 ring-white/10">
                <Sparkles className="h-6 w-6" aria-hidden="true" />
              </span>
              <h2 className="mt-4 font-display text-lg font-semibold text-white">Ask about your family&apos;s safety</h2>
              <p className="mx-auto mt-1 max-w-md text-sm text-slate-400">
                I can only see what you&apos;re allowed to see — members who chose to share with your families, alerts sent to you,
                and your safe zones.
              </p>
            </div>
          )}
          {turns.map((t, i) => (
            <div key={i} className={cn("flex gap-3", t.role === "user" && "flex-row-reverse")} data-testid={`turn-${t.role}`}>
              <span
                className={cn(
                  "grid h-8 w-8 shrink-0 place-items-center rounded-full",
                  t.role === "user" ? "bg-neon-blue/20 text-[#9db5ff]" : "bg-neon-purple/20 text-[#c7a6ff]",
                )}
                aria-hidden="true"
              >
                {t.role === "user" ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
              </span>
              <div className={cn("max-w-[85%] space-y-1", t.role === "user" && "text-right")}>
                <div
                  className={cn(
                    // Plain text only (no HTML/markdown rendering) — model output can't inject markup or links.
                    "inline-block whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-left text-sm leading-relaxed",
                    t.role === "user" ? "bg-neon-blue/15 text-white" : "bg-white/[0.05] text-slate-100",
                  )}
                >
                  {t.content}
                </div>
                {t.role === "assistant" && t.provider && (
                  <p className="text-[11px] text-slate-500">
                    {LABEL[t.provider]}
                    {t.toolsUsed?.length ? ` · checked ${t.toolsUsed.map((x) => TOOL_LABEL[x] ?? x).join(", ")}` : ""}
                  </p>
                )}
              </div>
            </div>
          ))}
          {busy && (
            <div className="flex gap-3" aria-label="Assistant is thinking">
              <span className="grid h-8 w-8 place-items-center rounded-full bg-neon-purple/20 text-[#c7a6ff]">
                <Bot className="h-4 w-4" aria-hidden="true" />
              </span>
              <span className="inline-flex items-center gap-1 rounded-2xl bg-white/[0.05] px-4 py-3">
                {[0, 1, 2].map((d) => (
                  <span key={d} className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400" style={{ animationDelay: `${d * 120}ms` }} />
                ))}
              </span>
            </div>
          )}
          <div ref={endRef} />
        </div>

        <div className="border-t border-white/5 p-4">
          {error && <Notice tone="danger" className="mb-3">{error}</Notice>}
          <div className="mb-3 flex flex-wrap gap-1.5" aria-label="Suggestions">
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                type="button"
                disabled={busy}
                onClick={() => ask(s)}
                className="rounded-full border border-white/10 px-3 py-1 text-xs text-slate-300 hover:border-neon-cyan/50 hover:text-white disabled:opacity-50"
              >
                {s}
              </button>
            ))}
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void ask(input);
            }}
            className="flex gap-2"
            aria-label="Ask the assistant"
          >
            <label htmlFor="assistant-input" className="sr-only">
              Your question
            </label>
            <input
              id="assistant-input"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              maxLength={2000}
              placeholder={provider === "quick" ? "Ask a quick question…" : `Ask ${LABEL[provider]}…`}
              className="h-11 flex-1 rounded-xl border border-white/10 bg-ink-900/70 px-3.5 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-neon-blue/30"
              autoComplete="off"
            />
            <Button type="submit" loading={busy} disabled={!input.trim()} aria-label="Send">
              {!busy && <SendHorizontal className="h-4 w-4" aria-hidden="true" />}
            </Button>
          </form>
        </div>
      </Card>

      <div className="space-y-4">
        <Card>
          <fieldset>
            <legend className="mb-3 text-sm font-semibold text-white">Assistant</legend>
            <div className="space-y-1.5">
              {options.map((o) => (
                <label
                  key={o.id}
                  className={cn(
                    "flex items-center gap-3 rounded-xl border px-3 py-2.5 text-sm",
                    !o.enabled && "cursor-not-allowed opacity-50",
                    provider === o.id ? "border-neon-cyan/40 bg-neon-cyan/[0.06] text-white" : "border-white/10 text-slate-300",
                  )}
                >
                  <input
                    type="radio"
                    name="provider"
                    className="accent-[#22e1ff]"
                    checked={provider === o.id}
                    disabled={!o.enabled || busy}
                    onChange={() => choose(o.id)}
                  />
                  <span className="flex-1">
                    {o.label}
                    {o.model && <span className="block text-[11px] text-slate-500">{o.model}</span>}
                  </span>
                  {!o.enabled && <Badge>Not configured</Badge>}
                  {o.id === "quick" && <Badge tone="safe">No AI</Badge>}
                </label>
              ))}
            </div>
          </fieldset>
          {turns.length > 0 && (
            <Button size="sm" variant="ghost" className="mt-3" onClick={() => setTurns([])} disabled={busy}>
              <Eraser className="h-3.5 w-3.5" aria-hidden="true" /> Clear conversation
            </Button>
          )}
        </Card>
        <Notice tone="info" title="Privacy">
          <span className="flex gap-1.5">
            <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            {provider === "quick"
              ? "Quick answers are computed on our server — nothing is sent to an AI company."
              : `To answer, the family information you're allowed to see (names, shared locations, alerts, zones) is sent to ${LABEL[provider]}. Contact details are never sent. Conversations aren't saved.`}
          </span>
        </Notice>
        <p className="flex gap-1.5 px-1 text-xs text-slate-500">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          The assistant can only read information. It can&apos;t send alerts or change settings. In an emergency, use the SOS button.
        </p>
      </div>
    </div>
  );
}
